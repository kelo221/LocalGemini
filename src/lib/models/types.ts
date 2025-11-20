export type Role = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
}

export interface ChatState {
  messages: ChatMessage[];
  model: string;
  isGenerating: boolean;
  error?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatHistoryState {
  sessions: ChatSession[];
  currentSessionId: string | null;
}

export type ModelName = 'models/gemini-flash-latest' | (string & {});

export interface StreamOptions {
  model: ModelName;
  messages: ChatMessage[];
  systemInstruction?: string;
  signal?: AbortSignal;
  onText: (delta: string) => void;
}


