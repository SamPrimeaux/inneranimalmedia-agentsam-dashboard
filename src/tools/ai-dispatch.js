import { handlers as fsHandlers } from './fs.js';
import { handlers as dbHandlers } from './db.js';
import { handlers as termHandlers } from './terminal.js';

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
        case 'list_dir': return await fsHandlers.list_dir(params, env);
        case 'read_file': return await fsHandlers.read_file(params, env);
        case 'write_file': return await fsHandlers.write_file(params, env);

        // ── Database ─────────────────────────────────────────────────────────
        case 'd1_query': return await dbHandlers.d1_query(params, env);
        case 'd1_batch_write': return await dbHandlers.d1_batch_write(params, env);

        // ── Terminal ─────────────────────────────────────────────────────────
        case 'run_command': return await termHandlers.run_command(params, env);

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
