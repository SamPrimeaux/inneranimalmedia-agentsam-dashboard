// src/tools/builtin/imessage.js
/**
 * Agent Sam Built-in Tool: iMessage
 * Orchestrates iMessage capabilities via the BlueBubbles implementation.
 */
import * as bb from "../../integrations/bluebubbles.js";

export const imessageTools = {
  /**
   * imessage.send: Sends a text message to a chat GUID.
   */
  "imessage.send": async ({ env }, args) => {
    if (!args.chatGuid || !args.text) {
      throw new Error("Missing chatGuid or text for imessage.send");
    }
    return bb.sendMessage(env, args);
  },

  /**
   * imessage.send_and_wait: Sends a message and registers a hook for a reply.
   */
  "imessage.send_and_wait": async ({ env, session }, args) => {
    const { chatGuid, text, conversationId } = args;
    if (!chatGuid || !text || !conversationId) {
      throw new Error("Missing chatGuid, text, or conversationId for imessage.send_and_wait");
    }

    // 1. Send the message
    const res = await bb.sendMessage(env, { chatGuid, text });

    // 2. Register the hook
    await env.DB.prepare(
      `INSERT INTO agentsam_hook (id, user_id, provider, external_id, trigger, target_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      session?.user_id || 'system',
      'imessage',
      chatGuid,
      'imessage_reply',
      conversationId,
      1
    ).run();

    return { 
      status: 'sent_and_hooked', 
      chatGuid, 
      conversationId,
      result: res
    };
  },

  /**
   * imessage.list_chats: Retrieves the list of recent chats.
   */
  "imessage.list_chats": async ({ env }) => {
    return bb.listChats(env);
  },

  /**
   * imessage.get_history: Retrieves message history for a chat GUID.
   */
  "imessage.get_history": async ({ env }, args) => {
    if (!args.chatGuid) {
      throw new Error("Missing chatGuid for imessage.get_history");
    }
    return bb.getMessages(env, args.chatGuid, args.limit || 25);
  },
};
