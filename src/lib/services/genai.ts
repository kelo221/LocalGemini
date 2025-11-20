import { GoogleGenAI } from "@google/genai";
import type { ChatMessage, StreamOptions } from "../models/types";

let client: GoogleGenAI | null = null;
let currentApiKey: string | null = null;

export function getClient(apiKey: string): GoogleGenAI {
  // Re-create client if API key changed
  if (!client || currentApiKey !== apiKey) {
    client = new GoogleGenAI({ apiKey });
    currentApiKey = apiKey;
  }
  return client;
}

export async function validateApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const testClient = new GoogleGenAI({ apiKey });
    // Try to list models as a validation test
    const iterable = await testClient.models.list({ config: { pageSize: 1 } } as any);
    // Try to get at least one model
    for await (const model of iterable as any) {
      // If we can iterate, the key is valid
      return { valid: true };
    }
    return { valid: true };
  } catch (e: any) {
    console.error("API key validation error:", e);
    const errorMessage = e?.message || "Unknown error";
    if (errorMessage.includes("401") || errorMessage.includes("403") || errorMessage.includes("API key")) {
      return { valid: false, error: "Invalid API key. Please check your key and try again." };
    }
    return { valid: false, error: `Failed to validate API key: ${errorMessage}` };
  }
}

function messagesToContents(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

export async function streamGenerate({
  model,
  messages,
  signal,
  onText,
  apiKey,
  systemInstruction,
}: StreamOptions & { apiKey: string }): Promise<void> {
  const contents = messagesToContents(messages);
  // Use the official streaming API and extract text from each chunk
  const generateStream: any = (getClient(apiKey).models as any).generateContentStream;
  const result = await generateStream({
    model,
    contents,
    // Per official examples, pass abort via config.abortSignal
    config: { 
      abortSignal: signal,
      systemInstruction: systemInstruction,
    },
  });
  const stream: AsyncIterable<any> = (result as any).stream ?? (result as any);

  for await (const chunk of stream) {
    if (signal?.aborted) break;
    try {
      // Official examples expose chunk.text (string) and chunk.data (binary)
      const text =
        (typeof (chunk as any).text === "string" ? (chunk as any).text : undefined) ??
        // Fallback: attempt to read the first candidate text
        (chunk as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).join("") ??
        undefined;
      if (text) {
        onText(text);
      }
    } catch (error) {
      console.warn("Error processing chunk:", error);
      // Ignore malformed chunks and continue streaming
    }
  }
}

export async function listModels(apiKey: string, pageSize = 50): Promise<string[]> {
  const iterable = await getClient(apiKey).models.list({ config: { pageSize } } as any);
  const names: string[] = [];
  for await (const model of iterable as any) {
    const name = model?.name as string | undefined;
    if (name) names.push(name);
  }
  // Prefer Gemini models by default ordering
  names.sort((a, b) => a.localeCompare(b));
  return names;
}


