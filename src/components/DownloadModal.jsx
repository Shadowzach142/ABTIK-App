// src/components/DownloadModal.jsx
import { Client, Databases, Storage } from "appwrite";
// import "../styles/downloadModal.css";
import "../styles/global.css";
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
  <div className="dm-field">
    <div className="dm-field-label">
      {icon}
      {label}
    </div>
    <div className="dm-field-value">{value ?? "N/A"}</div>
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
      setEditedPatient((prev) =>
        prev && prev.$id === updated.$id ? updated : { ...(prev || {}), profile: uploadResult.viewUrl, profilePreview: preview }
      );
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
    if (!searchQuery.trim()) return <p className="dm-text-muted">Type a name to search patients…</p>;
    if (loadingPatients) return <p>Searching…</p>;
    if (!loadingPatients && patients.length === 0) return <p>No patient found.</p>;
    return null;
  }, [searchQuery, loadingPatients, patients]);

  // hospital row styles (as before) now via CSS classes

  return (
    <div className="modal-overlay">
      <div className="modal">
        {/* header */}
        <div className="modal-header">
          <h2 className="modal-title">Patient Records</h2>
                    <button onClick={() => setShowDownloadModal(false)} className="btn-close">
            <X size={24} />
          </button>
        </div>
        <div className="modal-body">
        <div className="modal-search">
          <Search size={18} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patient by name..."
          />
        </div>

        {/* content */}
        <div className="dm-content">
          {topContent}

          {patients.length > 0 && (
            <div className="dm-grid">
              {patients.map((p) => (
                <div key={p.$id} className="dm-card">
                  {/* patient header */}
                  <div onClick={() => handleTogglePatient(p)} className="dm-card-header">
                    <div className="dm-card-left">
                      <div className="dm-avatar-box">
                        {p.profile ? (
                          <img src={p.profile} alt="profile" className="dm-avatar" />
                        ) : (
                          <User size={20} />
                        )}
                      </div>
                      <div>
                        <div className="dm-card-name">{p.name}</div>
                        <div className="dm-card-sub">
                          {p.place || "—"} • Last: {p.lastvisited || "—"}
                        </div>
                      </div>
                    </div>
                    <div>{expandedId === p.$id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</div>
                  </div>

                  {/* expanded */}
                  {expandedId === p.$id && (
                    <div className="dm-expanded">
                      {/* profile top */}
                      <div className="dm-toprow">
                        <div className="dm-avatar-wrap">
                          <div className="dm-avatar-rel">
                            <img
                              src={
                                selectedPatient &&
                                selectedPatient.$id === p.$id &&
                                editedPatient?.profilePreview
                                  ? editedPatient.profilePreview
                                  : p.profile || "/avatar.png"
                              }
                              alt="avatar"
                              className="dm-avatar-lg"
                            />
                            {/* Upload control visible when editing this patient */}
                            {isEditing && selectedPatient?.$id === p.$id && (
                              <div className="dm-upload-ctrl">
                                <label className="dm-upload-label">
                                  <Camera size={14} />
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handleProfileFileSelect(e.target.files)}
                                    disabled={uploadingProfile}
                                    style={{ display: "none" }}
                                  />
                                  {uploadingProfile ? "Uploading..." : "Upload"}
                                </label>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="dm-flex1">
                          {!isEditing || selectedPatient?.$id !== p.$id ? (
                            <>
                              <div className="dm-row mb-8">
                                <Field icon={<Calendar size={14} />} label="DOB" value={p.dateofbirth} />
                                <Field icon={<Droplets size={14} />} label="Blood Type" value={p.bloodtype} />
                                <Field icon={<Phone size={14} />} label="Phone" value={p.phonenumber} />
                              </div>

                              <div className="dm-row">
                                <Field icon={<Mail size={14} />} label="Email" value={p.email} />
                                <Field icon={<MapPin size={14} />} label="Place" value={p.place} />
                                <Field label="Gender" value={p.gender} />
                              </div>
                            </>
                          ) : (
                            <div className="dm-edit-grid">
                              <input
                                value={editedPatient?.name || ""}
                                onChange={(e) => handleInputChange("name", e.target.value)}
                                placeholder="Full name"
                                className="dm-input"
                              />
                              <div className="dm-row">
                                <input
                                  value={editedPatient?.dateofbirth || ""}
                                  onChange={(e) => handleInputChange("dateofbirth", e.target.value)}
                                  placeholder="DOB"
                                  className="dm-input flex1"
                                />
                                <input
                                  value={editedPatient?.gender || ""}
                                  onChange={(e) => handleInputChange("gender", e.target.value)}
                                  placeholder="Gender"
                                  className="dm-input flex1"
                                />
                              </div>
                              <div className="dm-row">
                                <input
                                  value={editedPatient?.phonenumber || ""}
                                  onChange={(e) => handleInputChange("phonenumber", e.target.value)}
                                  placeholder="Phone (digits only)"
                                  className="dm-input flex1"
                                />
                                <input
                                  value={editedPatient?.email || ""}
                                  onChange={(e) => handleInputChange("email", e.target.value)}
                                  placeholder="Email"
                                  className="dm-input flex1"
                                />
                              </div>
                              <input
                                value={editedPatient?.place || ""}
                                onChange={(e) => handleInputChange("place", e.target.value)}
                                placeholder="Place"
                                className="dm-input"
                              />
                              <div className="dm-row">
                                <input
                                  value={editedPatient?.bloodtype || ""}
                                  onChange={(e) => handleInputChange("bloodtype", e.target.value)}
                                  placeholder="Blood Type"
                                  className="dm-input flex1"
                                />
                                <input
                                  value={editedPatient?.lastvisited || ""}
                                  onChange={(e) => handleInputChange("lastvisited", e.target.value)}
                                  placeholder="Last visited"
                                  className="dm-input flex1"
                                />
                              </div>
                              {editedPatient?.profilePreview && (
                                <div className="dm-preview">
                                  <div className="dm-field-label">Profile preview</div>
                                  <img src={editedPatient.profilePreview} alt="preview" className="dm-preview-img" />
                                </div>
                              )}
                            </div>
                          )}

                          <div className="dm-actions">
                            {!isEditing || selectedPatient?.$id !== p.$id ? (
                              <button onClick={() => handleStartEdit(p)} className="dm-btn dm-btn-primary">
                                <Edit size={14} /> Edit Profile
                              </button>
                            ) : (
                              <>
                                <button onClick={handleSave} className="dm-btn dm-btn-success">
                                  <Save size={14} /> Save
                                </button>
                                <button
                                  onClick={() => {
                                    setIsEditing(false);
                                    setEditedPatient(null);
                                  }}
                                  className="dm-btn dm-btn-neutral"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* records accordion */}
                      <div className="dm-section">
                        <div className="dm-section-title">Visit / Records</div>
                        {recordsLoading[p.$id] && <p>Loading records…</p>}
                        {!recordsLoading[p.$id] &&
                          (recordsByPatient[p.$id]?.length ? (
                            <div className="dm-records-grid">
                              {recordsByPatient[p.$id].map((r) => {
                                const isOpen = !!recordExpanded[r.$id];
                                return (
                                  <div key={r.$id} className="dm-accordion">
                                    <button
                                      onClick={() => toggleRecord(r.$id)}
                                      className="dm-accordion-toggle"
                                    >
                                      <div className="dm-record-head">
                                        <div className="dm-record-head-muted">Record Date</div>
                                        <div className="dm-record-head-date">{fmtDateOnly(r.recorddate)}</div>
                                      </div>
                                      <div>{isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</div>
                                    </button>

                                    {isOpen && (
                                      <div className="dm-accordion-body">
                                        <div className="dm-detail-grid">
                                          <div>
                                            <div className="dm-field-label">Symptom 1</div>
                                            <div className="dm-field-value">{r.symptom1 || "—"}</div>
                                          </div>
                                          <div>
                                            <div className="dm-field-label">Symptom 2</div>
                                            <div className="dm-field-value">{r.symptom2 || "—"}</div>
                                          </div>
                                          <div>
                                            <div className="dm-field-label">Symptom 3</div>
                                            <div className="dm-field-value">{r.symptom3 || "—"}</div>
                                          </div>

                                          {r.summary && (
                                            <div className="dm-summary">
                                              <div className="dm-field-label">Summary</div>
                                              <div className="dm-field-value">{r.summary}</div>
                                            </div>
                                          )}

                                          {r.image && (
                                            <div className="dm-image-wrap">
                                              <a href={r.image} target="_blank" rel="noreferrer">
                                                <img src={r.image} alt="record" className="dm-record-img" />
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
                      <div className="dm-section">
                        <div className="dm-section-title">Hospital Records</div>
                        <div className="dm-hosp-list">
                          {STATIC_HOSPITALS.map((h) => (
                            <div key={h} className="dm-hosp-row">
                              <div className="dm-hosp-left">
                                <div className="dm-iconbox">
                                  <FileText size={18} color="#0f172a" />
                                </div>
                                <div className="dm-hosp-name">{h}</div>
                              </div>
                              <button className="dm-request-btn" onClick={(e) => e.stopPropagation()}>
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
    </div>
  );
};

export default DownloadModal;
