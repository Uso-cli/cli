import { spawn } from "node:child_process";
import type { AttemptRecord, ExecutionTask, RuntimeRoute } from "../types";

export async function runTask(
  task: ExecutionTask,
  route: RuntimeRoute,
  attempt: number,
): Promise<AttemptRecord> {
  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    let shell = isWindows ? "cmd.exe" : "/bin/bash";
    let shellArgs = [isWindows ? "/c" : "-c", `${task.command} ${task.args.join(" ")}`];

    if (isWindows && route === "wsl") {
      shell = "wsl.exe";
      const envSetup = 'source $HOME/.cargo/env 2>/dev/null; export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.avm/bin:$PATH"';
      shellArgs = ["-d", "Ubuntu", "-e", "bash", "-c", `${envSetup} && ${task.command} ${task.args.join(" ")}`];
    }

    const child = spawn(shell, shellArgs, {
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d: { toString: () => string; }) => {
      stdout += d.toString();
    });

    child.stderr.on("data", (d: { toString: () => string; }) => {
      stderr += d.toString();
    });

    child.on("close", (code: number) => {
      const exitCode = code ?? 1;
      resolve({
        taskId: task.id,
        attempt,
        command: `${task.command} ${task.args.join(" ")}`,
        route,
        status: exitCode === 0 ? "success" : "failed",
        stdout,
        stderr,
        exitCode,
      });
    });
  });
}
