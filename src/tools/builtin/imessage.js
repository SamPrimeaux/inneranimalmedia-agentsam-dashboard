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
