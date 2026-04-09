import { workspaceReadFile, workspaceListFiles, workspaceSearch } from './fs.js';
import { d1Query, d1BatchWrite } from './db.js';
import { terminalExecute } from './terminal.js';

// Builtin Imports
import { searchWeb, a11yAuditWebpage } from './builtin/web.js';
import { listWorkers, workerDeploy } from './builtin/deploy.js';
import { knowledgeSearch, humanContextList, humanContextAdd } from './builtin/context.js';
import { telemetryLog, telemetryQuery } from './builtin/telemetry.js';
import { excalidrawExport, voxelSaveScene, generateImage } from './builtin/media.js';

/**
 * Universal Tool Dispatcher.
 * Routes model-requested tools to their modular implementations.
 */
export async function runBuiltinTool(env, toolName, params) {
    console.log(`[AI Dispatcher] Executing tool: ${toolName}`);

    switch (toolName) {
        // ── Filesystem ───────────────────────────────────────────────────────
        case 'workspace_read_file': return await workspaceReadFile(env, params);
        case 'workspace_list_files': return await workspaceListFiles(env, params);
        case 'workspace_search': return await workspaceSearch(env, params);

        // ── Database ─────────────────────────────────────────────────────────
        case 'd1_query': return await d1Query(env, params);
        case 'd1_batch_write': return await d1BatchWrite(env, params);

        // ── Terminal ─────────────────────────────────────────────────────────
        case 'terminal_execute': return await terminalExecute(env, params);

        // ── Web ──────────────────────────────────────────────────────────────
        case 'web_search': return await searchWeb(env, params);
        case 'a11y_audit_webpage': return await a11yAuditWebpage(env, params);

        // ── Deployment ───────────────────────────────────────────────────────
        case 'worker_deploy': return await workerDeploy(env, params);
        case 'list_workers': return await listWorkers(env);

        // ── Context & Knowledge ──────────────────────────────────────────────
        case 'knowledge_search': return await knowledgeSearch(env, params);
        case 'human_context_list': return await humanContextList(env, params);
        case 'human_context_add': return await humanContextAdd(env, params);

        // ── Telemetry ────────────────────────────────────────────────────────
        case 'telemetry_log': return await telemetryLog(env, params);
        case 'telemetry_query': return await telemetryQuery(env, params);

        // ── Media & Canvas ───────────────────────────────────────────────────
        case 'excalidraw_export': return await excalidrawExport(env, params);
        case 'voxel_save_scene': return await voxelSaveScene(env, params);
        case 'generate_image': return await generateImage(env, params);

        default:
            return { error: `Tool implementation for '${toolName}' not found in modular dispatcher.` };
    }
}
