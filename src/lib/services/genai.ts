import { GoogleGenAI, createPartFromUri } from "@google/genai";
import type { ChatMessage, StreamOptions, FileAttachment, GroundingMetadata } from "../models/types";

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

export interface UploadedFile {
  uri: string;
  mimeType: string;
  name: string;
}

export async function uploadFile(
  apiKey: string, 
  file: File,
  onProgress?: (progress: number) => void
): Promise<UploadedFile> {
  const ai = getClient(apiKey);
  
  // Upload the file
  const uploadedFile = await ai.files.upload({
    file: file,
    config: {
      displayName: file.name,
    },
  });

  // Wait for the file to be processed
  let getFile = await ai.files.get({ name: uploadedFile.name as string });
  let attempts = 0;
  const maxAttempts = 30; // Max 30 seconds wait
  
  while (getFile.state === 'PROCESSING' && attempts < maxAttempts) {
    attempts++;
    if (onProgress) {
      onProgress(Math.min(90, attempts * 3)); // Progress up to 90%
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    getFile = await ai.files.get({ name: uploadedFile.name as string });
  }

  if (getFile.state === 'FAILED') {
    throw new Error('File processing failed');
  }

  if (onProgress) {
    onProgress(100);
  }

  return {
    uri: getFile.uri as string,
    mimeType: getFile.mimeType as string,
    name: file.name,
  };
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
  return messages.map((m) => {
    const parts: any[] = [];
    
    // Add file attachments first if present
    if (m.attachments && m.attachments.length > 0) {
      for (const attachment of m.attachments) {
        if (attachment.uri) {
          parts.push(createPartFromUri(attachment.uri, attachment.mimeType));
        }
      }
    }
    
    // Add text content
    if (m.content) {
      parts.push({ text: m.content });
    }
    
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts,
    };
  });
}

export async function streamGenerate({
  model,
  messages,
  signal,
  onText,
  onGroundingMetadata,
  apiKey,
  systemInstruction,
  useSearchGrounding,
}: StreamOptions & { apiKey: string }): Promise<void> {
  const contents = messagesToContents(messages);
  
  // Build tools array if search grounding is enabled
  const tools: any[] = [];
  if (useSearchGrounding) {
    tools.push({ googleSearch: {} });
  }
  
  // Use the official streaming API and extract text from each chunk
  const generateStream: any = (getClient(apiKey).models as any).generateContentStream;
  const result = await generateStream({
    model,
    contents,
    // Per official examples, pass abort via config.abortSignal
    config: { 
      abortSignal: signal,
      systemInstruction: systemInstruction,
      ...(tools.length > 0 ? { tools } : {}),
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
      
      // Check for grounding metadata
      const groundingMetadata = (chunk as any)?.candidates?.[0]?.groundingMetadata;
      if (groundingMetadata && onGroundingMetadata) {
        const sources: { uri: string; title: string }[] = [];
        
        // Extract grounding chunks/sources
        if (groundingMetadata.groundingChunks) {
          for (const grounding of groundingMetadata.groundingChunks) {
            if (grounding.web) {
              sources.push({
                uri: grounding.web.uri || '',
                title: grounding.web.title || grounding.web.uri || 'Source',
              });
            }
          }
        }
        
        // Also check searchEntryPoint for Google Search results
        if (groundingMetadata.searchEntryPoint?.renderedContent) {
          // This contains the rendered search widget HTML
        }
        
        if (sources.length > 0) {
          onGroundingMetadata({ sources });
        }
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


