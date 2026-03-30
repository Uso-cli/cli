---
name: uso-cli-command-development
description: Add or update USO CLI commands safely, including argument parsing, platform dispatch, and user-facing output behavior.
---

# USO CLI Command Development

Use this skill when creating or modifying commands in the USO CLI.

## When To Use

- Adding a new command in src/commands
- Updating command flags and behavior
- Wiring command flow to platform adapters in src/platforms
- Improving CLI logs and error messages

## Repository Context

- Command handlers live in src/commands
- OS-specific implementations live in src/platforms
- Shared helper utilities live in src/utils
- Entry point wiring lives in bin/index.js

## Workflow

1. Find the command entry and map all call paths.
2. Confirm cross-platform behavior for Windows, macOS, Linux, and WSL.
3. Keep command output consistent with existing logger style.
4. Prefer additive changes over breaking behavior.
5. Validate with focused command runs.

## Guardrails

- Preserve existing command names and expected flags unless explicitly asked.
- Keep user-facing wording clear and action-oriented.
- If privilege elevation is needed, ensure fallback and retry paths are explicit.
- Avoid hidden side effects outside the command scope.

## Validation Checklist

- Command runs with expected args and invalid args.
- Error handling includes actionable remediation.
- Platform-specific branches are covered.
- No regressions in neighboring command modules.
