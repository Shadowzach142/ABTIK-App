import React from "react";
import ReactDOM from "react-dom/client";
import HealthcareDashboard from "./App.jsx"; // <-- uses your App.jsx
import "./styles/global.css";
import "./styles/uploadModal.css";
import "./styles/downloadModal.css";
import "./styles/landingPage.css";
import "./styles/analyticsPage.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HealthcareDashboard />
  </React.StrictMode>
);
