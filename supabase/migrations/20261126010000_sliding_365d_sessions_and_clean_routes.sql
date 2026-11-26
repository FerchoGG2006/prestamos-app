-- =========================================================================
-- MIGRACIÓN 017: SESIONES BANCARIAS DESLIZANTES DE 365 DÍAS + RUTAS LIMPIAS
-- =========================================================================
-- 1. Eleva la vigencia de private.office_sessions de 30 días a 365 días
--    y extiende EN SITIO todas las sesiones activas actuales (cero cortes).
-- 2. Crea RPC public.refresh_kredia_session() para renovar silenciosamente
--    el vencimiento en cada arranque/reanudación sin mutar current_office_id().
-- 3. Crea RPC public.delete_empty_route(p_route_id) aislada por RLS/office_id
--    que solo elimina rutas vacías (0 clientes, 0 créditos) preservando >= 1 ruta.
-- 4. Limpieza explícitamente aprobada de rutas fantasma vacías sin cobrador
--    (rt-plancha-001 en Inversiones La Plancha y route-norte en Inversiones FBV),
--    protegida con guardas estrictas NOT EXISTS (cero pérdida de datos).
-- =========================================================================

-- 1. Actualizar authenticate_kredia_user para emitir tokens de 365 días
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
  VALUES (v_token_hash, v_office.id, v_user.id, v_user.role, NOW() + interval '365 days');

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

GRANT EXECUTE ON FUNCTION public.authenticate_kredia_user(TEXT, TEXT) TO anon, authenticated;

-- 2. Extender en sitio TODAS las sesiones activas actuales a 365 días sin revocar ni desconectar a nadie
UPDATE private.office_sessions
SET expires_at = GREATEST(expires_at, NOW() + interval '365 days')
WHERE revoked = FALSE
  AND expires_at > NOW();

-- 3. RPC silenciosa de renovación deslizante (mantiene private.current_office_id() 100% STABLE/read-only)
CREATE OR REPLACE FUNCTION public.refresh_kredia_session()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_headers JSONB;
  v_token TEXT;
  v_hash TEXT;
  v_session RECORD;
  v_eff_status TEXT;
  v_new_expiry TIMESTAMPTZ;
BEGIN
  v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
  IF v_headers IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'session_invalid', true);
  END IF;

  v_token := NULLIF(TRIM(v_headers ->> 'x-kredia-session'), '');
  IF v_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'session_invalid', true);
  END IF;

  v_hash := encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex');

  SELECT
    s.token_hash,
    s.office_id,
    s.user_id,
    s.role,
    o.license_status,
    o.license_expires_at
  INTO v_session
  FROM private.office_sessions s
  JOIN public.offices o ON o.id = s.office_id
  WHERE s.token_hash = v_hash
    AND s.revoked = FALSE
    AND s.expires_at > NOW()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'session_invalid', true);
  END IF;

  IF v_session.license_status = 'ACTIVE'
     AND v_session.license_expires_at IS NOT NULL
     AND v_session.license_expires_at <= NOW() THEN
    v_eff_status := 'EXPIRED';
  ELSE
    v_eff_status := v_session.license_status;
  END IF;

  IF v_eff_status <> 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'session_invalid', false,
      'license_status', v_eff_status
    );
  END IF;

  v_new_expiry := NOW() + interval '365 days';
  UPDATE private.office_sessions
  SET expires_at = GREATEST(expires_at, v_new_expiry)
  WHERE token_hash = v_hash;

  RETURN jsonb_build_object(
    'ok', true,
    'office_id', v_session.office_id,
    'expires_at', v_new_expiry
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_kredia_session() TO anon, authenticated;

-- 4. RPC segura para eliminar rutas vacías desde Móvil / Desktop (aislada por office_id de la sesión)
CREATE OR REPLACE FUNCTION public.delete_empty_route(p_route_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_office_id TEXT;
  v_route_id TEXT;
  v_routes_count INTEGER;
  v_cust_count INTEGER;
  v_loan_count INTEGER;
  v_target RECORD;
BEGIN
  v_office_id := private.current_office_id();
  IF v_office_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'session_invalid', true, 'error', 'Sesión no válida.');
  END IF;

  v_route_id := NULLIF(TRIM(p_route_id), '');
  IF v_route_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Identificador de ruta inválido.');
  END IF;

  SELECT id, collector_id INTO v_target
  FROM public.routes
  WHERE id = v_route_id AND office_id = v_office_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'deleted', false, 'already_absent', true);
  END IF;

  SELECT COUNT(*) INTO v_routes_count
  FROM public.routes
  WHERE office_id = v_office_id;

  IF v_routes_count <= 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La oficina debe conservar al menos 1 ruta activa.');
  END IF;

  SELECT COUNT(*) INTO v_cust_count
  FROM public.customers
  WHERE office_id = v_office_id AND route_id = v_route_id;

  SELECT COUNT(*) INTO v_loan_count
  FROM public.loans
  WHERE office_id = v_office_id AND route_id = v_route_id;

  IF v_cust_count > 0 OR v_loan_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', format('Esta ruta tiene %s cliente(s) y %s crédito(s) asociados. Trasládalos antes de eliminarla.', v_cust_count, v_loan_count)
    );
  END IF;

  DELETE FROM public.routes
  WHERE id = v_route_id AND office_id = v_office_id;

  RETURN jsonb_build_object('ok', true, 'deleted', true, 'route_id', v_route_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_empty_route(TEXT) TO anon, authenticated;

-- 5. Limpieza segura (aprobada por el usuario) de rutas fantasma vacías y sin cobrador
DELETE FROM public.routes r
WHERE (
  (r.office_id = 'off-c995615df9' AND r.id = 'rt-plancha-001' AND r.collector_id IS NULL)
  OR
  (r.office_id = 'off-fbv-001' AND r.id = 'route-norte' AND r.collector_id IS NULL)
)
AND EXISTS (
  SELECT 1 FROM public.routes other
  WHERE other.office_id = r.office_id AND other.id <> r.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.customers c WHERE c.office_id = r.office_id AND c.route_id = r.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.loans l WHERE l.office_id = r.office_id AND l.route_id = r.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.payments p WHERE p.office_id = r.office_id AND p.route_id = r.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.cash_movements cm WHERE cm.office_id = r.office_id AND cm.route_id = r.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.daily_settlements ds WHERE ds.office_id = r.office_id AND ds.route_id = r.id
);
