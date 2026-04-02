import React from "react";
import ReactDOM from "react-dom/client";
import OverviewDashboard from "./OverviewDashboard.jsx";

const root = document.getElementById("overview-root");
if (root) {
  ReactDOM.createRoot(root).render(<OverviewDashboard />);
}
