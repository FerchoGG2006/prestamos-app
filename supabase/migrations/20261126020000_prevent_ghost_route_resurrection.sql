-- =========================================================================
-- MIGRACIÓN: CANDADO ANTI-RESURRECCIÓN DE RUTAS FANTASMA EN POSTGRESQL
-- =========================================================================
-- Impide a nivel de motor de base de datos que cualquier dispositivo viejo
-- (con caché local previa) vuelva a insertar una ruta vacía sin cobrador
-- (collector_id IS NULL) cuando la oficina ya tiene al menos 1 ruta activa.
-- Usa RETURN NULL en BEFORE INSERT para descartar silenciosamente solo esa
-- fila fantasma sin interrumpir ni lanzar errores al resto del lote UPSERT.
-- =========================================================================

CREATE OR REPLACE FUNCTION private.prevent_ghost_route_resurrection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.collector_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.routes same
       WHERE same.id = NEW.id
     )
     AND EXISTS (
       SELECT 1 FROM public.routes existing
       WHERE existing.office_id = NEW.office_id
         AND existing.id <> NEW.id
     )
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_ghost_route_resurrection ON public.routes;
CREATE TRIGGER trg_prevent_ghost_route_resurrection
  BEFORE INSERT ON public.routes
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_ghost_route_resurrection();

-- Limpieza segura (0 clientes y 0 créditos) de las rutas fantasma re-insertadas
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
);
