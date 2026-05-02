import React, { useEffect, useMemo, useState } from "react";

/**
 * Agent Sam provider guide component.
 * Target file: agent-dashboard/src/components/guides/ApiProviderGuide.tsx
 *
 * Build/debug notes:
 * - No lucide-react dependency. Some sandbox/build environments resolve lucide icons
 *   through remote per-icon ESM URLs, which can fail during bundling.
 * - Icons are local CSS/lettermark chips, so this file only depends on React.
 * - This component renders provider reference docs and reads open security todos.
 * - It does not create endpoints, tables, routes, migrations, or roadmap files.
 *
 * Existing tables read or referenced by this component:
 * - agentsam_todo: live guide callouts for open security/provider tasks.
 * - ai_models: customer-facing model catalog and provider capability metadata.
 * - agent_model_registry: internal provider/model registry, pricing, routing metadata.
 * - agentsam_bootstrap: workspace operating rules, theme slug, UI preferences, model defaults.
 * - agentsam_model_routes: proposed routing source for mode/task/provider/model choices.
 * - agent_telemetry: execution, token, latency, cache, and model-call telemetry.
 * - spend_ledger: provider/model/tool cost reconciliation.
 * - mcp_registered_tools, mcp_tools, mcp_tool_calls: MCP registry and execution history.
 *
 * Schema proposal notes only, not created by this component:
 * - agentsam_provider_registry: provider capabilities, auth source, safety tier, status.
 * - agentsam_provider_runs: normalized run records across OpenAI, Anthropic, Google, Cloudflare, and local models.
 * - agentsam_context_packets: reusable compact workspace/context bundles.
 * - agentsam_prompt_cache_keys: cache key metadata, provider, hit/miss accounting.
 * - agentsam_compaction_events: context compaction inputs, outputs, and quality checks.
 * - agentsam_eval_suites, agentsam_eval_cases, agentsam_eval_runs: eval-driven model promotion.
 * - agentsam_tool_load_events: deferred tool search/load accounting.
 * - agentsam_webhook_events: provider webhook idempotency and processing state.
 */

type ProviderKey = "openai" | "anthropic" | "google" | "cloudflare" | "cursor" | "agentsam";
type CapabilityTone = "primary" | "success" | "warning" | "danger" | "info";
type IconKind = "alert" | "book" | "bot" | "check" | "chevron" | "cloud" | "code" | "database" | "layers" | "network" | "refresh" | "route" | "search" | "shield" | "x";

type Capability = {
  label: string;
  detail: string;
  tone?: CapabilityTone;
};

type RouteSpec = {
  label: string;
  value: string;
  detail: string;
};

type TableSpec = {
  table: string;
  purpose: string;
  status: "existing" | "proposal";
};

type TodoItem = {
  id?: string | number;
  title?: string;
  task?: string;
  description?: string;
  provider?: string;
  category?: string;
  status?: string;
  priority?: string;
  tags?: string[] | string | null;
  created_at?: string | number | null;
};

type TodoResponse = {
  todos?: TodoItem[];
  items?: TodoItem[];
  rows?: TodoItem[];
};

type ProviderGuide = {
  key: ProviderKey;
  label: string;
  route: string;
  eyebrow: string;
  title: string;
  role: string;
  summary: string;
  bestFor: string[];
  avoidFor: string[];
  capabilities: Capability[];
  agentSamRoutes: RouteSpec[];
  d1Tables: TableSpec[];
  mcpStrategy: string[];
  costStrategy: string[];
  cachingStrategy: string[];
  evalStrategy: string[];
  securityRules: string[];
  todoTags: string[];
};

interface ApiProviderGuideProps {
  provider?: ProviderKey;
  workspaceId?: string | null;
}

const PROVIDER_ORDER: ProviderKey[] = ["openai", "anthropic", "google", "cloudflare", "cursor", "agentsam"];

const ICON_LABELS: Record<IconKind, string> = {
  alert: "AL",
  book: "BK",
  bot: "AI",
  check: "OK",
  chevron: "GO",
  cloud: "CF",
  code: "CD",
  database: "DB",
  layers: "LY",
  network: "NT",
  refresh: "RF",
  route: "RT",
  search: "SR",
  shield: "SH",
  x: "NO"
};

