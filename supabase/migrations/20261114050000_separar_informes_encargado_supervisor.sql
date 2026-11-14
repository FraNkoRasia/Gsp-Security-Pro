-- Separar los informes del Supervisor de los informes operativos del Encargado.
-- Los informes históricos quedan identificados como creados por Supervisor.
alter table public.informes_supervision
  add column if not exists rol_creador text not null default 'supervisor'
  check (rol_creador in ('supervisor','encargado_empresa'));

alter table public.informes_supervision
  alter column id_vigilador drop not null,
  alter column nombre_vigilante drop not null;

-- El Encargado solo puede leer sus propios informes operativos.
-- Super Admin conserva exactamente su acceso global.
drop policy if exists "informes supervision lectura autorizada" on public.informes_supervision;
create policy "informes supervision lectura autorizada"
on public.informes_supervision for select to authenticated
using (
  exists (
    select 1 from public.perfiles p
    where p.id = (select auth.uid()) and p.activo = true
      and (
        p.rol = 'super_administrador'
        or (p.rol = 'administrador' and p.id_empresa = informes_supervision.id_empresa)
        or (p.rol = 'supervisor' and informes_supervision.rol_creador = 'supervisor'
          and p.id_empresa = informes_supervision.id_empresa
          and informes_supervision.id_supervisor = p.id)
        or (p.rol = 'encargado_empresa' and informes_supervision.rol_creador = 'encargado_empresa'
          and p.id_empresa = informes_supervision.id_empresa
          and informes_supervision.id_supervisor = p.id)
      )
  )
);

drop policy if exists "informes supervision alta supervisor" on public.informes_supervision;
create policy "informes supervision alta supervisor"
on public.informes_supervision for insert to authenticated
with check (
  creado_por = (select auth.uid())
  and id_supervisor = (select auth.uid())
  and estado = 'registrado'
  and (
    (
      rol_creador = 'supervisor'
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
    )
    or
    (
      rol_creador = 'encargado_empresa'
      and id_vigilador is null and nombre_vigilante is null
      and exists (
        select 1 from public.perfiles p
        join public.objetivos o on o.id = informes_supervision.id_objetivo
          and o.id_empresa = informes_supervision.id_empresa
        where p.id = (select auth.uid()) and p.activo = true
          and p.rol = 'encargado_empresa'
          and p.id_empresa = informes_supervision.id_empresa
          and o.activo = true and o.id_encargado_empresa = p.id
      )
    )
  )
);

-- La función de preparación identifica al autor desde el perfil autenticado;
-- el cliente no puede suplantar el rol ni la identidad del creador.
create or replace function private.preparar_informe_supervision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
  v_nombre text;
  v_rol text;
  v_vigilante text;
begin
  select p.id_empresa, btrim(p.nombre || ' ' || p.apellido), p.rol
    into v_empresa, v_nombre, v_rol
  from public.perfiles p
  where p.id = (select auth.uid()) and p.activo = true
    and p.rol in ('supervisor','encargado_empresa');

  if v_empresa is null then
    raise exception 'Solo un Supervisor o Encargado activo puede registrar informes.';
  end if;

  if not exists (
    select 1 from public.objetivos o
    where o.id = new.id_objetivo and o.id_empresa = v_empresa and o.activo = true
      and (
        (v_rol = 'supervisor' and o.id_supervisor = (select auth.uid()))
        or (v_rol = 'encargado_empresa' and o.id_encargado_empresa = (select auth.uid()))
      )
  ) then
    raise exception 'El objetivo no está asignado a tu cuenta o no se encuentra operativo.';
  end if;

  if v_rol = 'supervisor' then
    select v.nombre || ' ' || v.apellido into v_vigilante
    from public.vigiladores v
    join public.asignaciones a on a.id_vigilador = v.id
    where v.id = new.id_vigilador and v.id_empresa = v_empresa and v.activo = true
      and a.id_objetivo = new.id_objetivo and a.id_empresa = v_empresa
      and a.activa = true and a.fecha_inicio <= current_date
      and (a.fecha_fin is null or a.fecha_fin >= current_date)
    order by a.fecha_inicio desc
    limit 1;

    if v_vigilante is null then
      raise exception 'El vigilador no tiene una asignación activa en ese objetivo.';
    end if;
  else
    new.id_vigilador := null;
    new.nombre_vigilante := null;
  end if;

  new.id_empresa := v_empresa;
  new.id_supervisor := (select auth.uid());
  new.supervisor_nombre := v_nombre;
  new.rol_creador := v_rol;
  new.creado_por := (select auth.uid());
  new.creado_en := now();
  new.estado := 'registrado';
  if v_rol = 'supervisor' then
    new.nombre_vigilante := btrim(v_vigilante);
  end if;
  return new;
end;
$$;

-- El Encargado registra informes, pero no puede consultar informes del Supervisor
-- ni agregar actuaciones a los informes de otros roles.
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
        (p.rol = 'administrador' and p.id_empresa = i.id_empresa and informes_supervision_actuaciones.tipo = 'seguimiento')
        or (p.rol = 'super_administrador' and informes_supervision_actuaciones.tipo = 'seguimiento')
        or (p.rol = 'supervisor' and i.rol_creador = 'supervisor'
          and p.id_empresa = i.id_empresa and o.id_supervisor = p.id
          and i.id_supervisor = p.id and informes_supervision_actuaciones.tipo = 'aclaracion')
      )
  )
);
