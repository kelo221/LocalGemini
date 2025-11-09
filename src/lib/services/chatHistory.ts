import type { ChatSession } from "../models/types";

const STORAGE_KEY = "gemini_chat_sessions";

export function generateTitle(firstMessage: string): string {
  const cleaned = firstMessage.trim();
  if (cleaned.length <= 50) {
    return cleaned;
  }
  return cleaned.substring(0, 50) + "...";
}

export function saveChatSession(session: ChatSession): void {
  try {
    const sessions = loadChatSessions();
    const index = sessions.findIndex((s) => s.id === session.id);
    
    if (index >= 0) {
      // Update existing session
      sessions[index] = session;
    } else {
      // Add new session
      sessions.push(session);
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (error) {
    console.error("Failed to save chat session:", error);
  }
}

export function loadChatSessions(): ChatSession[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      return [];
    }
    
    const sessions = JSON.parse(data) as ChatSession[];
    // Sort by updatedAt in descending order (most recent first)
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    console.error("Failed to load chat sessions:", error);
    return [];
  }
}

export function deleteChatSession(id: string): void {
  try {
    const sessions = loadChatSessions();
    const filtered = sessions.filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("Failed to delete chat session:", error);
  }
}