const GUIDES: Record<ProviderKey, ProviderGuide> = {
  openai: {
    key: "openai",
    label: "OpenAI",
    route: "/api/guide/openai",
    eyebrow: "Reasoning and tool orchestration",
    title: "OpenAI API for Agent Sam",
    role: "OpenAI is the high-agency orchestration lane for Agent Sam when the task needs reasoning, structured tool use, MCP, file retrieval, shell/computer-style workflows, webhook-backed async handling, and precise response contracts.",
    summary: "Use OpenAI when Agent Sam needs to plan across multiple systems, search available tools, call MCP, reason through code or infrastructure, and return artifacts that can be audited in D1.",
    bestFor: [
      "Tool-heavy Agent mode runs where MCP tools must be selected dynamically.",
      "Debug mode investigations that combine logs, code, browser state, and shell output.",
      "Reasoning sessions with compacted context, file search, citations, and structured artifacts.",
      "Webhook-backed async jobs where the final result must be processed after the request cycle."
    ],
    avoidFor: [
      "Simple one-line summaries that can run through a cheaper provider lane.",
      "Visual-first screenshot critique where Gemini is the better first reviewer.",
      "Provider eval grading where Anthropic is being used as the rubric judge.",
      "Private local terminal helper tasks that should stay on Qwen/Ollama."
    ],
    capabilities: [
      { label: "Reasoning", detail: "Primary lane for complex architecture, debugging, and multi-step development decisions.", tone: "primary" },
      { label: "MCP", detail: "Remote MCP tools should be approval-gated and loaded only when relevant.", tone: "success" },
      { label: "Tool search", detail: "Use deferred tool loading instead of injecting the full MCP catalog into every request.", tone: "info" },
      { label: "Webhooks", detail: "Use for background completion, event dedupe, and queue-based post-processing.", tone: "warning" },
      { label: "Compaction", detail: "Keep durable project state usable without bloating every prompt.", tone: "primary" }
    ],
    agentSamRoutes: [
      { label: "OpenAI responder", value: "/api/agent/openai/respond", detail: "Provider-specific execution lane for Responses API runs." },
      { label: "Unified responder", value: "/api/agent/respond", detail: "Recommended public entry that routes by D1 model policy." },
      { label: "Webhook receiver", value: "/api/webhooks/openai", detail: "Verify signature, dedupe event id, enqueue processing." },
      { label: "Tool search bridge", value: "/api/agent/tools/search", detail: "Expose only relevant MCP namespaces to the selected run." }
    ],
    d1Tables: [
      { table: "ai_models", purpose: "OpenAI customer-facing catalog rows with tool, vision, reasoning, and pricing flags.", status: "existing" },
      { table: "agent_model_registry", purpose: "Internal OpenAI model metadata, cache pricing, context window, and routing tier.", status: "existing" },
      { table: "agentsam_model_routes", purpose: "Mode and task routing into OpenAI when tool-heavy reasoning is required.", status: "proposal" },
      { table: "agentsam_prompt_cache_keys", purpose: "Cache key tracking for stable IAM system prompts and workspace prefixes.", status: "proposal" },
      { table: "agentsam_webhook_events", purpose: "Webhook idempotency, signature status, retry state, and processing result.", status: "proposal" },
      { table: "mcp_tool_calls", purpose: "Every OpenAI-triggered MCP call should land here with approval and cost metadata.", status: "existing" }
    ],
    mcpStrategy: [
      "Expose MCP by namespace, not by dumping every tool schema into context.",
      "Require capability checks before shell, deploy, db_write, r2_write, secret, or GitHub mutation tools.",
      "Log tool selection, tool args summary, approval state, result summary, and verification result.",
      "Use OpenAI for high-agency MCP orchestration only after workspace and tenant scope are resolved from session."
    ],
    costStrategy: [
      "Start through the unified router; only escalate to OpenAI reasoning when tool complexity or risk justifies it.",
      "Track input, output, cache read, cache write, tool call, and webhook post-processing costs.",
      "Prefer compact context packets over raw logs or full file dumps.",
      "Store avoided-cost notes when a cheaper provider completed the task without OpenAI escalation."
    ],
    cachingStrategy: [
      "Stable prefix: IAM identity, safety rules, mode contract, output contract, and current provider policy.",
      "Semi-stable prefix: workspace rules from agentsam_bootstrap and selected MCP namespace summaries.",
      "Dynamic suffix: user task, current error, selected file excerpts, recent tool results, and approval state.",
      "Cache key should include workspace id, mode, policy version, and guide/provider version."
    ],
    evalStrategy: [
      "Score OpenAI on tool choice accuracy, safe approval behavior, debug correctness, and artifact quality.",
      "Include negative tests where the model must refuse deploy/db-write until approval is present.",
      "Promote OpenAI routes only when it beats alternatives on quality after normalized cost and latency.",
      "Use Anthropic or a rubric judge lane to grade high-risk coding outputs before promotion."
    ],
    securityRules: [
      "Never allow a provider-supplied tenant id to override the authenticated session tenant.",
      "Do not send raw secrets, bearer tokens, or vault values to OpenAI; send scoped capability references only.",
      "Webhook processing must verify signature and dedupe before touching D1, R2, queues, or email.",
      "Shell/computer-style actions require approval gates and execution receipts."
    ],
    todoTags: ["openai", "gpt", "responses", "webhook", "mcp", "tool", "tool_search", "prompt_cache", "compaction"]
  },
  anthropic: {
    key: "anthropic",
    label: "Anthropic",
    route: "/api/guide/anthropic",
    eyebrow: "Evaluation, planning, and code review",
    title: "Anthropic Claude for Agent Sam",
    role: "Anthropic is the evaluation, planning, code review, and high-trust collaboration lane. Use Claude to define success criteria, review risky plans, generate eval rubrics, and critique Agent Sam outputs before model promotion.",
    summary: "Claude should act as Agent Sam's reviewer and evaluator: excellent for long-context planning, codebase reasoning, safe refactor proposals, UX critiques, and rubric-based model testing.",
    bestFor: [
      "Developing provider evals before changing default model routes.",
      "Long-form architecture review and refactor planning.",
      "Reviewing risky code, database migrations, security changes, and deployment plans.",
      "Producing high-quality implementation checklists for Agent Sam or Cursor execution."
    ],
    avoidFor: [
      "Blind execution without tool/audit wrapping.",
      "Using Claude as only another chat provider instead of as a reviewer and judge.",
      "Cheap repetitive summarization that belongs in a lower-cost lane.",
      "Visual-only screenshot triage where Gemini should produce first-pass findings."
    ],
    capabilities: [
      { label: "Evals", detail: "Best lane for defining success criteria and grading model/provider behavior.", tone: "success" },
      { label: "Planning", detail: "Strong fit for staged implementation plans and risk analysis.", tone: "primary" },
      { label: "Code review", detail: "Use for high-risk diffs, schema changes, auth, and deployment workflows.", tone: "warning" },
      { label: "Prompt caching", detail: "Cache large rules, architecture briefs, coding conventions, and tool descriptions.", tone: "info" }
    ],
    agentSamRoutes: [
      { label: "Anthropic responder", value: "/api/agent/anthropic/respond", detail: "Provider-specific lane for Claude review and planning." },
      { label: "Eval runner", value: "/api/evals/anthropic/run", detail: "Use Claude as a rubric judge for provider comparisons." },
      { label: "Unified responder", value: "/api/agent/respond", detail: "Route into Anthropic when the D1 policy marks the task as review/eval heavy." }
    ],
    d1Tables: [
      { table: "ai_models", purpose: "Claude catalog rows with picker visibility, tool, vision, pricing, and context metadata.", status: "existing" },
      { table: "agent_model_registry", purpose: "Internal Anthropic model capabilities, cache pricing, tier, and route metadata.", status: "existing" },
      { table: "agentsam_eval_suites", purpose: "Mode-specific suites for Ask, Plan, Agent, Debug, Auto, UI review, and MCP safety.", status: "proposal" },
      { table: "agentsam_eval_cases", purpose: "Golden cases, expected behavior, forbidden behavior, and required context.", status: "proposal" },
      { table: "agentsam_eval_runs", purpose: "Model score, latency, cost, judge notes, and promotion decision metadata.", status: "proposal" },
      { table: "agentsam_lessons", purpose: "Recurring review findings and durable improvement notes.", status: "existing" }
    ],
    mcpStrategy: [
      "Use MCP sparingly for review tasks; Claude should often critique the plan before execution tools are enabled.",
      "When tools are enabled, constrain Claude to read-only or review-safe namespaces unless approval is granted.",
      "Use Claude output to produce tool execution checklists for OpenAI/Agent mode rather than directly mutating high-risk systems.",
      "Record critique findings as eval notes or agentsam_lessons."
    ],
    costStrategy: [
      "Spend Anthropic budget where quality and judgment matter more than speed.",
      "Use eval sampling instead of running every trivial task through Claude.",
      "Cache stable architecture briefs and rubric definitions.",
      "Track reviewer cost separately from executor cost in spend_ledger."
    ],
    cachingStrategy: [
      "Cache IAM architecture brief, coding standards, DB rules, UI design rules, and rubric definitions.",
      "Keep the actual diff, task, error, or output being graded outside the stable prefix.",
      "Version cache keys by rubric version so old evaluations remain comparable.",
      "Do not cache tenant-specific secrets or raw vault material."
    ],
    evalStrategy: [
      "Make Claude the first-class eval author and judge for provider route decisions.",
      "Use mode-specific rubrics rather than one generic quality score.",
      "Require explanations for failures so the fix can become an agentsam_lesson.",
      "Compare Claude's own output against the same rubrics to avoid assuming it always wins."
    ],
    securityRules: [
      "Treat Claude review output as advice until an audited execution lane applies changes.",
      "Use read-only context for risky security, billing, auth, and migration reviews by default.",
      "Do not expose raw secrets in review prompts.",
      "Require human approval before using Claude-generated migration/deploy instructions in Agent mode."
    ],
    todoTags: ["anthropic", "claude", "eval", "rubric", "review", "prompt_cache", "safety"]
  },
  google: {
    key: "google",
    label: "Google",
    route: "/api/guide/google",
    eyebrow: "Gemini, Vertex, and multimodal review",
    title: "Google Gemini and Vertex for Agent Sam",
    role: "Google is the multimodal and visual reasoning lane. Use Gemini for screenshots, UI audits, media understanding, browser-state analysis, and fast design/development exploration before work becomes a governed Agent Sam task.",
    summary: "Gemini should turn images, screenshots, UI states, and broad context into structured findings that Agent Sam can store, prioritize, and execute through the normal tool/governance system.",
    bestFor: [
      "Screenshot-based UI and UX critique.",
      "Visual regression review and browser preview analysis.",
      "Media-heavy tasks involving images, documents, and multimodal context.",
      "Fast ideation before a stricter OpenAI or Anthropic execution/review pass."
    ],
    avoidFor: [
      "Replacing the audited deployment or database execution path.",
      "Treating visual critique as automatically approved code changes.",
      "Secret-bearing prompts or client-private context without explicit scope control.",
      "Provider eval judging where a dedicated rubric lane is required."
    ],
    capabilities: [
      { label: "Multimodal", detail: "Primary lane for screenshots, visual state, UI audits, and media understanding.", tone: "primary" },
      { label: "Visual QA", detail: "Convert screenshots into structured issues with severity and acceptance tests.", tone: "success" },
      { label: "Fast exploration", detail: "Useful for early-stage ideas before routing to executor/reviewer lanes.", tone: "info" },
      { label: "Vertex path", detail: "Use for enterprise Google Cloud controls where needed.", tone: "warning" }
    ],
    agentSamRoutes: [
      { label: "Google responder", value: "/api/agent/google/respond", detail: "Provider-specific Gemini lane for multimodal and Google tasks." },
      { label: "Visual audit", value: "/api/quality/visual-audit", detail: "Screenshot and UI review flow that stores structured findings." },
      { label: "Unified responder", value: "/api/agent/respond", detail: "Route to Google when the task requires multimodal review." }
    ],
    d1Tables: [
      { table: "ai_models", purpose: "Gemini/Vertex model rows with vision, context, and picker metadata.", status: "existing" },
      { table: "quality_audit_findings", purpose: "Structured UI findings from screenshot or browser analysis.", status: "existing" },
      { table: "agentsam_visual_reviews", purpose: "Provider output, screenshots, route metadata, and acceptance checks.", status: "proposal" },
      { table: "agentsam_model_routes", purpose: "Route visual_qa and multimodal tasks to Gemini where appropriate.", status: "proposal" },
      { table: "media_assets", purpose: "R2-backed screenshot and media artifacts that visual review can reference.", status: "existing" }
    ],
    mcpStrategy: [
      "Use browser and screenshot tools to produce grounded visual inputs before asking Gemini for critique.",
      "Normalize Gemini findings into Agent Sam artifacts rather than freeform chat output.",
      "Send execution tasks back through Agent Sam Plan or Agent mode with normal approvals.",
      "Store screenshot keys, route paths, theme slug, and component guesses with every finding."
    ],
    costStrategy: [
      "Use Google when image or multimodal input is the reason for the task.",
      "Do not route generic text-only coding tasks to Google unless evals show it wins.",
      "Batch visual checks when running route-level audits.",
      "Track screenshot and media processing costs separately from chat costs."
    ],
    cachingStrategy: [
      "Cache stable UI standards, design token rules, and audit rubrics.",
      "Do not cache rapidly changing screenshot state as if it were durable context.",
      "Summarize repeated visual findings into agentsam_lessons for future UI passes.",
      "Keep route-specific screenshots in R2 and reference keys in D1."
    ],
    evalStrategy: [
      "Score Gemini on visual issue detection, specificity, severity accuracy, and component-level fix usefulness.",
      "Compare against human-reviewed screenshots from your actual dashboard pages.",
      "Use acceptance tests like identify active mode within one second or no horizontal overflow.",
      "Do not promote visual recommendations unless they map to real component/file changes."
    ],
    securityRules: [
      "Strip secrets and private tokens from screenshots before visual review.",
      "Avoid sending client-sensitive media unless the tenant and workspace scope explicitly permit it.",
      "Do not let Gemini output bypass Agent Sam approval gates.",
      "Store visual artifacts with tenant and workspace ownership metadata."
    ],
    todoTags: ["google", "gemini", "vertex", "visual", "screenshot", "multimodal", "ui", "ux"]
  },
  cloudflare: {
    key: "cloudflare",
    label: "Cloudflare",
    route: "/api/guide/cloudflare",
    eyebrow: "Edge runtime and fallback AI utilities",
    title: "Cloudflare Platform for Agent Sam",
    role: "Cloudflare is the runtime, storage, security, and edge execution platform for IAM. Workers AI is only a fallback and utility lane: embeddings, speech-to-text, image classification, and last-resort chat fallback. Primary inference should use keyed providers such as Anthropic, Gemini, and OpenAI.",
    summary: "Use Cloudflare for the platform brain and action surface: Workers, D1, R2, Durable Objects, Queues, Access, Tunnel, Hyperdrive, Browser Rendering, AutoRAG, Vectorize, and controlled Workers AI utilities.",
    bestFor: [
      "D1-backed runtime configuration, model routing, telemetry, spend, memory, and tool governance.",
      "R2-backed dashboard bundles, docs, artifacts, screenshots, RAG corpus, and static pages.",
      "Durable Object sessions for chat, collaboration, live terminal state, and real-time features.",
      "Workers AI embeddings, STT, image classification, and last-resort fallback only."
    ],
    avoidFor: [
      "Defaulting chat or agent reasoning to Workers AI.",
      "Treating Workers AI as a preferred general inference provider.",
      "Bypassing keyed provider routing for complex Agent mode tasks.",
      "Hardcoding Cloudflare binding decisions instead of storing platform state in D1."
    ],
    capabilities: [
      { label: "D1 brain", detail: "Runtime source for models, tools, memory, telemetry, spend, and governance.", tone: "primary" },
      { label: "R2 artifacts", detail: "Dashboard bundles, guide pages, screenshots, docs, and generated artifacts.", tone: "success" },
      { label: "Durable Objects", detail: "Stateful sessions for chat, collaboration, rooms, and terminal orchestration.", tone: "info" },
      { label: "Workers AI utility", detail: "Embeddings, STT, image classification, and final fallback only.", tone: "warning" },
      { label: "Zero Trust", detail: "Access, Tunnel, and private service routing protect internal origins.", tone: "danger" }
    ],
    agentSamRoutes: [
      { label: "Cloudflare guide", value: "/api/guide/cloudflare", detail: "Canonical Cloudflare platform guide." },
      { label: "Workers alias", value: "/api/guide/workers", detail: "Should redirect or map to the Cloudflare guide." },
      { label: "Embedding utility", value: "/api/rag/embed", detail: "Workers AI embedding utility, not a primary chat route." },
      { label: "RAG ingest", value: "/api/rag/ingest", detail: "Queue-backed ingest into R2, D1, Vectorize, or AutoRAG-related storage." }
    ],
    d1Tables: [
      { table: "ai_models", purpose: "Workers AI utility rows should be marked fallback, embedding, STT, or classification only.", status: "existing" },
      { table: "agentsam_model_routes", purpose: "Primary inference should route to keyed providers; Workers AI only utility/fallback lanes.", status: "proposal" },
      { table: "rag_chunks", purpose: "Chunk metadata, source keys, token counts, embeddings, and checksums.", status: "existing" },
      { table: "vectorize_index_registry", purpose: "Vector index metadata, dimensions, source type, and query counts.", status: "existing" },
      { table: "agent_telemetry", purpose: "Edge execution, queue, RAG, embedding, and fallback telemetry.", status: "existing" },
      { table: "spend_ledger", purpose: "Cloudflare platform and utility AI cost reconciliation.", status: "existing" }
    ],
    mcpStrategy: [
      "Cloudflare MCP tools should be capability-gated by action risk: read, write, deploy, secret, migration, and destructive operations.",
      "Workers AI tools should be utility tools, not the default chat responder.",
      "R2, D1, deploy, tunnel, and browser rendering tools need execution receipts and rollback metadata where possible.",
      "Use D1 as the runtime source of truth for all Cloudflare-bound provider decisions."
    ],
    costStrategy: [
      "Use Workers AI when it directly reduces cost for embeddings, STT, image classification, or fallback response handling.",
      "Do not optimize for cheap chat if output quality causes rework.",
      "Queue large ingest and telemetry jobs instead of blocking interactive requests.",
      "Track platform cost separately from keyed provider inference cost."
    ],
    cachingStrategy: [
      "Cache R2 docs and context packets by checksum, not by filename alone.",
      "Use D1 rows for compact metadata and R2 for large artifacts.",
      "Use Queues for compaction, ingest, and telemetry rollups.",
      "Keep Workers AI outputs labeled as utility/fallback so they do not pollute model-quality evals."
    ],
    evalStrategy: [
      "Evaluate Workers AI utility tasks separately from OpenAI, Anthropic, and Gemini chat/reasoning tasks.",
      "Score embeddings on retrieval quality, not chat helpfulness.",
      "Score STT and image classification against task-specific accuracy checks.",
      "Treat chat fallback as degraded-mode success, not a primary route win."
    ],
    securityRules: [
      "Protect terminal, Ollama, and internal origins behind Cloudflare Access and Tunnel.",
      "Do not expose private service URLs or tunnel internals in client bundles.",
      "Use tenant and workspace scope on R2 keys, D1 writes, queue jobs, and MCP tool calls.",
      "Require explicit approval for deploy, migration, secret, and destructive storage tools."
    ],
    todoTags: ["cloudflare", "workers", "workers_ai", "d1", "r2", "queue", "tunnel", "access", "autorag", "vectorize", "embedding"]
  },
  cursor: {
    key: "cursor",
    label: "Cursor",
    route: "/api/guide/cursor",
    eyebrow: "External benchmark and migration source",
    title: "Cursor as the Agent Sam Benchmark",
    role: "Cursor is the external benchmark and fallback development environment while Agent Sam matures into a Cloudflare-native, browser-based, governed IDE. Copy the useful patterns, but keep IAM governance, telemetry, and multi-tenant scope in your own platform.",
    summary: "Use Cursor to compare Agent Sam against a real agentic IDE: repo rules, file awareness, terminal actions, diffs, project context, and task completion loops.",
    bestFor: [
      "Benchmarking Agent Sam on identical coding tasks.",
      "Maintaining external repo rules that other tools can read.",
      "Heavy repo execution while Agent Sam terminal/file/diff flows are being hardened.",
      "Studying agent UX patterns that should be rebuilt in the IAM shell."
    ],
    avoidFor: [
      "Letting Cursor-only rules diverge from agentsam_bootstrap.",
      "Using Cursor as a permanent bypass around IAM audit, spend, and governance.",
      "Treating Cursor output as production-ready without Agent Sam verification.",
      "Hiding client or platform workflow knowledge outside your own D1/R2 docs."
    ],
    capabilities: [
      { label: "Rules", detail: "External file-backed project rules should mirror into Agent Sam DB-backed rules.", tone: "primary" },
      { label: "IDE loop", detail: "Useful benchmark for edit, terminal, diff, test, and commit cycles.", tone: "success" },
      { label: "MCP client", detail: "Cursor can consume mcp.inneranimalmedia.com with bearer auth and scoped tools.", tone: "info" },
      { label: "Parity testing", detail: "Compare outputs, corrections, and verification receipts against Agent Sam.", tone: "warning" }
    ],
    agentSamRoutes: [
      { label: "Cursor guide", value: "/api/guide/cursor", detail: "Reference guide for Cursor parity and migration." },
      { label: "Parity compare", value: "/api/parity/cursor/compare", detail: "Optional comparison endpoint for Cursor output versus Agent Sam output." },
      { label: "Unified responder", value: "/api/agent/respond", detail: "Agent Sam should graduate workflows once evals show parity or better." }
    ],
    d1Tables: [
      { table: "agentsam_bootstrap", purpose: "Runtime mirror of durable rules that may also exist in AGENTS.md or Cursor rules.", status: "existing" },
      { table: "agentsam_rules_document", purpose: "Track external file rules and their DB-backed equivalents.", status: "existing" },
      { table: "mcp_clients", purpose: "Cursor client registration, auth scope, last seen, and allowed namespaces.", status: "proposal" },
      { table: "agentsam_parity_tests", purpose: "Task, Cursor output, Agent Sam output, correction count, and score.", status: "proposal" },
      { table: "workflow_migrations", purpose: "Track workflows that move from external tools into Agent Sam.", status: "proposal" }
    ],
    mcpStrategy: [
      "Cursor should use the same MCP server as Agent Sam, but with client-specific scopes.",
      "Keep bearer token rotation and MCP_AUTH_TOKEN handling visible in security todos.",
      "Do not expose tools to Cursor that Agent Sam itself could not audit.",
      "Use Cursor tool usage as a benchmark for Agent Sam MCP UX."
    ],
    costStrategy: [
      "Treat Cursor as an external productivity cost to be reduced by Agent Sam parity.",
      "Track which workflows still require Cursor and why.",
      "Use eval data before cutting off Cursor from critical workflows.",
      "Prioritize replacing repetitive routine development first, not every advanced IDE feature at once."
    ],
    cachingStrategy: [
      "Mirror durable project rules into DB so Agent Sam and Cursor operate from the same source material.",
      "Version rules by checksum and last synced timestamp.",
      "Use compact rule summaries for prompts and full rules for docs.",
      "Do not let hidden Cursor context become the only place critical platform knowledge lives."
    ],
    evalStrategy: [
      "Run the same tasks through Cursor and Agent Sam.",
      "Compare success, files touched, tests run, human correction count, and time-to-verify.",
      "Promote a workflow into Agent Sam only when it produces equal or better receipts.",
      "Keep a failure library from Cursor-vs-Agent-Sam comparisons."
    ],
    securityRules: [
      "Cursor MCP tokens need rotation, scoping, and audit visibility.",
      "Cursor should not bypass tenant/workspace boundaries when acting through IAM MCP tools.",
      "Do not store long-lived raw external tokens in repo files.",
      "High-risk Cursor-generated changes still need Agent Sam verification before deploy."
    ],
    todoTags: ["cursor", "mcp", "rules", "parity", "ide", "token", "auth"]
  },
  agentsam: {
    key: "agentsam",
    label: "Agent Sam",
    route: "/api/guide/agentsam",
    eyebrow: "IAM-native agent operating system",
    title: "Agent Sam Provider Router and Dev OS",
    role: "Agent Sam is the Cloudflare-native development and business operations system. It should route across keyed providers, use D1 as the runtime brain, execute through MCP, write receipts for every action, and become the primary replacement for routine Cursor-style development work.",
    summary: "The product is not one chat box. It is a governed, multi-tenant, provider-routed development operating system where every capability is a row, every row can become a tool, and every tool call is audited.",
    bestFor: [
      "Unified Ask, Plan, Agent, Debug, and Auto workflows.",
      "Provider routing across OpenAI, Anthropic, Google, Cloudflare utility AI, and local Qwen/Ollama.",
      "Client operations, deployment, spend, telemetry, docs, RAG, storage, and MCP workflows.",
      "Turning Sam's recurring decisions into persistent tables, tools, rules, evals, and receipts."
    ],
    avoidFor: [
      "Acting without tenant/session scope.",
      "Hardcoding provider model lists in the Worker.",
      "Skipping evals and choosing models by hype.",
      "Executing deploy, migration, secret, or destructive operations without approval and rollback context."
    ],
    capabilities: [
      { label: "Router", detail: "Select provider by mode, task, risk, budget, latency, context, and eval score.", tone: "primary" },
      { label: "MCP OS", detail: "Every action should be a governed tool with approval, telemetry, and receipt metadata.", tone: "success" },
      { label: "D1 brain", detail: "Models, routes, tools, rules, memory, spend, telemetry, and todo state live in rows.", tone: "info" },
      { label: "Eval gate", detail: "Model promotion is earned by passing task-specific evals.", tone: "warning" },
      { label: "Receipt layer", detail: "Plans, diffs, commands, screenshots, tests, and deployment receipts prove work happened.", tone: "danger" }
    ],
    agentSamRoutes: [
      { label: "Unified responder", value: "/api/agent/respond", detail: "Main entry point that chooses provider/model/tool path from D1." },
      { label: "Provider router", value: "/api/agent/route", detail: "Returns selected provider, model, mode, risk, tools, and cost budget." },
      { label: "Context packet", value: "/api/agent/context/packet", detail: "Builds compact context from workspace, tenant, repo, route, docs, and recent state." },
      { label: "Eval runner", value: "/api/evals/run", detail: "Runs provider/model comparisons against mode-specific suites." }
    ],
    d1Tables: [
      { table: "agentsam_bootstrap", purpose: "Durable operating instructions, theme, capabilities, feature flags, and workspace rules.", status: "existing" },
      { table: "agentsam_todo", purpose: "Open work items surfaced directly inside this guide by provider/security category.", status: "existing" },
      { table: "agentsam_model_routes", purpose: "Provider and model selection by mode, task type, risk, and workspace policy.", status: "proposal" },
      { table: "agentsam_context_packets", purpose: "Compact reusable context objects for provider runs.", status: "proposal" },
      { table: "agentsam_change_sets", purpose: "Staged file, database, and deploy changes with rollback metadata.", status: "existing" },
      { table: "agentsam_verifications", purpose: "Tests, curls, screenshots, evals, and deployment checks.", status: "existing" },
      { table: "spend_ledger", purpose: "Source of truth for provider, tool, platform, and client-attributed cost.", status: "existing" }
    ],
    mcpStrategy: [
      "MCP is Agent Sam's action layer, not an optional sidecar.",
      "Each tool needs name, category, schema, risk, capability, approval, cost, and audit metadata.",
      "The router should attach only relevant tools for the current task and mode.",
      "Tool execution should always produce an inspectable receipt."
    ],
    costStrategy: [
      "Primary inference should use keyed providers based on eval results and task fit.",
      "Cloudflare Workers AI should remain utility/fallback, not the default chat provider.",
      "Track provider cost, tool cost, platform cost, and avoided cost separately.",
      "Use budgets and quality gates before allowing high-cost background work."
    ],
    cachingStrategy: [
      "Store stable rules in agentsam_bootstrap and reusable packets in agentsam_context_packets.",
      "Keep provider-specific prompt cache keys versioned and traceable.",
      "Compact long sessions into durable summaries with links to source artifacts.",
      "Never compact away approvals, risk state, or failed verification details."
    ],
    evalStrategy: [
      "Every mode needs its own eval suite: Ask, Plan, Agent, Debug, Auto, UI review, MCP safety, deploy safety.",
      "Provider routes should be promoted only by score, not hype.",
      "Eval output should become lessons, todo items, and model route updates.",
      "Regression tests should catch silent failures, missing endpoint behavior, unsafe tool calls, and poor context use."
    ],
    securityRules: [
      "Tenant resolution always comes from authenticated session.",
      "Vault values never enter prompts; providers receive scoped capability references only.",
      "High-risk MCP tools require approval and audit rows.",
      "Every endpoint should fail with typed safe errors, not empty objects, nulls, or swallowed exceptions."
    ],
    todoTags: ["agentsam", "agent", "router", "eval", "security", "mcp", "governance", "provider", "model"]
  }
};

