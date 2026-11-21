-- =========================================================================
-- MIGRACIÓN: RLS ESTRICTO POR OFICINA + SESIONES CRIPTOGRÁFICAS + RPC VENDEDOR
-- =========================================================================
-- Elimina TODAS las políticas abiertas USING (true) para anon.
-- Aísla el 100% de las tablas por office_id a nivel de motor PostgreSQL
-- mediante tokens de sesión firmados (x-kredia-session) emitidos tras
-- verificar credenciales en servidor (authenticate_kredia_user).
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Esquema privado para sesiones y secreto del vendedor (inaccesible vía REST)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.office_sessions (
  token_hash TEXT PRIMARY KEY,
  office_id TEXT NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_office_sessions_office_id
  ON private.office_sessions (office_id);

CREATE TABLE IF NOT EXISTS private.vendor_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  vendor_key_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO private.vendor_config (id, vendor_key_hash)
VALUES (1, '2cff23eb4eb15f5befdf48a9d1206daeb4beee6019a1fa9305650fbbea387e51')
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated;

-- 2. Verificador de contraseñas en servidor (soporta sha256$salt$hash y PBKDF2-HMAC-SHA256 65536)
CREATE OR REPLACE FUNCTION private.verify_kredia_password(p_raw TEXT, p_stored TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_parts TEXT[];
  v_salt TEXT;
  v_expected TEXT;
  v_computed TEXT;
  v_salt_bytes BYTEA;
  v_key_bytes BYTEA;
  v_u BYTEA;
  v_t BIT(256);
  v_hex TEXT := '';
  v_i INTEGER;
BEGIN
  IF p_raw IS NULL OR p_stored IS NULL OR length(trim(p_raw)) = 0 OR length(trim(p_stored)) = 0 THEN
    RETURN FALSE;
  END IF;

  -- Formato App Móvil/Web: sha256$<salt>$<hash>
  IF trim(p_stored) LIKE 'sha256$%' THEN
    v_parts := string_to_array(trim(p_stored), '$');
    IF array_length(v_parts, 1) <> 3 THEN
      RETURN FALSE;
    END IF;
    v_salt := v_parts[2];
    v_expected := lower(v_parts[3]);
    v_computed := encode(extensions.digest(convert_to(v_salt || ':' || trim(p_raw), 'UTF8'), 'sha256'), 'hex');
    RETURN v_computed = v_expected;
  END IF;

  -- Formato Escritorio JavaFX (PasswordHasher.java): <32-hex-salt>$<64-hex-pbkdf2>
  IF position('$' IN trim(p_stored)) > 0 THEN
    v_parts := string_to_array(trim(p_stored), '$');
    IF array_length(v_parts, 1) = 2 AND length(v_parts[1]) = 32 AND length(v_parts[2]) = 64 THEN
      v_salt_bytes := decode(v_parts[1], 'hex');
      v_expected := lower(v_parts[2]);
      v_key_bytes := convert_to(trim(p_raw), 'UTF8');
      v_u := extensions.hmac(v_salt_bytes || E'\\x00000001'::bytea, v_key_bytes, 'sha256');
      v_t := ('x' || encode(v_u, 'hex'))::bit(256);
      FOR v_i IN 2..65536 LOOP
        v_u := extensions.hmac(v_u, v_key_bytes, 'sha256');
        v_t := v_t # (('x' || encode(v_u, 'hex'))::bit(256));
      END LOOP;
      FOR v_i IN 0..7 LOOP
        v_hex := v_hex || lpad(to_hex(substring(v_t FROM v_i * 32 + 1 FOR 32)::bit(32)::int), 8, '0');
      END LOOP;
      RETURN lower(v_hex) = v_expected;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

-- 3. Función RLS de contexto: devuelve el office_id verificado del token x-kredia-session (solo si la licencia está ACTIVE)
CREATE OR REPLACE FUNCTION private.current_office_id()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_headers JSONB;
  v_token TEXT;
  v_hash TEXT;
  v_office_id TEXT;
BEGIN
  v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
  IF v_headers IS NULL THEN
    RETURN NULL;
  END IF;

  v_token := NULLIF(TRIM(v_headers ->> 'x-kredia-session'), '');
  IF v_token IS NULL THEN
    RETURN NULL;
  END IF;

  v_hash := encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex');

  SELECT s.office_id INTO v_office_id
  FROM private.office_sessions s
  JOIN public.offices o ON o.id = s.office_id
  WHERE s.token_hash = v_hash
    AND s.revoked = FALSE
    AND s.expires_at > NOW()
    AND o.license_status = 'ACTIVE'
    AND (o.license_expires_at IS NULL OR o.license_expires_at > NOW())
  LIMIT 1;

  RETURN v_office_id;
END;
$$;

-- Verificación del secreto maestro del vendedor (solo Panel Comercial)
CREATE OR REPLACE FUNCTION private.is_valid_vendor_request()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_headers JSONB;
  v_vendor_key TEXT;
  v_hash TEXT;
BEGIN
  v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
  IF v_headers IS NULL THEN
    RETURN FALSE;
  END IF;
  v_vendor_key := NULLIF(TRIM(v_headers ->> 'x-kredia-vendor-key'), '');
  IF v_vendor_key IS NULL THEN
    RETURN FALSE;
  END IF;
  v_hash := encode(extensions.digest(convert_to(v_vendor_key, 'UTF8'), 'sha256'), 'hex');
  RETURN EXISTS (
    SELECT 1 FROM private.vendor_config WHERE id = 1 AND vendor_key_hash = v_hash
  );
END;
$$;

GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.current_office_id() TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.verify_kredia_password(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.is_valid_vendor_request() FROM PUBLIC, anon, authenticated;

-- 4. RPC pública de autenticación segura: valida clave en servidor y emite token de sesión de 30 días
CREATE OR REPLACE FUNCTION public.authenticate_kredia_user(p_username TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user RECORD;
  v_office RECORD;
  v_raw_token TEXT;
  v_token_hash TEXT;
  v_eff_status TEXT;
BEGIN
  IF p_username IS NULL OR length(trim(p_username)) = 0 OR p_password IS NULL OR length(trim(p_password)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ingresa tu usuario y contraseña.');
  END IF;

  SELECT * INTO v_user
  FROM public.users u
  WHERE lower(trim(u.username)) = lower(trim(p_username))
    AND u.is_active = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Credenciales incorrectas o usuario no registrado.');
  END IF;

  IF NOT private.verify_kredia_password(p_password, v_user.password_hash) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Credenciales incorrectas. Verifica tu usuario y contraseña.');
  END IF;

  SELECT * INTO v_office
  FROM public.offices o
  WHERE o.id = v_user.office_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La oficina asociada no existe.');
  END IF;

  IF v_office.license_status = 'ACTIVE' AND v_office.license_expires_at IS NOT NULL AND v_office.license_expires_at <= NOW() THEN
    v_eff_status := 'EXPIRED';
  ELSE
    v_eff_status := v_office.license_status;
  END IF;

  IF v_eff_status <> 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'license_status', v_eff_status,
      'error', CASE
        WHEN v_eff_status = 'EXPIRED' THEN 'El acceso de tu oficina ha vencido. Comunícate con soporte.'
        ELSE 'El acceso de tu oficina se encuentra pausado. Comunícate con soporte.'
      END
    );
  END IF;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(convert_to(v_raw_token, 'UTF8'), 'sha256'), 'hex');

  INSERT INTO private.office_sessions (token_hash, office_id, user_id, role, expires_at)
  VALUES (v_token_hash, v_office.id, v_user.id, v_user.role, NOW() + interval '30 days');

  RETURN jsonb_build_object(
    'ok', true,
    'session_token', v_raw_token,
    'office', jsonb_build_object(
      'id', v_office.id,
      'company_name', v_office.company_name,
      'tax_id', v_office.tax_id,
      'city', v_office.city,
      'address', v_office.address,
      'support_phone', v_office.support_phone,
      'activation_code', v_office.activation_code,
      'license_status', v_eff_status,
      'license_plan', v_office.license_plan,
      'license_expires_at', v_office.license_expires_at,
      'settings', v_office.settings
    ),
    'user', jsonb_build_object(
      'id', v_user.id,
      'office_id', v_user.office_id,
      'name', v_user.name,
      'username', v_user.username,
      'role', v_user.role,
      'phone', v_user.phone,
      'is_active', v_user.is_active,
      'assigned_route_ids', v_user.assigned_route_ids,
      'created_at', v_user.created_at
    )
  );
END;
$$;

-- 5. RPCs protegidas del Panel Comercial del Vendedor (exigen header x-kredia-vendor-key válido)
CREATE OR REPLACE FUNCTION public.vendor_list_offices()
RETURNS SETOF public.offices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_valid_vendor_request() THEN
    RAISE EXCEPTION 'VENDOR_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.offices ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_username_exists(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_valid_vendor_request() THEN
    RAISE EXCEPTION 'VENDOR_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.users WHERE lower(trim(username)) = lower(trim(p_username))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_upsert_office(
  p_id TEXT,
  p_company_name TEXT,
  p_activation_code TEXT,
  p_license_status TEXT,
  p_license_plan TEXT,
  p_license_expires_at TIMESTAMPTZ,
  p_owner_name TEXT,
  p_support_phone TEXT,
  p_city TEXT,
  p_recovery_pin TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_valid_vendor_request() THEN
    RAISE EXCEPTION 'VENDOR_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.offices (
    id, company_name, activation_code, license_status, license_plan,
    license_expires_at, owner_name, support_phone, city, recovery_pin, updated_at
  ) VALUES (
    p_id, p_company_name, p_activation_code, COALESCE(p_license_status, 'ACTIVE'), COALESCE(p_license_plan, 'LIFETIME'),
    p_license_expires_at, COALESCE(p_owner_name, ''), COALESCE(p_support_phone, ''), COALESCE(p_city, ''), COALESCE(p_recovery_pin, ''), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    company_name = EXCLUDED.company_name,
    activation_code = EXCLUDED.activation_code,
    license_status = EXCLUDED.license_status,
    license_plan = EXCLUDED.license_plan,
    license_expires_at = EXCLUDED.license_expires_at,
    owner_name = EXCLUDED.owner_name,
    support_phone = EXCLUDED.support_phone,
    city = EXCLUDED.city,
    recovery_pin = EXCLUDED.recovery_pin,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_upsert_user(
  p_id TEXT,
  p_office_id TEXT,
  p_name TEXT,
  p_username TEXT,
  p_password_hash TEXT,
  p_role TEXT,
  p_assigned_route_ids JSONB,
  p_phone TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_valid_vendor_request() THEN
    RAISE EXCEPTION 'VENDOR_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.users (
    id, office_id, name, username, password_hash, role, assigned_route_ids, phone, is_active, updated_at
  ) VALUES (
    p_id, p_office_id, p_name, lower(trim(p_username)), p_password_hash, p_role,
    COALESCE(p_assigned_route_ids, '[]'::jsonb), COALESCE(p_phone, ''), TRUE, NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    username = EXCLUDED.username,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    assigned_route_ids = EXCLUDED.assigned_route_ids,
    phone = EXCLUDED.phone,
    is_active = TRUE,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_upsert_route(
  p_id TEXT,
  p_office_id TEXT,
  p_name TEXT,
  p_code TEXT,
  p_collector_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_valid_vendor_request() THEN
    RAISE EXCEPTION 'VENDOR_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.routes (id, office_id, name, code, collector_id, is_active, updated_at)
  VALUES (p_id, p_office_id, p_name, p_code, p_collector_id, TRUE, NOW())
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    code = EXCLUDED.code,
    collector_id = EXCLUDED.collector_id,
    is_active = TRUE,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_set_license_status(p_office_id TEXT, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_valid_vendor_request() THEN
    RAISE EXCEPTION 'VENDOR_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  UPDATE public.offices SET license_status = p_status, updated_at = NOW() WHERE id = p_office_id;
  IF p_status <> 'ACTIVE' THEN
    UPDATE private.office_sessions SET revoked = TRUE WHERE office_id = p_office_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_regenerate_code(p_office_id TEXT, p_new_code TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_valid_vendor_request() THEN
    RAISE EXCEPTION 'VENDOR_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  UPDATE public.offices SET activation_code = p_new_code, updated_at = NOW() WHERE id = p_office_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.authenticate_kredia_user(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_list_offices() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_username_exists(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_upsert_office(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_upsert_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_upsert_route(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_set_license_status(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_regenerate_code(TEXT, TEXT) TO anon, authenticated;

-- Revocar función pública vieja de lookup abierto por código
REVOKE EXECUTE ON FUNCTION public.lookup_office_by_activation_code(TEXT) FROM PUBLIC, anon, authenticated;

-- 6. REEMPLAZAR TODAS LAS POLÍTICAS ABIERTAS POR RLS ESTRICTO POR OFFICE_ID
DO $$
DECLARE
  t TEXT;
BEGIN
  -- Offices (id = current_office_id)
  DROP POLICY IF EXISTS "Allow anon all on offices" ON public.offices;
  DROP POLICY IF EXISTS "Strict office isolation on offices" ON public.offices;
  CREATE POLICY "Strict office isolation on offices"
    ON public.offices
    FOR ALL
    TO anon, authenticated
    USING (id = (SELECT private.current_office_id()))
    WITH CHECK (id = (SELECT private.current_office_id()));

  -- Tablas operativas multi-tenant (office_id = current_office_id)
  FOREACH t IN ARRAY ARRAY[
    'users', 'routes', 'customers', 'loans', 'installments',
    'payments', 'renewals', 'daily_settlements', 'cash_movements'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow anon all on %I" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Strict office isolation on %I" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Strict office isolation on %I" ON public.%I FOR ALL TO anon, authenticated USING (office_id = (SELECT private.current_office_id())) WITH CHECK (office_id = (SELECT private.current_office_id()))',
      t, t
    );
  END LOOP;

  -- Libro Mayor Inmutable (financial_events: SOLO SELECT e INSERT estrictos por office_id)
  DROP POLICY IF EXISTS "Allow anon select on financial_events" ON public.financial_events;
  DROP POLICY IF EXISTS "Allow anon insert on financial_events" ON public.financial_events;
  DROP POLICY IF EXISTS "Strict office select on financial_events" ON public.financial_events;
  DROP POLICY IF EXISTS "Strict office insert on financial_events" ON public.financial_events;

  CREATE POLICY "Strict office select on financial_events"
    ON public.financial_events
    FOR SELECT
    TO anon, authenticated
    USING (office_id = (SELECT private.current_office_id()));

  CREATE POLICY "Strict office insert on financial_events"
    ON public.financial_events
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (office_id = (SELECT private.current_office_id()));
END $$;

-- 7. Vista de saldos del libro mayor con security_invoker = true (hereda RLS del invocador)
CREATE OR REPLACE VIEW public.office_ledger_balances
WITH (security_invoker = true) AS
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
