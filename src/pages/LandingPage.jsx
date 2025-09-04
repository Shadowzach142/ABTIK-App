import React from "react";
import { Upload, Download, BarChart3 } from "lucide-react";
import "../styles/landingPage.css";
import "../styles/global.css";

const LandingPage = ({
  setCurrentPage,
  setShowUploadModal,
  setShowDownloadModal,
}) => {
  return (
    <div className="landing-page">
      <div className="landing-container">
        <div className="landing-header">
          <h1 className="landing-title">Abtik Data Hub</h1>
          <p className="landing-subtitle">
            Transform paper-based medical records into digital insights. Scan,
            analyze, and share healthcare data to improve community health
            outcomes.
          </p>
        </div>

        <div className="landing-actions">
          <div className="action-grid">
            <div
              onClick={() => setShowUploadModal(true)}
              className="action-card"
            >
              <div className="action-icon upload">
                <Upload size={32} />
              </div>
              <h3 className="action-title">Upload Forms</h3>
              <p className="action-description">
                Scan and digitize patient forms to create searchable medical
                records
              </p>
            </div>

            <div
              onClick={() => setShowDownloadModal(true)}
              className="action-card"
            >
              <div className="action-icon download">
                <Download size={32} />
              </div>
              <h3 className="action-title">Access Records</h3>
              <p className="action-description">
                Search and download patient data from connected healthcare
                facilities
              </p>
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            <button
              onClick={() => setCurrentPage("analytics")}
              className="analytics-button"
            >
              <BarChart3 size={24} />
              View Analytics Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;