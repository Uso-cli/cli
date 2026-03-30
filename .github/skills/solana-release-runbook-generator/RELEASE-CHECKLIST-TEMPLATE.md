# Solana Release Checklist - <release-tag>

## Release Metadata

- Release tag: <release-tag>
- Commit hash: <commit-hash>
- Program name: <program-name>
- Program ID: <program-id>
- Target cluster: <cluster>
- Deploy authority wallet: <wallet-path>
- Upgrade authority: <upgrade-authority>
- Deploy window UTC: <window>
- Rollback owner: <rollback-owner>
- Primary RPC: <primary-rpc>
- Fallback RPC: <fallback-rpc>

## Stage 1 Source Freeze

| Task                      | Owner   | Status | Evidence       |
| ------------------------- | ------- | ------ | -------------- |
| Branch clean and reviewed | <owner> | TODO   | <link-or-note> |
| Toolchain versions pinned | <owner> | TODO   | <link-or-note> |
| Release notes frozen      | <owner> | TODO   | <link-or-note> |

## Stage 2 Build And Artifact Integrity

| Task                                 | Owner   | Status | Evidence       |
| ------------------------------------ | ------- | ------ | -------------- |
| Reproducible build completed         | <owner> | TODO   | <link-or-note> |
| Binary hash captured                 | <owner> | TODO   | <link-or-note> |
| IDL and binary from same commit      | <owner> | TODO   | <link-or-note> |
| Program ID matches deployment intent | <owner> | TODO   | <link-or-note> |

## Stage 3 Pre-Deploy Safety Gates

| Task                                  | Owner   | Status | Evidence       |
| ------------------------------------- | ------- | ------ | -------------- |
| Cluster URL and commitment verified   | <owner> | TODO   | <link-or-note> |
| Deploy authority identity verified    | <owner> | TODO   | <link-or-note> |
| Upgrade authority custody verified    | <owner> | TODO   | <link-or-note> |
| Fee payer and rent funding verified   | <owner> | TODO   | <link-or-note> |
| RPC health and slot progress verified | <owner> | TODO   | <link-or-note> |
| Incident and maintenance window clear | <owner> | TODO   | <link-or-note> |

## Stage 4 Controlled Deploy

| Task                                    | Owner   | Status | Evidence       |
| --------------------------------------- | ------- | ------ | -------------- |
| Explicit cluster and keypair flags used | <owner> | TODO   | <link-or-note> |
| Deploy tx signatures and slots recorded | <owner> | TODO   | <link-or-note> |
| No concurrent infra changes             | <owner> | TODO   | <link-or-note> |

## Stage 5 Post-Deploy Verification

| Task                                    | Owner   | Status | Evidence       |
| --------------------------------------- | ------- | ------ | -------------- |
| Program account executable verified     | <owner> | TODO   | <link-or-note> |
| Deployed hash matches expected artifact | <owner> | TODO   | <link-or-note> |
| Critical instruction smoke tests passed | <owner> | TODO   | <link-or-note> |
| Event and logs sanity checks passed     | <owner> | TODO   | <link-or-note> |
| Client and IDL compatibility verified   | <owner> | TODO   | <link-or-note> |

## Stage 6 Rollback And Incident Response

| Task                                     | Owner   | Status | Evidence       |
| ---------------------------------------- | ------- | ------ | -------------- |
| Rollback authority path validated        | <owner> | TODO   | <link-or-note> |
| Previous known-good artifact available   | <owner> | TODO   | <link-or-note> |
| Rollback trigger thresholds documented   | <owner> | TODO   | <link-or-note> |
| Incident communication channel confirmed | <owner> | TODO   | <link-or-note> |

## Evidence Archive

- Release tag:
- Commit hash:
- Toolchain versions:
- Artifact hash:
- Deploy tx signatures:
- Slot numbers:
- Smoke test outputs:

## GO Or NO-GO Decision

- Decision: GO or NO-GO
- Rationale:
- Blocking items:

## Sign-Off

- Release engineer:
- Reviewer:
- Timestamp UTC:
