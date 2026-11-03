create table if not exists public.supervisiones_operativas (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null references public.empresas(id) on delete restrict,
  id_objetivo uuid not null references public.objetivos(id) on delete restrict,
  id_supervisor uuid not null references public.perfiles(id) on delete restrict,
  id_vigilador uuid null references public.vigiladores(id) on delete set null,
  fecha_supervision timestamptz not null default now(),
  resultado text not null check (resultado in ('conforme','con_observaciones')),
  observaciones text not null,
  creado_en timestamptz not null default now(),
  constraint supervisiones_operativas_observaciones_no_vacias check (length(trim(observaciones)) > 0)
);

create index if not exists idx_supervisiones_operativas_objetivo_fecha
  on public.supervisiones_operativas (id_objetivo, fecha_supervision desc);
create index if not exists idx_supervisiones_operativas_supervisor_fecha
  on public.supervisiones_operativas (id_supervisor, fecha_supervision desc);

alter table public.supervisiones_operativas enable row level security;

drop policy if exists "supervisiones operativas lectura autorizada" on public.supervisiones_operativas;
create policy "supervisiones operativas lectura autorizada"
on public.supervisiones_operativas for select to authenticated
using (
  exists (
    select 1 from public.perfiles p
    where p.id = (select auth.uid())
      and p.activo = true
      and (
        p.rol = 'super_administrador'
        or (p.rol = 'administrador' and p.id_empresa = supervisiones_operativas.id_empresa)
        or (p.rol = 'supervisor' and p.id = supervisiones_operativas.id_supervisor
          and exists (
            select 1 from public.objetivos o
            where o.id = supervisiones_operativas.id_objetivo
              and o.id_empresa = supervisiones_operativas.id_empresa
              and o.id_supervisor = p.id
          ))
      )
  )
);

drop policy if exists "supervisor registra controles de sus objetivos" on public.supervisiones_operativas;
create policy "supervisor registra controles de sus objetivos"
on public.supervisiones_operativas for insert to authenticated
with check (
  id_supervisor = (select auth.uid())
  and exists (
    select 1 from public.perfiles p
    join public.objetivos o on o.id = supervisiones_operativas.id_objetivo
    where p.id = (select auth.uid())
      and p.activo = true
      and p.rol = 'supervisor'
      and p.id_empresa = supervisiones_operativas.id_empresa
      and o.id_empresa = supervisiones_operativas.id_empresa
      and o.activo = true
      and o.id_supervisor = p.id
  )
  and (
    id_vigilador is null
    or exists (
      select 1 from public.asignaciones a
      join public.vigiladores v on v.id = a.id_vigilador
      where a.id_objetivo = supervisiones_operativas.id_objetivo
        and a.id_empresa = supervisiones_operativas.id_empresa
        and a.id_vigilador = supervisiones_operativas.id_vigilador
        and a.activa = true
        and a.fecha_inicio <= current_date
        and (a.fecha_fin is null or a.fecha_fin >= current_date)
        and v.id_empresa = supervisiones_operativas.id_empresa
        and v.activo = true
    )
  )
);

revoke all on public.supervisiones_operativas from anon;
grant select, insert on public.supervisiones_operativas to authenticated;
revoke update, delete on public.supervisiones_operativas from authenticated;