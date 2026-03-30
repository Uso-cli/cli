---
name: sprint-task-breakdown
description: Convert sprint goals into implementation-ready tasks for this repository with clear dependencies and validation steps.
---

# Sprint Task Breakdown

Use this skill when planning or refining sprint work.

## Inputs

- Sprint goal statement
- Constraints and deadlines
- Current repository state

## Output Contract

Produce tasks with:

- Scope statement
- Files likely affected
- Acceptance criteria
- Validation commands
- Dependency order
- Risks and rollback notes

## Task Sizing Rules

- Prefer tasks completable in one focused coding session.
- Split high-risk changes from low-risk refactors.
- Keep migration or tooling changes isolated from feature changes.

## Quality Gate

A task is ready only if:

- The expected behavior is unambiguous.
- Validation is explicit and executable.
- Dependencies are named.
- Completion can be reviewed objectively.
