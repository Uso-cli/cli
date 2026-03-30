# Skills Setup for This Sprint

This workspace is now prepared to use Copilot/VS Code skills from this directory.

## What was installed

- Catalog cloned at: `../awesome-agent-skills`
- Local skills folder: `.github/skills`

## Important note

`awesome-agent-skills` is a curated index, not a bundle of installable skills.
It points to skill repositories you can import into this folder.

## How to add a skill

1. Create a folder under `.github/skills/<skill-name>`
2. Add `SKILL.md` in that folder
3. Restart/reload Copilot chat if needed

## Suggested sprint starter skills

- `planning`
- `code-review`
- `test-fixing`
- `release-checklist`

## Installed local skills

- `uso-cli-command-development`
- `solana-anchor-development`
- `cross-platform-installer-hardening`
- `test-and-regression-guard`
- `sprint-task-breakdown`
- `solana-release-pipeline-and-prod-deploy-checks`
- `solana-release-runbook-generator`

## Minimal SKILL.md template

```md
---
name: sprint-planning
description: Helps break work into implementation-ready tasks for this repo.
---

# Sprint Planning Skill

Use this skill when asked to create or refine sprint work items.

1. Read current goals and constraints.
2. Produce small, testable tasks.
3. Include dependency order and risk notes.
```
