import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Client, Databases, Query } from "appwrite";
import { MapPin } from "lucide-react";

/**
 * AnalyticsPage (dynamic diseases)
 *
 * Changes:
 * - Removed hard-coded default disease list.
 * - Builds diseases list dynamically from symptoms found in records (supports symptoms array/string and symptom1/2/3).
 * - Left panel shows unique symptoms (sorted by frequency) and counts.
 * - Automatically selects the first symptom once records are loaded.
 * - Debug panel removed (as requested).
 */

// ---------- Vite env (direct) ----------
const ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1";
const PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID;
const DATABASE_ID = import.meta.env.VITE_DATABASE_ID;
const PATIENTS_COL = import.meta.env.VITE_PATIENTS_COLLECTION_ID;
const RECORDS_COL = import.meta.env.VITE_RECORDS_COLLECTION_ID;
const BUCKET_ID = import.meta.env.VITE_BUCKET_ID || null;

// ---------- Appwrite init ----------
const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
const databases = new Databases(client);

// ---------- Helpers ----------
async function geocodePlace(place) {
  if (!place) return null;
  const key = `geo:${place.toLowerCase()}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached);
    const q = encodeURIComponent(`${place}, Philippines`);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "ABTIK-App-Analytics/1.0 (youremail@example.com)" },
    });
    if (!resp.ok) return null;
    const body = await resp.json();
    if (Array.isArray(body) && body.length > 0) {
      const coords = { lat: parseFloat(body[0].lat), lng: parseFloat(body[0].lon) };
      localStorage.setItem(key, JSON.stringify(coords));
      return coords;
    }
    return null;
  } catch (err) {
    console.warn("Geocode error:", err);
    return null;
  }
}

function parseDateString(s) {
  if (!s) return null;
  const raw = String(s).trim();
  // MM-DD-YYYY or M/D/YYYY
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }
  // ISO/native
  const dIso = new Date(raw);
  if (!isNaN(dIso.getTime())) return dIso;
  const p = Date.parse(raw);
  return isNaN(p) ? null : new Date(p);
}

function extractSymptomsFromRecord(record) {
  if (!record) return [];
  const out = [];
  const s = record.symptoms;
  if (s) {
    if (Array.isArray(s)) {
      for (const item of s) if (item && String(item).trim()) out.push(String(item).trim());
    } else if (typeof s === "string") {
      out.push(...s.split(/[,;]+/).map((p) => p.trim()).filter(Boolean));
    }
  }
  const s1 = record.symptom1 || record.symptom_1 || null;
  const s2 = record.symptom2 || record.symptom_2 || null;
  const s3 = record.symptom3 || record.symptom_3 || null;
  for (const v of [s1, s2, s3]) if (v && String(v).trim()) out.push(String(v).trim());
  // normalize: remove empty, keep original casing as entered, but dedupe by trimmed string
  return Array.from(new Set(out.map((x) => x)));
}

function recordMatchesDiseaseBySymptoms(record, diseaseLower) {
  if (!record) return false;
  if (!diseaseLower) return false;
  const syms = extractSymptomsFromRecord(record).map((s) => String(s).toLowerCase());
  return syms.some((s) => s.includes(diseaseLower));
}

function extractPatientIdFromRecord(record) {
  if (!record) return null;
  const candidates = [
    "patientsid",
    "patientid",
    "patient",
    "patientId",
    "patientsID",
    "patient_id",
    "patients_id",
    "patientsId",
  ];
  for (const k of candidates) {
    if (record[k]) return String(record[k]);
  }
  return null;
}

// ---------- Component ----------
const AnalyticsPage = ({ setCurrentPage }) => {
  const [patients, setPatients] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDisease, setSelectedDisease] = useState(null); // will be set from records
  const [placeCoords, setPlaceCoords] = useState({});
  const [error, setError] = useState(null);
  const [timeWindowMonths, setTimeWindowMonths] = useState(12);

  const pollRef = useRef(null);

  // Fetch patients & records (1..120 months cutoff)
  async function fetchDataOnce() {
    if (!databases || !DATABASE_ID || !PATIENTS_COL || !RECORDS_COL) {
      setError("Appwrite configuration missing (check VITE_* env vars).");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // patients
      const patRes = await databases.listDocuments(DATABASE_ID, PATIENTS_COL, [Query.limit(1000)]);
      const patientsDocs = patRes.documents || [];

      // cutoff
      const months = Math.max(1, Math.min(120, Number(timeWindowMonths)));
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - months);

      // try server-side first
      let recordsDocs = [];
      let usedServerFilter = false;
      try {
        const recRes = await databases.listDocuments(DATABASE_ID, RECORDS_COL, [
          Query.limit(1000),
          Query.greaterEqual("recorddate", cutoff.toISOString()),
        ]);
        if (recRes.documents && recRes.documents.length > 0) {
          recordsDocs = recRes.documents;
          usedServerFilter = true;
        } else {
          console.debug("[Analytics] server filter returned 0 docs; fallback to client-side parse");
        }
      } catch (err) {
        console.debug("[Analytics] server filter error -> fallback to client-side parse", err);
      }

      if (!usedServerFilter) {
        const all = await databases.listDocuments(DATABASE_ID, RECORDS_COL, [Query.limit(1000)]);
        const allDocs = all.documents || [];
        const filtered = allDocs.filter((r) => {
          const dt = parseDateString(r.recorddate);
          if (!dt) return false;
          return dt >= cutoff;
        });
        recordsDocs = filtered;
      }

      setPatients(patientsDocs);
      setRecords(recordsDocs);
    } catch (err) {
      console.error("Appwrite fetch error:", err);
      setError("Failed to fetch Appwrite data. See console.");
    } finally {
      setLoading(false);
    }
  }

  // initial load + polling; re-run when timeWindowMonths changes so cutoff updates
  useEffect(() => {
    if (!PROJECT_ID) {
      setError("VITE_APPWRITE_PROJECT_ID not set in env.");
      setLoading(false);
      return;
    }
    fetchDataOnce();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchDataOnce, 30000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [PROJECT_ID, timeWindowMonths]);

  // patient lookup map by id that includes many fallback keys
  const patientsById = useMemo(() => {
    const m = {};
    for (const p of patients || []) {
      const candidates = [p.$id, p.id, p.recordid, p.recordId, p.email];
      for (const c of candidates) {
        if (c) m[String(c)] = p;
      }
    }
    return m;
  }, [patients]);

  // --- NEW: build diseases list from records' symptoms ---
  // Array of { name, count } sorted by count desc
  const diseasesList = useMemo(() => {
    const freq = {};
    for (const r of records || []) {
      const syms = extractSymptomsFromRecord(r);
      for (const s of syms) {
        const key = String(s).trim();
        if (!key) continue;
        freq[key] = (freq[key] || 0) + 1;
      }
    }
    const arr = Object.entries(freq).map(([name, count]) => ({ name, count }));
    arr.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return arr;
  }, [records]);

  // If no disease selected yet, pick the first available from the dynamic list
  useEffect(() => {
    if ((!selectedDisease || selectedDisease === "") && diseasesList.length > 0) {
      setSelectedDisease(diseasesList[0].name);
    }
  }, [diseasesList, selectedDisease]);

  // trend (monthly buckets) — uses only symptom fields
  const trendByMonth = useMemo(() => {
    const monthsCount = Math.max(1, Math.min(120, Number(timeWindowMonths)));
    const months = [];
    const now = new Date();
    for (let i = monthsCount - 1; i >= 0; i--) {
      months.push({ date: new Date(now.getFullYear(), now.getMonth() - i, 1), count: 0 });
    }
    const diseaseLower = (selectedDisease || "").toLowerCase();
    for (const r of records || []) {
      if (!recordMatchesDiseaseBySymptoms(r, diseaseLower)) continue;
      const dt = parseDateString(r.recorddate);
      if (!dt) continue;
      const idx = months.findIndex((m) => m.date.getFullYear() === dt.getFullYear() && m.date.getMonth() === dt.getMonth());
      if (idx !== -1) months[idx].count++;
    }
    return months.map((m) => m.count);
  }, [records, selectedDisease, timeWindowMonths]);

  // affected areas grouped by place using only symptom fields to detect disease records
  const affectedAreas = useMemo(() => {
    const counts = {};
    const diseaseLower = (selectedDisease || "").toLowerCase();
    for (const r of records || []) {
      if (!recordMatchesDiseaseBySymptoms(r, diseaseLower)) continue;

      const pid = extractPatientIdFromRecord(r);
      let place = null;
      if (pid && patientsById[pid]) {
        place = patientsById[pid].place || patientsById[pid].placeName || patientsById[pid].city || null;
      }
      if (!place) place = r.place || r.location || r.city || null;
      if (!place) {
        if (pid) {
          for (const p of patients || []) {
            if (p.recordid && String(p.recordid) === String(pid) && (p.place || p.city)) {
              place = p.place || p.city;
              break;
            }
          }
        }
      }
      if (!place) continue;
      counts[place] = (counts[place] || 0) + 1;
    }
    const arr = Object.entries(counts).map(([place, count]) => ({ place, count }));
    arr.sort((a, b) => b.count - a.count);
    return arr;
  }, [records, patientsById, patients, selectedDisease]);

  // geocode affected places (cache-aware)
  useEffect(() => {
    let mounted = true;
    const toGeo = affectedAreas.map((a) => a.place).filter(Boolean);
    const current = { ...placeCoords };
    (async () => {
      for (const p of toGeo) {
        if (!p) continue;
        if (current[p]) continue;
        const coords = await geocodePlace(p);
        if (!mounted) return;
        if (coords) {
          current[p] = coords;
          setPlaceCoords({ ...current });
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    })();
    return () => (mounted = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affectedAreas]);

  // map markers
  const markers = useMemo(() => {
    return affectedAreas
      .map((a) => {
        const coords = placeCoords[a.place];
        if (!coords) return null;
        return { place: a.place, count: a.count, coords };
      })
      .filter(Boolean);
  }, [affectedAreas, placeCoords]);

  // sparkline
  const spark = useMemo(() => {
    const values = trendByMonth;
    const W = Math.max(320, values.length * 28);
    const H = 120;
    const pad = 6;
    const max = Math.max(...values, 1);
    const pts = values.map((v, i) => {
      const x = pad + (i * (W - pad * 2)) / Math.max(1, values.length - 1);
      const y = pad + (1 - v / max) * (H - pad * 2);
      return [x, y];
    });
    if (pts.length === 0) return { d: "", area: "", W, H };
    const d = pts.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(" ");
    const area = `M ${pts[0][0]} ${H} ${pts.map((p) => `L ${p[0]} ${p[1]}`).join(" ")} L ${pts[pts.length - 1][0]} ${H} Z`;
    return { d, area, W, H };
  }, [trendByMonth]);

  // disease counts mapping from dynamic list
  const diseaseCounts = useMemo(() => {
    const out = {};
    for (const d of diseasesList) {
      out[d.name] = d.count;
    }
    return out;
  }, [diseasesList]);

  const defaultCenter = [12.8797, 121.774];

  function compactSymptomsText(record) {
    const s = extractSymptomsFromRecord(record);
    if (!s || s.length === 0) return record.recorddate || "Record";
    return `${s.slice(0, 3).join(", ")}${s.length > 3 ? "..." : ""}`;
  }

  function setPresetMonths(label) {
    switch (label) {
      case "1M":
        setTimeWindowMonths(1);
        break;
      case "3M":
        setTimeWindowMonths(3);
        break;
      case "6M":
        setTimeWindowMonths(6);
        break;
      case "1Y":
        setTimeWindowMonths(12);
        break;
      case "2Y":
        setTimeWindowMonths(24);
        break;
      case "5Y":
        setTimeWindowMonths(60);
        break;
      case "10Y":
        setTimeWindowMonths(120);
        break;
      default:
        setTimeWindowMonths(12);
    }
  }

  return (
    <div style={{ fontFamily: "Inter, system-ui, Arial", minHeight: "100vh", background: "#f3f6f9", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 700 }}>Disease Tracking</div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Analytics Dashboard</div>
            <div style={{ color: "#64748b", fontSize: 13 }}>
              Viewing last <strong>{timeWindowMonths} month{timeWindowMonths !== 1 ? "s" : ""}</strong>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {["1M", "3M", "6M", "1Y", "2Y", "5Y", "10Y"].map((p) => (
              <button
                key={p}
                onClick={() => setPresetMonths(p)}
                style={{
                  background: "#fff",
                  border: "1px solid #e6eef8",
                  padding: "6px 8px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 260, gap: 6 }}>
            <input
              aria-label="time window months"
              type="range"
              min={1}
              max={120}
              value={timeWindowMonths}
              onChange={(e) => setTimeWindowMonths(Math.max(1, Math.min(120, Number(e.target.value))))}
              style={{ width: 260 }}
            />
            <div style={{ fontSize: 12, color: "#64748b" }}>
              {timeWindowMonths} month{timeWindowMonths !== 1 ? "s" : ""} ({(timeWindowMonths / 12).toFixed(2)} years)
            </div>
          </div>
        </div>

        <div>
          {setCurrentPage && (
            <button onClick={() => setCurrentPage("landing")} style={{ background: "transparent", border: "none", color: "#2563eb", cursor: "pointer" }}>
              ← Back to Home
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ color: "crimson", marginBottom: 12 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr 380px", gap: 16 }}>
        {/* LEFT: dynamic diseases list */}
        <div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 12, boxShadow: "0 8px 24px rgba(2,6,23,0.06)", height: "calc(100vh - 180px)", overflowY: "auto" }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Detected Symptoms (from Records)</div>

            {diseasesList.length === 0 ? (
              <div style={{ color: "#94a3b8" }}>No symptoms found in records for the selected time window.</div>
            ) : (
              diseasesList.map((d) => {
                const selected = d.name === selectedDisease;
                return (
                  <div
                    key={d.name}
                    onClick={() => setSelectedDisease(d.name)}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      marginBottom: 8,
                      cursor: "pointer",
                      background: selected ? "#fff7f7" : "transparent",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>{d.name}</div>
                      <div style={{ color: "#94a3b8", fontSize: 13 }}>{(d.count || 0).toLocaleString()} records</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* CENTER: Map */}
        <div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 10px 30px rgba(2,6,23,0.06)" }}>
            <div style={{ fontWeight: 700 }}>Disease Distribution Map - {selectedDisease || "—"}</div>
            <div style={{ color: "#64748b", marginBottom: 12 }}>Distribution (past {timeWindowMonths} month{timeWindowMonths !== 1 ? "s" : ""})</div>

            <div style={{ height: 420, borderRadius: 10, overflow: "hidden", position: "relative" }}>
              {loading ? (
                <div style={{ display: "grid", placeItems: "center", height: "100%" }}>Loading data…</div>
              ) : (
                <>
                  <MapContainer center={defaultCenter} zoom={6} style={{ height: "100%", width: "100%" }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />
                    {markers.map((m) => (
                      <CircleMarker
                        key={m.place}
                        center={[m.coords.lat, m.coords.lng]}
                        radius={6 + Math.sqrt(m.count) * 3}
                        pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.85 }}
                      >
                        <Popup>
                          <div style={{ fontWeight: 700 }}>{m.place}</div>
                          <div>{m.count} records</div>
                        </Popup>
                      </CircleMarker>
                    ))}
                  </MapContainer>

                  <div style={{ position: "absolute", left: "50%", top: "45%", transform: "translate(-50%,-50%)", pointerEvents: "none" }}>
                    <div style={{ width: 64, height: 64, borderRadius: 999, border: "4px solid #2563eb", display: "grid", placeItems: "center" }}>
                      <MapPin size={28} color="#1e40af" />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Trend + Most Affected + Recent */}
        <div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 12, boxShadow: "0 10px 30px rgba(2,6,23,0.06)", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700 }}>{selectedDisease || "—"} - Trend ({timeWindowMonths} month{timeWindowMonths !== 1 ? "s" : ""})</div>
              <div style={{ color: "#94a3b8" }}>Monthly buckets</div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ width: "100%", overflowX: "auto", marginTop: 6 }}>
                <svg viewBox={`0 0 ${spark.W} ${spark.H}`} style={{ width: spark.W, height: 160, display: "block" }} preserveAspectRatio="none">
                  {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
                    <line key={i} x1="0" x2={spark.W} y1={t * spark.H} y2={t * spark.H} stroke="#eef2f7" strokeWidth="1" />
                  ))}
                  <path d={spark.area} fill="#ef4444" opacity="0.08" />
                  <path d={spark.d} fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              </div>

              <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}>
                Showing last {timeWindowMonths} month{timeWindowMonths !== 1 ? "s" : ""}.
              </div>
            </div>
          </div>

          <div style={{ background: "#fff", borderRadius: 12, padding: 12, boxShadow: "0 10px 30px rgba(2,6,23,0.06)", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Most Affected Areas</div>
            {affectedAreas.length === 0 ? (
              <div style={{ color: "#94a3b8" }}>No data</div>
            ) : (
              affectedAreas.map((a, idx) => {
                const max = Math.max(...affectedAreas.map((x) => x.count), 1);
                const pct = Math.round((a.count / max) * 100);
                return (
                  <div key={a.place} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{a.place}</div>
                      <div style={{ color: "#94a3b8", fontSize: 12 }}>#{idx + 1}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 140, height: 10, background: "#f1f5f9", borderRadius: 999 }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "#ef4444", borderRadius: 999 }} />
                      </div>
                      <div style={{ width: 42, textAlign: "right", fontWeight: 700 }}>{a.count}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ background: "#fff", borderRadius: 12, padding: 12, boxShadow: "0 10px 30px rgba(2,6,23,0.06)" }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Recent Reports (examples)</div>
            <div style={{ color: "#64748b", fontSize: 13 }}>
              {(records || [])
                .slice(0, 6)
                .map((r, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    • {compactSymptomsText(r)} — <em style={{ color: "#94a3b8" }}>{r.recorddate}</em>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 8, color: "#94a3b8", fontSize: 12 }}>* Data from Appwrite. Geocoding via OpenStreetMap/Nominatim (cached in localStorage).</div>
    </div>
  );
};

export default AnalyticsPage;
