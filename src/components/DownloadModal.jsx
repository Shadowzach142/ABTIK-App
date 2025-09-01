// src/components/DownloadModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  Search,
  User,
  Calendar,
  Phone,
  MapPin,
  Droplets,
  Mail,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Edit,
  Camera,
  Save,
  FileText,
  Lock,
} from "lucide-react";
import { Client, Databases, Storage } from "appwrite";

/* ---------- Appwrite setup (use your env vars) ---------- */
const ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1";
const PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID;
const DATABASE_ID = import.meta.env.VITE_DATABASE_ID;
const PATIENTS_COL = import.meta.env.VITE_PATIENTS_COLLECTION_ID;
const RECORDS_COL = import.meta.env.VITE_RECORDS_COLLECTION_ID;
const BUCKET_ID = import.meta.env.VITE_BUCKET_ID || null; // <- you said you renamed this

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
const databases = new Databases(client);
const storage = new Storage(client);

/* ---------- helpers ---------- */
const fmtDateOnly = (value) => {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value || "N/A";
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
};

const cleanInteger = (raw) => {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).replace(/[^\d]/g, "");
  if (s === "") return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
};

const Field = ({ icon, label, value }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <div style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
      {icon}
      {label}
    </div>
    <div style={{ fontSize: 14, color: "#0f172a" }}>{value ?? "N/A"}</div>
  </div>
);

const STATIC_HOSPITALS = [
  "General Hospital Manila",
  "St. Luke's Medical Center",
  "Philippine General Hospital",
  "Makati Medical Center",
];

