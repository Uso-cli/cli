import { spawn } from "node:child_process";
import type { AgentTool, ToolResult } from "../tool-registry";
import type { AgentState } from "../state";
import type { ToolDefinition } from "../llm-types";

/**
 * run_terminal_command — Execute a shell command and capture output.
 * This is the agent's "hands" — how it interacts with the OS.
 */
export const runTerminalCommandTool: AgentTool = {
  name: "run_terminal_command",
  description:
    "Execute a shell command in the terminal and return stdout/stderr. " +
    "Use this for any CLI operation: checking versions, running builds, " +
    "deploying programs, managing wallets, etc.",

  definition: {
    name: "run_terminal_command",
    description:
      "Execute a shell command in the terminal and return stdout/stderr.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            "The full command to execute (e.g., 'solana balance', 'anchor build').",
        },
        cwd: {
          type: "string",
          description:
            "Working directory for the command. Defaults to the current project root.",
        },
        timeout_ms: {
          type: "number",
          description:
            "Timeout in milliseconds. Defaults to 60000 (60 seconds).",
          default: 60000,
        },
      },
      required: ["command"],
    },
  },

  async execute(
    params: Record<string, unknown>,
    state: AgentState,
  ): Promise<ToolResult> {
    const command = String(params.command ?? "");
    const cwd = String(params.cwd ?? process.cwd());
    const timeoutMs = Number(params.timeout_ms ?? 60000);

    if (!command) {
      return { success: false, output: "", error: "No command provided." };
    }

    return new Promise((resolve) => {
      const isWindows = state.environment.os === "windows";
      const shell = isWindows ? "cmd.exe" : "/bin/bash";
      const shellFlag = isWindows ? "/c" : "-c";

      const child = spawn(shell, [shellFlag, command], {
        cwd,
        env: process.env,
        timeout: timeoutMs,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (d: Buffer) => {
        stdout += d.toString();
      });

      child.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
      });

      child.on("error", (err) => {
        resolve({
          success: false,
          output: stdout,
          error: `Process error: ${err.message}`,
        });
      });

      child.on("close", (code: number | null) => {
        const exitCode = code ?? 1;
        // Cap output to prevent flooding the LLM context
        const cappedStdout =
          stdout.length > 3000
            ? stdout.slice(0, 1500) +
              "\n...[truncated]...\n" +
              stdout.slice(-1500)
            : stdout;
        const cappedStderr =
          stderr.length > 2000
            ? stderr.slice(0, 1000) +
              "\n...[truncated]...\n" +
              stderr.slice(-1000)
            : stderr;

        const output = cappedStdout + (cappedStderr ? `\nSTDERR:\n${cappedStderr}` : "");

        resolve({
          success: exitCode === 0,
          output,
          error: exitCode !== 0 ? `Exit code ${exitCode}` : undefined,
          data: { exitCode },
        });
      });
    });
  },
};
