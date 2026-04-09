import { jsonResponse } from '../../core/responses.js';

/**
 * Web-related Tools (Builtin).
 * Handles search, browser operations, and accessibility audits.
 */

/**
 * Perform a web search.
 */
export async function searchWeb(env, { query }) {
    if (!query) return { error: 'query required' };

    // This typically bridges to a Search API (e.g., Tavily, Brave, Google) 
    // Logic ported from the monolithic worker's search_web handler.
    try {
        const apiKey = env.TAVILY_API_KEY || env.SEARCH_API_KEY;
        if (!apiKey) return { error: 'Search API key not configured' };

        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: apiKey,
                query,
                search_depth: 'advanced',
                max_results: 5
            })
        });

        const data = await response.json();
        return { results: data.results || [] };
    } catch (e) {
        return { error: 'Web search failed', detail: e.message };
    }
}

/**
 * Perform an accessibility audit on a webpage.
 */
export async function a11yAuditWebpage(env, { url }) {
    if (!url) return { error: 'url required' };

    // Logic bridges to the Playwright integration for browser-based auditing
    try {
        const response = await fetch(`${env.DASHBOARD_API_URL}/api/browser/a11y?url=${encodeURIComponent(url)}`, {
            headers: { 'Authorization': `Bearer ${env.DASHBOARD_SECRET}` }
        });
        const data = await response.json();
        return { audit: data.audit, summary: data.summary };
    } catch (e) {
        return { error: 'A11y audit failed', detail: e.message };
    }
}