function inferProviderFromPath(pathname: string): ProviderKey {
  if (pathname.includes("/api/guide/workers")) return "cloudflare";
  const hit = PROVIDER_ORDER.find((key) => pathname.includes(`/api/guide/${key}`));
  return hit || "agentsam";
}

function normalizeText(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

function getTodoTitle(todo: TodoItem): string {
  return todo.title || todo.task || "Open security task";
}

function getTodoDescription(todo: TodoItem): string {
  return todo.description || "Review this open Agent Sam todo before changing provider or security behavior.";
}

function getTodoTags(todo: TodoItem): string[] {
  if (Array.isArray(todo.tags)) return todo.tags.map((tag) => normalizeText(tag));
  if (typeof todo.tags === "string") {
    return todo.tags
      .split(",")
      .map((tag) => normalizeText(tag).trim())
      .filter(Boolean);
  }
  return [];
}

function todoMatchesProvider(todo: TodoItem, guide: ProviderGuide): boolean {
  const haystack = [todo.provider, todo.category, todo.priority, todo.status, todo.title, todo.task, todo.description, ...getTodoTags(todo)]
    .map(normalizeText)
    .join(" ");

  return guide.todoTags.some((tag) => haystack.includes(tag));
}

function cxTone(tone: CapabilityTone | undefined): string {
  if (tone === "success") return "var(--accent-success)";
  if (tone === "warning") return "var(--accent-warning)";
  if (tone === "danger") return "var(--accent-danger)";
  if (tone === "info") return "var(--accent-info)";
  return "var(--primary)";
}

function Pill({ children, tone = "primary" }: { children: React.ReactNode; tone?: CapabilityTone }): JSX.Element {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius)",
        padding: "6px 10px",
        color: "var(--text-primary)",
        background: "var(--bg-elevated)",
        boxShadow: "var(--shadow)",
        fontSize: 12,
        lineHeight: 1
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: "var(--radius)",
          background: cxTone(tone)
        }}
      />
      {children}
    </span>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }): JSX.Element {
  return (
    <section
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background: "var(--bg-surface)",
        boxShadow: "var(--shadow)",
        padding: 20,
        ...style
      }}
    >
      {children}
    </section>
  );
}

