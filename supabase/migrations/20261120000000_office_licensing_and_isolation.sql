-- =========================================================================
-- MIGRACIÓN: REGISTRO COMERCIAL DE OFICINAS, LICENCIAS Y VINCULACIÓN
-- =========================================================================
-- Agrega control de licencias y código de activación único a public.offices
-- para aislar múltiples oficinas compradoras sin depender del nombre comercial.
-- =========================================================================

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS activation_code TEXT,
  ADD COLUMN IF NOT EXISTS license_status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (license_status IN ('ACTIVE', 'SUSPENDED', 'EXPIRED')),
  ADD COLUMN IF NOT EXISTS license_plan TEXT NOT NULL DEFAULT 'LIFETIME'
    CHECK (license_plan IN ('LIFETIME', 'MONTHLY', 'ANNUAL')),
  ADD COLUMN IF NOT EXISTS license_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS owner_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_offices_activation_code
  ON public.offices (UPPER(activation_code))
  WHERE activation_code IS NOT NULL AND activation_code <> '';

-- Unicidad global de usuario entre todas las oficinas (permite login directo solo con usuario + contraseña)
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_global_username
  ON public.users (LOWER(TRIM(username)));

-- Función auxiliar para validar estado de licencia de una oficina
CREATE OR REPLACE FUNCTION public.is_office_license_active(p_office_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.offices o
    WHERE o.id = p_office_id
      AND o.license_status = 'ACTIVE'
      AND (o.license_expires_at IS NULL OR o.license_expires_at > NOW())
  );
$$;

-- Función de consulta segura por código de activación (para vinculación de dispositivos)
CREATE OR REPLACE FUNCTION public.lookup_office_by_activation_code(p_activation_code TEXT)
RETURNS TABLE (
  id TEXT,
  company_name TEXT,
  tax_id TEXT,
  city TEXT,
  address TEXT,
  support_phone TEXT,
  recovery_pin TEXT,
  settings JSONB,
  activation_code TEXT,
  license_status TEXT,
  license_plan TEXT,
  license_expires_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    o.id,
    o.company_name,
    o.tax_id,
    o.city,
    o.address,
    o.support_phone,
    o.recovery_pin,
    o.settings,
    o.activation_code,
    CASE
      WHEN o.license_status = 'ACTIVE' AND o.license_expires_at IS NOT NULL AND o.license_expires_at <= NOW()
        THEN 'EXPIRED'
      ELSE o.license_status
    END AS license_status,
    o.license_plan,
    o.license_expires_at
  FROM public.offices o
  WHERE UPPER(TRIM(o.activation_code)) = UPPER(TRIM(p_activation_code))
  LIMIT 1;
$$;
