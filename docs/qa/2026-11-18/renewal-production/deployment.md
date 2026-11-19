# Renewal release evidence

Release commit: 21a3864ba92648d8f077f95430772990a1f5fc47
Isolated release tree: 9e52b54c596263462952b9f449bc7c74ef7cff71

Validation: finance regressions passed locally and in GitHub Actions; general renewal matrix 127 scenarios / 1632 assertions. Typecheck and web export passed locally. No real customer storage was used: financial fixtures persist to an in-memory Map.

GitHub run https://github.com/FerchoGG2006/prestamos-app/actions/runs/44373210048 passed dependencies and financial tests, but publication failed because EXPO_TOKEN was not provided. No OTA was published by that run. Local EAS session was confirmed as project owner; direct publication from the isolated release checkout is in progress.

Only the nine renewal-release files were advanced to remote main. Original dirty desktop/mobile workspace is preserved. Application identifiers, runtimeVersion, schema and storage keys are unchanged. No phone reset, reinstall or data import was performed.

## Confirmed preview publication

EAS preview update group: 9c3e57e0-0862-4547-849f-7a880e98fadb
Android: 01a1f000-dc25-7fc5-9b81-5ab8e0266f4a
iOS: 01a1f000-dc25-717b-98d6-b4a5077f528f
Runtime: 1.2.2. Published from commit 21a3864.
https://expo.dev/accounts/ferchogg2007/projects/cartera-movil/updates/9c3e57e0-0862-4547-849f-7a880e98fadb

General formula: customer net=P-S-F; Base decreases by P-S (net plus paperwork); new debt=P+interest; refinance compensation is not collections. With P700000/S620000/F0/R40% customer net80000, Base500000->420000, debt980000, Admin1400000. With F35000 net45000; same Base/debt/Admin.

## Completed production publication

Published successfully through the existing local Expo owner session; the failed GitHub workflow did not block direct publication. Production group: 3fbdad70-caa9-427c-bdce-1d7265d05917. Android update: 01a1f005-ad2c-7042-a444-ee25a88c32e6. iOS update: 01a1f005-ad2c-7180-a338-c1d28e339b41. Runtime1.2.2; commit21a3864; EAS reports isGitWorkingTreeDirty=false. Existing preview and production channels are active and point to the corresponding branches and new groups. No channel mapping changed.

https://expo.dev/accounts/ferchogg2007/projects/cartera-movil/updates/3fbdad70-caa9-427c-bdce-1d7265d05917

Web export rebuilt successfully, then deployment created and promoted to production. Existing production alias: https://cartera-movil.expo.app . Deployment: https://cartera-movil--gcgy70idew.expo.app . Public HTML and JavaScript return200. Served bundle /_expo/static/js/web/index-e804c3c44ff0b3a5146bd38bcfa01d18.js exactly matches SHA256 of isolated tested export: aa306a78000b3acb9308cb7120d1d291b42095404b92b89ac955fdeca3ffd588. Build label web1.2.14(2026-11-18) verified. See web-verification.json.

Not observed: installation/application of the OTA on the physical phone. No real customer or payment was read, modified or used for testing. Existing same-app OTA update is the delivery method, without uninstalling or clearing storage.

Remaining infrastructure issue: GitHub Actions EXPO_TOKEN secret is absent; future automated publication needs that secret configured. This release itself is published and remotely verified.
