-- =========================================================================
-- MIGRACIÓN: COMPROBANTES OFICIALES VERIFICABLES E INMUTABLES (SPEC 016)
-- =========================================================================
-- 1. Crea public.official_receipts con clave única idempotente por operación
--    (office_id, receipt_type, entity_id) para pagos, préstamos y renovaciones.
-- 2. Bloquea mutaciones y borrados a nivel de motor PostgreSQL (anti-fraude).
-- 3. Expone RPCs seguras:
--    - issue_official_receipt(...): emite o retorna el comprobante inmutable
--    - get_official_receipt(p_code): consulta pública por código exacto sin login
--    - void_official_receipt(...): marca como REVERSED / CANCELLED al anular
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.official_receipts (
  receipt_code TEXT PRIMARY KEY,
  office_id TEXT NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  receipt_type TEXT NOT NULL CHECK (receipt_type IN ('PAYMENT', 'LOAN', 'RENEWAL')),
  entity_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  route_name TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL,
  customer_document TEXT NOT NULL DEFAULT '',
  loan_number TEXT NOT NULL DEFAULT '',
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('APPROVED', 'REVERSED', 'CANCELLED')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issued_at_display TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_official_receipts_office_entity UNIQUE (office_id, receipt_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_official_receipts_office_issued
  ON public.official_receipts (office_id, issued_at DESC);

ALTER TABLE public.official_receipts ENABLE ROW LEVEL SECURITY;

-- Políticas estrictas por oficina: SOLO SELECT e INSERT (nunca UPDATE ni DELETE)
DROP POLICY IF EXISTS "Strict office select on official_receipts" ON public.official_receipts;
DROP POLICY IF EXISTS "Strict office insert on official_receipts" ON public.official_receipts;

CREATE POLICY "Strict office select on official_receipts"
  ON public.official_receipts
  FOR SELECT
  TO anon, authenticated
  USING (office_id = (SELECT private.current_office_id()));

CREATE POLICY "Strict office insert on official_receipts"
  ON public.official_receipts
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (office_id = (SELECT private.current_office_id()));

-- Trigger de inmutabilidad antifraude
CREATE OR REPLACE FUNCTION private.prevent_official_receipt_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'OFFICIAL_RECEIPT_IMMUTABLE: Los comprobantes oficiales no se pueden eliminar.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF current_setting('kredia.allow_receipt_void', true) = 'true'
       AND OLD.status = 'APPROVED'
       AND NEW.status IN ('REVERSED', 'CANCELLED')
       AND NEW.receipt_code = OLD.receipt_code
       AND NEW.office_id = OLD.office_id
       AND NEW.receipt_type = OLD.receipt_type
       AND NEW.entity_id = OLD.entity_id
       AND NEW.company_name = OLD.company_name
       AND NEW.route_name = OLD.route_name
       AND NEW.customer_name = OLD.customer_name
       AND NEW.customer_document = OLD.customer_document
       AND NEW.loan_number = OLD.loan_number
       AND NEW.amount = OLD.amount
       AND NEW.issued_at = OLD.issued_at
       AND NEW.issued_at_display = OLD.issued_at_display
       AND NEW.payload = OLD.payload THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'OFFICIAL_RECEIPT_IMMUTABLE: Los comprobantes oficiales no se pueden alterar.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_official_receipt_mutation ON public.official_receipts;
CREATE TRIGGER trg_prevent_official_receipt_mutation
  BEFORE UPDATE OR DELETE ON public.official_receipts
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_official_receipt_mutation();

-- Helper interno para serializar la vista pública segura del comprobante (sin office_id ni datos sensibles)
CREATE OR REPLACE FUNCTION private.serialize_public_receipt(r public.official_receipts)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'receipt_code', r.receipt_code,
    'receipt_type', r.receipt_type,
    'company_name', r.company_name,
    'route_name', r.route_name,
    'customer_name', r.customer_name,
    'loan_number', r.loan_number,
    'amount', r.amount,
    'status', r.status,
    'issued_at', r.issued_at,
    'issued_at_display', r.issued_at_display,
    'payload', r.payload,
    'verified_by', 'Kredia'
  );
$$;

REVOKE EXECUTE ON FUNCTION private.prevent_official_receipt_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.serialize_public_receipt(public.official_receipts) FROM PUBLIC, anon, authenticated;

-- RPC 1: Emitir comprobante oficial (idempotente e inmutable por operación)
CREATE OR REPLACE FUNCTION public.issue_official_receipt(
  p_receipt_type TEXT,
  p_entity_id TEXT,
  p_company_name TEXT,
  p_route_name TEXT,
  p_customer_name TEXT,
  p_customer_document TEXT,
  p_loan_number TEXT,
  p_amount NUMERIC,
  p_issued_at_display TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_office_id TEXT;
  v_type TEXT;
  v_entity TEXT;
  v_existing public.official_receipts;
  v_inserted public.official_receipts;
  v_code TEXT;
  v_company TEXT;
  v_display TEXT;
BEGIN
  v_office_id := private.current_office_id();
  IF v_office_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión no autorizada para emitir comprobantes.');
  END IF;

  v_type := upper(trim(COALESCE(p_receipt_type, '')));
  IF v_type NOT IN ('PAYMENT', 'LOAN', 'RENEWAL') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tipo de comprobante inválido.');
  END IF;

  v_entity := trim(COALESCE(p_entity_id, ''));
  IF length(v_entity) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Identificador de operación requerido.');
  END IF;

  -- Si ya existe un comprobante emitido para esta operación, devolver el ORIGINAL inmutable
  SELECT * INTO v_existing
  FROM public.official_receipts
  WHERE office_id = v_office_id
    AND receipt_type = v_type
    AND entity_id = v_entity
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'existed', true,
      'receipt', private.serialize_public_receipt(v_existing)
    );
  END IF;

  v_company := NULLIF(trim(COALESCE(p_company_name, '')), '');
  IF v_company IS NULL THEN
    SELECT company_name INTO v_company FROM public.offices WHERE id = v_office_id LIMIT 1;
  END IF;
  v_company := COALESCE(v_company, 'Kredia');

  v_display := NULLIF(trim(COALESCE(p_issued_at_display, '')), '');
  IF v_display IS NULL THEN
    v_display := to_char(NOW() AT TIME ZONE 'America/Bogota', 'DD/MM/YY HH24:MI:SS');
  END IF;

  v_code := 'KRD-' || to_char(NOW() AT TIME ZONE 'America/Bogota', 'YYMMDD') || '-' || upper(encode(extensions.gen_random_bytes(4), 'hex'));

  INSERT INTO public.official_receipts (
    receipt_code,
    office_id,
    receipt_type,
    entity_id,
    company_name,
    route_name,
    customer_name,
    customer_document,
    loan_number,
    amount,
    status,
    issued_at,
    issued_at_display,
    payload
  ) VALUES (
    v_code,
    v_office_id,
    v_type,
    v_entity,
    v_company,
    COALESCE(trim(p_route_name), ''),
    COALESCE(NULLIF(trim(p_customer_name), ''), 'Cliente'),
    COALESCE(trim(p_customer_document), ''),
    COALESCE(trim(p_loan_number), ''),
    GREATEST(0, COALESCE(p_amount, 0)),
    'APPROVED',
    NOW(),
    v_display,
    COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (office_id, receipt_type, entity_id) DO NOTHING
  RETURNING * INTO v_inserted;

  IF v_inserted.receipt_code IS NULL THEN
    SELECT * INTO v_inserted
    FROM public.official_receipts
    WHERE office_id = v_office_id
      AND receipt_type = v_type
      AND entity_id = v_entity
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'existed', false,
    'receipt', private.serialize_public_receipt(v_inserted)
  );
END;
$$;

-- RPC 2: Consulta pública de un único comprobante por código exacto (sin login, sin enumeración)
CREATE OR REPLACE FUNCTION public.get_official_receipt(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code TEXT;
  v_row public.official_receipts;
BEGIN
  v_code := upper(trim(COALESCE(p_code, '')));
  IF length(v_code) < 10 OR v_code NOT LIKE 'KRD-%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Código de comprobante inválido.');
  END IF;

  SELECT * INTO v_row
  FROM public.official_receipts
  WHERE receipt_code = v_code
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Comprobante no encontrado.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'receipt', private.serialize_public_receipt(v_row)
  );
