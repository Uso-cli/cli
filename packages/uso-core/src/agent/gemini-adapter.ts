import type {
  LlmAdapter,
  LlmOptions,
  LlmResponse,
  ChatMessage,
  GeminiConfig,
  ToolCall,
  ToolDefinition,
} from "./llm-types";

const DEFAULT_GEMINI_CONFIG: Omit<GeminiConfig, "apiKey"> = {
  model: "gemini-2.0-flash",
};

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Gemini Adapter — Google's Gemini API for deep reasoning with massive
 * context windows. Ideal for parsing large Anchor IDL files and
 * multi-file codebase analysis.
 */
export class GeminiAdapter implements LlmAdapter {
  readonly provider = "gemini" as const;
  private config: GeminiConfig;

  get name(): string {
    return `Gemini (${this.config.model})`;
  }

  constructor(config: { apiKey: string } & Partial<Omit<GeminiConfig, "apiKey">>) {
    this.config = { ...DEFAULT_GEMINI_CONFIG, ...config };
  }

  async available(): Promise<boolean> {
    if (!this.config.apiKey) return false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const url = `${GEMINI_API_BASE}/models/${this.config.model}?key=${this.config.apiKey}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      return res.ok;
    } catch {
      return false;
    }
  }

  async chat(
    messages: ChatMessage[],
    options?: LlmOptions,
  ): Promise<LlmResponse> {
    const startMs = Date.now();

    // Convert to Gemini format
    const systemInstruction = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n");

    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.1,
        maxOutputTokens: options?.maxTokens ?? 8192,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    // Add tool declarations if provided
    if (options?.tools && options.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: options.tools.map((t) =>
            this.toGeminiFunctionDecl(t),
          ),
        },
      ];
    }

    if (options?.responseFormat === "json") {
      (body.generationConfig as Record<string, unknown>).responseMimeType =
        "application/json";
    }

    const url = `${GEMINI_API_BASE}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as GeminiResponse;
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    // Extract text content
    const textContent = parts
      .filter((p): p is { text: string } => "text" in p)
      .map((p) => p.text)
      .join("");

    // Extract function calls
    const toolCalls: ToolCall[] = parts
      .filter(
        (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
          "functionCall" in p,
      )
      .map((p, i) => ({
        id: `gemini_call_${Date.now()}_${i}`,
        name: p.functionCall.name,
        arguments: p.functionCall.args ?? {},
      }));

    const usage = data.usageMetadata;

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: usage
        ? {
            promptTokens: usage.promptTokenCount ?? 0,
            completionTokens: usage.candidatesTokenCount ?? 0,
            totalTokens: usage.totalTokenCount ?? 0,
          }
        : undefined,
      finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
      model: this.config.model,
      latencyMs: Date.now() - startMs,
    };
  }

  private toGeminiFunctionDecl(tool: ToolDefinition): Record<string, unknown> {
    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: tool.parameters.properties,
        required: tool.parameters.required ?? [],
      },
    };
  }
}

// ─── Gemini response types ─────────────────────────────────────────
interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<
        | { text: string }
        | { functionCall: { name: string; args: Record<string, unknown> } }
      >;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}
