export default function ExecutionPlanCard({
  plan_id,
  summary,
  steps = [],
  onApprove,
  onReject,
}) {
  return (
    <div
      className="execution-plan-card"
      style={{
        background: "var(--bg-elevated)",
        border: "2px solid var(--mode-plan)",
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 12,
          color: "var(--mode-plan)",
        }}
      >
        [PLAN] Execution Plan Ready
      </div>

      <p style={{ fontSize: 13, marginBottom: 16, marginTop: 0, color: "var(--color-text)" }}>
        {summary || "No summary provided."}
      </p>

      <div style={{ marginBottom: 16 }}>
        {(steps || []).map((step, i) => (
          <div
            key={i}
            style={{
              padding: "10px 12px",
              background: "var(--bg-canvas)",
              borderRadius: 8,
              marginBottom: 8,
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 500, marginBottom: 4, color: "var(--color-text)" }}>
              Step {i + 1}: {step?.title ?? step?.name ?? "Step"}
            </div>
            <div style={{ color: "var(--text-muted)" }}>
              {step?.description ?? step?.detail ?? ""}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => onApprove(plan_id)}
          style={{
            flex: 1,
            padding: "10px 16px",
            background: "var(--mode-plan)",
            color: "var(--color-on-mode)",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => onReject(plan_id)}
          style={{
            padding: "10px 16px",
            background: "transparent",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            cursor: "pointer",
            color: "var(--color-text)",
          }}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
