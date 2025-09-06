// src/pages/AnalyticsPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "../styles/analyticsPage.css";
import "../styles/global.css";
import { Client, Databases, Query } from "appwrite";
import { MapPin } from "lucide-react";

/* ---------- ENV & Appwrite ---------- */
const ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1";
const PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID;
const DATABASE_ID = import.meta.env.VITE_DATABASE_ID;
const PATIENTS_COL = import.meta.env.VITE_PATIENTS_COLLECTION_ID;
const RECORDS_COL = import.meta.env.VITE_RECORDS_COLLECTION_ID;

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
const databases = new Databases(client);

/* ---------- helpers ---------- */
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
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }
  const dIso = new Date(raw);
  if (!isNaN(dIso.getTime())) return dIso;
  const p = Date.parse(raw);
  return isNaN(p) ? null : new Date(p);
}

function normalizeName(n = "") {
  return String(n || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
}

function extractSymptomsFromRecord(record) {
  if (!record) return [];
  const out = [];
  if (record.symptoms) {
    if (Array.isArray(record.symptoms)) {
      for (const item of record.symptoms) if (item && String(item).trim()) out.push(String(item).trim());
    } else if (typeof record.symptoms === "string") {
      out.push(...record.symptoms.split(/[,;]+/).map((p) => p.trim()).filter(Boolean));
    }
  }
  const s1 = record.symptom1 || record.symptom_1 || null;
  const s2 = record.symptom2 || record.symptom_2 || null;
  const s3 = record.symptom3 || record.symptom_3 || null;
  for (const v of [s1, s2, s3]) if (v && String(v).trim()) out.push(String(v).trim());
  return Array.from(new Set(out.map((x) => x)));
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

const PALETTE = ["#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899", "#14b8a6"];

function aggregateTimeSeries(monthObjs, maxBuckets = 60) {
  if (!Array.isArray(monthObjs) || monthObjs.length === 0) return { buckets: [], labels: [] };
  if (monthObjs.length <= maxBuckets) {
    return {
      buckets: monthObjs.map((m) => m.count),
      labels: monthObjs.map((m) => m.date),
      map: monthObjs.map((_, i) => [i]),
    };
  }
  const buckets = [];
  const labels = [];
  const map = [];
  const groupSize = Math.ceil(monthObjs.length / maxBuckets);
  for (let i = 0; i < monthObjs.length; i += groupSize) {
    const slice = monthObjs.slice(i, i + groupSize);
    const sum = slice.reduce((s, x) => s + (x.count || 0), 0);
    buckets.push(sum);
    const mid = slice[Math.floor(slice.length / 2)];
    labels.push(mid.date);
    map.push(slice.map((_, idx) => i + idx));
  }
  return { buckets, labels, map };
}

/* ---------- PieChart component (SVG) ---------- */
const PieChart = ({ data = [], size = 180, innerRatio = 0.55, onSliceClick, ariaLabel }) => {
  const total = data.reduce((s, x) => s + (x.count || 0), 0) || 1;
  let accAngle = -Math.PI / 2; // start top
  const center = size / 2;
  const radius = size / 2;
  const innerR = radius * innerRatio;

  const [hoverIdx, setHoverIdx] = useState(null);

  const slices = data.map((d, idx) => {
    const angle = (d.count / total) * Math.PI * 2;
    const start = accAngle;
    const end = accAngle + angle;
    const large = angle > Math.PI ? 1 : 0;
    const x1 = center + radius * Math.cos(start);
    const y1 = center + radius * Math.sin(start);
    const x2 = center + radius * Math.cos(end);
    const y2 = center + radius * Math.sin(end);
    const xi1 = center + innerR * Math.cos(end);
    const yi1 = center + innerR * Math.sin(end);
    const xi2 = center + innerR * Math.cos(start);
    const yi2 = center + innerR * Math.sin(start);
    const path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${innerR} ${innerR} 0 ${large} 0 ${xi2} ${yi2} Z`;
    accAngle += angle;
    return { d, idx, path, color: d.color || PALETTE[idx % PALETTE.length], value: d.count };
  });

  const hovered = hoverIdx != null ? data[hoverIdx] : null;

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaLabel || "Pie chart"}
        style={{ flex: "0 0 auto" }}
      >
        <defs>
          <filter id="subtle" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="12" floodColor="#000" floodOpacity="0.06" />
          </filter>
        </defs>
        <g filter="url(#subtle)">
          {slices.map((s) => (
            <path
              key={s.idx}
              d={s.path}
              fill={s.color}
              stroke="#fff"
              strokeWidth={1}
              onMouseEnter={() => setHoverIdx(s.idx)}
              onMouseLeave={() => setHoverIdx(null)}
              onClick={() => onSliceClick && onSliceClick(s.d)}
              style={{
                transformOrigin: `${center}px ${center}px`,
                cursor: onSliceClick ? "pointer" : "default",
                opacity: hoverIdx == null ? 1 : hoverIdx === s.idx ? 1 : 0.6,
                transition: "opacity 140ms ease",
              }}
            />
          ))}
        </g>

        {/* center label */}
        <g>
          <circle cx={center} cy={center} r={innerR - 2} fill="#fff" />
          <text x={center} y={center - 6} textAnchor="middle" fontWeight={700} fontSize={14} fill="#0f172a">
            {hovered ? hovered.label : "Top"}
          </text>
          <text x={center} y={center + 14} textAnchor="middle" fontSize={12} fill="#64748b">
            {hovered ? `${hovered.count}` : `${total}`}
          </text>
        </g>
      </svg>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", cursor: onSliceClick ? "pointer" : "default" }} onClick={() => onSliceClick && onSliceClick(d)}>
            <div style={{ width: 10, height: 10, background: d.color || PALETTE[i % PALETTE.length], borderRadius: 3 }} />
            <div style={{ minWidth: 110 }}>{d.label}</div>
            <div style={{ marginLeft: "auto", fontWeight: 700 }}>{d.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ---------- AnalyticsPage component ---------- */
const AnalyticsPage = ({ setCurrentPage }) => {
  const [patients, setPatients] = useState([]);
  const [records, setRecords] = useState([]);
  const [recordsWithPatient, setRecordsWithPatient] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDisease, setSelectedDisease] = useState(null);
  const [placeCoords, setPlaceCoords] = useState({});
  const [timeWindowMonths, setTimeWindowMonths] = useState(12);
  const [error, setError] = useState(null);

  const [chartOpacity, setChartOpacity] = useState(1);
  const fetchDebounceRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    window.addEventListener("records:updated", fetchDataOnce);
    window.addEventListener("storage", (e) => {
      if (e.key === "records-updated") fetchDataOnce();
    });
    return () => {
      window.removeEventListener("records:updated", fetchDataOnce);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchDataOnce() {
    if (!databases || !DATABASE_ID || !PATIENTS_COL || !RECORDS_COL) {
      setError("Appwrite config missing.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const patRes = await databases.listDocuments(DATABASE_ID, PATIENTS_COL, [Query.limit(1000)]);
      const patientsDocs = patRes.documents || [];

      const months = Math.max(1, Math.min(120, Number(timeWindowMonths)));
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - months);

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
        }
      } catch (err) {
        // fallback
      }

      if (!usedServerFilter) {
        const all = await databases.listDocuments(DATABASE_ID, RECORDS_COL, [Query.limit(1000)]);
        const allDocs = all.documents || [];
        recordsDocs = allDocs.filter((r) => {
          const dt = parseDateString(r.recorddate);
          if (!dt) return false;
          return dt >= cutoff;
        });
      }

      setPatients(patientsDocs);
      setRecords(recordsDocs);
    } catch (err) {
      console.error("fetchDataOnce error", err);
      setError("Failed to fetch data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!PROJECT_ID) {
      setError("VITE_APPWRITE_PROJECT_ID not set.");
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
  }, [PROJECT_ID]);

  useEffect(() => {
    setChartOpacity(0.25);
    if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
    fetchDebounceRef.current = setTimeout(async () => {
      await fetchDataOnce();
      requestAnimationFrame(() => setChartOpacity(1));
    }, 320);
    return () => {
      if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeWindowMonths]);

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

  const patientsByNormalizedName = useMemo(() => {
    const m = {};
    for (const p of patients || []) {
      if (!p || !p.name) continue;
      const n = normalizeName(p.name);
      if (!n) continue;
      if (!m[n]) m[n] = [];
      m[n].push(p);
    }
    return m;
  }, [patients]);

  useEffect(() => {
    const arr = [];
    for (const r of records || []) {
      let matchedPatient = null;
      const pid = extractPatientIdFromRecord(r);
      if (pid && patientsById[pid]) {
        matchedPatient = patientsById[pid];
      } else if (r.name) {
        const rn = normalizeName(r.name);
        if (rn && patientsByNormalizedName[rn] && patientsByNormalizedName[rn].length > 0) {
          matchedPatient = patientsByNormalizedName[rn][0];
        } else {
          const tokens = rn ? rn.split(" ").filter(Boolean) : [];
          if (tokens.length > 0) {
            const found = patients.find((p) => {
              if (!p || !p.name) return false;
              const pn = normalizeName(p.name);
              return tokens.every((t) => pn.includes(t));
            });
            if (found) matchedPatient = found;
          }
        }
      }
      arr.push({ ...r, matchedPatient });
    }
    setRecordsWithPatient(arr);
  }, [records, patientsById, patientsByNormalizedName, patients]);

  const diseasesList = useMemo(() => {
    const freq = {};
    for (const r of recordsWithPatient) {
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
  }, [recordsWithPatient]);

  useEffect(() => {
    if ((!selectedDisease || selectedDisease === "") && diseasesList.length > 0) {
      setSelectedDisease(diseasesList[0].name);
    }
  }, [diseasesList, selectedDisease]);

  const monthsSeries = useMemo(() => {
    const monthsCount = Math.max(1, Math.min(120, Number(timeWindowMonths)));
    const now = new Date();
    const months = [];
    for (let i = monthsCount - 1; i >= 0; i--) {
      months.push({ date: new Date(now.getFullYear(), now.getMonth() - i, 1), count: 0 });
    }
    const diseaseLower = (selectedDisease || "").toLowerCase();
    for (const r of recordsWithPatient) {
      const syms = extractSymptomsFromRecord(r).map((s) => String(s).toLowerCase());
      if (!syms.some((s) => s.includes(diseaseLower))) continue;
      const dt = parseDateString(r.recorddate);
      if (!dt) continue;
      const idx = months.findIndex((m) => m.date.getFullYear() === dt.getFullYear() && m.date.getMonth() === dt.getMonth());
      if (idx !== -1) months[idx].count++;
    }
    return months;
  }, [recordsWithPatient, selectedDisease, timeWindowMonths]);

  const maxDisplayBuckets = 60;
  const aggregated = useMemo(() => aggregateTimeSeries(monthsSeries, maxDisplayBuckets), [monthsSeries]);
  const displayValues = aggregated.buckets || [];
  const displayLabels = aggregated.labels || [];

  const affectedAreas = useMemo(() => {
    const counts = {};
    const diseaseLower = (selectedDisease || "").toLowerCase();
    for (const r of recordsWithPatient) {
      const syms = extractSymptomsFromRecord(r).map((s) => String(s).toLowerCase());
      if (!syms.some((s) => s.includes(diseaseLower))) continue;

      let place = null;
      if (r.matchedPatient) place = r.matchedPatient.place || r.matchedPatient.city || r.matchedPatient.location || null;
      if (!place) place = r.place || r.location || r.city || null;
      if (!place) continue;
      counts[place] = (counts[place] || 0) + 1;
    }
    const arr = Object.entries(counts).map(([place, count]) => ({ place, count }));
    arr.sort((a, b) => b.count - a.count);
    return arr;
  }, [recordsWithPatient, selectedDisease]);

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

  const markers = useMemo(() => {
    return affectedAreas
      .map((a) => {
        const coords = placeCoords[a.place];
        if (!coords) return null;
        return { place: a.place, count: a.count, coords };
      })
      .filter(Boolean);
  }, [affectedAreas, placeCoords]);

  // Chart sparkline
  const spark = useMemo(() => {
    const values = displayValues;
    const W = Math.max(700, values.length * 20);
    const H = 240;
    const pad = 18;
    const maxVal = Math.max(...values, 1);
    const pts = values.map((v, i) => {
      const x = pad + (i * (W - pad * 2)) / Math.max(1, values.length - 1);
      const y = pad + (1 - v / maxVal) * (H - pad * 2);
      return [x, y, v];
    });
    if (pts.length === 0) return { d: "", area: "", pts: [], W, H, maxVal };
    const d = pts.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(" ");
    const area = `M ${pts[0][0]} ${H} ${pts.map((p) => `L ${p[0]} ${p[1]}`).join(" ")} L ${pts[pts.length - 1][0]} ${H} Z`;
    return { d, area, pts, W, H, pad, maxVal };
  }, [displayValues]);

  const xTicks = useMemo(() => {
    const n = Math.min(8, displayLabels.length || 0);
    if (!displayLabels || displayLabels.length === 0) return [];
    const step = Math.max(1, Math.floor(displayLabels.length / n));
    const ticks = [];
    for (let i = 0; i < displayLabels.length; i += step) {
      ticks.push({ idx: i, date: displayLabels[i] });
    }
    const lastIdx = displayLabels.length - 1;
    if (!ticks.find((t) => t.idx === lastIdx)) ticks.push({ idx: lastIdx, date: displayLabels[lastIdx] });
    return ticks;
  }, [displayLabels]);

  const yTicks = useMemo(() => {
    const max = Math.max(1, Math.ceil((spark.maxVal || 1) / 1));
    const steps = 4;
    const arr = [];
    for (let i = 0; i <= steps; i++) {
      arr.push(Math.round((max * i) / steps));
    }
    return arr;
  }, [spark]);

  function shouldShowPointLabel(idx, value) {
    if (value <= 0) return false;
    if (displayValues.length <= 18) return true;
    const left = displayValues[idx - 1] ?? -1;
    const right = displayValues[idx + 1] ?? -1;
    return value >= left && value >= right && value > 0;
  }

  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, label: "", value: 0 });
  const chartRef = useRef(null);

  const handleMouseMove = (e) => {
    if (!chartRef.current || !spark.pts || spark.pts.length === 0) return;
    const rect = chartRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    let nearest = null;
    let minDist = Infinity;
    for (let i = 0; i < spark.pts.length; i++) {
      const p = spark.pts[i];
      const dx = Math.abs(p[0] - sx);
      if (dx < minDist) {
        minDist = dx;
        nearest = { idx: i, x: p[0], y: p[1], v: p[2] };
      }
    }
    if (nearest) {
      setTooltip({
        show: true,
        x: nearest.x + rect.left,
        y: nearest.y + rect.top,
        label: displayLabels[nearest.idx] ? new Date(displayLabels[nearest.idx]).toLocaleString("en-US", { month: "short", year: "numeric" }) : "",
        value: nearest.v,
      });
    }
  };
  const handleMouseLeave = () => setTooltip((t) => ({ ...t, show: false }));

  function compactSymptomsText(record) {
    const s = extractSymptomsFromRecord(record);
    if (!s || s.length === 0) return record.recorddate || "Record";
    return `${s.slice(0, 3).join(", ")}${s.length > 3 ? "..." : ""}`;
  }

  const diseaseCounts = useMemo(
    () =>
      diseasesList.slice(0, 8).map((d, i) => ({
        label: d.name,
        count: d.count,
        color: PALETTE[i % PALETTE.length],
      })),
    [diseasesList]
  );
  const placeCounts = useMemo(
    () =>
      affectedAreas.slice(0, 8).map((p, i) => ({
        label: p.place,
        count: p.count,
        color: PALETTE[(i + 3) % PALETTE.length],
      })),
    [affectedAreas]
  );

  const defaultCenter = [12.8797, 121.774];
  const sliderMin = 1;
  const sliderMax = 120;
  const percent = Math.round(((timeWindowMonths - sliderMin) / (sliderMax - sliderMin)) * 100);
  const sliderBackground = `linear-gradient(90deg, #0f172a ${percent}%, #e6edf3 ${percent}%)`;

  return (
    <div style={{ padding: 18 }}>
      <style>{`
        input[type="range"].big-range {
          -webkit-appearance: none;
          appearance: none;
          height: 10px;
          border-radius: 999px;
          outline: none;
          margin: 0;
          background: ${sliderBackground};
          transition: background 220ms ease;
        }
        input[type="range"].big-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #fff;
          border: 4px solid #0f172a;
          box-shadow: 0 6px 18px rgba(2,6,23,0.12);
          cursor: pointer;
          margin-top: -6px;
        }
        .chart-fade { transition: opacity 360ms ease; }
        .tooltip-box {
          position: fixed;
          pointer-events: none;
          background: rgba(15,23,42,0.95);
          color: #fff;
          padding: 8px 10px;
          border-radius: 6px;
          font-size: 12px;
          transform: translate(-50%, -120%);
          white-space: nowrap;
          box-shadow: 0 6px 18px rgba(2,6,23,0.12);
          z-index: 99999;
        }
      `}</style>

      {/* header + slider */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Disease Tracking</div>
          <div style={{ color: "#64748b", marginTop: 2 }}>Analytics Dashboard</div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 420 }}>
          <div style={{ minWidth: 260 }}>
            <label style={{ fontSize: 13, color: "#475569" }}>Time window (months)</label>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <input
                aria-label="time window months"
                type="range"
                min={sliderMin}
                max={sliderMax}
                value={timeWindowMonths}
                onChange={(e) => setTimeWindowMonths(Math.max(sliderMin, Math.min(sliderMax, Number(e.target.value))))}
                className="big-range"
                style={{ width: 320 }}
              />
              <div style={{ width: 68, textAlign: "center", fontWeight: 700 }}>{timeWindowMonths}</div>
            </div>
          </div>

          {setCurrentPage && (
            <button onClick={() => setCurrentPage("landing")} className="btn btn-secondary">
              Back to Home
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 420px", gap: 18 }}>
        {/* left: symptoms list */}
        <div>
          <div style={{ background: "#fff", padding: 12, borderRadius: 12, boxShadow: "0 6px 18px rgba(2,6,23,0.04)" }}>
            <div style={{ fontWeight: 700 }}>Detected Symptoms</div>
            <div style={{ color: "#64748b", marginTop: 6, marginBottom: 10 }}>From records in selected window</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {diseasesList.length === 0 ? (
                <div style={{ color: "#94a3b8" }}>No symptoms found</div>
              ) : (
                diseasesList.map((d, i) => {
                  const selected = d.name === selectedDisease;
                  return (
                    <button
                      key={d.name}
                      onClick={() => setSelectedDisease(d.name)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px",
                        borderRadius: 8,
                        border: selected ? "1px solid rgba(14,165,233,0.12)" : "1px solid transparent",
                        background: selected ? "rgba(99,102,241,0.05)" : "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{d.name}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{d.count.toLocaleString()} records</div>
                      </div>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: PALETTE[i % PALETTE.length] }} />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* center: map + trend + affected */}
        <div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 12, boxShadow: "0 6px 18px rgba(2,6,23,0.04)", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>Disease Distribution Map</div>
              <div style={{ color: "#64748b" }}>{selectedDisease || "—"}</div>
            </div>
            <div style={{ height: 380, position: "relative", borderRadius: 8, overflow: "hidden" }}>
              {loading ? (
                <div style={{ display: "grid", placeItems: "center", height: "100%", color: "#64748b" }}>Loading data…</div>
              ) : (
                <>
                  <MapContainer center={defaultCenter} zoom={6} style={{ height: "100%", width: "100%" }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
                    {markers.map((m) => (
                      <CircleMarker key={m.place} center={[m.coords.lat, m.coords.lng]} radius={6 + Math.sqrt(m.count) * 3} pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.85 }}>
                        <Popup>
                          <div style={{ fontWeight: 700 }}>{m.place}</div>
                          <div>{m.count} records</div>
                        </Popup>
                      </CircleMarker>
                    ))}
                  </MapContainer>
                  <div style={{ position: "absolute", left: "50%", top: 8, transform: "translateX(-50%)" }}>
                    <div style={{ background: "#fff", padding: 6, borderRadius: 999, boxShadow: "0 6px 12px rgba(2,6,23,0.06)" }}>
                      <MapPin size={22} color="#1e40af" />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={{ background: "#fff", borderRadius: 12, padding: 12, boxShadow: "0 6px 18px rgba(2,6,23,0.04)", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>{selectedDisease || "—"} - Trend</div>
              <div style={{ color: "#64748b", fontSize: 13 }}>Monthly</div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ width: 56, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                {yTicks
                  .slice()
                  .reverse()
                  .map((val, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#64748b" }}>
                      {val}
                    </div>
                  ))}
              </div>

              <div style={{ flex: 1, position: "relative" }}>
                <div ref={chartRef} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
                  <svg viewBox={`0 0 ${spark.W} ${spark.H}`} style={{ width: "100%", height: "240px", display: "block", opacity: chartOpacity, transition: "opacity 360ms ease" }} preserveAspectRatio="xMidYMid meet">
                    {yTicks.map((val, i) => {
                      const y = Math.round((1 - val / (spark.maxVal || 1)) * (spark.H - 36)) + 18;
                      return <line key={i} x1={0} x2={spark.W} y1={y} y2={y} stroke="#eef2f7" strokeWidth="1" />;
                    })}

                    <path d={spark.area} fill="#ef4444" opacity="0.06" />
                    <path d={spark.d} fill="none" stroke="#ef4444" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />

                    {spark.pts.map((p, idx) => (
                      <g key={idx}>
                        <circle cx={p[0]} cy={p[1]} r={3.6} fill="#ef4444" stroke="#fff" strokeWidth="0.8" />
                        {shouldShowPointLabel(idx, p[2]) && (
                          <text x={p[0]} y={p[1] - 10} fontSize="11" fill="#0f172a" fontWeight="700" textAnchor="middle">
                            {p[2]}
                          </text>
                        )}
                      </g>
                    ))}

                    {xTicks.map((t, i) => {
                      const idx = t.idx;
                      if (!spark.pts || !spark.pts[idx]) return null;
                      const x = spark.pts[idx][0];
                      const dt = new Date(t.date);
                      const label = dt.toLocaleString("en-US", { month: "short", year: "2-digit" });
                      return (
                        <g key={i} transform={`translate(${x},0)`}>
                          <line x1={0} x2={0} y1={spark.H - 36} y2={spark.H - 18} stroke="#e6edf3" strokeWidth="1" />
                          <text x={0} y={spark.H - 4} fontSize="11" fill="#64748b" textAnchor="middle">
                            {label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                <div style={{ textAlign: "center", color: "#64748b", fontSize: 12, marginTop: 6 }}>Months (X) — Records (Y)</div>

                {tooltip.show && (
                  <div className="tooltip-box" style={{ left: tooltip.x, top: tooltip.y }}>
                    <div style={{ fontWeight: 700 }}>{tooltip.label}</div>
                    <div style={{ opacity: 0.9 }}>{tooltip.value} record{tooltip.value !== 1 ? "s" : ""}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ background: "#fff", borderRadius: 12, padding: 12, boxShadow: "0 6px 18px rgba(2,6,23,0.04)" }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Most Affected Areas</div>
            <div>
              {affectedAreas.length === 0 ? (
                <div style={{ color: "#94a3b8" }}>No data</div>
              ) : (
                affectedAreas.map((a, idx) => {
                  const max = Math.max(...affectedAreas.map((x) => x.count), 1);
                  const pct = Math.round((a.count / max) * 100);
                  return (
                    <div key={a.place} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{a.place}</div>
                        <div style={{ color: "#94a3b8", fontSize: 12 }}>#{idx + 1}</div>
                      </div>
                      <div style={{ flex: "0 0 50%", display: "flex", gap: 10, alignItems: "center" }}>
                        <div style={{ flex: 1, height: 10, background: "#f1f5f9", borderRadius: 6 }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: "#ef4444" }} />
                        </div>
                        <div style={{ width: 40, textAlign: "right", fontWeight: 700 }}>{a.count}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* right: pies + recent */}
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 12, boxShadow: "0 6px 18px rgba(2,6,23,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>Top Symptoms (Pie)</div>
              <div style={{ color: "#64748b" }}>{diseaseCounts.reduce((s, d) => s + d.count, 0)} total</div>
            </div>

            <PieChart
              data={diseaseCounts}
              size={220}
              innerRatio={0.58}
              onSliceClick={(d) => {
                if (d && d.label) setSelectedDisease(d.label);
              }}
              ariaLabel="Top symptoms pie chart"
            />
          </div>

          <div style={{ background: "#fff", borderRadius: 12, padding: 12, boxShadow: "0 6px 18px rgba(2,6,23,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>Top Areas (Pie)</div>
              <div style={{ color: "#64748b" }}>{placeCounts.reduce((s, d) => s + d.count, 0)} total</div>
            </div>

            <PieChart
              data={placeCounts}
              size={220}
              innerRatio={0.6}
              onSliceClick={(d) => {
                if (d && d.label) {
                  // clicking area will try to filter by that place by setting selectedDisease to same (quick UX hack)
                  // you can instead implement a place filter; for now we set selectedDisease to itself so map and trend remain unchanged
                  // leave as no-op or implement place filter if desired
                  // setSelectedPlace(d.label)
                }
              }}
              ariaLabel="Top areas pie chart"
            />
          </div>

          <div style={{ background: "#fff", borderRadius: 12, padding: 12, boxShadow: "0 6px 18px rgba(2,6,23,0.04)", minHeight: 300 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Recent Reports (diseases)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", maxHeight: 700 }}>
              {recordsWithPatient.slice(0, 200).map((r, i) => (
                <div key={i} style={{ background: "#fff", borderRadius: 8, padding: 8, border: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 14 }}>• {compactSymptomsText(r)}</div>
                    <div style={{ color: "#94a3b8", fontSize: 12 }}>{r.recorddate}</div>
                  </div>
                </div>
              ))}
              {recordsWithPatient.length === 0 && <div style={{ color: "#94a3b8" }}>No recent reports</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;
