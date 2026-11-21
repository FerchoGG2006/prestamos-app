-- =========================================================================
-- MIGRACIÓN: LIBRO MAYOR FINANCIERO INMUTABLE (PATRÓN DATOMIC / NUBANK),
-- RENOVACIONES, LIQUIDACIONES Y COMPATIBILIDAD OPERATIVA REAL
-- =========================================================================

-- 1. Ampliar estados de cuotas para soportar estados en español e inglés
DO $$
DECLARE
  c_name TEXT;
BEGIN
  FOR c_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.installments'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.installments DROP CONSTRAINT IF EXISTS %I', c_name);
  END LOOP;
END $$;

ALTER TABLE public.installments
  ADD CONSTRAINT chk_installments_status CHECK (
    status IN ('PENDING', 'PARTIAL', 'PAGADA', 'OVERDUE', 'PENDIENTE', 'PARCIAL', 'VENCIDA', 'ADELANTADA')
  );

-- 2. Ampliar categorías de movimientos de caja (cobros, reversos, anulaciones)
DO $$
DECLARE
  c_name TEXT;
BEGIN
  FOR c_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.cash_movements'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%category%'
  LOOP
    EXECUTE format('ALTER TABLE public.cash_movements DROP CONSTRAINT IF EXISTS %I', c_name);
  END LOOP;
END $$;

ALTER TABLE public.cash_movements
  ADD CONSTRAINT chk_cash_movements_category CHECK (
    category IN (
      'EXPENSE', 'RECAUDO_OFICINA', 'CAPITAL_INJECTION',
      'LOAN_DISBURSEMENT', 'RENEWAL_DISBURSEMENT', 'RETIRO_PAPELERIA',
      'ADJUSTMENT', 'COLLECTION', 'PAYMENT_REVERSAL', 'LOAN_CANCELLATION'
    )
  );

-- 3. Columnas de idempotencia y desglose en payments + occurred_date
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS installments_breakdown JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS local_created_at TEXT;

ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS local_created_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_office_idempotency
  ON public.payments (office_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

-- 4. Tabla de Renovaciones (multi-tenant)
CREATE TABLE IF NOT EXISTS public.renewals (
  id TEXT PRIMARY KEY,
  office_id TEXT NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  previous_loan_id TEXT NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  new_loan_id TEXT NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  collector_id TEXT,
  new_principal NUMERIC(14,2) NOT NULL,
  previous_balance_deducted NUMERIC(14,2) NOT NULL DEFAULT 0,
  paperwork_deducted NUMERIC(14,2) NOT NULL DEFAULT 0,
  actual_cash_disbursed NUMERIC(14,2) NOT NULL DEFAULT 0,
  local_created_at TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_renewals_office_id ON public.renewals(office_id);

-- 5. Tabla de Liquidaciones Diarias Selladas (multi-tenant)
CREATE TABLE IF NOT EXISTS public.daily_settlements (
  id TEXT PRIMARY KEY,
  office_id TEXT NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  session_id TEXT,
  route_id TEXT,
  collector_id TEXT,
  settlement_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SETTLED',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  settled_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_settlements_office_id ON public.daily_settlements(office_id);

-- 6. LIBRO MAYOR FINANCIERO INMUTABLE (APPEND-ONLY — PATRÓN DATOMIC / NUBANK)
CREATE TABLE IF NOT EXISTS public.financial_events (
  id TEXT PRIMARY KEY,
  office_id TEXT NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
  sequence_no BIGINT GENERATED ALWAYS AS IDENTITY,
  idempotency_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'OFFICE_OPENING_BALANCE',
      'LOAN_DISBURSED',
      'PAYMENT_RECEIVED',
      'PAYMENT_REVERSED',
      'RENEWAL_EXECUTED',
      'EXPENSE_RECORDED',
      'CAPITAL_INJECTED',
      'OFFICE_WITHDRAWAL',
      'PAPERWORK_WITHDRAWAL',
      'LOAN_CANCELLED',
      'SETTLEMENT_CLOSED',
      'ADJUSTMENT_ENTRY'
    )
  ),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  route_id TEXT,
  customer_id TEXT,
  actor_user_id TEXT,
  amount NUMERIC(14,2) NOT NULL,
  cash_delta NUMERIC(14,2) NOT NULL DEFAULT 0,
  digital_delta NUMERIC(14,2) NOT NULL DEFAULT 0,
  portfolio_delta NUMERIC(14,2) NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_financial_events_office_idempotency UNIQUE (office_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_financial_events_office_seq
  ON public.financial_events (office_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_financial_events_office_route
  ON public.financial_events (office_id, route_id);

-- Trigger duro de inmutabilidad: bloquea UPDATE y DELETE a nivel de motor PostgreSQL
CREATE OR REPLACE FUNCTION public.prevent_financial_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_LEDGER_VIOLATION: financial_events is append-only; insert a reversal or adjustment event instead.';
END;
$$;

DROP TRIGGER IF EXISTS trg_financial_events_no_update ON public.financial_events;
CREATE TRIGGER trg_financial_events_no_update
  BEFORE UPDATE ON public.financial_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_event_mutation();

DROP TRIGGER IF EXISTS trg_financial_events_no_delete ON public.financial_events;
CREATE TRIGGER trg_financial_events_no_delete
  BEFORE DELETE ON public.financial_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_event_mutation();

-- Vista de saldos derivados 100% de hechos inmutables
CREATE OR REPLACE VIEW public.office_ledger_balances AS
SELECT
  office_id,
  COALESCE(route_id, 'ALL') AS route_id,
  COUNT(*) AS events_count,
  COALESCE(SUM(portfolio_delta), 0)::NUMERIC(14,2) AS portfolio_balance,
  COALESCE(SUM(cash_delta), 0)::NUMERIC(14,2) AS cash_balance,
  COALESCE(SUM(digital_delta), 0)::NUMERIC(14,2) AS digital_balance,
  (COALESCE(SUM(portfolio_delta), 0) + COALESCE(SUM(cash_delta), 0) + COALESCE(SUM(digital_delta), 0))::NUMERIC(14,2) AS administrative_total,
  MAX(sequence_no) AS last_sequence_no,
  MAX(recorded_at) AS last_recorded_at
FROM public.financial_events
GROUP BY office_id, COALESCE(route_id, 'ALL');

-- 7. RLS (financial_events permite SOLO SELECT e INSERT, nunca UPDATE ni DELETE)
ALTER TABLE public.renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow anon all on renewals" ON public.renewals;
  CREATE POLICY "Allow anon all on renewals" ON public.renewals FOR ALL TO anon USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow anon all on daily_settlements" ON public.daily_settlements;
  CREATE POLICY "Allow anon all on daily_settlements" ON public.daily_settlements FOR ALL TO anon USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Allow anon select on financial_events" ON public.financial_events;
  CREATE POLICY "Allow anon select on financial_events" ON public.financial_events FOR SELECT TO anon USING (true);

  DROP POLICY IF EXISTS "Allow anon insert on financial_events" ON public.financial_events;
  CREATE POLICY "Allow anon insert on financial_events" ON public.financial_events FOR INSERT TO anon WITH CHECK (true);
END $$;
