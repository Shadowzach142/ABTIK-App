// src/components/UploadModal.jsx
import React, { useEffect, useState } from "react";
import { Upload, X } from "lucide-react";
import { Client, Databases, Storage, Permission, Role } from "appwrite";

/**
 * UploadModal.jsx — updated to request and save email, place, gender
 *
 * Requirements (env):
 * VITE_APPWRITE_ENDPOINT (optional)
 * VITE_APPWRITE_PROJECT_ID
 * VITE_DATABASE_ID
 * VITE_PATIENTS_COLLECTION_ID
 * VITE_RECORDS_COLLECTION_ID
 * VITE_BUCKET_ID
 *
 * Make sure Patients collection has attributes:
 * - name (string), dateofbirth (string), lastvisited (string)
 * - phonenumber (int) OR optional (we will only save integer if valid)
 * - email (string)
 * - place (string)
 * - gender (string)
 * - bloodtype (string) (optional)
 * - profile (string) (optional)
 * - recordsid (array)
 *
 * Records collection should accept: image, symptom1/2/3, recorddate, patientsid, summary
 */

const ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1";
const PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID;
const DATABASE_ID = import.meta.env.VITE_DATABASE_ID;
const PATIENTS_COL = import.meta.env.VITE_PATIENTS_COLLECTION_ID;
const RECORDS_COL = import.meta.env.VITE_RECORDS_COLLECTION_ID;
const BUCKET_ID = import.meta.env.VITE_BUCKET_ID || null;

// OCR / AI endpoints (keep your endpoints)
const OCR_URL = "https://ai-tools.rev21labs.com/api/v1/vision/ocr";
const PROMPT_URL = "https://ai-tools.rev21labs.com/api/v1/ai/prompt";
const API_KEY = "OWRhY2VjODUtOTkyMi00YWI3LThjOTItM2RiMzJlYWJlYjhj";

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
const databases = new Databases(client);
const storage = new Storage(client);

// utilities
const mkId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const fileViewUrl = (bucketId, fileId) =>
  `${ENDPOINT}/storage/buckets/${bucketId}/files/${fileId}/view?project=${PROJECT_ID}`;
const cleanText = (s = "") => (s || "").replace(/\s+/g, " ").trim();
const normalizeName = (n = "") => (n || "").trim().toLowerCase();
const cleanInteger = (raw) => {
  if (raw === undefined || raw === null) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (digits === "") return null;
  const n = parseInt(digits, 10);
  return Number.isNaN(n) ? null : n;
};