/* ---------- Component ---------- */
const DownloadModal = ({ setShowDownloadModal }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [recordsByPatient, setRecordsByPatient] = useState({});
  const [recordsLoading, setRecordsLoading] = useState({});
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedPatient, setEditedPatient] = useState(null);
  const [recordExpanded, setRecordExpanded] = useState({});
  const [uploadingProfile, setUploadingProfile] = useState(false);

  useEffect(() => {
    console.log("ENV:", { ENDPOINT, PROJECT_ID, DATABASE_ID, PATIENTS_COL, RECORDS_COL, BUCKET_ID });
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setPatients([]);
      return;
    }
    const t = setTimeout(() => fetchPatients(searchQuery.trim()), 600);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchPatients = async (q) => {
    setLoadingPatients(true);
    console.log("Searching patients for:", q);
    try {
      const res = await databases.listDocuments(DATABASE_ID, PATIENTS_COL);
      console.log("Appwrite patients raw:", res);
      const filtered = res.documents.filter((d) => (d.name || "").toLowerCase().includes(q.toLowerCase()));
      console.log("Filtered results:", filtered);
      setPatients(filtered);
    } catch (err) {
      console.error("Error fetching patients:", err);
      setPatients([]);
    } finally {
      setLoadingPatients(false);
    }
  };

  const fetchRecordsForPatient = async (patientId) => {
    if (!patientId) return;
    if (recordsByPatient[patientId]) return;
    setRecordsLoading((s) => ({ ...s, [patientId]: true }));
    try {
      const res = await databases.listDocuments(DATABASE_ID, RECORDS_COL);
      console.log("Appwrite records raw:", res);
      const filtered = res.documents
        .filter((r) => {
          if (!r.patientsid) return false;
          if (typeof r.patientsid === "string") return r.patientsid === patientId;
          if (r.patientsid?.$id) return r.patientsid.$id === patientId;
          return false;
        })
        .sort((a, b) => {
          const ta = new Date(a.recorddate).getTime();
          const tb = new Date(b.recorddate).getTime();
          if (isNaN(ta) || isNaN(tb)) return 0;
          return tb - ta;
        });
      console.log("Filtered records:", filtered);
      setRecordsByPatient((prev) => ({ ...prev, [patientId]: filtered }));
    } catch (err) {
      console.error("Error fetching records:", err);
      setRecordsByPatient((prev) => ({ ...prev, [patientId]: [] }));
    } finally {
      setRecordsLoading((s) => ({ ...s, [patientId]: false }));
    }
  };

  const handleTogglePatient = (p) => {
    const id = p.$id;
    const will = expandedId !== id ? id : null;
    setExpandedId(will);
    setSelectedPatient(will ? p : null);
    setIsEditing(false);
    setEditedPatient(null);
    setRecordExpanded({});
    if (will) fetchRecordsForPatient(id);
  };

  const toggleRecord = (recordId) => setRecordExpanded((prev) => ({ ...prev, [recordId]: !prev[recordId] }));

  // FIX: accept patient directly so we don't rely on stale selectedPatient state
  const handleStartEdit = (patient) => {
    if (!patient) return;
    setSelectedPatient(patient);
    setEditedPatient({ ...patient }); // immediate snapshot
    setIsEditing(true);
    console.log("Edit started for patient:", patient.$id);
  };

  const handleInputChange = (field, value) => {
    setEditedPatient((prev) => ({ ...(prev || {}), [field]: value }));
  };

  // Upload file helper
  const uploadProfileFile = async (file) => {
    if (!BUCKET_ID) {
      console.warn("BUCKET_ID not set - uploads disabled");
      return null;
    }
    try {
      setUploadingProfile(true);
      const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      console.log("Uploading file to bucket:", BUCKET_ID, "fileId:", uniqueId);
      const result = await storage.createFile(BUCKET_ID, uniqueId, file);
      console.log("Storage.createFile result:", result);
      const viewUrl = `${ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${result.$id}/view?project=${PROJECT_ID}`;
      return { viewUrl, fileId: result.$id };
    } catch (err) {
      console.error("Error uploading profile file:", err);
      alert("Failed to upload profile image. See console.");
      return null;
    } finally {
      setUploadingProfile(false);
    }
  };

  // Upload & immediately update patient profile attribute
  const handleProfileFileSelect = async (files) => {
    const file = files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setEditedPatient((prev) => ({ ...(prev || {}), profilePreview: preview }));

    if (!BUCKET_ID) {
      alert("Profile upload not enabled: set VITE_BUCKET_ID in your env to enable uploads. Local preview only.");
      return;
    }

    const patientId = (editedPatient && editedPatient.$id) || (selectedPatient && selectedPatient.$id);
    if (!patientId) {
      alert("No patient selected to upload profile for.");
      return;
    }

    const uploadResult = await uploadProfileFile(file);
    if (!uploadResult) return;

    try {
      console.log("Updating patient profile attribute:", patientId, uploadResult.viewUrl);
      const updated = await databases.updateDocument(DATABASE_ID, PATIENTS_COL, patientId, { profile: uploadResult.viewUrl });
      console.log("Updated patient doc (profile):", updated);
      setPatients((prev) => prev.map((p) => (p.$id === updated.$id ? updated : p)));
      setSelectedPatient((prev) => (prev && prev.$id === updated.$id ? updated : prev));
      setEditedPatient((prev) => (prev && prev.$id === updated.$id ? updated : { ...(prev || {}), profile: uploadResult.viewUrl, profilePreview: preview }));
    } catch (err) {
      console.error("Error updating patient profile attribute:", err);
      alert("Failed to save profile to patient document. See console.");
    }
  };

  // Save edited fields to Appwrite
  const handleSave = async () => {
    if (!editedPatient && !selectedPatient) {
      console.warn("No editedPatient or selectedPatient present on Save");
      return;
    }

    // Prefer editedPatient (current changes), fallback to selectedPatient
    const docToSave = editedPatient || selectedPatient;
    const docId = docToSave.$id || (selectedPatient && selectedPatient.$id);

    if (!docId) {
      console.error("Missing document ID — cannot save");
      return;
    }

    // Clean phone
    const cleanedPhone = cleanInteger(docToSave.phonenumber);
    if (docToSave.phonenumber && cleanedPhone === null) {
      alert("Phone number contains invalid characters. Please enter digits only.");
      return;
    }

    // Build payload
    const payload = {
      name: docToSave.name,
      dateofbirth: docToSave.dateofbirth,
      gender: docToSave.gender,
      email: docToSave.email,
      place: docToSave.place,
      bloodtype: docToSave.bloodtype,
      lastvisited: docToSave.lastvisited,
    };
    if (cleanedPhone !== null) payload.phonenumber = cleanedPhone;
    if (docToSave.profile) payload.profile = docToSave.profile;

    console.log("Saving patient payload for id:", docId, payload);

    try {
      const updated = await databases.updateDocument(DATABASE_ID, PATIENTS_COL, docId, payload);
      console.log("Save succeeded, updated doc:", updated);
      // update local caches
      setPatients((prev) => prev.map((p) => (p.$id === updated.$id ? updated : p)));
      setSelectedPatient(updated);
      setEditedPatient(null);
      setIsEditing(false);
      // keep expanded view
    } catch (err) {
      console.error("Error updating patient:", err);
      alert("Failed to save changes. Check console for details.");
    }
  };

  const topContent = useMemo(() => {
    if (!searchQuery.trim()) return <p style={{ color: "#64748b" }}>Type a name to search patients…</p>;
    if (loadingPatients) return <p>Searching…</p>;
    if (!loadingPatients && patients.length === 0) return <p>No patient found.</p>;
    return null;
  }, [searchQuery, loadingPatients, patients]);

  // hospital row styles (as before)
  const hospitalRowStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid #E6EDF6",
    background: "#fff",
  };
  const hospitalLeftStyle = { display: "flex", alignItems: "center", gap: 12 };
  const iconBoxStyle = { width: 36, height: 36, borderRadius: 8, background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #EEF6FB" };
  const requestBtnStyle = { display: "inline-flex", alignItems: "center", gap: 8, background: "transparent", border: "none", color: "#f97316", cursor: "pointer", fontWeight: 600 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.5)", display: "flex", justifyContent: "center", alignItems: "center", padding: 16, zIndex: 1000 }}>
      <div style={{ width: "min(980px,100%)", background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 10px 30px rgba(2,6,23,0.12)" }}>
        {/* header */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, borderBottom: "1px solid #eef2f7" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, border: "1px solid #eef2f7", padding: 8, borderRadius: 10 }}>
            <Search size={18} />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search patient by name..." style={{ border: "none", outline: "none", flex: 1 }} />
          </div>
          <button onClick={() => setShowDownloadModal(false)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #eef2f7", background: "#fff", cursor: "pointer" }}>
            <X size={16} /> Close
          </button>
        </div>

        {/* content */}
        <div style={{ padding: 16, maxHeight: "72vh", overflowY: "auto" }}>
          {topContent}

          {patients.length > 0 && (
            <div style={{ display: "grid", gap: 12 }}>
              {patients.map((p) => (
                <div key={p.$id} style={{ border: "1px solid #eef2f7", borderRadius: 10, overflow: "hidden" }}>
                  {/* patient header */}
                  <div onClick={() => handleTogglePatient(p)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fafafa", padding: 12, cursor: "pointer" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <div style={{ width: 44, height: 44, borderRadius: 8, background: "#eef2f7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {p.profile ? <img src={p.profile} alt="profile" style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover" }} /> : <User size={20} />}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{p.name}</div>
                        <div style={{ color: "#64748b", fontSize: 13 }}>{p.place || "—"} • Last: {p.lastvisited || "—"}</div>
                      </div>
                    </div>
                    <div>{expandedId === p.$id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</div>
                  </div>

                  {/* expanded */}
                  {expandedId === p.$id && (
                    <div style={{ padding: 12 }}>
                      {/* profile top */}
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                        <div style={{ width: 120 }}>
                          <div style={{ position: "relative" }}>
                            <img src={selectedPatient && selectedPatient.$id === p.$id && editedPatient?.profilePreview ? editedPatient.profilePreview : (p.profile || "/avatar.png")} alt="avatar" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 10 }} />
                            {/* Upload control visible when editing this patient */}
                            {isEditing && selectedPatient?.$id === p.$id && (
                              <div style={{ position: "absolute", left: 8, bottom: 8, display: "flex", gap: 8 }}>
                                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#fff", padding: "6px 8px", borderRadius: 8, border: "1px solid #eef2f7", cursor: "pointer" }}>
                                  <Camera size={14} />
                                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleProfileFileSelect(e.target.files)} disabled={uploadingProfile} />
                                  {uploadingProfile ? "Uploading..." : "Upload"}
                                </label>
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ flex: 1 }}>
                          {!isEditing || selectedPatient?.$id !== p.$id ? (
                            <>
                              <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                                <Field icon={<Calendar size={14} />} label="DOB" value={p.dateofbirth} />
                                <Field icon={<Droplets size={14} />} label="Blood Type" value={p.bloodtype} />
                                <Field icon={<Phone size={14} />} label="Phone" value={p.phonenumber} />
                              </div>

                              <div style={{ display: "flex", gap: 12 }}>
                                <Field icon={<Mail size={14} />} label="Email" value={p.email} />
                                <Field icon={<MapPin size={14} />} label="Place" value={p.place} />
                                <Field label="Gender" value={p.gender} />
                              </div>
                            </>
                          ) : (
                            <div style={{ display: "grid", gap: 8 }}>
                              <input value={editedPatient?.name || ""} onChange={(e) => handleInputChange("name", e.target.value)} placeholder="Full name" style={{ padding: 8, borderRadius: 8, border: "1px solid #eef2f7" }} />
                              <div style={{ display: "flex", gap: 8 }}>
                                <input value={editedPatient?.dateofbirth || ""} onChange={(e) => handleInputChange("dateofbirth", e.target.value)} placeholder="DOB" style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #eef2f7" }} />
                                <input value={editedPatient?.gender || ""} onChange={(e) => handleInputChange("gender", e.target.value)} placeholder="Gender" style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #eef2f7" }} />
                              </div>
                              <div style={{ display: "flex", gap: 8 }}>
                                <input value={editedPatient?.phonenumber || ""} onChange={(e) => handleInputChange("phonenumber", e.target.value)} placeholder="Phone (digits only)" style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #eef2f7" }} />
                                <input value={editedPatient?.email || ""} onChange={(e) => handleInputChange("email", e.target.value)} placeholder="Email" style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #eef2f7" }} />
                              </div>
                              <input value={editedPatient?.place || ""} onChange={(e) => handleInputChange("place", e.target.value)} placeholder="Place" style={{ padding: 8, borderRadius: 8, border: "1px solid #eef2f7" }} />
                              <div style={{ display: "flex", gap: 8 }}>
                                <input value={editedPatient?.bloodtype || ""} onChange={(e) => handleInputChange("bloodtype", e.target.value)} placeholder="Blood Type" style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #eef2f7" }} />
                                <input value={editedPatient?.lastvisited || ""} onChange={(e) => handleInputChange("lastvisited", e.target.value)} placeholder="Last visited" style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #eef2f7" }} />
                              </div>
                              {editedPatient?.profilePreview && (
                                <div style={{ marginTop: 6 }}>
                                  <div style={{ fontSize: 12, color: "#64748b" }}>Profile preview</div>
                                  <img src={editedPatient.profilePreview} alt="preview" style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 8, marginTop: 6 }} />
                                </div>
                              )}
                            </div>
                          )}

                          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                            {!isEditing || selectedPatient?.$id !== p.$id ? (
                              <button onClick={() => handleStartEdit(p)} style={{ display: "inline-flex", gap: 8, alignItems: "center", padding: "8px 12px", borderRadius: 8, background: "#0ea5e9", color: "#fff", border: "none", cursor: "pointer" }}>
                                <Edit size={14} /> Edit Profile
                              </button>
                            ) : (
                              <>
                                <button onClick={handleSave} style={{ display: "inline-flex", gap: 8, alignItems: "center", padding: "8px 12px", borderRadius: 8, background: "#10b981", color: "#fff", border: "none", cursor: "pointer" }}>
                                  <Save size={14} /> Save
                                </button>
                                <button onClick={() => { setIsEditing(false); setEditedPatient(null); }} style={{ padding: "8px 12px", borderRadius: 8, background: "#f1f5f9", border: "1px solid #e2e8f0", cursor: "pointer" }}>
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* records accordion */}
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Visit / Records</div>
                        {recordsLoading[p.$id] && <p>Loading records…</p>}
                        {!recordsLoading[p.$id] && (recordsByPatient[p.$id]?.length ? (
                          <div style={{ display: "grid", gap: 8 }}>
                            {recordsByPatient[p.$id].map((r) => {
                              const isOpen = !!recordExpanded[r.$id];
                              return (
                                <div key={r.$id} style={{ border: "1px solid #eef2f7", borderRadius: 8, overflow: "hidden" }}>
                                  <button onClick={() => toggleRecord(r.$id)} style={{ width: "100%", padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fafafa", border: "none", cursor: "pointer" }}>
                                    <div style={{ fontWeight: 600 }}>
                                      <div style={{ color: "#64748b", fontSize: 12 }}>Record Date</div>
                                      <div style={{ fontSize: 14 }}>{fmtDateOnly(r.recorddate)}</div>
                                    </div>
                                    <div>{isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</div>
                                  </button>

                                  {isOpen && (
                                    <div style={{ padding: 12, background: "#fff" }}>
                                      <div style={{ display: "grid", gap: 8 }}>
                                        <div>
                                          <div style={{ fontSize: 12, color: "#64748b" }}>Symptom 1</div>
                                          <div style={{ fontSize: 14, color: "#0f172a" }}>{r.symptom1 || "—"}</div>
                                        </div>
                                        <div>
                                          <div style={{ fontSize: 12, color: "#64748b" }}>Symptom 2</div>
                                          <div style={{ fontSize: 14, color: "#0f172a" }}>{r.symptom2 || "—"}</div>
                                        </div>
                                        <div>
                                          <div style={{ fontSize: 12, color: "#64748b" }}>Symptom 3</div>
                                          <div style={{ fontSize: 14, color: "#0f172a" }}>{r.symptom3 || "—"}</div>
                                        </div>

                                        {r.summary && (
                                          <div style={{ marginTop: 8, padding: 8, background: "#f8fafc", borderRadius: 8 }}>
                                            <div style={{ fontSize: 12, color: "#64748b" }}>Summary</div>
                                            <div style={{ fontSize: 14, color: "#0f172a" }}>{r.summary}</div>
                                          </div>
                                        )}

                                        {r.image && (
                                          <div style={{ marginTop: 8 }}>
                                            <a href={r.image} target="_blank" rel="noreferrer">
                                              <img src={r.image} alt="record" style={{ width: "100%", maxHeight: 240, objectFit: "cover", borderRadius: 8 }} />
                                            </a>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p>No records found for this patient.</p>
                        ))}
                      </div>

                      {/* Hospital UI */}
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Hospital Records</div>
                        <div style={{ display: "grid", gap: 10 }}>
                          {STATIC_HOSPITALS.map((h) => (
                            <div key={h} style={hospitalRowStyle}>
                              <div style={hospitalLeftStyle}>
                                <div style={iconBoxStyle}>
                                  <FileText size={18} color="#0f172a" />
                                </div>
                                <div style={{ fontSize: 15, color: "#0f172a", fontWeight: 600 }}>{h}</div>
                              </div>
                              <button style={requestBtnStyle} onClick={(e) => e.stopPropagation()}>
                                <Lock size={16} />
                                Request Access
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DownloadModal;
