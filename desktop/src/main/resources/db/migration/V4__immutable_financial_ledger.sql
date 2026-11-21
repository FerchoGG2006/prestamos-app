-- =========================================================================
-- V4: LIBRO MAYOR FINANCIERO INMUTABLE (APPEND-ONLY — PATRÓN DATOMIC / NUBANK)
-- =========================================================================
-- Todo hecho financiero queda registrado como evento atómico inmutable.
-- Los triggers bloquean cualquier UPDATE o DELETE directamente en SQLite.
-- =========================================================================

CREATE TABLE IF NOT EXISTS financial_event (
    sequence_no INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    office_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    route_id TEXT,
    customer_id TEXT,
    actor_user_id TEXT,
    amount TEXT NOT NULL,
    cash_delta TEXT NOT NULL DEFAULT '0.00',
    digital_delta TEXT NOT NULL DEFAULT '0.00',
    portfolio_delta TEXT NOT NULL DEFAULT '0.00',
    payload_json TEXT NOT NULL DEFAULT '{}',
    occurred_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    UNIQUE (office_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_financial_event_office_seq
    ON financial_event (office_id, sequence_no);

CREATE INDEX IF NOT EXISTS idx_financial_event_office_route
    ON financial_event (office_id, route_id);

CREATE TRIGGER IF NOT EXISTS trg_financial_event_no_update
BEFORE UPDATE ON financial_event
BEGIN
    SELECT RAISE(ABORT, 'IMMUTABLE_LEDGER_VIOLATION: financial_event is append-only; insert a reversal or adjustment event instead.');
END;

CREATE TRIGGER IF NOT EXISTS trg_financial_event_no_delete
BEFORE DELETE ON financial_event
BEGIN
    SELECT RAISE(ABORT, 'IMMUTABLE_LEDGER_VIOLATION: financial_event is append-only; insert a reversal or adjustment event instead.');
END;
