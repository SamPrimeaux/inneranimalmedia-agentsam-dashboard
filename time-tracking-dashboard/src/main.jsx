import React from "react";
import ReactDOM from "react-dom/client";
import TimeTracking from "./TimeTracking.jsx";

const root = document.getElementById("time-tracking-root");
if (root) {
  ReactDOM.createRoot(root).render(<TimeTracking />);
}
