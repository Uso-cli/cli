---
name: solana-release-pipeline-and-prod-deploy-checks
description: Advanced release gating and production deployment checks for Solana Anchor programs, including artifact integrity, cluster safety, signer controls, rollout strategy, and rollback readiness.
---

# Solana Release Pipeline And Production Deploy Checks

Use this skill for release candidates, mainnet or devnet deployment promotion, and high-risk changes to on-chain programs.

## When To Use

- Preparing a tagged release for Solana programs
- Promoting from localnet or devnet to production cluster
- Verifying deployment safety for Anchor program updates
- Running go or no-go checks before signing and deploying

## Release Stages

1. Source Freeze
2. Build And Artifact Integrity
3. Pre-Deploy Safety Gates
4. Controlled Deploy
5. Post-Deploy Verification
6. Rollback Or Incident Response

## Stage 1: Source Freeze

- Ensure branch is clean and changes are reviewed.
- Pin versions for Rust, Solana CLI, Anchor, and Node tooling.
- Record exact git commit hash for release provenance.
- Lock release notes with migration and operational impact.

## Stage 2: Build And Artifact Integrity

- Build in a reproducible environment.
- Capture binary size and hash of deployable artifacts.
- Ensure IDL and program binary were generated from the same commit.
- Verify declared program ID matches target deployment intent.

## Stage 3: Pre-Deploy Safety Gates

- Confirm target cluster URL and commitment settings.
- Validate deploy authority wallet path and signer identity.
- Confirm upgrade authority expectations and custody.
- Verify rent and fee payer funding sufficiency.
- Check RPC health and expected slot progress.
- Confirm no conflicting maintenance window or incident state.

## Stage 4: Controlled Deploy

- Use explicit cluster and keypair flags.
- Deploy during a controlled time window.
- Record deploy transaction signatures and slot numbers.
- Avoid concurrent unrelated infra changes during deployment.

## Stage 5: Post-Deploy Verification

- Verify program account exists and executable flag is true.
- Verify deployed program data hash matches expected artifact.
- Run smoke tests for critical instructions and account flows.
- Verify events or logs for expected initialization behavior.
- Confirm client compatibility with updated IDL and accounts.

## Stage 6: Rollback And Incident Response

- Predefine rollback owner and authority access path.
- Keep previous known-good artifact and metadata available.
- Define exact rollback trigger thresholds.
- Record incident timeline and communications channel.

## Production Go Or No-Go Checklist

Release is GO only if all pass:

- Reproducible build complete
- Artifact and IDL integrity verified
- Correct cluster and authority verified
- Funding and RPC health validated
- Smoke tests passed after deploy
- Rollback plan confirmed and reachable

Any failed gate is NO-GO.

## Suggested Command Pattern

Use this sequence as a guide and adapt for your environment.

1. Anchor build with pinned toolchain.
2. Verify program ID and artifact hash.
3. Validate deploy authority and cluster config.
4. Deploy with explicit flags.
5. Run smoke tests immediately.
6. Archive tx signatures, slot, and build metadata.

## Evidence To Archive Per Release

- Release tag and commit hash
- Toolchain versions
- Artifact hashes
- Program ID and cluster
- Deploy tx signatures and slots
- Smoke test results
- Final GO decision record
