import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { configureMonacoLoader } from "./workspace/monacoLoaderConfig.js";

configureMonacoLoader({ verbose: import.meta.env.DEV });

import "./workspace/workspace.css";
import AgentDashboard from "./AgentDashboard.jsx";

const root = document.getElementById("agent-dashboard-root");
if (root) {
  ReactDOM.createRoot(root).render(<AgentDashboard />);
}
