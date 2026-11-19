# JavaFX operational parity — 18 November 2026

## User data protection
The user explicitly stated that the phone contains real customers and correct installments and requested no changes. No phone app was reset, installed, reconfigured, read for fixtures or synchronized. No real office database was opened for testing, restored or migrated. All executed writes used disposable SQLite databases or fresh folders under desktop/build/qa. Existing unrelated workspace changes were preserved. No installer was executed and no production deployment was performed.

## Implemented

- Atomic, authorized and audited customer deactivation; no catch-and-force CANCELADO fallback or physical customer deletion. Rejection of one protected loan rolls back the entire customer operation. Profile edits delegate to the service and cannot silently transfer a customer with contracts.
- Native customer follow-up dialog for dated promises, explicit fulfillment/cancellation, no-payment visits and due/overdue commitment alerts. These operations do not fabricate Payment or cash movements.
- Managed customer attachments (JPG/PNG/PDF/MP4/MOV), relational V3 metadata, unique stored names, SHA-256 verification, ownership checks and rollback cleanup. Originals remain unchanged.
- Office ZIP backup with committed SQLite and referenced attachments. Recovery validates SQLite integrity, schema and foreign keys, rejects unsafe archive paths/corruption and publishes a new recovered-office folder. It never replaces the running office. --office-dir opens a separate office before Spring datasource initialization.
- Legacy mobile normalization for expectedAmount, collector assignment and frequency/customer states. Origination requires a verifiable disbursement; migrated baseline subtracts uploaded allocations before applying actual payments. Predecessor payments run before renewal, successor payments afterward. Replays do not duplicate money. Incomplete/contradictory snapshots, unsupported reversals/cancellations and missing stable financial IDs fail closed instead of silently changing balances.
- LAN data endpoints require configured office PIN or a manager-generated, expiring route-scoped link. Pairing stays bound to route/collector and initiating manager session. Export excludes private settings; collectors cannot export other routes or ALL. Public status endpoint returns connectivity metadata only.
- Windows packaging includes jdk.httpserver, resolves Gradle artifact names dynamically, preserves previous release outputs, supports configurable ISCC path and generates portable ZIP plus installer. Production demo seeds disabled; existing office credentials/data retained.

## Verified

58 JUnit tests passed (zero failures/errors/skips), including 17 new cases covering lifecycle rollback/replay, permissions, promises/visits without money, attachment storage/rollback, full isolated recovery of a closed settlement and attachment, corrupt/path-traversal rejection, HTTP route/PIN controls, complete legacy new-loan/payment snapshot, migration baseline, payment-before-renewal and successor payment, HTTP closed-day rejection and incomplete snapshot rollback. Original 35-scenario financial journey passed unchanged.

Commands:

```powershell
.\gradlew.bat :desktop:test :desktop:officeJourneyQa :desktop:packageAll --offline --console=plain -PisolatedBuildDir=build/parity-20261118 -PdistributionDir=build/release-parity-20261118-verified
```

The isolated build directory avoids locked resource outputs from older JavaFX/IDE processes; those processes and real offices were not stopped or cleaned. The native package was launched with --office-dir pointing to the seeded fictitious folder. Accessibility exposed `OFICINA FICTICIA QA` login; the bundled LAN server returned status OK at an ephemeral port, proving the native runtime contains the server module. Computer Use failed twice to activate the captured window, so visual acceptance of the new dialogs is explicitly pending.

Phone connectivity requested only by opening /api/sync/status in the phone browser, without entering the real mobile app. This is not evidence of phone success until the user confirms the result.

## Remaining acceptance and limits

- Visual acceptance of new native dialogs after resolving Windows activation (`failed to activate captured window`).
- Physical phone status confirmation and a complete bidirectional journey in a separate disposable device/app dataset; the user's real app cannot be used for destructive trial operations.
- Installer/update acceptance on another Windows PC and printing/maps/WhatsApp external integrations.
- Changes to existing customer profiles, promise transitions and media are not a versioned bidirectional legacy synchronization protocol yet. Desktop-managed attachments are local and recoverable, not automatically pulled from the user's existing phone.
- Legacy snapshots containing reversals/cancellations or ambiguous migrated-renewal history require an explicit reconciliation contract. They are rejected, not guessed or silently repaired.
- Recovery needs a usable authenticated office to prepare the new folder; recovery from an unbootable live office requires a future pre-start recovery entry point. A new recovered office may be opened separately with --office-dir.

These results are an implemented and tested increment, not a claim of complete mobile/desktop parity or authorization to migrate existing customer data.

## Release evidence

Verified output: `desktop/build/release-parity-20261118-verified/`. Both `Instalador-SistemaCartera-v1.1.0.exe` and `SistemaCartera-v1.1.0-Windows-x64.zip` were generated successfully (`BUILD SUCCESSFUL in 2m 25s`). SHA-256 and sizes are recorded in artifacts.json. No installation executed.

`jimage` confirms `Module: jdk.httpserver`. SHA-256 of the packaged and tested main JAR matches: `834ABBA83ABFD65CD141C7B329803D0103801622A034F3DE66A8216953F32D9A`. The exact final executable was additionally launched with another fresh fictitious clone under desktop/build/qa/verified-package-nyui11gl and its own /api/sync/status returned OK. The previous fictitious status endpoint remains available for the already-sent phone connectivity question; neither endpoint accesses mobile storage.

Recovery packages are currently bounded to 512 MB decompressed when importing; individual attachments are limited to 100 MB. Visual acceptance and another-PC installation remain pending; this release was generated for review, not deployed.

## Actualización: prueba real del motor móvil

El usuario confirmó status OK desde el navegador del teléfono. Se completó además el recorrido HTTP con el motor móvil real en memoria aislada, se corrigió el contrato de exportación y se pasó la regresión ampliada: **59 pruebas y 35/35 escenarios**. Véase [mobile-roundtrip/REPORT.md](mobile-roundtrip/REPORT.md). El usuario solo dispone del teléfono con clientes reales; no se ejecutaron transacciones en esa app. La verificación física de operaciones queda pendiente de un dispositivo/instalación de pruebas separado.
