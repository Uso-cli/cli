---
name: solana-release-runbook-generator
description: Generate a per-release Solana deployment checklist document from the release gate model, including preflight, deploy evidence, post-deploy checks, and rollback readiness.
---

# Solana Release Runbook Generator

Use this skill to generate a release-specific checklist document before each deploy.

## Purpose

Create a concrete runbook for one release candidate by converting the gate model into actionable, auditable checklist items.

This skill complements:

- solana-release-pipeline-and-prod-deploy-checks

## Inputs Required

Collect these values first:

- Release tag
- Commit hash
- Target cluster
- Program name and program ID
- Deploy authority wallet path
- Upgrade authority identity
- Planned deploy window UTC
- Rollback owner
- Primary RPC URL and fallback RPC URL

## Output File Contract

Write one file per release:

- docs/releases/RELEASE-CHECKLIST-<release-tag>.md

Example:

- docs/releases/RELEASE-CHECKLIST-v1.4.0.md

## Generation Steps

1. Read the gate model from the companion production gate skill.
2. Copy the runbook template in this skill folder.
3. Fill all metadata fields from provided release inputs.
4. Convert each gate into checkbox tasks.
5. Add owner, status, and evidence columns per task.
6. Add explicit GO or NO-GO decision block.
7. Save file under docs/releases using the naming contract.

## Checklist Rules

- Every gate item must be testable and evidence-backed.
- Do not leave ambiguous pass criteria.
- Include exact command examples for verification where relevant.
- Include rollback trigger thresholds and rollback command notes.
- Mark unknown values as TODO and block GO decision until resolved.

## Required Sections In Output

1. Release Metadata
2. Stage 1 Source Freeze
3. Stage 2 Build And Artifact Integrity
4. Stage 3 Pre-Deploy Safety Gates
5. Stage 4 Controlled Deploy
6. Stage 5 Post-Deploy Verification
7. Stage 6 Rollback And Incident Response
8. Evidence Archive
9. GO Or NO-GO Decision
10. Sign-Off

## Decision Logic

- GO only if every required gate is checked PASS with linked evidence.
- NO-GO if any required gate is FAIL, BLOCKED, or TODO.

## Quality Bar

The generated document is complete only when:

- All release metadata is populated.
- All gates are present and mapped to checklist lines.
- Each line has an owner and evidence placeholder.
- Final decision and sign-off block is included.
