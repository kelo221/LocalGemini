import type { ChatMessage, ChatSession, ModelName } from "../models/types";
import { streamGenerate } from "../services/genai";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class ChatController {
  private messages: ChatMessage[] = [];
  private model: ModelName;
  private generating = false;
  private abortController: AbortController | null = null;
  private sessionId: string;
  private sessionTitle: string;

  constructor(model: ModelName = "gemini-2.5-flash") {
    this.model = model;
    this.sessionId = uid();
    this.sessionTitle = "New Chat";
  }

  getMessages(): ChatMessage[] {
    return this.messages;
  }

  isBusy(): boolean {
    return this.generating;
  }

  setModel(model: ModelName) {
    this.model = model;
  }

  clear(): void {
    if (this.generating) return;
    this.messages = [];
  }

  private async generateResponse(
    apiKey: string,
    systemInstruction: string | undefined,
    onChange: (messages: ChatMessage[], generating: boolean) => void
  ): Promise<void> {
    const assistantMsg: ChatMessage = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    };

    this.messages = [...this.messages, assistantMsg];
    this.generating = true;
    onChange(this.messages, this.generating);

    this.abortController = new AbortController();

    try {
      await streamGenerate({
        model: this.model,
        // Provide all messages up to but excluding the empty assistant placeholder
        messages: this.messages.slice(0, -1),
        systemInstruction,
        signal: this.abortController.signal,
        apiKey,
        onText: (delta) => {
          assistantMsg.content += delta;
          this.messages = this.messages.map((m) =>
            m.id === assistantMsg.id ? assistantMsg : m
          );
          onChange(this.messages, this.generating);
        },
      });
    } catch (err) {
      console.error("Generation failed:", err);
    } finally {
      this.generating = false;
      this.abortController = null;
      onChange(this.messages, this.generating);
    }
  }

  async send(
    userText: string,
    options: { apiKey: string; systemInstruction?: string },
    onChange: (messages: ChatMessage[], generating: boolean) => void
  ): Promise<void> {
    if (!userText.trim()) return;
    if (this.generating) return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: userText,
      createdAt: Date.now(),
    };

    this.messages = [...this.messages, userMsg];
    
    await this.generateResponse(options.apiKey, options.systemInstruction, onChange);
  }

  async editMessage(
    messageId: string,
    newContent: string,
    options: { apiKey: string; systemInstruction?: string },
    onChange: (messages: ChatMessage[], generating: boolean) => void
  ): Promise<void> {
    if (this.generating) return;

    const index = this.messages.findIndex((m) => m.id === messageId);
    if (index === -1) return;

    // Only allow editing user messages for now (or treat assistant edit as just a correction without regen? Plan says "edit their own messages")
    if (this.messages[index].role !== "user") return;

    // Update content
    this.messages[index].content = newContent;
    
    // Truncate all messages after this one
    this.messages = this.messages.slice(0, index + 1);
    
    // Regenerate response
    await this.generateResponse(options.apiKey, options.systemInstruction, onChange);
  }

  async regenerate(
    options: { apiKey: string; systemInstruction?: string },
    onChange: (messages: ChatMessage[], generating: boolean) => void
  ): Promise<void> {
    if (this.generating) return;
    if (this.messages.length === 0) return;

    // If last message is assistant, remove it
    const lastMsg = this.messages[this.messages.length - 1];
    if (lastMsg.role === "assistant") {
      this.messages = this.messages.slice(0, -1);
    }

    // Only regenerate if there is at least one message (user message) left
    if (this.messages.length > 0) {
      await this.generateResponse(options.apiKey, options.systemInstruction, onChange);
    }
  }

  stop(): void {
    if (this.abortController && !this.abortController.signal.aborted) {
      this.abortController.abort();
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getSessionTitle(): string {
    return this.sessionTitle;
  }

  setSessionTitle(title: string): void {
    this.sessionTitle = title;
  }

  exportSession(): ChatSession {
    return {
      id: this.sessionId,
      title: this.sessionTitle,
      messages: this.messages,
      model: this.model,
      createdAt: this.messages.length > 0 ? this.messages[0].createdAt : Date.now(),
      updatedAt: Date.now(),
    };
  }

  loadSession(session: ChatSession): void {
    if (this.generating) return;
    
    this.sessionId = session.id;
    this.sessionTitle = session.title;
    this.messages = session.messages;
    this.model = session.model;
  }

  createNewSession(): void {
    if (this.generating) return;
    
    this.sessionId = uid();
    this.sessionTitle = "New Chat";
    this.messages = [];
  }
}
