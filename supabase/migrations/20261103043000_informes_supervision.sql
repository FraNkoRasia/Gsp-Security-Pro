-- Informes formales del rol Supervisor con seguimiento inmutable.
create table if not exists public.informes_supervision (
  id uuid primary key default gen_random_uuid(),
  id_empresa uuid not null references public.empresas(id) on delete restrict,
  id_objetivo uuid not null references public.objetivos(id) on delete restrict,
  id_supervisor uuid not null references public.perfiles(id) on delete restrict,
  supervisor_nombre text not null,
  id_vigilador uuid not null references public.vigiladores(id) on delete restrict,
  nombre_vigilante text not null,
  tipo text not null check (tipo in ('incumplimiento','observacion','incidente','supervision')),
  gravedad text not null check (gravedad in ('baja','media','alta','critica')),
  descripcion text not null check (length(btrim(descripcion)) >= 10),
  accion_tomada text,
  observaciones text,
  estado text not null default 'registrado' check (estado in ('registrado','pendiente_revision','en_seguimiento','resuelto')),
  creado_por uuid not null references public.perfiles(id) on delete restrict,
  creado_en timestamptz not null default now(),
  constraint informes_supervision_objetivo_empresa_fk
    foreign key (id_objetivo,id_empresa) references public.objetivos(id,id_empresa) deferrable initially immediate
);

create index if not exists idx_informes_supervision_empresa_fecha
  on public.informes_supervision(id_empresa,creado_en desc);
create index if not exists idx_informes_supervision_objetivo_fecha
  on public.informes_supervision(id_objetivo,creado_en desc);
create index if not exists idx_informes_supervision_vigilador_fecha
  on public.informes_supervision(id_vigilador,creado_en desc);

create table if not exists public.informes_supervision_actuaciones (
  id uuid primary key default gen_random_uuid(),
  id_informe uuid not null references public.informes_supervision(id) on delete restrict,
  id_autor uuid not null references public.perfiles(id) on delete restrict,
  autor_nombre text not null,
  tipo text not null check (tipo in ('registro','aclaracion','seguimiento','cambio_estado')),
  estado text check (estado is null or estado in ('registrado','pendiente_revision','en_seguimiento','resuelto')),
  comentario text,
  creado_en timestamptz not null default now(),
  constraint informes_supervision_actuacion_contenido_ck
    check (tipo = 'registro' or (nullif(btrim(comentario),'') is not null))
);
create index if not exists idx_informes_supervision_actuaciones_informe
  on public.informes_supervision_actuaciones(id_informe,creado_en);

alter table public.informes_supervision enable row level security;
alter table public.informes_supervision_actuaciones enable row level security;

grant select, insert on public.informes_supervision to authenticated;
grant update (estado) on public.informes_supervision to authenticated;
grant select, insert on public.informes_supervision_actuaciones to authenticated;
revoke update, delete on public.informes_supervision from authenticated;
revoke update, delete on public.informes_supervision_actuaciones from authenticated;

drop policy if exists "informes supervision lectura autorizada" on public.informes_supervision;
create policy "informes supervision lectura autorizada"
on public.informes_supervision for select to authenticated
using (
  exists (
    select 1 from public.perfiles p
    where p.id = (select auth.uid()) and p.activo = true
      and (
        (p.rol = 'super_administrador')
        or (p.rol = 'administrador' and p.id_empresa = informes_supervision.id_empresa)
        or (p.rol = 'supervisor' and p.id_empresa = informes_supervision.id_empresa
          and exists (select 1 from public.objetivos o
            where o.id = informes_supervision.id_objetivo
              and o.id_empresa = informes_supervision.id_empresa
              and o.id_supervisor = p.id))
        or (p.rol = 'encargado_empresa' and p.id_empresa = informes_supervision.id_empresa
          and exists (select 1 from public.objetivos o
            where o.id = informes_supervision.id_objetivo
              and o.id_empresa = informes_supervision.id_empresa
              and o.id_encargado_empresa = p.id))
      )
  )
);

