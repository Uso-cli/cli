---
name: solana-anchor-development
description: Build and maintain Anchor-based Solana workflows in this repo, including build, test, deploy, wallet, and local validator alignment.
---

# Solana Anchor Development

Use this skill when working on Anchor and Solana workflow behavior in USO.

## When To Use

- Modifying build, test, or deploy command behavior
- Updating local validator assumptions and health checks
- Scaffolding Anchor project defaults
- Troubleshooting wallet and cluster setup flow

## Core Principles

- Keep localnet workflow fast and deterministic.
- Prefer explicit checks before invoking heavy commands.
- Make failures explain next steps.
- Keep command behavior stable across host platforms.

## Typical Flow

1. Verify environment prerequisites and tool availability.
2. Run build path and capture expected artifacts.
3. Run test path with local validator logic and skip behavior when needed.
4. Validate deploy path with cluster and keypair checks.
5. Confirm generated scaffold output still matches expected Anchor layout.

## Common Risk Areas

- Port conflicts with local validator.
- Mismatch between wallet keypair and configured cluster.
- PATH inconsistencies between native and WSL routing.
- Silent failures from shell command wrappers.

## Done Criteria

- Build, test, and deploy command paths are coherent.
- Wallet and validator checks are explicit.
- Error output includes exact recovery actions.
