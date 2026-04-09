/**
 * Integration: Anthropic
 * Handles tool-calling and streaming logic for Claude 3.5 Sonnet.
 */

export async function chatWithAnthropic({ messages, tools, env }) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing from environment');

  const systemPrompt = `You are Agent Sam, a high-performance coding assistant.
    Workspace: ${env.WORKSPACE_LABEL || 'Agent Sam Dashboard'}
    You have direct access to tools for filesystem access, terminal execution, and database queries.
    Use these tools surgically to fulfill user requests accurately.`;

  const apiBody = {
    model: 'claude-3-5-sonnet-20240620',
    max_tokens: 4096,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content
    })).filter(m => m.role !== 'system'),
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters
    })),
    stream: true
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(apiBody)
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Anthropic API Error: ${err.error?.message || response.statusText}`);
  }

  return response.body; // Streamed Body
}
