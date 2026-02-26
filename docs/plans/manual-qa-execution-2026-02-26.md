# Manual QA Execution Report (2026-02-26)

## Scope
This run executed the premium advisory risk review + billing checklist as far as possible from local CLI/Xcode automation, then validated checklist coverage against implemented code paths.

## Commands Executed
- `pnpm --filter @crop-copilot/contracts test`
- `pnpm --filter @crop-copilot/api typecheck`
- `pnpm --filter @crop-copilot/api test`
- `pnpm --filter @crop-copilot/web build`
- `pnpm --filter infra build`
- `xcodebuild -project apps/ios/CropCopilot.xcodeproj -scheme CropCopilot -sdk iphonesimulator -configuration Debug build CODE_SIGNING_ALLOWED=NO`

## Results Summary
- Automated backend/web/infrastructure checks: PASS
- iOS compile check: PASS
- iOS compile warnings: 2 deprecation warnings in `DiagnosisResultView.swift` (`onChange(of:perform:)`)
- Manual/touch/device-dependent checks: NOT EXECUTABLE in CLI-only run and must be completed in staged QA

## Checklist Execution Status

### Web
- Settings and navigation (`/settings`, `/settings/billing`, sidebar billing link): PASS (code + build verified)
- Billing & usage rendering/state actions: PASS (code + build verified)
- Checkout/portal endpoint wiring: PASS (handlers + infra routes verified)
- Diagnose optional planning fields + validation (photo/lab): PASS (code verified)
- Premium recommendation cards and status states: PASS (code verified)
- Feedback reward flow wiring: PASS (code verified)
- Usage guard flow wiring: PASS (handler + entitlement checks verified)
- Base recommendation regression signals: PASS (`api test` + build smoke)

### iOS
- Diagnose forms include optional planning fields: PASS (code + compile verified)
- Premium insights rendering states: PASS (code + compile verified)
- Push registration endpoint integration: PASS (code + compile verified)
- Feedback modal flow and end-to-end interaction timing: NEEDS DEVICE QA
- Navigation crash regression checks: NEEDS DEVICE QA

### API Spot Checks
- Endpoints are implemented and routed in infra:
  - `GET /api/v1/subscription`
  - `GET /api/v1/usage`
  - `GET /api/v1/recommendations/{id}/premium`
  - `POST /api/v1/recommendations/{id}/premium`
  - `POST /api/v1/recommendations/{id}/report`
  - `POST /api/v1/push/register`
- Live token-auth HTTP calls against deployed runtime: NEEDS ENV QA RUN

## Gaps Found During Execution
1. iOS planning inputs accepted invalid acreage/date/lat/lon without local validation feedback.
2. Admin version-toggle logic was duplicated across `/admin` and `/admin/discovery`.
3. QA/docs migration prerequisites were missing SQL `008_advisory_risk_review_states.sql`.
4. Web env example did not document the new admin v1/v2/v3 API target variables.
5. README migration section stopped at SQL `006`.

## Gap Resolution Status
All five gaps above were implemented in this pass.
