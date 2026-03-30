---
name: test-and-regression-guard
description: Keep changes safe with targeted testing, regression checks, and failure triage before and after edits.
---

# Test And Regression Guard

Use this skill for any non-trivial code change.

## Test Planning

1. Identify directly impacted commands and modules.
2. Select the smallest useful command-level and integration checks.
3. Run fast checks first, then broader checks if needed.

## Failure Triage

- Separate new failures from pre-existing failures.
- Prioritize behavior regressions over style-only issues.
- Reproduce consistently before attempting fixes.

## Regression Checklist

- CLI output compatibility for common flows
- Argument parsing and option passthrough
- Platform branch behavior
- Filesystem side effects
- Build and test lifecycle behavior

## Reporting Format

- What changed
- What was tested
- What passed
- What remains risky
