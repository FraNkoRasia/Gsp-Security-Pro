CREATE TABLE IF NOT EXISTS public.credenciales_administradores (
  id_usuario uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  dni text NOT NULL CHECK (dni ~ '^[0-9]{7,8}$'),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.credenciales_administradores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.credenciales_administradores FROM anon, authenticated;
GRANT ALL ON TABLE public.credenciales_administradores TO service_role;
