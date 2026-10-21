-- Datos administrativos de empresa y DNI de acceso inicial del administrador.
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS art_aseguradora text;

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS dni text;

COMMENT ON COLUMN public.empresas.art_aseguradora IS 'Aseguradora de Riesgos del Trabajo declarada por la empresa.';
COMMENT ON COLUMN public.perfiles.dni IS 'DNI del usuario para credencial inicial y recuperación administrativa; acceso restringido por RLS.';
