---
name: cross-platform-installer-hardening
description: Improve reliability of installation and setup across Windows, macOS, Linux, and WSL with resilient retries and diagnostics.
---

# Cross Platform Installer Hardening

Use this skill when changing install, init, doctor, verify, or uninstall behavior.

## When To Use

- Updating privilege or elevation logic
- Improving install reliability on Windows and WSL
- Adjusting environment detection and path setup
- Expanding diagnostics in doctor or verify

## Reliability Strategy

1. Detect environment accurately before action.
2. Perform preflight checks and fail early with guidance.
3. Execute idempotent install steps.
4. Retry only for known transient or privilege-related failures.
5. Emit clear final status with remediation.

## Hardening Rules

- Keep each install phase independently retryable.
- Record what succeeded before retrying next steps.
- Avoid destructive cleanup without explicit confirmation.
- Include platform-specific detail in errors.

## Verification Matrix

- Windows native path
- Windows with WSL route
- macOS native
- Linux native

## Output Quality

- Every failure message should answer what failed, why, and what to run next.