const UploadModal = ({ setShowUploadModal }) => {
  const [file, setFile] = useState(null);
  const [ocrText, setOcrText] = useState("");
  const [extracted, setExtracted] = useState(null);
  const [uploadedUrl, setUploadedUrl] = useState(null);

  const [loading, setLoading] = useState(false);
  const [creatingRecord, setCreatingRecord] = useState(false);

  useEffect(() => {
    console.log("UploadModal env:", { ENDPOINT, PROJECT_ID, DATABASE_ID, PATIENTS_COL, RECORDS_COL, BUCKET_ID });
  }, []);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setOcrText("");
    setExtracted(null);
    setUploadedUrl(null);
  };

  // OCR + AI extraction with updated prompt (requests email, place, gender)
  const runOcrAndExtract = async (file) => {
    if (!file) throw new Error("No file provided");
    setLoading(true);
    try {
      console.log("Starting OCR for file:", file.name);
      const form = new FormData();
      form.append("file", file, file.name);

      const ocrResp = await fetch(OCR_URL, {
        method: "POST",
        headers: { "x-api-key": API_KEY },
        body: form,
      });
      const ocrJson = await ocrResp.json();
      const text = cleanText(ocrJson?.text || ocrJson?.ocrText || "");
      console.log("OCR text:", text);
      setOcrText(text);

      // Improved prompt: explicitly request email/place/gender and full fields
      const promptBody = {
        prompt:
          "Extract patient information from the medical form text and return VALID JSON ONLY with these keys: " +
          "`name`, `dateofbirth` (DD/MM/YYYY or ISO or null), `visited` (DD/MM/YYYY or ISO or null), `phone`, `email`, `bloodtype`, `gender`, `place`, " +
          "`symptom1`, `symptom2`, `symptom3`, `summary`. " +
          "If a field is missing, set it to null. Phone should contain digits (you may return formatted), email as a string if present, gender as 'Male'/'Female'/'Other' or null. " +
          "Return JSON only.",
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

      console.log("Sending AI prompt...");
      const aiResp = await fetch(PROMPT_URL, {
        method: "POST",
        headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(promptBody),
      });
      const aiJson = await aiResp.json();
      console.log("AI raw response:", aiJson);

      // normalize output robustly (aiJson.output, aiJson.result, aiJson, or JSON string)
      let out = aiJson?.output ?? aiJson?.result ?? aiJson;
      if (typeof out === "string") {
        try {
          out = JSON.parse(out);
        } catch (e) {
          const m = out.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              out = JSON.parse(m[0]);
            } catch (ee) {
              out = {};
            }
          } else {
            out = {};
          }
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

      // derive phoneDigits
      normalized.phoneDigits = normalized.phone ? String(normalized.phone).replace(/[^\d]/g, "") : null;

      console.log("Normalized extracted:", normalized);
      setExtracted(normalized);
      return normalized;
    } finally {
      setLoading(false);
    }
  };

  // find patient by exact normalized name
  const findPatientByName = async (name) => {
    if (!name) return null;
    try {
      const res = await databases.listDocuments(DATABASE_ID, PATIENTS_COL);
      const target = normalizeName(name);
      const found = (res.documents || []).find((d) => normalizeName(d.name) === target);
      console.log("findPatientByName result:", { name, found });
      return found || null;
    } catch (err) {
      console.error("Error listing patients for duplicate check:", err);
      return null;
    }
  };

  // upload file to Appwrite Storage
  const uploadToStorage = async (file) => {
    if (!BUCKET_ID) throw new Error("No BUCKET_ID configured");
    const id = mkId();
    console.log("Uploading file to storage id:", id);
    const result = await storage.createFile(BUCKET_ID, id, file);
    console.log("Storage.createFile result:", result);
    const url = fileViewUrl(BUCKET_ID, result.$id);
    return { url, fileId: result.$id, storageResult: result };
  };

  // create patient (includes email/place/gender/phonenumber/bloodtype when available)
  const createPatient = async ({ name, dateofbirth, lastvisited, phoneDigits, email, place, gender, bloodtype }) => {
    const docId = mkId();
    const payload = {
      name: name || "Unknown",
      dateofbirth: dateofbirth || null,
      lastvisited: lastvisited || null,
      phonenumber: phoneDigits !== null ? Number(phoneDigits) : null,
      email: email || null,
      place: place || null,
      gender: gender || null,
      bloodtype: bloodtype || null,
      profile: null,
      recordsid: [],
    };
    // remove null keys (optional)
    Object.keys(payload).forEach((k) => payload[k] === null && delete payload[k]);
    console.log("Creating patient with payload:", payload);
    const created = await databases.createDocument(DATABASE_ID, PATIENTS_COL, docId, payload, [Permission.read(Role.any())]);
    console.log("Created patient:", created);
    return created;
  };

  // create record doc (no bloodtype here)
  const createRecordDoc = async ({ imageUrl, patientId, extractedFields }) => {
    const docId = mkId();
    const recPayload = {
      image: imageUrl,
      symptom1: extractedFields?.symptom1 ?? null,
      symptom2: extractedFields?.symptom2 ?? null,
      symptom3: extractedFields?.symptom3 ?? null,
      recorddate: extractedFields?.visited ?? new Date().toISOString(),
      patientsid: patientId,
      summary: extractedFields?.summary ?? null,
    };
    Object.keys(recPayload).forEach((k) => recPayload[k] === null && delete recPayload[k]);
    console.log("Creating record payload:", recPayload);
    const created = await databases.createDocument(DATABASE_ID, RECORDS_COL, docId, recPayload, [Permission.read(Role.any())]);
    console.log("Created record:", created);
    return created;
  };

  // append record id to patient.recordsid (idempotent)
  const appendRecordIdToPatient = async (patientDoc, recordId) => {
    if (!patientDoc || !patientDoc.$id) throw new Error("Invalid patient doc for update");
    const existing = Array.isArray(patientDoc.recordsid) ? [...patientDoc.recordsid] : [];
    if (!existing.includes(recordId)) existing.push(recordId);
    console.log("Updating patient.recordsid ->", existing);
    const updated = await databases.updateDocument(DATABASE_ID, PATIENTS_COL, patientDoc.$id, { recordsid: existing });
    console.log("Patient updated with record id:", updated);
    return updated;
  };

  // update patient with email/place/gender/phone/bloodtype if they are missing
  const updatePatientIfFieldsFound = async (patientDoc, fields) => {
    if (!patientDoc || !patientDoc.$id) return patientDoc;
    const payload = {};
    if (fields.phoneDigits && !patientDoc.phonenumber) payload.phonenumber = Number(fields.phoneDigits);
    if (fields.email && !patientDoc.email) payload.email = fields.email;
    if (fields.place && !patientDoc.place) payload.place = fields.place;
    if (fields.gender && !patientDoc.gender) payload.gender = fields.gender;
    if (fields.bloodtype && !patientDoc.bloodtype) payload.bloodtype = fields.bloodtype;
    if (Object.keys(payload).length === 0) return patientDoc;
    console.log("Updating existing patient with:", payload);
    try {
      const updated = await databases.updateDocument(DATABASE_ID, PATIENTS_COL, patientDoc.$id, payload);
      console.log("Patient updated:", updated);
      return updated;
    } catch (err) {
      console.error("Failed to update existing patient:", err);
      return patientDoc;
    }
  };

  // perform OCR & extraction
  const handleProcess = async () => {
    if (!file) return alert("Select a file first.");
    try {
      await runOcrAndExtract(file);
    } catch (err) {
      console.error("OCR/extract error:", err);
      alert("OCR or extraction failed. See console.");
    }
  };

  // final upload & attach/create logic (auto-detect by name)
  const handleUploadAndCreateRecord = async () => {
    if (!file) return alert("No file to upload.");
    if (!extracted) return alert("No extracted data — press Process first.");
    setCreatingRecord(true);

    try {
      // compute cleaned phone digits now (derivative)
      const phoneDigits = extracted.phoneDigits ?? (extracted.phone ? String(extracted.phone).replace(/[^\d]/g, "") : null);

      // 1) find patient by normalized name
      let patientDoc = null;
      if (extracted.name) patientDoc = await findPatientByName(extracted.name);

      // 2) if patient exists, update missing fields
      if (patientDoc) {
        patientDoc = await updatePatientIfFieldsFound(patientDoc, {
          phoneDigits,
          email: extracted.email,
          place: extracted.place,
          gender: extracted.gender,
          bloodtype: extracted.bloodtype,
        });
      }

      // 3) if no patient found -> create
      if (!patientDoc) {
        console.log("No existing patient found — creating new one for:", extracted.name);
        patientDoc = await createPatient({
          name: extracted.name,
          dateofbirth: extracted.dateofbirth,
          lastvisited: extracted.visited,
          phoneDigits,
          email: extracted.email,
          place: extracted.place,
          gender: extracted.gender,
          bloodtype: extracted.bloodtype,
        });
      }

      if (!patientDoc || !patientDoc.$id) throw new Error("No patient document available after detection/create.");

      // 4) upload image to storage
      if (!BUCKET_ID) throw new Error("VITE_BUCKET_ID not set — enable storage uploads.");
      const uploadResult = await uploadToStorage(file);
      setUploadedUrl(uploadResult.url);
      console.log("Uploaded file URL:", uploadResult.url);

      // 5) create record doc
      const record = await createRecordDoc({
        imageUrl: uploadResult.url,
        patientId: patientDoc.$id,
        extractedFields: extracted,
      });

      // 6) append record id to patient
      await appendRecordIdToPatient(patientDoc, record.$id);

      alert("Record saved and linked to patient successfully.");
      console.log("Completed create/attach: patient:", patientDoc, "record:", record);

      // reset UI
      setFile(null);
      setOcrText("");
      setExtracted(null);
      setUploadedUrl(null);
    } catch (err) {
      console.error("Upload/create record failed:", err);
      alert("Failed to create record. See console for details.");
    } finally {
      setCreatingRecord(false);
    }
  };

  // UI
  const modalOuter = { position: "fixed", inset: 0, display: "flex", justifyContent: "center", alignItems: "center", background: "rgba(2,6,23,0.45)", zIndex: 1000, padding: 16 };
  const modal = { width: "min(980px,100%)", background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 12px 30px rgba(2,6,23,0.12)" };
  const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, borderBottom: "1px solid #eef2f7" };
  const body = { padding: 16, maxHeight: "72vh", overflowY: "auto", display: "grid", gap: 12 };
  const fileBox = { border: "2px dashed #e6eef8", padding: 16, borderRadius: 10, display: "flex", gap: 12, alignItems: "center", cursor: "pointer" };
  const smallBtn = { padding: "8px 12px", borderRadius: 8, cursor: "pointer" };

  return (
    <div style={modalOuter}>
      <div style={modal}>
        <div style={header}>
          <h2 style={{ margin: 0 }}>Upload Medical Form</h2>
          <div>
            <button onClick={() => setShowUploadModal(false)} style={{ ...smallBtn, border: "1px solid #eef2f7", background: "#fff" }}>
              <X size={16} /> Close
            </button>
          </div>
        </div>

        <div style={body}>
          <div style={fileBox} onClick={() => document.getElementById("um-file-input")?.click()} title="Click to choose file">
            <Upload size={20} />
            <div>
              <div style={{ fontWeight: 600 }}>{file ? file.name : "Click to select or drop a scanned form"}</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>{file ? `${(file.size / 1024).toFixed(1)} KB` : "PNG/JPG preferred"}</div>
            </div>
            <input id="um-file-input" type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleProcess} style={{ ...smallBtn, background: "#0ea5e9", color: "#fff", border: "none" }} disabled={!file || loading}>
              {loading ? "Processing..." : "Process (OCR + Extract)"}
            </button>

            <button onClick={() => { setFile(null); setExtracted(null); setOcrText(""); setUploadedUrl(null); }} style={{ ...smallBtn, background: "#f1f5f9", border: "1px solid #e2e8f0" }}>
              Reset
            </button>
          </div>

          {ocrText && (
            <div style={{ borderRadius: 8, padding: 12, background: "#fbfdff", border: "1px solid #eef6fb" }}>
              <strong>OCR Preview</strong>
              <div style={{ marginTop: 8, color: "#0f172a" }}>{ocrText}</div>
            </div>
          )}

          {extracted && (
            <div style={{ borderRadius: 8, padding: 12, border: "1px solid #eef2f7", display: "grid", gap: 8 }}>
              <strong>Extracted Data (editable)</strong>

              <div style={{ display: "grid", gap: 8 }}>
                <label style={{ fontSize: 13, color: "#64748b" }}>Name</label>
                <input value={extracted.name || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), name: e.target.value }))} style={{ padding: 8, borderRadius: 8, border: "1px solid #eef2f7" }} />
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, color: "#64748b" }}>Date of Birth</label>
                  <input value={extracted.dateofbirth || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), dateofbirth: e.target.value }))} placeholder="DD/MM/YYYY or ISO" style={{ padding: 8, borderRadius: 8, border: "1px solid #eef2f7", width: "100%" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, color: "#64748b" }}>Visited (record date)</label>
                  <input value={extracted.visited || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), visited: e.target.value }))} placeholder="DD/MM/YYYY or ISO" style={{ padding: 8, borderRadius: 8, border: "1px solid #eef2f7", width: "100%" }} />
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <label style={{ fontSize: 13, color: "#64748b" }}>Phone (will be cleaned to digits)</label>
                <input value={extracted.phone || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), phone: e.target.value }))} style={{ padding: 8, borderRadius: 8, border: "1px solid #eef2f7" }} />
                <div style={{ fontSize: 12, color: "#64748b" }}>Detected digits: {extracted?.phoneDigits ?? "none"}</div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <label style={{ fontSize: 13, color: "#64748b" }}>Email</label>
                <input value={extracted.email || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), email: e.target.value }))} style={{ padding: 8, borderRadius: 8, border: "1px solid #eef2f7" }} />
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <label style={{ fontSize: 13, color: "#64748b" }}>Place / Hospital</label>
                <input value={extracted.place || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), place: e.target.value }))} style={{ padding: 8, borderRadius: 8, border: "1px solid #eef2f7" }} />
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <label style={{ fontSize: 13, color: "#64748b" }}>Gender</label>
                <input value={extracted.gender || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), gender: e.target.value }))} style={{ padding: 8, borderRadius: 8, border: "1px solid #eef2f7" }} />
              </div>

              <div>
                <label style={{ fontSize: 13, color: "#64748b" }}>Blood Type</label>
                <input value={extracted.bloodtype || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), bloodtype: e.target.value }))} style={{ padding: 8, borderRadius: 8, border: "1px solid #eef2f7" }} />
              </div>

              <div>
                <label style={{ fontSize: 13, color: "#64748b" }}>Symptoms</label>
                <input value={extracted.symptom1 || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), symptom1: e.target.value }))} placeholder="Symptom 1" style={{ padding: 8, borderRadius: 8, border: "1px solid #eef2f7", marginBottom: 6 }} />
                <input value={extracted.symptom2 || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), symptom2: e.target.value }))} placeholder="Symptom 2" style={{ padding: 8, borderRadius: 8, border: "1px solid #eef2f7", marginBottom: 6 }} />
                <input value={extracted.symptom3 || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), symptom3: e.target.value }))} placeholder="Symptom 3" style={{ padding: 8, borderRadius: 8, border: "1px solid #eef2f7" }} />
              </div>

              <div>
                <label style={{ fontSize: 13, color: "#64748b" }}>Summary</label>
                <textarea value={extracted.summary || ""} onChange={(e) => setExtracted((p) => ({ ...(p || {}), summary: e.target.value }))} rows={3} style={{ padding: 8, borderRadius: 8, border: "1px solid #eef2f7", width: "100%" }} />
              </div>

              {uploadedUrl && (
                <div>
                  <label style={{ fontSize: 13, color: "#64748b" }}>Uploaded image preview</label>
                  <img src={uploadedUrl} alt="uploaded" style={{ width: "100%", borderRadius: 8, marginTop: 8 }} />
                </div>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button onClick={() => setShowUploadModal(false)} style={{ ...smallBtn, background: "#f1f5f9", border: "1px solid #e2e8f0" }}>Close</button>
                <button
                  onClick={async () => {
                    // compute phoneDigits locally (no setState reliance)
                    if (extracted?.phone) {
                      const digits = ("" + extracted.phone).replace(/[^\d]/g, "");
                      extracted.phoneDigits = digits || null;
                    } else {
                      extracted.phoneDigits = extracted.phoneDigits ?? null;
                    }
                    // call upload flow
                    await handleUploadAndCreateRecord();
                  }}
                  style={{ ...smallBtn, background: "#0ea5e9", color: "#fff", border: "none" }}
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
  );
};

export default UploadModal;
