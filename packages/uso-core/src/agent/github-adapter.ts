import type {
  LlmAdapter,
  LlmOptions,
  LlmResponse,
  ChatMessage,
  GitHubModelsConfig,
  ToolCall,
  ToolDefinition,
} from "./llm-types";

const DEFAULT_GITHUB_CONFIG: Omit<GitHubModelsConfig, "token"> = {
  model: "openai/gpt-4o-mini",
  baseUrl: "https://models.inference.ai.azure.com",
};

/**
 * GitHub Models Adapter — Access frontier models through GitHub's
 * models marketplace. Uses the OpenAI-compatible chat completions
 * endpoint under the hood.
 *
 * Requires a GitHub PAT with the `models` scope.
 * Browse available models: https://github.com/marketplace/models
 */
export class GitHubModelsAdapter implements LlmAdapter {
  readonly provider = "github" as const;
  private config: GitHubModelsConfig;

  get name(): string {
    return `GitHub Models (${this.config.model})`;
  }

  constructor(
    config: { token: string } & Partial<Omit<GitHubModelsConfig, "token">>,
  ) {
    this.config = { ...DEFAULT_GITHUB_CONFIG, ...config };
  }

  async available(): Promise<boolean> {
    if (!this.config.token) return false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      // GitHub Models uses an OpenAI-compatible endpoint
      // Just test auth by hitting the models list
      const res = await fetch(`${this.config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.config.token}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      // 200 = authenticated, 401 = bad token
      return res.ok || res.status === 200;
    } catch {
      // If the models endpoint doesn't exist, still try — the chat
      // endpoint is what matters. Assume available if token is set.
      return !!this.config.token;
    }
  }

  async chat(
    messages: ChatMessage[],
    options?: LlmOptions,
  ): Promise<LlmResponse> {
    const startMs = Date.now();

    // GitHub Models uses the OpenAI chat completions format
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
        Authorization: `Bearer ${this.config.token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub Models error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as GitHubModelsChatResponse;
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

// ─── GitHub Models response types (OpenAI-compatible) ──────────────
interface GitHubModelsChatResponse {
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