function IconChip({ kind, size = 36, spinning = false }: { kind: IconKind; size?: number; spinning?: boolean }): JSX.Element {
  return (
    <span
      className={spinning ? "iam-guide-spin" : undefined}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        minWidth: size,
        display: "inline-grid",
        placeItems: "center",
        borderRadius: "var(--radius)",
        background: "var(--primary-dim)",
        border: "1px solid var(--border-subtle)",
        color: "var(--primary)",
        fontSize: Math.max(9, Math.floor(size * 0.28)),
        lineHeight: 1,
        fontWeight: 800,
        letterSpacing: "0.04em"
      }}
    >
      {ICON_LABELS[kind]}
    </span>
  );
}

function SectionTitle({ icon, title, description }: { icon: IconKind; title: string; description?: string }): JSX.Element {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
      <IconChip kind={icon} />
      <div>
        <h2 style={{ margin: 0, color: "var(--text-strong)", fontSize: 20, letterSpacing: "-0.03em" }}>{title}</h2>
        {description ? <p style={{ margin: "5px 0 0", color: "var(--text-secondary)", lineHeight: 1.55 }}>{description}</p> : null}
      </div>
    </div>
  );
}

function ListBlock({ items, icon }: { items: string[]; icon: IconKind }): JSX.Element {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((item) => (
        <div key={item} style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 10, color: "var(--text-primary)", lineHeight: 1.55 }}>
          <IconChip kind={icon} size={18} />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function LoadingRow(): JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-secondary)", lineHeight: 1.5 }}>
      <IconChip kind="refresh" size={18} spinning />
      <span>Loading open security tasks.</span>
    </div>
  );
}

