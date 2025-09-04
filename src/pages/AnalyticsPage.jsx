import React, { useState } from "react";
import { MapPin, TrendingUp, TrendingDown, Menu } from "lucide-react";

const AnalyticsPage = ({ setCurrentPage }) => {
  const [selectedDisease, setSelectedDisease] = useState("COVID-19");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Mock data
  const diseases = [
    { name: "COVID-19", cases: 1234, trend: "up", color: "#ef4444" },
    { name: "Influenza", cases: 876, trend: "down", color: "#f59e0b" },
    { name: "Dengue", cases: 543, trend: "up", color: "#10b981" },
    { name: "Hypertension", cases: 2103, trend: "up", color: "#8b5cf6" },
    { name: "Diabetes", cases: 1876, trend: "down", color: "#06b6d4" },
    { name: "Pneumonia", cases: 432, trend: "up", color: "#f97316" },
    { name: "Tuberculosis", cases: 298, trend: "down", color: "#ec4899" },
    { name: "Malaria", cases: 156, trend: "up", color: "#14b8a6" },
  ];

  const locations = [
    { name: "Quezon City", cases: 450, lat: 14.676, lng: 121.0437 },
    { name: "Manila", cases: 380, lat: 14.5995, lng: 120.9842 },
    { name: "Makati", cases: 290, lat: 14.5547, lng: 121.0244 },
    { name: "Pasig", cases: 210, lat: 14.5764, lng: 121.0851 },
    { name: "Taguig", cases: 185, lat: 14.5176, lng: 121.0509 },
    { name: "Marikina", cases: 142, lat: 14.6507, lng: 121.1029 },
  ];

  // Generate mock trend data for selected disease
  const generateTrendData = (diseaseName) => {
    const baseData = {
      "COVID-19": [45, 52, 48, 61, 58, 67, 63, 71, 68, 74, 72, 78],
      Influenza: [89, 85, 82, 78, 75, 71, 68, 64, 61, 58, 55, 52],
      Dengue: [23, 28, 31, 35, 42, 48, 52, 58, 61, 65, 69, 74],
      Hypertension: [
        112, 115, 118, 121, 125, 128, 132, 135, 139, 142, 146, 149,
      ],
      Diabetes: [95, 93, 91, 89, 87, 85, 83, 81, 79, 77, 75, 73],
      Pneumonia: [34, 37, 41, 44, 48, 52, 55, 59, 62, 66, 70, 73],
    };
    return (
      baseData[diseaseName] || [30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85]
    );
  };

  const trendData = generateTrendData(selectedDisease);
  const maxTrendValue = Math.max(...trendData);

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
              {diseases.map((disease) => (
                <div
                  key={disease.name}
                  onClick={() => {
                    setSelectedDisease(disease.name);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`disease-item ${
                    selectedDisease === disease.name ? "selected" : ""
                  }`}
                >
                  <div className="disease-info">
                    <div className="disease-details">
                      <h3>{disease.name}</h3>
                      <p className="disease-cases">
                        {disease.cases.toLocaleString()} cases
                      </p>
                    </div>
                    <div className="disease-indicators">
                      {disease.trend === "up" ? (
                        <TrendingUp className="trend-icon trend-up" />
                      ) : (
                        <TrendingDown className="trend-icon trend-down" />
                      )}
                      <div
                        className="disease-color"
                        style={{ backgroundColor: disease.color }}
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
                  <span className="stat-value">
                    {diseases
                      .reduce((sum, d) => sum + d.cases, 0)
                      .toLocaleString()}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Trending Up</span>
                  <span className="stat-value trending-up">
                    {diseases.filter((d) => d.trend === "up").length}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Trending Down</span>
                  <span className="stat-value trending-down">
                    {diseases.filter((d) => d.trend === "down").length}
                  </span>
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
                    <div className="map-placeholder">
                      <MapPin className="map-icon" />
                      <p className="map-text">
                        Metro Manila Disease Distribution
                      </p>
                      <p className="map-subtext">
                        Real-time tracking of {selectedDisease}
                      </p>
                    </div>

                    {/* Mock location markers */}
                    {locations.map((location, index) => {
                      const markerSize = Math.max(
                        25,
                        (location.cases / 450) * 60
                      );
                      const selectedDiseaseData = diseases.find(
                        (d) => d.name === selectedDisease
                      );
                      const adjustedCases = Math.floor(
                        location.cases * (selectedDiseaseData?.cases / 1000)
                      );

                      return (
                        <div
                          key={location.name}
                          className="location-marker"
                          style={{
                            width: markerSize + "px",
                            height: markerSize + "px",
                            left: 15 + index * 15 + "%",
                            top: 20 + (index % 3) * 25 + "%",
                            backgroundColor:
                              selectedDiseaseData?.color || "#ef4444",
                          }}
                          title={`${location.name}: ${adjustedCases} ${selectedDisease} cases`}
                        >
                          {adjustedCases}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Side - Charts and Data */}
              <div className="charts-section">
                {/* Trend Chart */}
                <div className="chart-container">
                  <h3 className="chart-title">
                    {selectedDisease} - 12 Month Trend
                  </h3>
                  <div className="chart-display" style={{ position: "relative", overflow: "hidden" }}>
                    {/* Show SVG background if COVID-19 is selected */}
                    {selectedDisease === "COVID-19" && (
                      <img
                        src="/Graphs/COVID%20line%20graph.svg"
                        alt="COVID-19 Line Graph"
                        style={{
                          position: "absolute",
                          left: "50%",
                          top: "50%",
                          transform: "translate(-50%, -50%)",
                          width: "auto",
                          height: "100%",
                          zIndex: 0,
                          opacity: 1, // adjust for visibility behind gradient
                          pointerEvents: "none",
                        }}
                        className="covid-svg-bg"
                      />
                    )}
                    {selectedDisease === "Influenza" && (
                      <img
                        src="/Graphs/Influenza%20line%20graph.svg"
                        alt="Influenza Line Graph"
                        style={{
                          position: "absolute",
                          left: "50%",
                          top: "50%",
                          transform: "translate(-50%, -50%)",
                          width: "auto",
                          height: "100%",
                          zIndex: 0,
                          opacity: 1, // adjust for visibility behind gradient
                          pointerEvents: "none",
                        }}
                        className="influenza-svg-bg"
                      />
                    )}
                    {selectedDisease === "Dengue" && (
                      <img
                        src="/Graphs/Dengue%20line%20graph.svg"
                        alt="Dengue Line Graph"
                        style={{
                          position: "absolute",
                          left: "50%",
                          top: "50%",
                          transform: "translate(-50%, -50%)",
                          width: "auto",
                          height: "100%",
                          zIndex: 0,
                          opacity: 1, // adjust for visibility behind gradient
                          pointerEvents: "none",
                        }}
                        className="dengue-svg-bg"
                      />
                    )}
                    {selectedDisease === "Hypertension" && (
                      <img
                        src="/Graphs/Hypertension%20line%20graph.svg"
                        alt="Hypertension Line Graph"
                        style={{
                          position: "absolute",
                          left: "50%",
                          top: "50%",
                          transform: "translate(-50%, -50%)",
                          width: "auto",
                          height: "100%",
                          zIndex: 0,
                          opacity: 1, // adjust for visibility behind gradient
                          pointerEvents: "none",
                        }}
                        className="hypertension-svg-bg"
                      />
                    )}
                    {selectedDisease === "Diabetes" && (
                      <img
                        src="/Graphs/Diabetes%20line%20graph.svg"
                        alt="Diabetes Line Graph"
                        style={{
                          position: "absolute",
                          left: "50%",
                          top: "50%",
                          transform: "translate(-50%, -50%)",
                          width: "auto",
                          height: "100%",
                          zIndex: 0,
                          opacity: 1, // adjust for visibility behind gradient
                          pointerEvents: "none",
                        }}
                        className="diabetes-svg-bg"
                      />
                    )}
                    {selectedDisease === "Pneumonia" && (
                      <img
                        src="/Graphs/Pneumonia%20line%20graph.svg"
                        alt="Pneumonia Line Graph"
                        style={{
                          position: "absolute",
                          left: "50%",
                          top: "50%",
                          transform: "translate(-50%, -50%)",
                          width: "auto",
                          height: "100%",
                          zIndex: 0,
                          opacity: 1, // adjust for visibility behind gradient
                          pointerEvents: "none",
                        }}
                        className="pneumonia-svg-bg"
                      />
                    )}
                    {selectedDisease === "Tuberculosis" && (
                      <img
                        src="/Graphs/Tuberculosis%20line%20graph.svg"
                        alt="Tuberculosis Line Graph"
                        style={{
                          position: "absolute",
                          left: "50%",
                          top: "50%",
                          transform: "translate(-50%, -50%)",
                          width: "auto",
                          height: "100%",
                          zIndex: 0,
                          opacity: 1, // adjust for visibility behind gradient
                          pointerEvents: "none",
                        }}
                        className="tuberculosis-svg-bg"
                      />
                    )}
                    {selectedDisease === "Malaria" && (
                      <img
                        src="/Graphs/Malaria%20line%20graph.svg"
                        alt="Malaria Line Graph"
                        style={{
                          position: "absolute",
                          left: "50%",
                          top: "50%",
                          transform: "translate(-50%, -50%)",
                          width: "auto",
                          height: "100%",
                          zIndex: 0,
                          opacity: 1, // adjust for visibility behind gradient
                          pointerEvents: "none",
                        }}
                        className="malaria-svg-bg"
                      />
                    )}
                    {/* Blue gradient overlay (if you have a gradient, otherwise add one) */}
                    
                    <div className="chart-bars" style={{ position: "relative", zIndex: 2 }}>
                      {trendData.map((value, index) => (
                        <div
                          key={index}
                          className="chart-bar"
                          style={{
                            height: (value / maxTrendValue) * 100 + "%",
                            backgroundColor:
                              diseases.find((d) => d.name === selectedDisease)?.color ||
                              "#3b82f6",
                          }}
                          title={`Month ${index + 1}: ${value} cases`}
                        ></div>
                      ))}
                    </div>
                  </div>
                  <div className="chart-labels">
                    <span>Jan</span>
                    <span>Feb</span>
                    <span>Mar</span>
                    <span>Apr</span>
                    <span>May</span>
                    <span>Jun</span>
                    <span>Jul</span>
                    <span>Aug</span>
                    <span>Sep</span>
                    <span>Oct</span>
                    <span>Nov</span>
                    <span>Dec</span>
                  </div>
                </div>

                {/* Top Affected Locations */}
                <div className="chart-container">
                  <h3 className="chart-title">Most Affected Areas</h3>
                  <div className="location-list">
                    {locations.slice(0, 6).map((location, index) => {
                      const selectedDiseaseData = diseases.find(
                        (d) => d.name === selectedDisease
                      );
                      const adjustedCases = Math.floor(
                        location.cases * (selectedDiseaseData?.cases / 1000)
                      );
                      const maxCases = Math.max(
                        ...locations.map((l) =>
                          Math.floor(
                            l.cases * (selectedDiseaseData?.cases / 1000)
                          )
                        )
                      );

                      return (
                        <div key={location.name} className="location-item">
                          <div className="location-info">
                            <span className="location-name">
                              {location.name}
                            </span>
                            <span className="location-rank">#{index + 1}</span>
                          </div>
                          <div className="location-stats">
                            <div className="progress-bar">
                              <div
                                className="progress-fill"
                                style={{
                                  width: `${(adjustedCases / maxCases) * 100}%`,
                                  backgroundColor:
                                    selectedDiseaseData?.color || "#ef4444",
                                }}
                              ></div>
                            </div>
                            <span className="location-count">
                              {adjustedCases}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="chart-container">
                  <h3 className="chart-title">Recent Reports</h3>
                  <div className="activity-list">
                    <div className="activity-item">
                      <div
                        className="activity-dot"
                        style={{ backgroundColor: "#ef4444" }}
                      ></div>
                      <div className="activity-content">
                        <p className="activity-text">
                          New outbreak reported in Quezon City
                        </p>
                        <span className="activity-time">2 hours ago</span>
                      </div>
                    </div>
                    <div className="activity-item">
                      <div
                        className="activity-dot"
                        style={{ backgroundColor: "#10b981" }}
                      ></div>
                      <div className="activity-content">
                        <p className="activity-text">
                          Recovery rate improved in Manila
                        </p>
                        <span className="activity-time">5 hours ago</span>
                      </div>
                    </div>
                    <div className="activity-item">
                      <div
                        className="activity-dot"
                        style={{ backgroundColor: "#f59e0b" }}
                      ></div>
                      <div className="activity-content">
                        <p className="activity-text">
                          Weekly report submitted from Makati
                        </p>
                        <span className="activity-time">1 day ago</span>
                      </div>
                    </div>
                    <div className="activity-item">
                      <div
                        className="activity-dot"
                        style={{ backgroundColor: "#8b5cf6" }}
                      ></div>
                      <div className="activity-content">
                        <p className="activity-text">
                          Data sync completed across all hospitals
                        </p>
                        <span className="activity-time">2 days ago</span>
                      </div>
                    </div>
                  </div>
                </div>
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