END;
$$;

-- RPC 3: Anulación auditada (solo cambia status APPROVED -> REVERSED/CANCELLED dentro de la misma oficina)
CREATE OR REPLACE FUNCTION public.void_official_receipt(
  p_receipt_type TEXT,
  p_entity_id TEXT,
  p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_office_id TEXT;
  v_type TEXT;
  v_status TEXT;
  v_updated INTEGER;
BEGIN
  v_office_id := private.current_office_id();
  IF v_office_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sesión no autorizada.');
  END IF;

  v_type := upper(trim(COALESCE(p_receipt_type, '')));
  v_status := upper(trim(COALESCE(p_new_status, '')));
  IF v_type NOT IN ('PAYMENT', 'LOAN', 'RENEWAL') OR v_status NOT IN ('REVERSED', 'CANCELLED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Parámetros de anulación inválidos.');
  END IF;

  PERFORM set_config('kredia.allow_receipt_void', 'true', true);

  UPDATE public.official_receipts
  SET status = v_status
  WHERE office_id = v_office_id
    AND receipt_type = v_type
    AND entity_id = trim(COALESCE(p_entity_id, ''))
    AND status = 'APPROVED';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'updated', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_official_receipt(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_official_receipt(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.void_official_receipt(TEXT, TEXT, TEXT) TO anon, authenticated;
