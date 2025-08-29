import React, { useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import {
  databases,
  Query,
  databaseId,
  patientsCollectionId,
} from "../appwrite";

const DownloadModal = ({ setShowDownloadModal }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);

  // 🔹 Debounced search for patients
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (searchQuery.trim() === "") {
        setPatients([]);
        return;
      }

      const fetchPatients = async () => {
        setLoading(true);
        try {
          const patientRes = await databases.listDocuments(
            databaseId,
            patientsCollectionId,
            [Query.search("name", searchQuery)]
          );
          setPatients(patientRes.documents);
        } catch (err) {
          console.error("Error fetching patients:", err);
        } finally {
          setLoading(false);
        }
      };

      fetchPatients();
    }, 1000); // 1 second delay

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  return (
    <div className="modal-overlay">
      <div className="modal large">
        <div className="modal-search">
          <div className="modal-header" style={{ marginBottom: "1rem" }}>
            <h2 className="modal-title">Patient Records</h2>
            <button
              onClick={() => setShowDownloadModal(false)}
              className="close-button"
            >
              <X size={24} />
            </button>
          </div>

          <div className="search-container">
            <Search className="search-icon" />
            <input
              type="text"
              placeholder="Search patient name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        <div className="modal-content">
          {!selectedPatient ? (
            <div className="patient-list">
              {loading && <p>Loading patients...</p>}
              {!loading && patients.length === 0 && searchQuery && (
                <p>No patients found</p>
              )}
              {patients.map((patient) => (
                <div
                  key={patient.$id}
                  onClick={() => setSelectedPatient(patient)}
                  className="patient-item"
                >
                  <h3 className="patient-name">{patient.name}</h3>
                  <p className="patient-details">
                    Date of Birth: {patient.dateofbirth} | Visited:{" "}
                    {patient.visited}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <button
                onClick={() => setSelectedPatient(null)}
                className="back-link"
              >
                ← Back to Search
              </button>

              <div className="patient-info">
                <h3 className="patient-info-name">{selectedPatient.name}</h3>
                <p className="patient-info-detail">
                  Date of Birth: {selectedPatient.dateofbirth}
                </p>
                <p className="patient-info-detail">
                  Last Visit: {selectedPatient.visited}
                </p>
              </div>

              <h4 className="record-section-title">Medical Record</h4>
              <div className="record-item">
                {selectedPatient.image ? (
                  <>
                    <img
                      src={selectedPatient.image}
                      alt="Medical Record"
                      className="record-image"
                      style={{ maxWidth: "200px", marginTop: "0.5rem" }}
                    />
                    <br />
                    <a
                      href={selectedPatient.image}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="download-link"
                    >
                      Download
                    </a>
                  </>
                ) : (
                  <p>No Image Available</p>
                )}
                <p style={{ marginTop: "0.5rem" }}>
                  <strong>Summary:</strong> {selectedPatient.summary || "N/A"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DownloadModal;
