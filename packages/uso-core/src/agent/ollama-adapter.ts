import type {
  LlmAdapter,
  LlmOptions,
  LlmResponse,
  ChatMessage,
  OllamaConfig,
  ToolCall,
} from "./llm-types";

const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  baseUrl: "http://localhost:11434",
  model: "llama3.1:8b",
};

/**
 * Ollama Adapter — Local LLM inference via Ollama HTTP API.
 * Zero dependencies, zero cost, zero latency to network.
 * Falls back gracefully if Ollama isn't running.
 */
export class OllamaAdapter implements LlmAdapter {
  readonly provider = "ollama" as const;
  private config: OllamaConfig;

  get name(): string {
    return `Ollama (${this.config.model})`;
  }

  constructor(config?: Partial<OllamaConfig>) {
    this.config = { ...DEFAULT_OLLAMA_CONFIG, ...config };
  }

  async available(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) return false;

      const data = (await res.json()) as { models?: Array<{ name: string }> };
      const models = data.models ?? [];

      // Check if requested model is pulled
      const modelBase = this.config.model.split(":")[0];
      return models.some(
        (m) => m.name === this.config.model || m.name.startsWith(modelBase),
      );
    } catch {
      return false;
    }
  }

  async chat(
    messages: ChatMessage[],
    options?: LlmOptions,
  ): Promise<LlmResponse> {
    const startMs = Date.now();

    const ollamaMessages = messages.map((m) => ({
      role: m.role === "tool" ? "assistant" : m.role,
      content: m.content,
    }));

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: ollamaMessages,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.1,
        num_predict: options?.maxTokens ?? 4096,
      },
    };

    if (options?.responseFormat === "json") {
      body.format = "json";
    }

    const res = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };

    const content = data.message?.content ?? "";
    const toolCalls = this.parseToolCalls(content);

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
      model: this.config.model,
      latencyMs: Date.now() - startMs,
    };
  }

  /**
   * Ollama doesn't natively support function calling for all models.
   * We parse structured JSON action blocks from the response text.
   * Format expected:
   * ```json
   * {"action": "tool_name", "params": {...}}
   * ```
   */
  private parseToolCalls(content: string): ToolCall[] {
    const calls: ToolCall[] = [];
    // Match JSON blocks with action field
    const jsonPattern = /\{[\s\S]*?"action"\s*:\s*"([^"]+)"[\s\S]*?\}/g;
    let match: RegExpExecArray | null;

    while ((match = jsonPattern.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[0]) as {
          action: string;
          params?: Record<string, unknown>;
        };
        if (parsed.action) {
          calls.push({
            id: `call_${Date.now()}_${calls.length}`,
            name: parsed.action,
            arguments: parsed.params ?? {},
          });
        }
      } catch {
        // Not valid JSON, skip
      }
    }

    return calls;
  }
}