function TodoCallout({ guide, todos, loading, error, onRetry }: { guide: ProviderGuide; todos: TodoItem[]; loading: boolean; error: boolean; onRetry: () => void }): JSX.Element | null {
  const filtered = todos.filter((todo) => todoMatchesProvider(todo, guide));

  if (loading) {
    return (
      <Card style={{ background: "var(--bg-elevated)" }}>
        <LoadingRow />
      </Card>
    );
  }

  if (error) {
    return (
      <Card style={{ background: "var(--bg-elevated)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: "var(--accent-warning)" }}>
            <IconChip kind="alert" size={20} />
            <span>Security todo items could not be loaded.</span>
          </div>
          <button
            type="button"
            onClick={onRetry}
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              padding: "8px 11px",
              cursor: "pointer"
            }}
          >
            Retry
          </button>
        </div>
      </Card>
    );
  }

  if (filtered.length === 0) return null;

  return (
    <Card style={{ background: "var(--primary-dim)", border: "1px solid var(--primary)" }}>
      <SectionTitle icon="shield" title={`${guide.label} security tasks`} description="Open Agent Sam todo items tagged to this provider are surfaced here before implementation decisions." />
      <div style={{ display: "grid", gap: 10 }}>
        {filtered.slice(0, 5).map((todo, index) => (
          <div
            key={String(todo.id ?? `${guide.key}-${index}`)}
            style={{
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius)",
              background: "var(--bg-card)",
              padding: 12
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <strong style={{ color: "var(--text-strong)", lineHeight: 1.4 }}>{getTodoTitle(todo)}</strong>
              {todo.priority ? <Pill tone="warning">{todo.priority}</Pill> : null}
            </div>
            <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", lineHeight: 1.55 }}>{getTodoDescription(todo)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ProviderNav({ activeKey }: { activeKey: ProviderKey }): JSX.Element {
  return (
    <nav aria-label="Provider guide navigation" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {PROVIDER_ORDER.map((key) => {
        const guide = GUIDES[key];
        const active = key === activeKey;
        return (
          <a
            key={key}
            href={guide.route}
            aria-current={active ? "page" : undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              textDecoration: "none",
              border: active ? "1px solid var(--primary)" : "1px solid var(--border)",
              borderRadius: "var(--radius)",
              background: active ? "var(--primary-dim)" : "var(--bg-elevated)",
              color: active ? "var(--text-strong)" : "var(--text-secondary)",
              padding: "9px 12px",
              fontSize: 13,
              lineHeight: 1
            }}
          >
            {guide.label}
          </a>
        );
      })}
    </nav>
  );
}

function TableList({ rows }: { rows: TableSpec[] }): JSX.Element {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((row) => (
        <div
          key={`${row.table}-${row.status}`}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(130px, 0.55fr) minmax(0, 1fr)",
            gap: 12,
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius)",
            background: "var(--bg-card)",
            padding: 12
          }}
        >
          <div>
            <code style={{ color: "var(--text-strong)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12, overflowWrap: "anywhere" }}>{row.table}</code>
            <div style={{ marginTop: 7 }}>
              <Pill tone={row.status === "existing" ? "success" : "warning"}>{row.status}</Pill>
            </div>
          </div>
          <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.55 }}>{row.purpose}</p>
        </div>
      ))}
    </div>
  );
}

