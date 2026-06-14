import type {
  LlmAdapter,
  LlmOptions,
  LlmResponse,
  ChatMessage,
  OpenAIConfig,
  ToolCall,
  ToolDefinition,
} from "./llm-types";

const DEFAULT_OPENAI_CONFIG: Omit<OpenAIConfig, "apiKey"> = {
  model: "gpt-4o-mini",
  baseUrl: "https://api.openai.com/v1",
};

/**
 * OpenAI Adapter — For rapid code refactoring, structured JSON output,
 * and native function calling. Works with any OpenAI-compatible API.
 */
export class OpenAIAdapter implements LlmAdapter {
  readonly provider = "openai" as const;
  private config: OpenAIConfig;

  get name(): string {
    return `OpenAI (${this.config.model})`;
  }

  constructor(config: { apiKey: string } & Partial<Omit<OpenAIConfig, "apiKey">>) {
    this.config = { ...DEFAULT_OPENAI_CONFIG, ...config };
  }

  async available(): Promise<boolean> {
    if (!this.config.apiKey) return false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${this.config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        signal: controller.signal,
      });
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

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map((m) => {
        const msg: Record<string, unknown> = {
          role: m.role,
          content: m.content,
        };
        if (m.toolCallId) msg.tool_call_id = m.toolCallId;
        if (m.name) msg.name = m.name;
        return msg;
      }),
      temperature: options?.temperature ?? 0.1,
      max_tokens: options?.maxTokens ?? 4096,
    };

    // Add tools for function calling
    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools.map((t) => this.toOpenAITool(t));
      body.tool_choice = "auto";
    }

    if (options?.responseFormat === "json") {
      body.response_format = { type: "json_object" };
    }

    if (options?.stop) {
      body.stop = options.stop;
    }

    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as OpenAIChatResponse;
    const choice = data.choices?.[0];
    const message = choice?.message;

    // Extract tool calls
    const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: this.safeParseArgs(tc.function.arguments),
    }));

    return {
      content: message?.content ?? "",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
      finishReason:
        choice?.finish_reason === "tool_calls" ? "tool_calls" : "stop",
      model: data.model ?? this.config.model,
      latencyMs: Date.now() - startMs,
    };
  }

  private toOpenAITool(
    tool: ToolDefinition,
  ): Record<string, unknown> {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  }

  private safeParseArgs(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { _raw: raw };
    }
  }
}

// ─── OpenAI response types ─────────────────────────────────────────
interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      role: string;
      content?: string;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model?: string;
}
