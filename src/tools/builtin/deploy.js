import { jsonResponse } from '../../core/responses.js';

/**
 * Deployment & DevOps Tools (Builtin).
 * Handles Cloudflare Worker management and CI/CD triggers.
 */

/**
 * List active Cloudflare Workers for the configured account.
 */
export async function listWorkers(env) {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = env.CLOUDFLARE_API_TOKEN;
    
    if (!accountId || !apiToken) return { error: 'Cloudflare credentials not configured' };

    try {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/services`, {
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        return { workers: data.result || [] };
    } catch (e) {
        return { error: 'Failed to list workers', detail: e.message };
    }
}

/**
 * Trigger a deployment for a workspace repository.
 */
export async function workerDeploy(env, { repo, branch = 'main' }) {
    if (!repo) return { error: 'repo required' };

    // This logic typically interfaces with the PTY to run 'wrangler deploy' 
    // or triggers a GitHub Action.
    try {
        // Modular bridge to the terminal execute tool
        const response = await fetch(`${env.TERMINAL_API_URL}/terminal/execute`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${env.TERMINAL_SECRET}`,
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ 
                command: `cd ${repo} && git checkout ${branch} && wrangler deploy`,
                cwd: '/workspace'
            })
        });
        const data = await response.json();
        return { 
            status: 'deployment_started', 
            job_id: data.id,
            stdout: data.stdout 
        };
    } catch (e) {
        return { error: 'Deployment failed', detail: e.message };
    }
}
