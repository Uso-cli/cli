import type { LlmAdapter } from "./llm-types";
import { OllamaAdapter } from "./ollama-adapter";
import { GeminiAdapter } from "./gemini-adapter";
import { OpenAIAdapter } from "./openai-adapter";
import { GitHubModelsAdapter } from "./github-adapter";
import type { AgentConfig } from "./agent-config";

/**
 * LLM Router — Intelligent adapter selection.
 *
 * Priority order:
 *   1. Explicit override (user passed --model flag)
 *   2. Ollama (local, fast, free) — if running
 *   3. GitHub Models — if token present
 *   4. Gemini — if API key present
 *   5. OpenAI — if API key present
 *   6. Fail with clear instructions
 *
 * The router probes each adapter's availability before selecting.
 * This means a developer with zero API keys but Ollama installed
 * gets a fully working agent out of the box.
 */
export class LlmRouter {
  private adapters: LlmAdapter[] = [];
  private selected: LlmAdapter | null = null;

  constructor(private config: AgentConfig) {}

  /**
   * Build all adapters from config and probe for availability.
   * Returns the selected adapter, or throws if none are available.
   */
  async resolve(forceProvider?: string): Promise<LlmAdapter> {
    this.adapters = this.buildAdapters();

    // If user forced a specific provider, try it first
    if (forceProvider) {
      const forced = this.adapters.find(
        (a) =>
          a.provider === forceProvider ||
          a.name.toLowerCase().includes(forceProvider.toLowerCase()),
      );
      if (forced) {
        const isAvailable = await forced.available();
        if (isAvailable) {
          this.selected = forced;
          return forced;
        }
        throw new Error(
          `Requested provider "${forceProvider}" is not available. ` +
            `Check that the server is running or API key is configured.`,
        );
      }
    }

    // Probe in priority order
    for (const adapter of this.adapters) {
      try {
        const isAvailable = await adapter.available();
        if (isAvailable) {
          this.selected = adapter;
          return adapter;
        }
      } catch {
        // Skip unavailable adapters silently
      }
    }

    throw new Error(
      "No LLM provider available.\n\n" +
        "The USO Agent needs at least one LLM to reason.\n" +
        "Options (pick any):\n\n" +
        "  1. Install Ollama (free, local, recommended):\n" +
        "     https://ollama.com → then run: ollama pull llama3.1:8b\n\n" +
        "  2. Set a GitHub Models token:\n" +
        "     uso agent-config --github-token <your-pat>\n\n" +
        "  3. Set a Gemini API key:\n" +
        "     uso agent-config --gemini-key <your-key>\n\n" +
        "  4. Set an OpenAI API key:\n" +
        "     uso agent-config --openai-key <your-key>\n",
    );
  }

  /**
   * Get the currently selected adapter (after resolve())
   */
  getSelected(): LlmAdapter | null {
    return this.selected;
  }

  /**
   * Get a summary of all adapter statuses (for diagnostics)
   */
  async diagnose(): Promise<Array<{ name: string; provider: string; available: boolean }>> {
    const adapters = this.buildAdapters();
    const results: Array<{ name: string; provider: string; available: boolean }> = [];

    for (const adapter of adapters) {
      let available = false;
      try {
        available = await adapter.available();
      } catch {
        // unavailable
      }
      results.push({
        name: adapter.name,
        provider: adapter.provider,
        available,
      });
    }

    return results;
  }

  /**
   * Build adapter instances from config in priority order
   */
  private buildAdapters(): LlmAdapter[] {
    const adapters: LlmAdapter[] = [];

    // 1. Ollama (always attempt — it's free and local)
    adapters.push(
      new OllamaAdapter({
        baseUrl: this.config.ollama?.baseUrl,
        model: this.config.ollama?.model,
      }),
    );

    // 2. GitHub Models
    if (this.config.github?.token) {
      adapters.push(
        new GitHubModelsAdapter({
          token: this.config.github.token,
          model: this.config.github.model,
          baseUrl: this.config.github.baseUrl,
        }),
      );
    }

    // 3. Gemini
    if (this.config.gemini?.apiKey) {
      adapters.push(
        new GeminiAdapter({
          apiKey: this.config.gemini.apiKey,
          model: this.config.gemini.model,
        }),
      );
    }

    // 4. OpenAI
    if (this.config.openai?.apiKey) {
      adapters.push(
        new OpenAIAdapter({
          apiKey: this.config.openai.apiKey,
          model: this.config.openai.model,
          baseUrl: this.config.openai.baseUrl,
        }),
      );
    }

    return adapters;
  }
}
