import React, { useState } from "react";
import LandingPage from "./pages/LandingPage.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import UploadModal from "./components/UploadModal.jsx";
import DownloadModal from "./components/DownloadModal.jsx";
import "./styles/global.css";
import "./styles/uploadModal.css";
import "./styles/downloadModal.css";
import "./styles/landingPage.css";
import "./styles/analyticsPage.css";

const App = () => {
  const [currentPage, setCurrentPage] = useState("landing");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  return (
    <div className="app landing-page">
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
