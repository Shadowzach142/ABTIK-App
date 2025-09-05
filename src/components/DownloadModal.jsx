// src/components/DownloadModal.jsx
import { Client, Databases, Storage, Query } from "appwrite";
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
  Eye,
  EyeOff,
  Check,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

/* ---------- Appwrite setup (use your env vars) ---------- */
const ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1";
const PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID;
const DATABASE_ID = import.meta.env.VITE_DATABASE_ID;
const PATIENTS_COL = import.meta.env.VITE_PATIENTS_COLLECTION_ID;
const RECORDS_COL = import.meta.env.VITE_RECORDS_COLLECTION_ID;
const BUCKET_ID = import.meta.env.VITE_BUCKET_ID || null;

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
const databases = new Databases(client);
const storage = new Storage(client);

/* ---------- helpers ---------- */
const fmtDateOnly = (value) => {
  if (!value) return "N/A";
  const tryParse = (v) => {
    if (typeof v === "string") {
      const mmddyyyy = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (mmddyyyy) {
        const mm = String(mmddyyyy[1]).padStart(2, "0");
        const dd = String(mmddyyyy[2]).padStart(2, "0");
        const yyyy = mmddyyyy[3].length === 2 ? "20" + mmddyyyy[3] : mmddyyyy[3];
        return new Date(`${yyyy}-${mm}-${dd}`);
      }
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  };

  const d = tryParse(value);
  if (!d) return value || "N/A";
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
};

const cleanInteger = (raw) => {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).replace(/[^\d]/g, "");
  if (s === "") return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
};

// Normalize names: trim, lowercase, remove diacritics & punctuation, collapse spaces
const normalizeName = (n = "") =>
  String(n || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, "") // remove punctuation (unicode aware)
    .replace(/\s+/g, " ");

const dedupeAndSortRecords = (records = []) => {
  const map = new Map();
  for (const r of records) {
    if (!r || !r.$id) continue;
    if (!map.has(r.$id)) map.set(r.$id, r);
  }
  const arr = Array.from(map.values());
  arr.sort((a, b) => {
    const ta = new Date(a.recorddate).getTime();
    const tb = new Date(b.recorddate).getTime();
    if (isNaN(ta) && isNaN(tb)) return 0;
    if (isNaN(ta)) return 1;
    if (isNaN(tb)) return -1;
    return tb - ta;
  });
  return arr;
};