function RouteList({ routes }: { routes: RouteSpec[] }): JSX.Element {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {routes.map((route) => (
        <div key={route.value} style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius)", background: "var(--bg-card)", padding: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
            <strong style={{ color: "var(--text-strong)" }}>{route.label}</strong>
            <code style={{ color: "var(--text-muted)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12, overflowWrap: "anywhere" }}>{route.value}</code>
          </div>
          <p style={{ margin: "7px 0 0", color: "var(--text-secondary)", lineHeight: 1.55 }}>{route.detail}</p>
        </div>
      ))}
    </div>
  );
}

function CapabilityGrid({ capabilities }: { capabilities: Capability[] }): JSX.Element {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
      {capabilities.map((capability) => (
        <div key={capability.label} style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius)", background: "var(--bg-card)", padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "var(--radius)", background: cxTone(capability.tone) }} />
            <strong style={{ color: "var(--text-strong)" }}>{capability.label}</strong>
          </div>
          <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.55 }}>{capability.detail}</p>
        </div>
      ))}
    </div>
  );
}

function parseTodoPayload(payload: TodoResponse | TodoItem[]): TodoItem[] {
  if (Array.isArray(payload)) return payload;
  return payload.todos || payload.items || payload.rows || [];
}

function fetchTodoItems(): Promise<TodoItem[]> {
  return fetch("/api/agent/todo?category=security&status=open", { credentials: "same-origin" }).then(async (response) => {
    if (!response.ok) return Promise.reject(new Error("todo_fetch_failed"));
    const payload = (await response.json()) as TodoResponse | TodoItem[];
    return parseTodoPayload(payload);
  });
}

