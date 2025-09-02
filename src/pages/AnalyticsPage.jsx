import React, { useState } from "react";
import { MapPin, TrendingUp, TrendingDown, Menu } from "lucide-react";
import DiseaseMap from "../components/DiseaseMap.jsx";
import SymptomTrendChart from "../components/SymptomTrendChart.jsx";

const AnalyticsPage = ({ setCurrentPage }) => {
  const [selectedDisease, setSelectedDisease] = useState("COVID-19");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Map diseases to their primary symptom in the CSV
  const diseaseToSymptom = {
    "COVID-19": "Fever",
    Influenza: "Cough",
    Dengue: "Headache",
    Hypertension: "Fatigue",
    Diabetes: "Thirst",
    Pneumonia: "Fever",
    Tuberculosis: "Cough",
    Malaria: "Chills",
  };

  // Keep the color mapping for consistency
  const diseaseColors = {
    "COVID-19": "#ef4444",
    Influenza: "#f59e0b",
    Dengue: "#10b981",
    Hypertension: "#8b5cf6",
    Diabetes: "#06b6d4",
    Pneumonia: "#f97316",
    Tuberculosis: "#ec4899",
    Malaria: "#14b8a6",
  };

  // Locations remain unchanged
  const locations = [
    { name: "Quezon City", cases: 450, lat: 14.676, lng: 121.0437 },
    { name: "Davao City", cases: 12, lat: 7.0731, lng: 125.6144 },
    { name: "Manila", cases: 380, lat: 14.5995, lng: 120.9842 },
    { name: "Makati", cases: 290, lat: 14.5547, lng: 121.0244 },
    { name: "Pasig", cases: 210, lat: 14.5764, lng: 121.0851 },
    { name: "Taguig", cases: 185, lat: 14.5176, lng: 121.0509 },
    { name: "Marikina", cases: 142, lat: 14.6507, lng: 121.1029 },
  ];

  return (
    <div className="analytics-page">
      {/* Mobile Header */}
      <div className="analytics-mobile-header">
        <div className="analytics-mobile-nav">
          <h1 className="analytics-mobile-title">Analytics Dashboard</h1>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="menu-button"
          >
            <Menu size={24} />
          </button>
        </div>
      </div>

      <div className="analytics-layout">
        {/* Sidebar - Disease List */}
        <div className={`analytics-sidebar ${isMobileMenuOpen ? "open" : ""}`}>
          <div className="sidebar-content">
            <h2 className="sidebar-title">Disease Tracking</h2>

            <div className="disease-list">
              {Object.keys(diseaseToSymptom).map((disease) => (
                <div
                  key={disease}
                  onClick={() => {
                    setSelectedDisease(disease);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`disease-item ${
                    selectedDisease === disease ? "selected" : ""
                  }`}
                >
                  <div className="disease-info">
                    <div className="disease-details">
                      <h3>{disease}</h3>
                      {/* Placeholder until real CSV-based case count is implemented */}
                      <p className="disease-cases">— cases</p>
                    </div>
                    <div className="disease-indicators">
                      {/* You could dynamically calculate trend later */}
                      <TrendingUp className="trend-icon trend-up" />
                      <div
                        className="disease-color"
                        style={{ backgroundColor: diseaseColors[disease] }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Disease Statistics Summary */}
            <div className="disease-summary">
              <h3 className="summary-title">Quick Stats</h3>
              <div className="summary-stats">
                <div className="stat-item">
                  <span className="stat-label">Total Cases</span>
                  <span className="stat-value">—</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Trending Up</span>
                  <span className="stat-value trending-up">—</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Trending Down</span>
                  <span className="stat-value trending-down">—</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="analytics-main">
          {/* Header */}
          <div className="analytics-header">
            <div className="header-content">
              <h1 className="analytics-title">Analytics Dashboard</h1>
              <button
                onClick={() => setCurrentPage("landing")}
                className="back-button"
              >
                ← Back to Home
              </button>
            </div>
          </div>

          <div className="analytics-content">
            <div className="analytics-grid">
              {/* Map Section - Center */}
              <div className="map-section">
                <div className="map-container">
                  <h3 className="map-title">
                    Disease Distribution Map - {selectedDisease}
                  </h3>
                  <div className="map-display">
                    <DiseaseMap
                      locations={locations}
                      selectedDisease={selectedDisease}
                    />
                  </div>
                </div>
              </div>

              {/* Right Side - Charts and Data */}
              <div className="charts-section">
                {/* Trend Chart - dynamic symptom based on selected disease */}
                <SymptomTrendChart
                  symptom={diseaseToSymptom[selectedDisease]}
                  selectedDiseaseColor={diseaseColors[selectedDisease]}
                />

                {/* Top Affected Locations */}
                {/* ...keep the existing code as is */}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div
          className={`mobile-overlay ${isMobileMenuOpen ? "show" : ""}`}
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}
    </div>
  );
};

export default AnalyticsPage;
