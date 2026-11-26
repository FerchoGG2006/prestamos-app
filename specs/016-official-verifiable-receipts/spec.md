# Feature Specification: Official Verifiable Digital Receipts, Branded PDF Tickets & Anti-Fraud WhatsApp Sharing

**Feature Branch**: `016-official-verifiable-receipts`
**Created**: 2026-11-26
**Status**: Approved by User (Choices: 1A Hosted Visual Card + PDF Download, 2A Office Name Header + Kredia Logo Footer, 3 Payment + New Loan + Renewal across Mobile & Desktop + Bugfixes + Short Messages)

## 1. Problem Statement & Business Context

Currently, sending receipts via WhatsApp relies on editable plain text messages, creating two critical business problems:
1. **Collector Fraud Risk**: Dishonest collectors can alter the paid amount or remaining balance in WhatsApp before tapping Send, deceiving clients and creating disputes with the office.
2. **Broken Receipt Balances & Cluttered Messages**:
   - Re-sending an older payment receipt from `CustomerDetailView` computes remaining balance using *today's* installment state, falsely showing `$ 0` and `"¡Crédito totalmente cancelado!"` on historical payments of renewed or later-paid loans.
   - `PaymentModal` subtracts `completedPayment.amountReceived` from an already-updated `totalRemainingBalance` (double subtraction), showing an incorrect `$ 0` balance right after collecting.
   - `TodayCollectionsView` quick WhatsApp omits delinquency (`overdueDays` / `overdueAmount`) and contains broken bold markdown with non-breaking spaces.
   - New Loans and Renewals have no official shareable receipt, and daily settlement/cuadre WhatsApp messages are excessively long.

## 2. User Stories & Acceptance Criteria

### US1 — Immutable Cloud Receipt Publication & Public Visual Verification Card (1-Tap Exact Client Chat)
- **As** an office owner / collector, **when** I confirm a **Payment**, **New Loan** (non-migration), or **Renewal** in Kredia Mobile or Kredia Desktop:
  1. A fast, fintech-style confirmation stepper executes the real persistence and cloud receipt publication steps.
  2. The system issues an **immutable official receipt** in Supabase (`public.official_receipts`) with a unique code (`KRD-YYMMDD-XXXXXXXX`) bound idempotently to `(office_id, receipt_type, entity_id)`.
  3. The collector sees a clean Bemovil/Nequi-style **Comprobante Oficial** card displaying:
     - Green checkmark circle, bold monetary amount, `Aprobado` pill, exact Colombia timestamp, and concept subtitle.
     - Inner ticket card with dashed dividers, **Office Name** prominently at the top, structured two-column verified details, verification folio, and **Kredia logo in the footer** (`Verificado por Kredia`).
  4. Clicking **Enviar por WhatsApp** opens the **exact client's WhatsApp chat (`wa.me/<phone>`) in 1 tap** with a short anti-fraud message containing the verified link (`https://cartera-movil.expo.app/?r=KRD-...`) — no editable amounts in the message text.
  5. When the client opens the link on any phone/browser (without logging in), they immediately see the **exact official visual receipt card** fetched from Supabase via `get_official_receipt(p_code)` with a prominent **"Descargar PDF"** button.
  6. Database RLS + triggers enforce **immutability**: neither collectors nor anon clients can `UPDATE` or `DELETE` an issued receipt. Only authorized payment reversal / loan cancellation transitions status to `REVERSED` / `CANCELLED` via dedicated RPC.

### US2 — Branded Offline-Capable PDF Ticket Generation (Web, Android, iOS, Windows Desktop)
- **As** a client, collector, or administrator, **when** I tap **"Descargar / Compartir PDF"** (on the public receipt page, in Mobile, or in Desktop):
  1. The app generates a crisp, genuine binary `.pdf` ticket containing the Office name at top, `Aprobado` status, verified amount & balance details, verification folio, and the **real Kredia logo embedded in the footer**.
  2. Works **100% offline** in both Mobile (Web download + Android/iOS file share) and Desktop (JavaFX file save / open in system PDF viewer) without requiring new native Expo modules or breaking Desktop's lightweight OTA JAR.

### US3 — Historical Balance Accuracy, Bug Fixes & Concise WhatsApp Messages
- **As** a collector or admin:
  1. `PaymentModal` displays and publishes the exact remaining balance after payment (no double subtraction) and targets `customer.whatsappPhone || customer.phone`.
  2. Re-sending any historical payment receipt from `CustomerDetailView` (Mobile) or `Customer360Dialog` / `TodayCollectionsView` (Desktop) calculates the **true historical remaining balance at the time of that payment** (even if the loan was later renewed or paid off) and retrieves the original immutable cloud receipt if already issued.
  3. `TodayCollectionsView` quick WhatsApp reminder passes real `overdueDays`, `overdueAmount`, and `remainingBalance`, and uses clean, short WhatsApp formatting without broken bolding.
  4. Account statement reminders and Daily Cuadre / Settlement WhatsApp messages (Mobile + Desktop) are shortened to crisp, scannable summaries.

## 3. Non-Functional Requirements & Constraints
- **Desktop Native JavaFX Rule (`AGENTS.md`)**: Desktop UI (`ReceiptDialog`, `PaymentDialog`, `CreateLoanDialog`, `RenewLoanDialog`) MUST remain 100% native JavaFX 21 (no WebView / HTML UI). All financial values in Desktop MUST use `BigDecimal`.
- **Zero Reinstall Deployment**: Mobile keeps `runtimeVersion: "1.2.2"` (no new native packages) so Android receives updates via Expo OTA and Web via `eas deploy`; Desktop adds zero heavy Gradle dependencies so OTA JAR stays ~1.35 MB.
- **Privacy & Multi-Tenant Isolation**: `get_official_receipt(p_code)` returns ONLY the single receipt matching the exact code (never allows listing/scraping) and exposes zero internal credentials, office settings, or unrelated client records.
