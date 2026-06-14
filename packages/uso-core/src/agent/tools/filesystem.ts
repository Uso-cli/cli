import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { AgentTool, ToolResult } from "../tool-registry";
import type { AgentState } from "../state";

/**
 * read_file — Read a file's contents from the project.
 * Used by the agent to inspect Anchor.toml, Cargo.toml, IDL files,
 * source code, config files, etc.
 */
export const readFileTool: AgentTool = {
  name: "read_file",
  description:
    "Read the contents of a file from the project directory. " +
    "Use this to inspect Anchor.toml, Cargo.toml, source code, IDL files, etc.",

  definition: {
    name: "read_file",
    description: "Read a file's contents. Returns the text content.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Relative or absolute path to the file (e.g., 'Anchor.toml', 'programs/my_program/src/lib.rs').",
        },
        max_lines: {
          type: "number",
          description:
            "Maximum number of lines to return. Defaults to 200. Use to avoid flooding context.",
          default: 200,
        },
      },
      required: ["path"],
    },
  },

  async execute(
    params: Record<string, unknown>,
  ): Promise<ToolResult> {
    const filePath = String(params.path ?? "");
    const maxLines = Number(params.max_lines ?? 200);

    if (!filePath) {
      return { success: false, output: "", error: "No file path provided." };
    }

    const resolved = resolve(process.cwd(), filePath);

    // Security: don't allow reading outside project root or sensitive files
    if (
      resolved.includes("..") &&
      !resolved.startsWith(process.cwd())
    ) {
      return {
        success: false,
        output: "",
        error: "Cannot read files outside the project directory.",
      };
    }

    if (!existsSync(resolved)) {
      return {
        success: false,
        output: "",
        error: `File not found: ${filePath}`,
      };
    }

    try {
      const content = readFileSync(resolved, "utf8");
      const lines = content.split("\n");

      if (lines.length > maxLines) {
        const truncated = lines.slice(0, maxLines).join("\n");
        return {
          success: true,
          output: `${truncated}\n\n... [${lines.length - maxLines} more lines truncated]`,
          data: { totalLines: lines.length, truncated: true },
        };
      }

      return {
        success: true,
        output: content,
        data: { totalLines: lines.length, truncated: false },
      };
    } catch (e) {
      return {
        success: false,
        output: "",
        error: `Read error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/**
 * write_file — Write content to a file.
 * Used by the agent to patch configs, update Anchor.toml, etc.
 */
export const writeFileTool: AgentTool = {
  name: "write_file",
  description:
    "Write or overwrite content to a file in the project directory. " +
    "Use this to update configuration files, patch source code, etc.",

  definition: {
    name: "write_file",
    description: "Write content to a file (creates or overwrites).",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative or absolute path to the file.",
        },
        content: {
          type: "string",
          description: "The full content to write to the file.",
        },
      },
      required: ["path", "content"],
    },
  },

  async execute(
    params: Record<string, unknown>,
  ): Promise<ToolResult> {
    const filePath = String(params.path ?? "");
    const content = String(params.content ?? "");

    if (!filePath) {
      return { success: false, output: "", error: "No file path provided." };
    }

    const resolved = resolve(process.cwd(), filePath);

    try {
      writeFileSync(resolved, content, "utf8");
      return {
        success: true,
        output: `Successfully wrote ${content.length} bytes to ${filePath}`,
      };
    } catch (e) {
      return {
        success: false,
        output: "",
        error: `Write error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/**
 * list_directory — List files and directories.
 * Used by the agent to understand project structure.
 */
export const listDirectoryTool: AgentTool = {
  name: "list_directory",
  description:
    "List files and subdirectories in a directory. " +
    "Use this to understand the project structure before reading specific files.",

  definition: {
    name: "list_directory",
    description: "List contents of a directory.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Relative or absolute path to the directory. Defaults to '.' (project root).",
          default: ".",
        },
        recursive: {
          type: "boolean",
          description: "If true, list recursively (max depth 3). Defaults to false.",
          default: false,
        },
      },
    },
  },

  async execute(
    params: Record<string, unknown>,
  ): Promise<ToolResult> {
    const dirPath = String(params.path ?? ".");
    const recursive = Boolean(params.recursive ?? false);
    const resolved = resolve(process.cwd(), dirPath);

    if (!existsSync(resolved)) {
      return {
        success: false,
        output: "",
        error: `Directory not found: ${dirPath}`,
      };
    }

    try {
      const entries = listDir(resolved, recursive, 0, 3);
      return {
        success: true,
        output: entries.join("\n"),
        data: { count: entries.length },
      };
    } catch (e) {
      return {
        success: false,
        output: "",
        error: `List error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

function listDir(
  dir: string,
  recursive: boolean,
  depth: number,
  maxDepth: number,
): string[] {
  const entries: string[] = [];
  const indent = "  ".repeat(depth);

  try {
    const items = readdirSync(dir);

    for (const item of items) {
      // Skip noise
      if (
        item === "node_modules" ||
        item === ".git" ||
        item === "target" ||
        item === "test-ledger"
      ) {
        entries.push(`${indent}📁 ${item}/ (skipped)`);
        continue;
      }

      const fullPath = join(dir, item);

      try {
        const stats = statSync(fullPath);

        if (stats.isDirectory()) {
          entries.push(`${indent}📁 ${item}/`);
          if (recursive && depth < maxDepth) {
            entries.push(...listDir(fullPath, true, depth + 1, maxDepth));
          }
        } else {
          const size =
            stats.size > 1024
              ? `${(stats.size / 1024).toFixed(1)}KB`
              : `${stats.size}B`;
          entries.push(`${indent}📄 ${item} (${size})`);
        }
      } catch {
        entries.push(`${indent}⚠️  ${item} (unreadable)`);
      }
    }
  } catch {
    entries.push(`${indent}⚠️  Cannot read directory`);
  }

  return entries;
}
