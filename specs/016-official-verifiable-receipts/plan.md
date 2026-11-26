# Technical Plan: Official Verifiable Digital Receipts & Branded PDF Tickets

## 1. Architecture Overview

```
[Kredia Mobile / Desktop]
  ├── Saves Payment / Loan / Renewal locally (existing transactional logic)
  ├── Publishes immutable snapshot -> Supabase RPC `issue_official_receipt(...)`
  │     └── Returns `receipt_code` (KRD-YYMMDD-XXXXXXXX)
  ├── Displays Native Stepper + Official Fintech Comprobante Card
  │     ├── [Enviar por WhatsApp] -> 1 tap `wa.me/<phone>?text=...https://cartera-movil.expo.app/?r=KRD-...`
  │     └── [Descargar / Compartir PDF] -> Pure-code PDF 1.4 w/ embedded Kredia JPEG logo in footer
  └── On Admin Reversal/Cancellation -> Supabase RPC `void_official_receipt(...)`

[Client Opens WhatsApp Link]
  └── https://cartera-movil.expo.app/?r=KRD-...
        └── App.tsx detects `?r=` before auth -> renders `<PublicReceiptView />`
              ├── Fetches single receipt via Supabase RPC `get_official_receipt(p_code)` (no login)
              ├── Renders exact Bemovil-style Kredia Comprobante Card (Office header + Kredia footer)
              └── [Descargar PDF] -> downloads genuine branded PDF ticket
```

## 2. Database & Security Design (`supabase/migrations/20261126000000_official_verifiable_receipts.sql`)
- Table `public.official_receipts`:
  - `receipt_code TEXT PRIMARY KEY`
  - `office_id TEXT NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE`
  - `receipt_type TEXT NOT NULL CHECK (receipt_type IN ('PAYMENT', 'LOAN', 'RENEWAL'))`
  - `entity_id TEXT NOT NULL`
  - `company_name TEXT NOT NULL`
  - `route_name TEXT NOT NULL DEFAULT ''`
  - `customer_name TEXT NOT NULL`
  - `customer_document TEXT NOT NULL DEFAULT ''`
  - `loan_number TEXT NOT NULL DEFAULT ''`
  - `amount NUMERIC(14,2) NOT NULL`
  - `status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('APPROVED', 'REVERSED', 'CANCELLED'))`
  - `issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `issued_at_display TEXT NOT NULL`
  - `payload JSONB NOT NULL DEFAULT '{}'::jsonb`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `CONSTRAINT uq_official_receipts_entity UNIQUE (office_id, receipt_type, entity_id)`
- Immutability trigger `prevent_official_receipt_mutation`:
  - Blocks `DELETE` unconditionally and blocks `UPDATE` unless `current_setting('kredia.allow_receipt_void', true) = 'true'` AND only `status` changes from `'APPROVED'` to `'REVERSED'` or `'CANCELLED'`.
- RLS:
  - `SELECT` & `INSERT` scoped strictly to `office_id = (SELECT private.current_office_id())`.
  - No `UPDATE` / `DELETE` policies for `anon` or `authenticated`.
- RPCs (`SECURITY DEFINER`, `SET search_path = ''`):
  - `public.issue_official_receipt(...)`: Authenticates via `private.current_office_id()`, returns existing immutable receipt if `(office_id, receipt_type, entity_id)` already exists, else inserts with server-generated `KRD-YYMMDD-<8HEX>` code.
  - `public.get_official_receipt(p_code TEXT)`: Public single-code lookup returning sanitized receipt JSON (no enumeration, no internal IDs).
  - `public.void_official_receipt(p_receipt_type TEXT, p_entity_id TEXT, p_new_status TEXT)`: Authenticates via `private.current_office_id()`, sets local GUC `kredia.allow_receipt_void = 'true'`, marks matching receipt as `REVERSED` or `CANCELLED`.

## 3. Branded PDF Asset & Generator (Zero Heavy Dependencies)
- Generate a compact 360px-wide JPEG (`kredia-logo.jpg`, ~5 KB, white background) from `mobile/assets/kredia.png`.
- Embed as base64 constant in `mobile/src/core/utils/kredia-logo-jpeg.ts` and as classpath resource `desktop/src/main/resources/ui/kredia-logo.jpg`.
- Pure PDF 1.4 ticket generator (`mobile/src/core/utils/receipt-pdf.ts` and `desktop/src/main/java/com/cartera/ui/util/OfficialReceiptPdfGenerator.java`):
  - Clean receipt page (320 × dynamic height pt, ~113 mm wide voucher).
  - Draws rounded card, soft green checkmark icon (or red void icon), bold amount, `Aprobado` badge + timestamp, Office name header, dashed dividers, clean 2-column table with WinAnsi Spanish characters, verification code, and embedded Kredia JPEG XObject (`/DCTDecode`) in footer.