export const API_PROVIDER_GUIDE_TEST_CASES = {
  pathInference: [
    { input: "/api/guide/openai", expected: "openai" as ProviderKey },
    { input: "/api/guide/workers", expected: "cloudflare" as ProviderKey },
    { input: "/api/guide/unknown", expected: "agentsam" as ProviderKey }
  ],
  todoMatching: [
    {
      todo: { title: "Rotate MCP_AUTH_TOKEN for OpenAI bridge", tags: "openai,mcp,security" },
      provider: "openai" as ProviderKey,
      expected: true
    },
    {
      todo: { title: "Review Gemini screenshot redaction", tags: ["google", "visual", "security"] },
      provider: "google" as ProviderKey,
      expected: true
    },
    {
      todo: { title: "Update unrelated billing copy", tags: "billing" },
      provider: "cursor" as ProviderKey,
      expected: false
    }
  ]
};

export function runApiProviderGuideSelfTests(): boolean {
  const pathTestsPass = API_PROVIDER_GUIDE_TEST_CASES.pathInference.every((test) => inferProviderFromPath(test.input) === test.expected);
  const todoTestsPass = API_PROVIDER_GUIDE_TEST_CASES.todoMatching.every((test) => todoMatchesProvider(test.todo, GUIDES[test.provider]) === test.expected);
  return pathTestsPass && todoTestsPass;
}

