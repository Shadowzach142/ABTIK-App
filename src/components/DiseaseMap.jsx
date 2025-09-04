// DiseaseMap.jsx - Simple placeholder component
import React from "react";
import { MapPin } from "lucide-react";

const DiseaseMap = ({ locations, selectedDisease }) => {
  return (
    <div
      style={{
        width: "100%",
        height: "300px",
        backgroundColor: "#f3f4f6",
        borderRadius: "8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        border: "2px dashed #d1d5db",
      }}
    >
      <MapPin size={48} style={{ color: "#9ca3af", marginBottom: "12px" }} />
      <p style={{ color: "#6b7280", fontSize: "16px", marginBottom: "8px" }}>
        Disease Map for {selectedDisease}
      </p>
      <p style={{ color: "#9ca3af", fontSize: "14px" }}>
        {locations.length} locations tracked
      </p>
    </div>
  );
};

export default DiseaseMap;
