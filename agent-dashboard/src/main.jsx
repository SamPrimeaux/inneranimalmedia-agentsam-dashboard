import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import AgentDashboard from "./AgentDashboard.jsx";

const root = document.getElementById("agent-dashboard-root");
if (root) {
  ReactDOM.createRoot(root).render(<AgentDashboard />);
}
