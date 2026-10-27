-- GSP Security Pro — nuevo rol independiente para encargados de empresa.
-- No modifica ni elimina el rol supervisor existente.
-- Cambio aditivo: permite almacenar el nuevo rol en perfiles.

ALTER TABLE public.perfiles
  DROP CONSTRAINT IF EXISTS perfiles_rol_check;

ALTER TABLE public.perfiles
  ADD CONSTRAINT perfiles_rol_check
  CHECK (rol IN (
    'super_administrador',
    'administrador',
    'supervisor',
    'encargado_empresa',
    'vigilador'
  ));
