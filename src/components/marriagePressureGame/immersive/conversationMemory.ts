import type { ChatBubble } from "./dialogueTypes";

export const CHAT_MEMORY_KEY = "marriage-pressure-conversations";
export interface ConversationMemory { nodeId: string | null; sent: ChatBubble[] }
export interface ConversationBook { key: string; chats: Record<string, ConversationMemory> }

export function restoreConversations(raw: string | null, key: string): ConversationBook {
  const empty = { key, chats: {} };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as ConversationBook;
    if (parsed.key !== key || !parsed.chats || typeof parsed.chats !== "object" || Array.isArray(parsed.chats)) return empty;
    for (const memory of Object.values(parsed.chats)) {
      if (!memory || (memory.nodeId !== null && typeof memory.nodeId !== "string") || !Array.isArray(memory.sent) || memory.sent.length > 100) return empty;
      if (memory.sent.some(line => !line || typeof line.id !== "string" || typeof line.text !== "string" || typeof line.mine !== "boolean" || typeof line.kind !== "string")) return empty;
    }
    return parsed;
  } catch { return empty; }
}
