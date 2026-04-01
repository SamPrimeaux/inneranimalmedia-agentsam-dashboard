/**
 * IAM code workspace — hosts IamEditorArea with local tab/file state.
 * Mounted from AgentDashboard (overlay or full-width). No worker API yet (CIDI session 1).
 */

import { useState, useCallback } from "react";
import IamEditorArea from "./IamEditorArea.jsx";

const DEFAULT_TAB = {
  id: "t1",
  label: "scratch.js",
  language: "javascript",
  path: "/workspace/scratch.js",
};

export default function IamWorkspaceShellHost({ themeSlug, onClose }) {
  const [tabs, setTabs] = useState([DEFAULT_TAB]);
  const [activeTabId, setActiveTabId] = useState(DEFAULT_TAB.id);
  const [contents, setContents] = useState({
    t1: "// IAM code workspace — bundled Monaco (Vite). Session 1 CIDI shell.\n",
  });

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const activeFileContent = contents[activeTabId] ?? "";

  const onTabClick = useCallback((id) => {
    setActiveTabId(id);
  }, []);

  const onTabClose = useCallback((id) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((t) => t.id !== id);
      setActiveTabId((cur) => (cur === id ? next[0].id : cur));
      return next;
    });
    setContents((c) => {
      const next = { ...c };
      delete next[id];
      return next;
    });
  }, []);

  const onFileChange = useCallback(
    (value) => {
      setContents((c) => ({ ...c, [activeTabId]: value }));
    },
    [activeTabId]
  );

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "8px 12px",
          borderBottom: "1px solid var(--iam-border)",
          background: "var(--iam-panel)",
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: "var(--iam-muted)",
            fontFamily: "var(--iam-mono, monospace)",
          }}
        >
          Code workspace
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "6px 12px",
            fontSize: 12,
            borderRadius: 6,
            border: "1px solid var(--iam-border)",
            background: "var(--iam-tab-active)",
            color: "var(--iam-text)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Close
        </button>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <IamEditorArea
          tabs={tabs}
          activeTabId={activeTabId}
          onTabClick={onTabClick}
          onTabClose={onTabClose}
          activeFileContent={activeFileContent}
          activeLanguage={activeTab?.language || "javascript"}
          themeSlug={themeSlug}
          breadcrumbs={["workspace", activeTab?.label || "file"]}
          terminalVisible={false}
          onFileChange={onFileChange}
        />
      </div>
    </div>
  );
}
