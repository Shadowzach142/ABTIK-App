import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import HealthcareDashboard from "./App.jsx"; // <-- uses your App.jsx

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HealthcareDashboard />
  </React.StrictMode>
);