## 4. Mobile Changes
- `mobile/src/core/utils/whatsapp-receipt.ts`:
  - Add `OfficialReceiptPayload`, `OfficialReceiptRecord`, `buildOfficialReceiptUrl(code)`, `formatOfficialReceiptWhatsAppMessage(...)`, `calculateHistoricalRemainingBalance(...)`.
  - Fix `formatCOPPlain` (ASCII space, no broken bold `\u00A0`), fix `formatAccountStatementReminder` (concise + real delinquency + footer), add concise `formatShortCuadreMessage(...)`.
- `mobile/src/infrastructure/sync/supabase-client.ts`:
  - Add `issueOfficialReceipt(...)`, `getPublicOfficialReceipt(code)`, and `voidOfficialReceipt(...)`.
- `mobile/src/core/utils/receipt-pdf.ts` + `mobile/src/core/utils/kredia-logo-jpeg.ts`:
  - Pure TS PDF generator + Web Blob download & Native `expo-file-system` + `Share`/`expo-intent-launcher` helper.
- `mobile/src/presentation/components/OfficialReceiptModal.tsx`:
  - Reusable fintech bottom-sheet with Phase 1 live confirmation stepper and Phase 2 Bemovil-style receipt card + WhatsApp 1-tap + PDF download/share.
- `mobile/src/presentation/views/public/PublicReceiptView.tsx`:
  - Standalone no-login receipt verification view rendered by `App.tsx` when `?r=KRD-...` is present in the URL.
- Integrations:
  - `PaymentModal.tsx`: Fix double-subtraction bug, use `whatsappPhone || phone`, use `OfficialReceiptModal` stepper + card.
  - `NewLoanModal.tsx`: Show `OfficialReceiptModal` (`LOAN`) on new non-migration loan creation.
  - `RenewalModal.tsx`: Show `OfficialReceiptModal` (`RENEWAL`) on renewal completion.
  - `CustomerDetailView.tsx`: Historical payments open `OfficialReceiptModal` with true historical balance & immutable cloud receipt; payment reversal / loan cancel calls `voidOfficialReceipt`.
  - `TodayCollectionsView.tsx`: Pass real `overdueDays`, `overdueAmount`, `remainingBalance` to `handleQuickWhatsApp`.
  - `CollectorCuadreModal.tsx` & `SettlementModal.tsx`: Short, clean WhatsApp cuadre summaries.

## 5. Desktop Changes (Native JavaFX 21 + Spring Boot)
- `SupabaseRegistryClient.java`: Add `issueOfficialReceipt(...)` and `voidOfficialReceipt(...)`.
- `OfficialReceiptService.java`: Orchestrates cloud receipt issuance (using `OfficeLicensingService` + `SupabaseRegistryClient`) with clean offline fallback & `BigDecimal` formatting.
- `OfficialReceiptPdfGenerator.java`: Pure Java PDF 1.4 ticket generator with embedded `/ui/kredia-logo.jpg`.
- `WhatsAppReceiptUtil.java`: Add `formatOfficialReceiptWhatsAppMessage(...)` (1-tap official link), shorten `formatAccountStatement`, `generateAccountStatementMessage`, and `generateDailySettlementMessage`, fix `\u00A0` currency formatting.
- `ReceiptDialog.java`: Upgrade to clean native JavaFX Bemovil-style fintech comprobante card supporting `PAYMENT`, `LOAN`, and `RENEWAL` (Office header, green check, bold amount, `Aprobado` pill, dashed dividers, 2-column grid, Kredia logo `ImageView` in footer, `Enviar WhatsApp`, `Descargar PDF`, `Imprimir`, `Copiar enlace`).
- Integrations: `PaymentDialog.java`, `CreateLoanDialog.java`, `RenewLoanDialog.java`, `Customer360Dialog.java` (with true historical balance calculation), `TodayCollectionsView.java`, `ReversePaymentUseCase` / `CancelLoanUseCase` (optional non-blocking cloud void).

## 6. Verification & Deployment Plan
1. Apply Supabase migration `20261126000000_official_verifiable_receipts.sql` live and verify RLS + immutability trigger + `get_official_receipt` RPC.
2. Mobile verification: `npm run typecheck` + `npm run test:finance` (including new unit tests for historical balance, double-subtraction prevention, PDF binary validity, and short WhatsApp formatting).
3. Desktop verification: `.\gradlew.bat test` (including new unit tests for `OfficialReceiptPdfGenerator`, historical balance, and `WhatsAppReceiptUtil`).
4. Deploy live:
   - Mobile Web (`eas deploy`) -> verify `https://cartera-movil.expo.app/?r=<test_code>` live!
   - Android OTA (`expo export --platform android --max-workers 1` + `eas-cli update --skip-bundler --platform android --channel preview`).
   - Desktop OTA (`v1.2.4` via `buildOtaPatch` uploaded to `desktop-updates`).
