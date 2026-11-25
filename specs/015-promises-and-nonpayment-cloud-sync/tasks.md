# Tasks: Bidirectional Promises & Non-Payment Cloud Sync (`015`)

- [x] T001 Mobile: Extend `supabase-client.ts` (`upsertOffice`) & `cloud-sync.ts` to union-merge and push `desktopPromises` and `nonPaymentVisits` in `offices.settings`
- [x] T002 Mobile: Extend `local-store.ts` (`mergeCloudPortfolio`, `recordPromise`, `recordNonPaymentVisit`) to merge and persist remote `desktopPromises` and `nonPaymentVisits`
- [x] T003 Desktop: Upgrade `DesktopCloudSyncService.java` for lossless union-merge of `desktopPromises` and bidirectional sync of `nonPaymentVisits` (`AuditLogEntity` `NON_PAYMENT_VISIT`) preserving read-only idle sync
- [x] T004 Desktop: Add 1-click `"No pagó"` dialog (same 5 reasons as Mobile) + `NO PAGÓ HOY` badge in `TodayCollectionsView.java` wired to `FollowUpService` in `CarteraApplication.java`
- [x] T005 Tests: Add automated tests in Mobile and Desktop (`DesktopFullMobileParityTest.java`) and verify full pass
- [x] T006 Release: Bump Mobile Web (`web 1.2.28`) + deploy to `https://cartera-movil.expo.app`; bump Desktop `AppVersion` (`1.2.3`), build 1.3 MB OTA patch, publish to Supabase Storage `desktop-updates`, verify live CDN, and push to `origin/main`

**Status**: Converged (`6/6` tasks completed & verified).
