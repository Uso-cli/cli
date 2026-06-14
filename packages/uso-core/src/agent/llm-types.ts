// ─── Chat Message Protocol ────────────────────────────────────────
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  name?: string;
}

// ─── Tool Call (function calling) ──────────────────────────────────
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// ─── Tool Definition (sent to the LLM) ────────────────────────────
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
  };
}

export interface ToolParameterSchema {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  items?: ToolParameterSchema;
  default?: unknown;
}

// ─── LLM Options ──────────────────────────────────────────────────
export interface LlmOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  responseFormat?: "text" | "json";
  stop?: string[];
}

// ─── LLM Response ─────────────────────────────────────────────────
export interface LlmResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: "stop" | "tool_calls" | "length" | "error";
  model?: string;
  latencyMs?: number;
}

// ─── The Universal Adapter Interface ──────────────────────────────
// Every LLM provider implements this. The brain calls this interface
// and never touches HTTP directly.
export interface LlmAdapter {
  /** Human-readable name (e.g., "Ollama (llama3.1:8b)") */
  readonly name: string;

  /** Provider identifier */
  readonly provider: "ollama" | "gemini" | "openai" | "github";

  /** Check if this adapter is available (API key set, server running, etc.) */
  available(): Promise<boolean>;

  /** Send a chat completion request */
  chat(messages: ChatMessage[], options?: LlmOptions): Promise<LlmResponse>;
}

// ─── Adapter Configuration ────────────────────────────────────────
export interface OllamaConfig {
  baseUrl: string;       // default: http://localhost:11434
  model: string;         // default: llama3.1:8b
}

export interface GeminiConfig {
  apiKey: string;
  model: string;         // default: gemini-2.0-flash
}

export interface OpenAIConfig {
  apiKey: string;
  model: string;         // default: gpt-4o-mini
  baseUrl?: string;      // allows custom endpoints
}

export interface GitHubModelsConfig {
  token: string;         // GitHub PAT with models scope
  model: string;         // default: openai/gpt-4o-mini
  baseUrl: string;       // https://models.github.ai/inference
}
