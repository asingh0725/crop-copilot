# Prod Data Guardrails

These rules apply to any change that can mutate production data in Crop Copilot.

## Default Policy

1. Production data is read-only by default.
2. No direct edits to production data are allowed unless the user explicitly asks for that exact change in the current thread.
3. Infrastructure changes that may replace the production database are forbidden.

## Mandatory Preconditions

Before any production data mutation:

1. Create a fresh manual RDS snapshot.
2. Create a fresh logical export backup (`pg_dump`).
3. Record the snapshot ID and dump path in the execution log.
4. Produce a dry-run row count for every table that will be changed.
5. State the exact mutation scope before executing it.

If any of the above are missing, stop.

## Forbidden Actions

1. No `DELETE`, `TRUNCATE`, or broad `UPDATE` against production without a per-table dry run and explicit user request.
2. No schema migration that CDK or CloudFormation marks as a possible replacement of the production RDS instance.
3. No destructive recommendation/profile/user rewrites to “clean up” data opportunistically.
4. No production mutation driven by guesswork about user identity. UUIDs and ownership must be verified first.

## Allowed Production Mutations

These are allowed only after the mandatory preconditions are satisfied:

1. Explicitly requested ownership fixes.
2. Explicitly requested billing/subscription corrections.
3. Explicitly requested data recovery or restoration.
4. Small, targeted SQL updates where the affected row set is verified in advance.

## Required Execution Sequence

1. Read-only verification.
2. Fresh snapshot.
3. Fresh logical dump.
4. Dry-run query with row counts.
5. Targeted mutation.
6. Post-change verification query.
7. Log the change summary, snapshot ID, dump path, and validation result.

## Snapshot Retention Policy

1. Routine production safety snapshots: retain for 30 days.
2. Migration snapshots: retain until the migration is verified and explicitly cleared for deletion.
3. One-off correction snapshots: retain until the correction is validated, then delete the superseded older safety snapshot if no migration depends on it.

## Current Operational Rule

For this repo, if AWS access is only available through expiring human SSO, do not attempt production data mutation unless a fresh authenticated session is already active.
