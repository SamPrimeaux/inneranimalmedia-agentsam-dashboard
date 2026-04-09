import { jsonResponse } from '../../core/responses.js';

/**
 * Media & Canvas Tools (Builtin).
 * Handles Excalidraw, Voxel Engine, and Image generation.
 */

/**
 * Export an Excalidraw scene as SVG or PNG.
 */
export async function excalidrawExport(env, { project_id, format = 'svg' }) {
    if (!project_id) return { error: 'project_id required' };
    
    // Bridges to the modular Canvas integration (/api/draw)
    try {
        const response = await fetch(`${env.DASHBOARD_API_URL}/api/draw/export?project_id=${project_id}&format=${format}`, {
            headers: { 'Authorization': `Bearer ${env.DASHBOARD_SECRET}` }
        });
        const data = await response.json();
        return { 
            export_url: data.url, 
            r2_key: data.r2_key,
            format 
        };
    } catch (e) {
        return { error: 'Excalidraw export failed', detail: e.message };
    }
}

/**
 * Save a Voxel scene.
 */
export async function voxelSaveScene(env, { project_id, scene_data }) {
    if (!project_id || !scene_data) return { error: 'project_id and scene_data required' };

    try {
        const response = await fetch(`${env.DASHBOARD_API_URL}/api/draw/save`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${env.DASHBOARD_SECRET}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ projectId: project_id, scene: scene_data, type: 'voxel' })
        });
        const data = await response.json();
        return { success: data.ok, r2_key: data.r2_key };
    } catch (e) {
        return { error: 'Voxel save failed', detail: e.message };
    }
}

/**
 * Generate an image via AI.
 */
export async function generateImage(env, { prompt, model = 'dall-e-3' }) {
    if (!prompt) return { error: 'prompt required' };

    try {
        // Logic bridges to the modular OpenAI or Workers AI integration
        const response = await fetch(`${env.DASHBOARD_API_URL}/api/images/generate`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${env.DASHBOARD_SECRET}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompt, model })
        });
        const data = await response.json();
        return { image_url: data.url };
    } catch (e) {
        return { error: 'Image generation failed', detail: e.message };
    }
}
