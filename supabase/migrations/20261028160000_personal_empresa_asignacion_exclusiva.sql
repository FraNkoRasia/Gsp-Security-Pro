-- DNI separado del perfil público y asignación exclusiva por objetivo para personal de empresa.
create table if not exists public.credenciales_personal_objetivo (
  id_usuario uuid primary key references auth.users(id) on delete cascade,
  id_empresa uuid not null references public.empresas(id) on delete cascade,
  dni text not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint credenciales_personal_objetivo_dni_empresa_unique unique (id_empresa, dni)
);

alter table public.credenciales_personal_objetivo enable row level security;
revoke all on public.credenciales_personal_objetivo from anon, authenticated;

create unique index if not exists objetivos_id_supervisor_unico
  on public.objetivos (id_supervisor) where id_supervisor is not null;
create unique index if not exists objetivos_id_encargado_empresa_unico
  on public.objetivos (id_encargado_empresa) where id_encargado_empresa is not null;

create index if not exists perfiles_empresa_rol_activo_idx
  on public.perfiles (id_empresa, rol, activo);
