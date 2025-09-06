// src/components/UploadModal.jsx
import React, { useEffect, useState } from "react";
import { Upload, X, Check, AlertTriangle } from "lucide-react";
import "../styles/global.css";
import "../styles/uploadModal.css";
import { Client, Databases, Storage, Permission, Role, Query } from "appwrite";

/**
 * UploadModal.jsx
 * - Adds `name` into created record documents
 * - Ensures DOB and recorddate are stored in MM-DD-YYYY
 * - Keeps robust dedupe & append logic
 */

// ---------- Env / Appwrite setup ----------
const ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1";
const PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID;
const DATABASE_ID = import.meta.env.VITE_DATABASE_ID;
const PATIENTS_COL = import.meta.env.VITE_PATIENTS_COLLECTION_ID;
const RECORDS_COL = import.meta.env.VITE_RECORDS_COLLECTION_ID;
const BUCKET_ID = import.meta.env.VITE_BUCKET_ID || null;

// Replace with your real OCR/AI endpoints & key
const OCR_URL = "https://ai-tools.rev21labs.com/api/v1/vision/ocr";
const PROMPT_URL = "https://ai-tools.rev21labs.com/api/v1/ai/prompt";
const API_KEY = "OWRhY2VjODUtOTkyMi00YWI3LThjOTItM2RiMzJlYWJlYjhj";

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
const databases = new Databases(client);
const storage = new Storage(client);

// ---------- Utilities ----------
const mkId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const fileViewUrl = (bucketId, fileId) =>
  `${ENDPOINT}/storage/buckets/${bucketId}/files/${fileId}/view?project=${PROJECT_ID}`;
const cleanText = (s = "") => (s || "").replace(/\s+/g, " ").trim();

// Normalize names: trim, lowercase, remove diacritics & punctuation, collapse spaces
const normalizeName = (n = "") =>
  String(n || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, "") // remove punctuation (unicode aware)
    .replace(/\s+/g, " ");

const nameTokens = (name) => {
  const norm = normalizeName(name || "");
  return norm ? norm.split(" ").filter(Boolean) : [];
};
const firstInitial = (name) => {
  const t = nameTokens(name);
  return t.length > 0 ? t[0][0] : "";
};
const lastName = (name) => {
  const t = nameTokens(name);
  return t.length > 0 ? t[t.length - 1] : "";
};

// Format any reasonable date string to MM-DD-YYYY (falls back to original if unparsable)
const toMMDDYYYY = (raw) => {
  if (!raw) return null;
  const s = String(raw).trim();
  // Accept MM-DD-YYYY or MM/DD/YYYY
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m1) {
    let mm = Number(m1[1]);
    let dd = Number(m1[2]);
    let yyyy = Number(m1[3]);
    if (yyyy < 100) yyyy += 2000;
    const mmS = String(mm).padStart(2, "0");
    const ddS = String(dd).padStart(2, "0");
    return `${mmS}-${ddS}-${yyyy}`;
  }
  // Accept ISO (YYYY-MM-DD or full ISO)
  const isoMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    const yyyy = Number(isoMatch[1]);
    const mm = Number(isoMatch[2]);
    const dd = Number(isoMatch[3]);
    return `${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}-${yyyy}`;
  }
  // fallback: try Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}-${dd}-${yyyy}`;
  }
  // if can't parse, return original to avoid losing info
  return s;
};

