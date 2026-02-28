# Gap Implementation Checklist (Post Manual-QA Execution)

Date: 2026-02-26

## Implemented in Code
- [x] Add iOS planning-field validation for:
  - [x] `fieldAcreage` (`> 0 && <= 100000`)
  - [x] `fieldLatitude` (`-90..90`)
  - [x] `fieldLongitude` (`-180..180`)
  - [x] `plannedApplicationDate` (`YYYY-MM-DD`, strict)
- [x] Deduplicate admin version-target logic into shared helper:
  - [x] `apps/web/lib/admin-version-targets.ts`
  - [x] update `/admin` page to use shared helper
  - [x] update `/admin/discovery` page to use shared helper
- [x] Update documentation and setup alignment:
  - [x] add migration `008_advisory_risk_review_states.sql` to QA prerequisites
  - [x] add admin v1/v2/v3 target env vars to `apps/web/.env.example`
  - [x] update README migration run-order through SQL `008`
  - [x] remove web Prisma migration path from active project files (already completed)

## Validation Completed
- [x] `contracts` tests
- [x] `api` typecheck
- [x] `api` tests
- [x] `web` production build
- [x] `infra` build
- [x] iOS simulator build via `xcodebuild`

## Remaining Manual QA (Device/Runtime)
- [ ] iOS touch-flow verification for feedback modal timing rules
- [ ] iOS end-to-end push permission + APNS token + backend row upsert
- [ ] Staged API token-auth spot checks against deployed runtime URLs
- [ ] Stripe live-mode checkout/portal verification with real customer records