export default function ApiProviderGuide(props: ApiProviderGuideProps): JSX.Element {
  const activeKey = useMemo<ProviderKey>(() => {
    if (props.provider && GUIDES[props.provider]) return props.provider;
    if (typeof window !== "undefined") return inferProviderFromPath(window.location.pathname);
    return "agentsam";
  }, [props.provider]);

  const guide = GUIDES[activeKey];
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todoLoading, setTodoLoading] = useState<boolean>(true);
  const [todoError, setTodoError] = useState<boolean>(false);

  const loadTodos = () => {
    setTodoLoading(true);
    setTodoError(false);
    fetchTodoItems()
      .then((items) => {
        setTodos(items);
        setTodoError(false);
      })
      .catch(() => {
        setTodos([]);
        setTodoError(true);
      })
      .finally(() => setTodoLoading(false));
  };

  useEffect(() => {
    loadTodos();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname.includes("/api/guide/workers")) {
      window.history.replaceState(null, "", "/api/guide/cloudflare");
    }
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-canvas)", color: "var(--text-primary)", fontFamily: "Nunito, var(--font-sans, system-ui)", overflowX: "hidden" }}>
      <style>{`@keyframes iam-guide-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } .iam-guide-spin { animation: iam-guide-spin 900ms linear infinite; } .iam-guide-link:focus-visible, .iam-guide-button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }`}</style>

      <div style={{ maxWidth: 1220, margin: "0 auto", padding: "28px 18px 56px" }}>
        <header style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 18, border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg-panel)", boxShadow: "var(--shadow)", padding: 22, marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div aria-hidden="true" style={{ width: 42, height: 42, borderRadius: "var(--radius)", background: "var(--primary-dim)", border: "1px solid var(--primary)", display: "grid", placeItems: "center", color: "var(--primary)" }}>
                <IconChip kind="network" size={24} />
              </div>
              <div>
                <div style={{ color: "var(--text-muted)", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>Inner Animal Media</div>
                <div style={{ color: "var(--text-strong)", fontSize: 17, fontWeight: 700 }}>Provider Guide System</div>
              </div>
            </div>
            <ProviderNav activeKey={activeKey} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 0.42fr)", gap: 18, alignItems: "stretch" }}>
            <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius)", background: "var(--bg-surface)", padding: 22 }}>
              <Pill tone="info">{guide.eyebrow}</Pill>
              <h1 style={{ margin: "16px 0 10px", color: "var(--text-strong)", fontSize: "clamp(34px, 5vw, 64px)", lineHeight: 0.98, letterSpacing: "-0.06em" }}>{guide.title}</h1>
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 18, lineHeight: 1.6, maxWidth: 820 }}>{guide.role}</p>
            </div>

            <Card style={{ background: "var(--bg-card)", display: "grid", alignContent: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, color: "var(--primary)" }}>
                <IconChip kind="route" size={20} />
                <strong style={{ color: "var(--text-strong)" }}>Route identity</strong>
              </div>
              <code style={{ display: "block", color: "var(--text-primary)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 13, overflowWrap: "anywhere", marginBottom: 12 }}>{guide.route}</code>
              <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.55 }}>{guide.summary}</p>
            </Card>
          </div>
        </header>

        <TodoCallout guide={guide} todos={todos} loading={todoLoading} error={todoError} onRetry={loadTodos} />

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(330px, 0.42fr)", gap: 18, marginTop: 18 }}>
          <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
            <Card>
              <SectionTitle icon="layers" title="Provider capabilities" description="What this provider is allowed to be good at inside Agent Sam." />
              <CapabilityGrid capabilities={guide.capabilities} />
            </Card>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
              <Card>
                <SectionTitle icon="check" title="Use this provider for" />
                <ListBlock items={guide.bestFor} icon="chevron" />
              </Card>
              <Card>
                <SectionTitle icon="x" title="Do not use it for" />
                <ListBlock items={guide.avoidFor} icon="chevron" />
              </Card>
            </div>

            <Card>
              <SectionTitle icon="route" title="Agent Sam routes" description="Reference-only route map. This component does not create routes or endpoints." />
              <RouteList routes={guide.agentSamRoutes} />
            </Card>

            <Card>
              <SectionTitle icon="database" title="D1 tables and schema notes" description="Existing rows are safe to read. Proposed rows are documentation only and are not created by this component." />
              <TableList rows={guide.d1Tables} />
            </Card>
          </div>

          <aside style={{ display: "grid", gap: 18, alignContent: "start", minWidth: 0 }}>
            <Card>
              <SectionTitle icon="network" title="MCP strategy" />
              <ListBlock items={guide.mcpStrategy} icon="chevron" />
            </Card>
            <Card>
              <SectionTitle icon="bot" title="Cost strategy" />
              <ListBlock items={guide.costStrategy} icon="chevron" />
            </Card>
            <Card>
              <SectionTitle icon="search" title="Caching and compaction" />
              <ListBlock items={guide.cachingStrategy} icon="chevron" />
            </Card>
            <Card>
              <SectionTitle icon="book" title="Eval strategy" />
              <ListBlock items={guide.evalStrategy} icon="chevron" />
            </Card>
            <Card>
              <SectionTitle icon="shield" title="Security rules" />
              <ListBlock items={guide.securityRules} icon="chevron" />
            </Card>
            <Card style={{ background: "var(--bg-elevated)" }}>
              <SectionTitle icon="code" title="Implementation boundary" />
              <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.6 }}>This file is a reference guide component only. It reads live security todos and renders provider guidance. Schema migrations, roadmap tasks, route registration, and endpoint creation belong outside this TSX file.</p>
            </Card>
            <Card style={{ background: "var(--bg-elevated)" }}>
              <SectionTitle icon="cloud" title="Cloudflare clarification" />
              <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.6 }}>Workers AI is not the preferred chat or reasoning provider. It is limited to embeddings, speech-to-text, image classification, and last-resort fallback. Primary inference routes should use keyed providers.</p>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}