const matchesPatientId = (r, patientId) => {
  if (!r || !patientId) return false;
  if (typeof r.patientsid === "string") return r.patientsid === patientId;
  if (r.patientsid && typeof r.patientsid === "object") {
    // support embedded doc shape or object with $id
    if (r.patientsid.$id) return r.patientsid.$id === patientId;
    // other shapes: try toString
    try {
      return String(r.patientsid) === String(patientId);
    } catch {
      return false;
    }
  }
  return false;
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

/* ---------- Toast helper (local) ---------- */
const Toast = ({ t, onClose }) => {
  const colors = {
    success: { bg: "#ecfdf5", border: "#34d399", iconBg: "#bbf7d0", text: "#065f46" },
    error: { bg: "#fff1f2", border: "#fb7185", iconBg: "#fecaca", text: "#7f1d1d" },
    info: { bg: "#eff6ff", border: "#60a5fa", iconBg: "#dbeafe", text: "#1e3a8a" },
  }[t.type || "info"];

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        padding: "10px 12px",
        borderRadius: 10,
        boxShadow: "0 6px 18px rgba(2,6,23,0.06)",
        minWidth: 300,
      }}
      role="status"
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          display: "grid",
          placeItems: "center",
          background: colors.iconBg,
          flex: "0 0 40px",
        }}
      >
        {t.type === "success" ? <Check size={18} color={colors.text} /> : t.type === "error" ? <AlertTriangle size={18} color={colors.text} /> : <Check size={18} color={colors.text} />}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, color: colors.text }}>{t.title}</div>
        {t.message && <div style={{ marginTop: 6, color: colors.text, opacity: 0.9 }}>{t.message}</div>}
      </div>

      <button onClick={onClose} aria-label="Close toast" style={{ background: "transparent", border: "none", cursor: "pointer", color: colors.text }}>
        <X size={14} />
      </button>
    </div>
  );
};

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
  const [showPassword, setShowPassword] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState([]);
  const showToast = ({ type = "info", title = "", message = "", ttl = 4500 }) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setToasts((t) => [...t, { id, type, title, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
  };
  const removeToast = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  useEffect(() => {
    console.log("ENV:", { ENDPOINT, PROJECT_ID, DATABASE_ID, PATIENTS_COL, RECORDS_COL, BUCKET_ID });
  }, []);

  // ---------- NEW: Listen for 'records:updated' CustomEvent and 'records-updated' storage key ----------
  useEffect(() => {
    const handleCustom = (e) => {
      try {
        const pid = e?.detail?.patientId;
        console.log("DownloadModal received records:updated event, patientId:", pid);
        if (pid) {
          const p = patients.find((x) => x.$id === pid);
          fetchRecordsForPatient(pid, p?.name, { showToasts: true });
        } else if (selectedPatient?.$id) fetchRecordsForPatient(selectedPatient.$id, selectedPatient.name, { showToasts: true });
      } catch (err) {
        console.warn("Error handling records:updated event", err);
      }
    };

    const handleStorage = (ev) => {
      if (ev.key !== "records-updated") return;
      try {
        const data = ev.newValue ? JSON.parse(ev.newValue) : null;
        const pid = data?.patientId;
        console.log("DownloadModal storage event records-updated:", pid);
        if (pid) {
          const p = patients.find((x) => x.$id === pid);
          fetchRecordsForPatient(pid, p?.name, { showToasts: true });
        } else if (selectedPatient?.$id) fetchRecordsForPatient(selectedPatient.$id, selectedPatient.name, { showToasts: true });
      } catch (err) {
        console.warn("Error handling storage records-updated event", err);
      }
    };

    window.addEventListener("records:updated", handleCustom);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("records:updated", handleCustom);
      window.removeEventListener("storage", handleStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatient, patients]);

  // Debounced search — fetch fresh patients from Appwrite each time
  useEffect(() => {
    if (!searchQuery.trim()) {
      setPatients([]);
      return;
    }
    const t = setTimeout(() => fetchPatients(searchQuery.trim()), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Fetch patients (large limit so newly uploaded docs are included)
  const fetchPatients = async (q) => {
    setLoadingPatients(true);
    console.log("Searching patients for:", q);
    try {
      // request up to 1000 docs (adjust if you expect >1000)
      const res = await databases.listDocuments(DATABASE_ID, PATIENTS_COL, [Query.limit(1000)]);
      console.log("Appwrite patients raw:", res);
      const filtered = (res.documents || []).filter((d) => (d.name || "").toLowerCase().includes(q.toLowerCase()));
      console.log("Filtered results:", filtered);
      setPatients(filtered);
    } catch (err) {
      console.error("Error fetching patients:", err);
      setPatients([]);
      showToast({ type: "error", title: "Search failed", message: "Could not fetch patients. Check console." });
    } finally {
      setLoadingPatients(false);
    }
  };

  /**
   * fetchRecordsForPatient(patientId, patientName, opts)
   *
   * - Tries: Query.equal('patientsid', patientId)
   * - Also tries: Query.equal('name', patientName) in parallel when patientName present
   * - Combines unique records from both queries
   * - Final fallback: broad fetch + client-side filter (patientsid match OR normalized name token containment)
   */
  const fetchRecordsForPatient = async (patientId, patientName = null, { showToasts = false } = {}) => {
    if (!patientId) return;
    setRecordsLoading((s) => ({ ...s, [patientId]: true }));
    if (showToasts) showToast({ type: "info", title: "Refreshing", message: "Fetching latest records..." });

    try {
      // Parallel attempts: by patientsid and by name (if name provided)
      let byPatientsId = [];
      let byName = [];

      // attempt patientsid query
      try {
        const res = await databases.listDocuments(DATABASE_ID, RECORDS_COL, [Query.limit(1000), Query.equal("patientsid", patientId)]);
        byPatientsId = (res && res.documents) || [];
      } catch (err) {
        console.warn("Server-side records query by patientsid failed (will try fallbacks):", err);
        byPatientsId = [];
      }

      // attempt name query if have patientName
      if (patientName) {
        try {
          const res2 = await databases.listDocuments(DATABASE_ID, RECORDS_COL, [Query.limit(1000), Query.equal("name", patientName)]);
          byName = (res2 && res2.documents) || [];
        } catch (err) {
          console.warn("Server-side records query by name failed (will fallback to client-side):", err);
          byName = [];
        }
      }

      // Combine results (de-duped)
      let combined = [...byPatientsId, ...byName];

      // If we already have some combined, dedupe and set
      if (combined.length > 0) {
        const final = dedupeAndSortRecords(combined);
        setRecordsByPatient((prev) => ({ ...prev, [patientId]: final }));
        return;
      }

      // Final fallback: broad fetch (limit) + client-side filter for both patientsid match and normalized name match
      const broad = await databases.listDocuments(DATABASE_ID, RECORDS_COL, [Query.limit(1000)]);
      const allRecords = broad.documents || [];

      // Filter records that match patientsid OR have a name match to patientName
      const matched = allRecords.filter((r) => {
        if (matchesPatientId(r, patientId)) return true;
        if (patientName && r.name) {
          const rn = normalizeName(r.name || "");
          const pNorm = normalizeName(patientName || "");
          if (!rn || !pNorm) return false;
          if (rn === pNorm) return true;
          // token containment: every token in patientName appears in record name
          const tokens = pNorm.split(" ").filter(Boolean);
          return tokens.length > 0 && tokens.every((t) => rn.includes(t));
        }
        return false;
      });

      if (matched.length > 0) {
        const final = dedupeAndSortRecords(matched);
        setRecordsByPatient((prev) => ({ ...prev, [patientId]: final }));
        return;
      }

      // Nothing found
      setRecordsByPatient((prev) => ({ ...prev, [patientId]: [] }));
    } catch (err) {
      console.error("Error fetching records:", err);
      setRecordsByPatient((prev) => ({ ...prev, [patientId]: [] }));
      showToast({ type: "error", title: "Records failed", message: "Could not fetch records. See console." });
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
    setShowPassword(false);
    setRecordExpanded({});
    if (will) {
      // fetch fresh records each time the panel opens, pass patient name for fallbacks
      fetchRecordsForPatient(id, p.name, { showToasts: false });
    }
  };

  const toggleRecord = (recordId) => setRecordExpanded((prev) => ({ ...prev, [recordId]: !prev[recordId] }));

  // Start editing a patient
  const handleStartEdit = (patient) => {
    if (!patient) return;
    setSelectedPatient(patient);
    setEditedPatient({ ...patient });
    setIsEditing(true);
    setShowPassword(false);
    console.log("Edit started for patient:", patient.$id);
  };

  const handleInputChange = (field, value) => {
    setEditedPatient((prev) => ({ ...(prev || {}), [field]: value }));
  };

  // Upload file helper
  const uploadProfileFile = async (file) => {
    if (!BUCKET_ID) {
      console.warn("BUCKET_ID not set - uploads disabled");
      showToast({ type: "info", title: "Uploads disabled", message: "Set VITE_BUCKET_ID to enable file uploads." });
      return null;
    }
    try {
      setUploadingProfile(true);
      const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      console.log("Uploading file to bucket:", BUCKET_ID, "fileId:", uniqueId);
      const result = await storage.createFile(BUCKET_ID, uniqueId, file);
      console.log("Storage.createFile result:", result);
      const viewUrl = `${ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${result.$id}/view?project=${PROJECT_ID}`;
      showToast({ type: "success", title: "Upload complete", message: "Profile image uploaded." });
      return { viewUrl, fileId: result.$id };
    } catch (err) {
      console.error("Error uploading profile file:", err);
      showToast({ type: "error", title: "Upload failed", message: "Failed to upload profile image. See console." });
      return null;
    } finally {
      setUploadingProfile(false);
    }
  };

  // Handle profile file select & immediate save to patient document
  const handleProfileFileSelect = async (files) => {
    const file = files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setEditedPatient((prev) => ({ ...(prev || {}), profilePreview: preview }));

    if (!BUCKET_ID) {
      showToast({ type: "info", title: "Preview only", message: "Set VITE_BUCKET_ID to enable uploads." });
      return;
    }

    const patientId = (editedPatient && editedPatient.$id) || (selectedPatient && selectedPatient.$id);
    if (!patientId) {
      showToast({ type: "error", title: "No patient selected", message: "Select a patient before uploading a profile." });
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
      showToast({ type: "success", title: "Profile saved", message: "Patient profile image updated." });
    } catch (err) {
      console.error("Error updating patient profile attribute:", err);
      showToast({ type: "error", title: "Save failed", message: "Failed to save profile to patient document." });
    }
  };

  // Save edited fields to Appwrite
  const handleSave = async () => {
    if (!editedPatient && !selectedPatient) {
      console.warn("No editedPatient or selectedPatient present on Save");
      showToast({ type: "info", title: "Nothing to save", message: "Open Edit to modify fields first." });
      return;
    }

    const docToSave = editedPatient || selectedPatient;
    const docId = docToSave.$id || (selectedPatient && selectedPatient.$id);

    if (!docId) {
      console.error("Missing document ID — cannot save");
      showToast({ type: "error", title: "Save failed", message: "Missing document ID." });
      return;
    }

    // Clean phone
    const cleanedPhone = cleanInteger(docToSave.phonenumber);
    if (docToSave.phonenumber && cleanedPhone === null) {
      showToast({ type: "error", title: "Invalid phone", message: "Phone must contain digits only." });
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

    if (docToSave.password !== undefined && docToSave.password !== null && docToSave.password !== "") {
      console.log("Password provided — will include in update payload (value not logged).");
      payload.password = docToSave.password;
      console.warn("Storing plaintext passwords is insecure. Consider a safer approach.");
    }

    console.log("Saving patient payload for id:", docId, { ...payload, _maskedPassword: payload.password ? true : false });
    try {
      const updated = await databases.updateDocument(DATABASE_ID, PATIENTS_COL, docId, payload);
      console.log("Save succeeded, updated doc:", updated);
      setPatients((prev) => prev.map((p) => (p.$id === updated.$id ? updated : p)));
      setSelectedPatient(updated);
      setEditedPatient(null);
      setIsEditing(false);
      setShowPassword(false);
      showToast({ type: "success", title: "Saved", message: "Patient information updated successfully." });
    } catch (err) {
      console.error("Error updating patient:", err);
      showToast({ type: "error", title: "Save failed", message: "Failed to save changes. Check console." });
    }
  };

  // Quick UI content
  const topContent = useMemo(() => {
    if (!searchQuery.trim()) return <p className="dm-text-muted">Type a name to search patients…</p>;
    if (loadingPatients) return <p>Searching…</p>;
    if (!loadingPatients && patients.length === 0) return <p>No patient found.</p>;
    return null;
  }, [searchQuery, loadingPatients, patients]);

  return (
    <>
      <div className="modal-overlay">
        <div className="modal">
          {/* header */}
          <div className="modal-header">
            <h2 className="modal-title">Patient Records</h2>
            <button onClick={() => setShowDownloadModal(false)} className="btn-close">
              <X size={24} />
            </button>
          </div>
          <div>
            <div className="modal-search">
              <Search size={18} />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search patient by name..." />
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
                            {p.profile ? <img src={p.profile} alt="profile" className="dm-avatar" /> : <User size={20} />}
                          </div>
                          <div>
                            <div className="dm-card-name">{p.name}</div>
                            <div className="dm-card-sub">{p.place || "—"} • Last: {p.lastvisited || "—"}</div>
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
                                    selectedPatient && selectedPatient.$id === p.$id && editedPatient?.profilePreview
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
                                      <input type="file" accept="image/*" onChange={(e) => handleProfileFileSelect(e.target.files)} disabled={uploadingProfile} style={{ display: "none" }} />
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

                                  {/* NEW: Password display (masked) with reveal toggle */}
                                  <div className="dm-row" style={{ marginTop: 8, alignItems: "center", gap: 12 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <div className="dm-field-label">
                                        <Lock size={14} />
                                        Password
                                      </div>
                                      <div className="dm-field-value" style={{ fontFamily: "monospace" }}>
                                        {p.password ? (showPassword ? p.password : "••••••••") : "—"}
                                      </div>
                                    </div>
                                    {p.password && (
                                      <button
                                        className="dm-show-pwd-btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setShowPassword((s) => !s);
                                        }}
                                        title={showPassword ? "Hide password" : "Show password"}
                                      >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                      </button>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <div className="dm-edit-grid">
                                  <input value={editedPatient?.name || ""} onChange={(e) => handleInputChange("name", e.target.value)} placeholder="Full name" className="dm-input" />
                                  <div className="dm-row">
                                    <input value={editedPatient?.dateofbirth || ""} onChange={(e) => handleInputChange("dateofbirth", e.target.value)} placeholder="DOB" className="dm-input flex1" />
                                    <input value={editedPatient?.gender || ""} onChange={(e) => handleInputChange("gender", e.target.value)} placeholder="Gender" className="dm-input flex1" />
                                  </div>
                                  <div className="dm-row">
                                    <input value={editedPatient?.phonenumber || ""} onChange={(e) => handleInputChange("phonenumber", e.target.value)} placeholder="Phone (digits only)" className="dm-input flex1" />
                                    <input value={editedPatient?.email || ""} onChange={(e) => handleInputChange("email", e.target.value)} placeholder="Email" className="dm-input flex1" />
                                  </div>
                                  <input value={editedPatient?.place || ""} onChange={(e) => handleInputChange("place", e.target.value)} placeholder="Place" className="dm-input" />
                                  <div className="dm-row">
                                    <input value={editedPatient?.bloodtype || ""} onChange={(e) => handleInputChange("bloodtype", e.target.value)} placeholder="Blood Type" className="dm-input flex1" />
                                    <input value={editedPatient?.lastvisited || ""} onChange={(e) => handleInputChange("lastvisited", e.target.value)} placeholder="Last visited" className="dm-input flex1" />
                                  </div>

                                  {/* NEW: password edit field */}
                                  <div style={{ display: "grid", gap: 6 }}>
                                    <label className="dm-field-label">Password (leave empty to keep current)</label>
                                    <input
                                      type="password"
                                      value={editedPatient?.password || ""}
                                      onChange={(e) => handleInputChange("password", e.target.value)}
                                      placeholder="Set a password (optional)"
                                      className="dm-input"
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

                                {/* NEW: Refresh records button */}
                                <button
                                  title="Refresh records for this patient"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    fetchRecordsForPatient(p.$id, p.name, { showToasts: true });
                                  }}
                                  className="dm-btn dm-btn-ghost"
                                  style={{ marginLeft: 8 }}
                                >
                                  <RefreshCw size={14} /> Refresh Records
                                </button>
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
                                        <button onClick={() => toggleRecord(r.$id)} className="dm-accordion-toggle">
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

      {/* Toast container (top-right) */}
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
          <div key={t.id} style={{ animation: "toastIn .16s ease-out" }}>
            <Toast t={t} onClose={() => removeToast(t.id)} />
          </div>
        ))}
      </div>

      <style>{`
        @keyframes toastIn {
          from { transform: translateY(-6px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
};

export default DownloadModal;