// ---------- UploadModal component ----------
const UploadModal = ({ setShowUploadModal }) => {
  const [file, setFile] = useState(null);
  const [ocrText, setOcrText] = useState("");
  const [extracted, setExtracted] = useState(null);
  const [uploadedUrl, setUploadedUrl] = useState(null);

  const [loading, setLoading] = useState(false);
  const [creatingRecord, setCreatingRecord] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState([]);
  const showToast = ({ type = "info", title = "", message = "", ttl = 4500 }) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setToasts((t) => [...t, { id, type, title, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
  };
  const removeToast = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  useEffect(() => {
    console.log("UploadModal env:", { ENDPOINT, PROJECT_ID, DATABASE_ID, PATIENTS_COL, RECORDS_COL, BUCKET_ID });
  }, []);

  // ---------- File input ----------
  const handleFileChange = (e) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setOcrText("");
    setExtracted(null);
    setUploadedUrl(null);
  };

  // ---------- OCR + AI Extraction ----------
  const runOcrAndExtract = async (file) => {
    if (!file) throw new Error("No file provided");
    setLoading(true);
    try {
      console.log("Starting OCR for:", file.name);
      const form = new FormData();
      form.append("file", file, file.name);

      const ocrResp = await fetch(OCR_URL, {
        method: "POST",
        headers: { "x-api-key": API_KEY },
        body: form,
      });
      const ocrJson = await ocrResp.json();
      const text = cleanText(ocrJson?.text || ocrJson?.ocrText || "");
      setOcrText(text);

      // Prompt instructing AI to return JSON
      const promptBody = {
        prompt:
          "Extract patient information from the medical form text and return VALID JSON ONLY with these keys: " +
          "`name`, `dateofbirth` (MM-DD-YYYY or ISO or null), `visited` (MM-DD-YYYY or ISO or null), `phone`, `email`, `bloodtype`, `gender`, `place`, " +
          "`symptom1`, `symptom2`, `symptom3`, `summary`. If a field is missing, set it to null. Return JSON only.",
        content: text,
        expected_output: {
          name: null,
          dateofbirth: null,
          visited: null,
          phone: null,
          email: null,
          bloodtype: null,
          gender: null,
          place: null,
          symptom1: null,
          symptom2: null,
          symptom3: null,
          summary: null,
        },
      };

      const aiResp = await fetch(PROMPT_URL, {
        method: "POST",
        headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(promptBody),
      });
      const aiJson = await aiResp.json();
      let out = aiJson?.output ?? aiJson?.result ?? aiJson;
      if (typeof out === "string") {
        try {
          out = JSON.parse(out);
        } catch (e) {
          const m = out.match(/\{[\s\S]*\}/);
          out = m ? JSON.parse(m[0]) : {};
        }
      }

      const normalized = {
        name: out.name ?? out.fullname ?? null,
        dateofbirth: out.dateofbirth ?? out.dob ?? null,
        visited: out.visited ?? out.lastvisited ?? null,
        phone: out.phone ?? out.phonenumber ?? null,
        email: out.email ?? out.contact_email ?? null,
        bloodtype: out.bloodtype ?? out.blood_group ?? null,
        gender: out.gender ?? out.sex ?? null,
        place: out.place ?? out.hospital ?? out.location ?? null,
        symptom1: out.symptom1 ?? out.s1 ?? null,
        symptom2: out.symptom2 ?? out.s2 ?? null,
        symptom3: out.symptom3 ?? out.s3 ?? null,
        summary: out.summary ?? out.notes ?? null,
      };

      normalized.phoneDigits = normalized.phone ? String(normalized.phone).replace(/[^\d]/g, "") : null;

      // Normalize date fields to MM-DD-YYYY for consistent storage
      if (normalized.dateofbirth) normalized.dateofbirth = toMMDDYYYY(normalized.dateofbirth);
      if (normalized.visited) normalized.visited = toMMDDYYYY(normalized.visited);

      setExtracted(normalized);
      showToast({ type: "success", title: "Extraction complete", message: "OCR + AI extraction finished — review before saving." });
      return normalized;
    } catch (err) {
      console.error("Extraction error:", err);
      showToast({ type: "error", title: "Extraction failed", message: "See console for details." });
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // ---------- Duplicate detection ----------
  const listAllPatients = async () => {
    try {
      const res = await databases.listDocuments(DATABASE_ID, PATIENTS_COL, [Query.limit(1000)]);
      return res.documents || [];
    } catch (err) {
      console.error("listAllPatients failed:", err);
      return [];
    }
  };

  // Find patient using rules: email > exact name > dob > phone > fuzzy > token containment
  const findPatientByName = async (name, email, dob, phoneDigits) => {
    const docs = await listAllPatients();

    if (email) {
      const byEmail = docs.find((d) => d.email && String(d.email).toLowerCase() === String(email).toLowerCase());
      if (byEmail) return byEmail;
    }

    const normalizedTarget = normalizeName(name);
    if (normalizedTarget) {
      const exact = docs.find((d) => normalizeName(d.name) === normalizedTarget);
      if (exact) return exact;
    }

    if (dob) {
      const candidate = docs.find((d) => {
        if (!d.dateofbirth) return false;
        const a = String(d.dateofbirth).replace(/[^\d]/g, "");
        const b = String(dob).replace(/[^\d]/g, "");
        if (!a || !b) return false;
        return a.endsWith(b) || b.endsWith(a) || a === b;
      });
      if (candidate) return candidate;
    }

    if (phoneDigits) {
      const byPhone = docs.find((d) => {
        const p = d.phonenumber ? String(d.phonenumber).replace(/[^\d]/g, "") : "";
        return p && phoneDigits && p === phoneDigits;
      });
      if (byPhone) return byPhone;
    }

    if (normalizedTarget) {
      const tFirst = firstInitial(name);
      const tLast = lastName(name);
      if (tLast) {
        const fuzzy = docs.find((d) => {
          const dFirst = firstInitial(d.name);
          const dLast = lastName(d.name);
          return dLast && dFirst && dLast === tLast && dFirst === tFirst;
        });
        if (fuzzy) return fuzzy;
      }
    }

    if (normalizedTarget) {
      const tokens = normalizedTarget.split(" ");
      const fallback = docs.find((d) => {
        const dn = normalizeName(d.name);
        return tokens.every((t) => t && dn.includes(t));
      });
      if (fallback) return fallback;
    }

    return null;
  };

  // ---------- Storage & DB operations ----------
  const uploadToStorage = async (file) => {
    if (!BUCKET_ID) throw new Error("No BUCKET_ID configured");
    const id = mkId();
    const result = await storage.createFile(BUCKET_ID, id, file);
    const url = fileViewUrl(BUCKET_ID, result.$id);
    return { url, fileId: result.$id, storageResult: result };
  };

  // Ensure patient dateofbirth stored in MM-DD-YYYY
  const createPatient = async ({ name, dateofbirth, lastvisited, phoneDigits, email, place, gender, bloodtype }) => {
    const docId = mkId();
    const payload = {
      name: name || "Unknown",
      dateofbirth: dateofbirth ? toMMDDYYYY(dateofbirth) : null,
      lastvisited: lastvisited ? toMMDDYYYY(lastvisited) : null,
      phonenumber: phoneDigits !== null ? String(phoneDigits) : null,
      email: email || null,
      place: place || null,
      gender: gender || null,
      bloodtype: bloodtype || null,
      profile: null,
      recordsid: [],
    };
    Object.keys(payload).forEach((k) => payload[k] === null && delete payload[k]);
    const created = await databases.createDocument(DATABASE_ID, PATIENTS_COL, docId, payload, [Permission.read(Role.any())]);
    return created;
  };

  // Include name in record payload and ensure recorddate is MM-DD-YYYY
  const createRecordDoc = async ({ imageUrl, patientId, extractedFields, patientName = null }) => {
    const docId = mkId();
    const recPayload = {
      name: extractedFields?.name ?? patientName ?? null, // newly added name field for records
      image: imageUrl,
      symptom1: extractedFields?.symptom1 ?? null,
      symptom2: extractedFields?.symptom2 ?? null,
      symptom3: extractedFields?.symptom3 ?? null,
      recorddate: extractedFields?.visited ? toMMDDYYYY(extractedFields.visited) : toMMDDYYYY(new Date().toISOString()),
      patientsid: patientId,
      summary: extractedFields?.summary ?? null,
    };
    Object.keys(recPayload).forEach((k) => recPayload[k] === null && delete recPayload[k]);
    const created = await databases.createDocument(DATABASE_ID, RECORDS_COL, docId, recPayload, [Permission.read(Role.any())]);
    return created;
  };

  // Robust append with retries (fetch-latest, dedupe, update).
  const appendRecordIdToPatient = async (patientDoc, recordId, { maxRetries = 6, retryDelay = 300 } = {}) => {
    if (!patientDoc || !patientDoc.$id) throw new Error("Invalid patient doc for update");
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        const latest = await databases.getDocument(DATABASE_ID, PATIENTS_COL, patientDoc.$id);
        const existing = Array.isArray(latest.recordsid) ? [...latest.recordsid] : [];
        if (!existing.includes(recordId)) existing.push(recordId);
        const updated = await databases.updateDocument(DATABASE_ID, PATIENTS_COL, patientDoc.$id, { recordsid: existing });
        return updated;
      } catch (err) {
        console.warn(`[appendRecord] attempt ${attempt} failed:`, err);
        if (attempt >= maxRetries) {
          console.error("[appendRecord] all attempts failed");
          throw err;
        }
        await new Promise((res) => setTimeout(res, retryDelay));
      }
    }
  };

  const updatePatientIfFieldsFound = async (patientDoc, fields) => {
    if (!patientDoc || !patientDoc.$id) return patientDoc;
    const payload = {};
    if (fields.phoneDigits && !patientDoc.phonenumber) payload.phonenumber = String(fields.phoneDigits);
    if (fields.email && !patientDoc.email) payload.email = fields.email;
    if (fields.place && !patientDoc.place) payload.place = fields.place;
    if (fields.gender && !patientDoc.gender) payload.gender = fields.gender;
    if (fields.bloodtype && !patientDoc.bloodtype) payload.bloodtype = fields.bloodtype;
    if (Object.keys(payload).length === 0) return patientDoc;
    try {
      const updated = await databases.updateDocument(DATABASE_ID, PATIENTS_COL, patientDoc.$id, payload);
      return updated;
    } catch (err) {
      console.error("updatePatientIfFieldsFound failed:", err);
      return patientDoc;
    }
  };

  // ---------- Handlers ----------
  const handleProcess = async () => {
    if (!file) {
      showToast({ type: "info", title: "No file", message: "Select a file first." });
      return;
    }
    try {
      await runOcrAndExtract(file);
    } catch (err) {
      console.error("handleProcess error:", err);
    }
  };

  const handleUploadAndCreateRecord = async () => {
    if (!file) {
      showToast({ type: "error", title: "No file", message: "Select a file before saving." });
      return;
    }
    if (!extracted) {
      showToast({ type: "info", title: "No data", message: "Run Process to extract data." });
      return;
    }
    setCreatingRecord(true);

    try {
      const phoneDigits = extracted.phoneDigits ?? (extracted.phone ? String(extracted.phone).replace(/[^\d]/g, "") : null);
      const dob = extracted.dateofbirth ?? null;
      const email = extracted.email ?? null;
      const name = extracted.name ?? null;

      // 1) find existing patient
      let patientDoc = null;
      if (email || name || phoneDigits || dob) {
        patientDoc = await findPatientByName(name, email, dob, phoneDigits);
      }

      // 2) update found patient with missing fields
      if (patientDoc) {
        patientDoc = await updatePatientIfFieldsFound(patientDoc, {
          phoneDigits,
          email,
          place: extracted.place,
          gender: extracted.gender,
          bloodtype: extracted.bloodtype,
        });
      }

      // 3) create patient if none found
      if (!patientDoc) {
        patientDoc = await createPatient({
          name,
          dateofbirth: dob,
          lastvisited: extracted.visited,
          phoneDigits,
          email,
          place: extracted.place,
          gender: extracted.gender,
          bloodtype: extracted.bloodtype,
        });
      }

      if (!patientDoc || !patientDoc.$id) throw new Error("No patient document after detection/create.");

      // 4) upload file to storage
      if (!BUCKET_ID) {
        showToast({ type: "error", title: "Uploads disabled", message: "VITE_BUCKET_ID missing in .env." });
        throw new Error("BUCKET_ID missing");
      }
      const uploadResult = await uploadToStorage(file);
      setUploadedUrl(uploadResult.url);

      // 5) create record doc (include name and normalized date)
      const record = await createRecordDoc({
        imageUrl: uploadResult.url,
        patientId: patientDoc.$id,
        extractedFields: extracted,
        patientName: patientDoc.name || name,
      });

      // 6) append record id to patient robustly
      try {
        await appendRecordIdToPatient(patientDoc, record.$id);
      } catch (appendErr) {
        // append failed after retries — do not delete the created record; log & notify
        console.error("appendRecordIdToPatient failed:", appendErr);
        showToast({
          type: "error",
          title: "Partial save",
          message:
            "Record was created but linking to patient failed. The record contains the patient name and patientsid (if available).",
        });
      }

      // 7) verify record has patientsid (safeguard) - if missing set it
      try {
        const latestRec = await databases.getDocument(DATABASE_ID, RECORDS_COL, record.$id);
        if (!latestRec.patientsid || String(latestRec.patientsid) !== String(patientDoc.$id)) {
          await databases.updateDocument(DATABASE_ID, RECORDS_COL, record.$id, { patientsid: patientDoc.$id });
        }
      } catch (err) {
        console.warn("Could not validate/update record.patientsid:", err);
      }

      showToast({ type: "success", title: "Saved", message: "Record saved and linked to patient (or recorded with name)." });

      // reset UI
      setFile(null);
      setOcrText("");
      setExtracted(null);
      setUploadedUrl(null);
    } catch (err) {
      console.error("handleUploadAndCreateRecord failed:", err);
      showToast({ type: "error", title: "Save failed", message: err.message || "Check console." });
    } finally {
      setCreatingRecord(false);
    }
  };

  // ---------- Render ----------
  return (
    <>
      <div className="modal-outer">
        <div className="modal">
          <div className="modal-header">
            <h2 className="modal-title">Upload Medical Form</h2>
            <div>
              <button onClick={() => setShowUploadModal(false)} className="btn-close">
                <X size={24} />
              </button>
            </div>
          </div>

          <div className="modal-body">
            <div
              className="upload-area"
              onClick={() => document.getElementById("um-file-input")?.click()}
              title="Click to choose file"
            >
              <Upload className="upload-icon" />
              <div>
                <div className="file-name">{file ? file.name : "Click to select or drop a scanned form"}</div>
                <div className="file-hint">{file ? `${(file.size / 1024).toFixed(1)} KB` : "PNG/JPG preferred"}</div>
              </div>
              <input id="um-file-input" type="file" accept="image/*" className="hidden-input" onChange={handleFileChange} />
            </div>

            <div className="action-row">
              <button onClick={handleProcess} className="btn btn-primary" disabled={!file || loading}>
                {loading ? "Processing..." : "Process"}
              </button>

              <button
                onClick={() => {
                  setFile(null);
                  setExtracted(null);
                  setOcrText("");
                  setUploadedUrl(null);
                }}
                className="btn btn-secondary"
              >
                Reset
              </button>
            </div>

            {ocrText && (
              <div className="ocr-preview">
                <strong>OCR Preview</strong>
                <div className="ocr-text">{ocrText}</div>
              </div>
            )}

            {extracted && (
              <div className="extracted">
                <strong>Extracted Data (editable)</strong>

                <div>
                  <label className="form-label">Name</label>
                  <input value={extracted.name || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), name: e.target.value }))} className="form-input" />
                </div>

                <div className="two-col">
                  <div>
                    <label className="form-label">Date of Birth</label>
                    <input
                      value={extracted.dateofbirth || ""}
                      onChange={(e) => setExtracted((p) => ({ ...(p || {}), dateofbirth: e.target.value }))}
                      placeholder="MM/DD/YYYY or ISO"
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">Visited (record date)</label>
                    <input
                      value={extracted.visited || ""}
                      onChange={(e) => setExtracted((p) => ({ ...(p || {}), visited: e.target.value }))}
                      placeholder="MM/DD/YYYY or ISO"
                      className="form-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label">Phone (will be cleaned to digits)</label>
                  <input value={extracted.phone || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), phone: e.target.value }))} className="form-input" />
                  <div className="detected-digits">Detected digits: {extracted?.phoneDigits ?? "none"}</div>
                </div>

                <div>
                  <label className="form-label">Email</label>
                  <input value={extracted.email || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), email: e.target.value }))} className="form-input" />
                </div>

                <div>
                  <label className="form-label">Place</label>
                  <input value={extracted.place || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), place: e.target.value }))} className="form-input" />
                </div>

                <div>
                  <label className="form-label">Gender</label>
                  <input value={extracted.gender || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), gender: e.target.value }))} className="form-input" />
                </div>

                <div>
                  <label className="form-label">Blood Type</label>
                  <input value={extracted.bloodtype || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), bloodtype: e.target.value }))} className="form-input" />
                </div>

                <div>
                  <label className="form-label">Symptoms</label>
                  <input value={extracted.symptom1 || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), symptom1: e.target.value }))} placeholder="Symptom 1" className="form-input symptom-input" />
                  <input value={extracted.symptom2 || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), symptom2: e.target.value }))} placeholder="Symptom 2" className="form-input symptom-input" />
                  <input value={extracted.symptom3 || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), symptom3: e.target.value }))} placeholder="Symptom 3" className="form-input" />
                </div>

                <div>
                  <label className="form-label">Summary</label>
                  <textarea value={extracted.summary || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), summary: e.target.value }))} rows={3} className="form-textarea" />
                </div>

                {uploadedUrl && (
                  <div>
                    <label className="form-label">Uploaded image preview</label>
                    <img src={uploadedUrl} alt="uploaded" className="uploaded-img" />
                  </div>
                )}

                <div className="footer-actions">
                  <button onClick={() => setShowUploadModal(false)} className="btn btn-reset">
                    Close
                  </button>
                  <button
                    onClick={async () => {
                      if (extracted?.phone) {
                        const digits = ("" + extracted.phone).replace(/[^\d]/g, "");
                        extracted.phoneDigits = digits || null;
                      } else {
                        extracted.phoneDigits = extracted.phoneDigits ?? null;
                      }
                      await handleUploadAndCreateRecord();
                    }}
                    className="btn btn-primary"
                    disabled={creatingRecord || loading}
                  >
                    {creatingRecord ? "Saving..." : "Upload & Save Record"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast container */}
      <div
        style={{
          position: "fixed",
          right: 18,
          top: 18,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          zIndex: 9999,
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              background: t.type === "success" ? "#ecfdf5" : t.type === "error" ? "#fff1f2" : "#eff6ff",
              border: `1px solid ${t.type === "success" ? "#34d399" : t.type === "error" ? "#fb7185" : "#60a5fa"}`,
              padding: "10px 12px",
              borderRadius: 10,
              boxShadow: "0 6px 18px rgba(2,6,23,0.06)",
              minWidth: 300,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                display: "grid",
                placeItems: "center",
                background: t.type === "success" ? "#bbf7d0" : t.type === "error" ? "#fecaca" : "#dbeafe",
                flex: "0 0 40px",
              }}
            >
              {t.type === "success" ? <Check size={18} color="#065f46" /> : t.type === "error" ? <AlertTriangle size={18} color="#7f1d1d" /> : <Check size={18} color="#1e3a8a" />}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{t.title}</div>
              {t.message && <div style={{ marginTop: 6, opacity: 0.95 }}>{t.message}</div>}
            </div>

            <button onClick={() => removeToast(t.id)} aria-label="Close toast" style={{ background: "transparent", border: "none", cursor: "pointer" }}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
};

export default UploadModal;
