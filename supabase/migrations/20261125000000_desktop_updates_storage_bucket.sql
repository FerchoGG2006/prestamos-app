-- =========================================================================
-- MIGRACIÓN: BUCKET PÚBLICO DE ACTUALIZACIONES OTA PARA DESKTOP (desktop-updates)
-- =========================================================================
-- Permite que todos los clientes Kredia Desktop descarguen parches ligeros (~1.6 MB)
-- y latest.json por HTTPS público (SELECT), mientras la publicación (INSERT/UPDATE/DELETE)
-- queda restringida exclusivamente a service_role (bypass RLS).
-- =========================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('desktop-updates', 'desktop-updates', true, 104857600)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 104857600;

DROP POLICY IF EXISTS "Public read desktop updates" ON storage.objects;
CREATE POLICY "Public read desktop updates"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'desktop-updates');
