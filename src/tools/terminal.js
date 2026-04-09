import { jsonResponse } from '../core/responses.js';

/**
 * Terminal & Shell Tool Implementation (Modular).
 * Interfaces with the PTY / Terminal bridge for live command execution.
 */

/**
 * Execute a command in the workspace terminal.
 */
export async function terminalExecute(env, { command, cwd = '.' }) {
    if (!command) return { error: 'command required' };

    try {
        const response = await fetch(`${env.TERMINAL_API_URL}/terminal/execute`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${env.TERMINAL_SECRET}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ command, cwd })
        });
        
        const data = await response.json();
        return { 
            stdout: data.stdout || '', 
            stderr: data.stderr || '', 
            exit_code: data.exit_code 
        };
    } catch (e) {
        return { error: 'Terminal execution failed', detail: e.message };
    }
}