drop policy if exists "informes supervision alta supervisor" on public.informes_supervision;
create policy "informes supervision alta supervisor"
on public.informes_supervision for insert to authenticated
with check (
  creado_por = (select auth.uid())
  and id_supervisor = (select auth.uid())
  and exists (
    select 1 from public.perfiles p
    join public.objetivos o on o.id = informes_supervision.id_objetivo
      and o.id_empresa = informes_supervision.id_empresa
    join public.asignaciones a on a.id_objetivo = o.id
      and a.id_empresa = o.id_empresa and a.id_vigilador = informes_supervision.id_vigilador
    join public.vigiladores v on v.id = a.id_vigilador
    where p.id = (select auth.uid()) and p.activo = true and p.rol = 'supervisor'
      and p.id_empresa = informes_supervision.id_empresa
      and o.activo = true and o.id_supervisor = p.id
      and v.activo = true
      and a.activa = true and a.fecha_inicio <= current_date
      and (a.fecha_fin is null or a.fecha_fin >= current_date)
  )
);

drop policy if exists "informes supervision cambio estado admin" on public.informes_supervision;
create policy "informes supervision cambio estado admin"
on public.informes_supervision for update to authenticated
using (
  exists (select 1 from public.perfiles p
    where p.id = (select auth.uid()) and p.activo = true
      and (p.rol = 'super_administrador'
        or (p.rol = 'administrador' and p.id_empresa = informes_supervision.id_empresa)))
)
with check (
  exists (select 1 from public.perfiles p
    where p.id = (select auth.uid()) and p.activo = true
      and (p.rol = 'super_administrador'
        or (p.rol = 'administrador' and p.id_empresa = informes_supervision.id_empresa)))
);

drop policy if exists "informes actuaciones lectura autorizada" on public.informes_supervision_actuaciones;
create policy "informes actuaciones lectura autorizada"
on public.informes_supervision_actuaciones for select to authenticated
using (
  exists (select 1 from public.informes_supervision i
    where i.id = informes_supervision_actuaciones.id_informe)
);

drop policy if exists "informes actuaciones alta autorizada" on public.informes_supervision_actuaciones;
create policy "informes actuaciones alta autorizada"
on public.informes_supervision_actuaciones for insert to authenticated
with check (
  id_autor = (select auth.uid())
  and exists (
    select 1 from public.perfiles p
    join public.informes_supervision i on i.id = informes_supervision_actuaciones.id_informe
    join public.objetivos o on o.id = i.id_objetivo and o.id_empresa = i.id_empresa
    where p.id = (select auth.uid()) and p.activo = true
      and (
        (p.rol = 'administrador' and p.id_empresa = i.id_empresa)
        or (p.rol = 'super_administrador')
        or (p.rol = 'supervisor' and p.id_empresa = i.id_empresa and o.id_supervisor = p.id and i.id_supervisor = p.id)
      )
  )
);

create or replace function private.registrar_actuacion_informe_supervision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
begin
  select p.nombre || ' ' || p.apellido into v_nombre
  from public.perfiles p where p.id = auth.uid();
  if tg_op = 'INSERT' then
    insert into public.informes_supervision_actuaciones
      (id_informe,id_autor,autor_nombre,tipo,estado,comentario)
    values (new.id,new.id_supervisor,new.supervisor_nombre,'registro',new.estado,'Informe original registrado.');
    return new;
  end if;
  if old.estado is distinct from new.estado then
    insert into public.informes_supervision_actuaciones
      (id_informe,id_autor,autor_nombre,tipo,estado,comentario)
    values (new.id,auth.uid(),coalesce(v_nombre,'Administración'),'cambio_estado',new.estado,
      'Estado actualizado de ' || old.estado || ' a ' || new.estado || '.');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_informe_supervision_actuacion on public.informes_supervision;
create trigger trg_informe_supervision_actuacion
after insert or update of estado on public.informes_supervision
for each row execute function private.registrar_actuacion_informe_supervision();

-- El registro original es inmutable: únicamente se permite modificar el estado
-- mediante el permiso de columna otorgado a authenticated.
create or replace function private.proteger_informe_supervision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los informes de supervisión no se pueden eliminar.';
  end if;
  if (to_jsonb(new) - 'estado') is distinct from (to_jsonb(old) - 'estado') then
    raise exception 'El contenido original del informe es inmutable.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_proteger_informe_supervision on public.informes_supervision;
create trigger trg_proteger_informe_supervision
before update or delete on public.informes_supervision
for each row execute function private.proteger_informe_supervision();

create or replace function private.proteger_actuacion_informe_supervision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Las actuaciones del informe son inmutables.';
end;
$$;
drop trigger if exists trg_proteger_actuacion_informe_supervision on public.informes_supervision_actuaciones;
create trigger trg_proteger_actuacion_informe_supervision
before update or delete on public.informes_supervision_actuaciones
for each row execute function private.proteger_actuacion_informe_supervision();

-- La inserción del informe y su actuación inicial se realizan en la misma transacción.
