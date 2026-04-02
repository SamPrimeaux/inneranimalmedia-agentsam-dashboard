export default function QueueIndicator({ current, queueCount, queue = [], onClear, onDeleteItem }) {
  if (!current && queueCount === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 80,
        right: 20,
        background: "var(--bg-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        color: "var(--color-text)",
        maxWidth: 320,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div>
          {current && (
            <div style={{ fontWeight: 500 }}>{current.task_type || "Running"}</div>
          )}
          {queueCount > 0 && (
            <div style={{ color: "var(--text-muted)" }}>+{queueCount} queued</div>
          )}
        </div>
        {queueCount > 0 && onClear && (
          <button
            type="button"
            onClick={onClear}
            style={{
              padding: "4px 8px",
              fontSize: 11,
              background: "transparent",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              cursor: "pointer",
              color: "var(--color-text)",
            }}
          >
            Clear
          </button>
        )}
      </div>
      {Array.isArray(queue) && queue.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {queue.slice(0, 5).map((item) => {
            const preview = item.payload?.message
              ? String(item.payload.message).substring(0, 50)
              : item.task_type || "Task";
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  background: "var(--bg-canvas)",
                  borderRadius: 4,
                  fontSize: 11,
                }}
              >
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {preview}{preview.length >= 50 ? "..." : ""}
                </span>
                {onDeleteItem && (
                  <button
                    type="button"
                    onClick={() => onDeleteItem(item.id)}
                    style={{
                      padding: "2px 6px",
                      fontSize: 10,
                      background: "transparent",
                      border: "1px solid var(--color-border)",
                      borderRadius: 4,
                      cursor: "pointer",
                      color: "var(--color-text)",
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
