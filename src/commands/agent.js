const os = require("os");
const path = require("path");
const chalk = require("chalk");
const { log, spinner } = require("../utils/logger");

/**
 * `uso agent "<goal>"` — Run the AI Agent to accomplish a goal.
 *
 * This command handler:
 *   1. Loads agent config from ~/.uso-agent.json
 *   2. Resolves an LLM provider (Ollama → GitHub → Gemini → OpenAI)
 *   3. Runs the ReAct FSM loop
 *   4. Streams reasoning + actions to the terminal with styled output
 */
const agent = async (goalParts, options) => {
  // Commander passes args differently depending on definition
  const goalArray = Array.isArray(goalParts) ? goalParts : [goalParts];
  const goal = goalArray.filter(Boolean).join(" ").trim();

  if (!goal) {
    log.error("❌ No goal provided.");
    log.info('Usage: uso agent "Deploy my staking program to devnet"');
    log.info('       uso agent "Check my environment and fix any issues"');
    log.info('       uso agent "Build and test my program"');
    return;
  }

  // Dynamic import of uso-core (ESM from CJS)
  let UsoAgent, loadAgentConfig;
  try {
    const core = require("../../packages/uso-core/dist/cjs/index.js");
    UsoAgent = core.UsoAgent;
    loadAgentConfig = core.loadAgentConfig;
  } catch (err) {
    log.error("❌ uso-core agent module not found.");
    log.warn(
      "Run 'cd packages/uso-core && npm run build' to compile the agent.",
    );
    log.warn(`Detail: ${err.message}`);
    return;
  }

  const config = loadAgentConfig();

  // Override config from CLI flags
  if (options.model) {
    // Try to infer provider from model name
    if (options.model.includes("/")) {
      // GitHub Models format: "openai/gpt-4o-mini"
      config.github = { ...config.github, model: options.model };
    } else if (options.model.startsWith("gemini")) {
      config.gemini = { ...config.gemini, model: options.model };
    } else if (
      options.model.startsWith("gpt") ||
      options.model.startsWith("o1") ||
      options.model.startsWith("o3")
    ) {
      config.openai = { ...config.openai, model: options.model };
    } else {
      config.ollama = { ...config.ollama, model: options.model };
    }
  }

  const maxLoops = parseInt(options.maxLoops || "3", 10);

  // ─── Banner ────────────────────────────────────────────────
  console.log();
  console.log(
    chalk.bold.cyan("  ┌─────────────────────────────────────────┐"),
  );
  console.log(
    chalk.bold.cyan("  │") +
      chalk.bold.white("         USO Agent v1.0              ") +
      chalk.bold.cyan("│"),
  );
  console.log(
    chalk.bold.cyan("  │") +
      chalk.dim("   Autonomous Solana DevOps Engine    ") +
      chalk.bold.cyan("│"),
  );
  console.log(
    chalk.bold.cyan("  └─────────────────────────────────────────┘"),
  );
  console.log();
  console.log(chalk.dim("  Goal: ") + chalk.white.bold(goal));
  console.log(chalk.dim("  Max iterations: ") + chalk.yellow(maxLoops));
  console.log();

  // ─── FSM Callbacks (render to terminal) ────────────────────
  const callbacks = {
    onPhaseChange: (phase, state) => {
      const phases = {
        planning: "🧠 Planning",
        executing: "⚡ Executing",
        validating: "✅ Validating",
        healing: "🔧 Self-Healing",
      };
      if (phases[phase]) {
        console.log(chalk.dim(`  ── ${phases[phase]} ──`));
      }
    },

    onThought: (thought, state) => {
      console.log(chalk.blue("  💭 ") + chalk.italic(thought));
    },

    onToolCall: (toolName, params, state) => {
      const paramStr = Object.keys(params).length > 0
        ? chalk.dim(` ${JSON.stringify(params).slice(0, 80)}`)
        : "";
      console.log(chalk.yellow("  🔧 ") + chalk.bold(toolName) + paramStr);
    },

    onObservation: (observation, success, state) => {
      const lines = observation.split("\n").slice(0, 10);
      const color = success ? chalk.green : chalk.red;
      const icon = success ? "  ✅ " : "  ❌ ";

      for (const line of lines) {
        if (line.trim()) {
          console.log(color(icon + line.trim().slice(0, 120)));
        }
      }
      if (observation.split("\n").length > 10) {
        console.log(chalk.dim("     ... (output truncated)"));
      }
    },

    onIteration: (iteration, maxIterations, state) => {
      console.log(
        chalk.dim(`\n  ─── Iteration ${iteration}/${maxIterations} ───`),
      );
    },

    onComplete: (summary, state) => {
      console.log();
      console.log(chalk.green.bold("  ✅ GOAL ACCOMPLISHED"));
      console.log(chalk.green("  " + summary));
      console.log();
    },

    onFailed: (reason, state) => {
      console.log();
      console.log(chalk.red.bold("  ❌ GOAL FAILED"));
      console.log(chalk.red("  " + reason));
      console.log();
    },
  };

  // ─── Run Agent ─────────────────────────────────────────────
  const spin = spinner("Resolving LLM provider...").start();

  try {
    const usoAgent = new UsoAgent(config);

    // Resolve LLM first to show which provider is being used
    const llmDiag = await usoAgent.diagnoseLlm();
    const available = llmDiag.filter((d) => d.available);

    if (available.length === 0) {
      spin.fail("No LLM provider available.");
      console.log();
      log.error("The USO Agent needs at least one LLM to reason.");
      console.log();
      log.info("Options (pick any):");
      log.info("  1. Install Ollama (free, local): https://ollama.com");
      log.info("     Then run: ollama pull llama3.1:8b");
      log.info(
        "  2. uso agent-config --github-token <your-github-pat>",
      );
      log.info(
        "  3. uso agent-config --gemini-key <your-api-key>",
      );
      log.info(
        "  4. uso agent-config --openai-key <your-api-key>",
      );
      return;
    }

    spin.succeed(
      `LLM: ${chalk.bold(available[0].name)} ${chalk.dim(`(${available.length} provider${available.length > 1 ? "s" : ""} available)`)}`,
    );

    // Run the agent
    const result = await usoAgent.run({
      goal,
      provider: options.provider,
      maxIterations: maxLoops,
      verbose: !!options.verbose,
      callbacks,
    });

    // ─── Summary ───────────────────────────────────────────
    console.log(chalk.dim("  ─────────────────────────────────────────"));
    console.log(
      chalk.dim("  Provider: ") + chalk.white(result.llmProvider),
    );
    console.log(
      chalk.dim("  Iterations: ") +
        chalk.white(`${result.totalIterations}/${maxLoops}`),
    );
    console.log(
      chalk.dim("  Duration: ") +
        chalk.white(`${(result.durationMs / 1000).toFixed(1)}s`),
    );
    console.log(
      chalk.dim("  Status: ") +
        (result.success
          ? chalk.green.bold("SUCCESS")
          : chalk.red.bold("FAILED")),
    );
    console.log();

    process.exitCode = result.success ? 0 : 1;
  } catch (err) {
    spin.fail("Agent failed to start.");
    log.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
};

/**
 * `uso agent-config` — Configure API keys and preferences.
 */
const agentConfig = async (options) => {
  let setApiKey, loadAgentConfig, saveAgentConfig;
  try {
    const core = require("../../packages/uso-core/dist/cjs/index.js");
    setApiKey = core.setApiKey;
    loadAgentConfig = core.loadAgentConfig;
    saveAgentConfig = core.saveAgentConfig;
  } catch (err) {
    log.error("❌ uso-core agent module not found.");
    log.warn("Run 'cd packages/uso-core && npm run build' to compile.");
    return;
  }

  // Set API keys from flags
  if (options.geminiKey) {
    setApiKey("gemini", options.geminiKey);
    log.success("✅ Gemini API key saved.");
  }
  if (options.openaiKey) {
    setApiKey("openai", options.openaiKey);
    log.success("✅ OpenAI API key saved.");
  }
  if (options.githubToken) {
    setApiKey("github", options.githubToken);
    log.success("✅ GitHub Models token saved.");
  }
  if (options.removeKeys) {
    const config = loadAgentConfig();
    config.gemini = { ...config.gemini, apiKey: "" };
    config.openai = { ...config.openai, apiKey: "" };
    config.github = { ...config.github, token: "" };
    saveAgentConfig(config);
    log.success("✅ All API keys removed.");
  }

  // Show current config
  if (!options.geminiKey && !options.openaiKey && !options.githubToken && !options.removeKeys) {
    const config = loadAgentConfig();
    console.log();
    console.log(chalk.bold("USO Agent Configuration"));
    console.log(chalk.dim("Config file: ~/.uso-agent.json"));
    console.log();
    console.log(chalk.bold("LLM Providers:"));
    console.log(
      `  Ollama:    model=${chalk.cyan(config.ollama?.model || "llama3.1:8b")} url=${chalk.dim(config.ollama?.baseUrl || "http://localhost:11434")}`,
    );
    console.log(
      `  GitHub:    model=${chalk.cyan(config.github?.model || "openai/gpt-4o-mini")} token=${config.github?.token ? chalk.green("SET") : chalk.red("NOT SET")}`,
    );
    console.log(
      `  Gemini:    model=${chalk.cyan(config.gemini?.model || "gemini-2.0-flash")} key=${config.gemini?.apiKey ? chalk.green("SET") : chalk.red("NOT SET")}`,
    );
    console.log(
      `  OpenAI:    model=${chalk.cyan(config.openai?.model || "gpt-4o-mini")} key=${config.openai?.apiKey ? chalk.green("SET") : chalk.red("NOT SET")}`,
    );
    console.log();
    console.log(chalk.bold("Agent Settings:"));
    console.log(
      `  Max iterations: ${chalk.cyan(config.agent?.maxIterations || 3)}`,
    );
    console.log(
      `  Confirm destructive: ${chalk.cyan(config.agent?.confirmDestructive ?? true)}`,
    );
    console.log();
    console.log(chalk.dim("Set API keys:"));
    console.log(
      chalk.dim("  uso agent-config --gemini-key <key>"),
    );
    console.log(
      chalk.dim("  uso agent-config --openai-key <key>"),
    );
    console.log(
      chalk.dim("  uso agent-config --github-token <token>"),
    );
    console.log(
      chalk.dim("  uso agent-config --remove-keys"),
    );
    console.log();
  }
};

module.exports = { agent, agentConfig };
