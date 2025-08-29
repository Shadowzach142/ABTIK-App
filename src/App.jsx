import React, { useState } from "react";
import "./styles.css";
import LandingPage from "./Pages/LandingPage.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import UploadModal from "./components/UploadModal.jsx";
import DownloadModal from "./components/DownloadModal.jsx";

const App = () => {
  const [currentPage, setCurrentPage] = useState("landing");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  return (
    <div className="app">
      {currentPage === "landing" && (
        <LandingPage
          setCurrentPage={setCurrentPage}
          setShowUploadModal={setShowUploadModal}
          setShowDownloadModal={setShowDownloadModal}
        />
      )}
      {currentPage === "analytics" && (
        <AnalyticsPage setCurrentPage={setCurrentPage} />
      )}
      {showUploadModal && (
        <UploadModal setShowUploadModal={setShowUploadModal} />
      )}
      {showDownloadModal && (
        <DownloadModal setShowDownloadModal={setShowDownloadModal} />
      )}
    </div>
  );
};

export default App;
