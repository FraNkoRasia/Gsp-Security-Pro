-- Limita el registro de novedades del vigilador al turno asignado
-- (con 10 minutos de tolerancia) y retrasa su visibilidad para gestión
-- hasta 15 minutos después de la salida programada.
alter table public.novedades_libro
  add column if not exists visible_para_gestion_desde timestamptz not null default now();

create or replace function private.validar_horario_novedad_vigilador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ahora timestamp without time zone := now() at time zone 'America/Argentina/Buenos_Aires';
  v_inicio timestamp without time zone;
  v_fin timestamp without time zone;
begin
  if (select private.current_role()) <> 'vigilador' then
    new.visible_para_gestion_desde := coalesce(new.visible_para_gestion_desde, now());
    return new;
  end if;

  if auth.uid() is null or new.creado_por is distinct from auth.uid() then
    raise exception 'No se pudo validar el usuario que registra la novedad.';
  end if;

  select
    t.fecha + t.hora_inicio,
    t.fecha + t.hora_fin
      + case when t.hora_fin <= t.hora_inicio then interval '1 day' else interval '0 day' end
  into v_inicio, v_fin
  from public.turnos t
  join public.vigiladores v on v.id = t.id_vigilador
  where v.id_usuario = auth.uid()
    and t.id_objetivo = new.id_objetivo
    and t.id_empresa = new.id_empresa
    and t.estado not in ('ausente', 'reemplazado')
    and t.hora_inicio is not null
    and t.hora_fin is not null
    and v_ahora between
      (t.fecha + t.hora_inicio) - interval '10 minutes'
      and (t.fecha + t.hora_fin
        + case when t.hora_fin <= t.hora_inicio then interval '1 day' else interval '0 day' end)
        + interval '10 minutes'
  order by t.fecha desc, t.hora_inicio desc
  limit 1;

  if v_inicio is null or v_fin is null then
    raise exception 'Solo podés registrar novedades durante tu turno de servicio, con 10 minutos de margen antes del ingreso y después de la salida.';
  end if;

  new.fecha := v_ahora::date;
  new.hora := v_ahora::time;
  new.visible_para_gestion_desde := (v_fin + interval '15 minutes') at time zone 'America/Argentina/Buenos_Aires';
  return new;
end;
$$;

drop trigger if exists trg_validar_horario_novedad_vigilador on public.novedades_libro;
create trigger trg_validar_horario_novedad_vigilador
before insert on public.novedades_libro
for each row execute function private.validar_horario_novedad_vigilador();

drop policy if exists "novedades lectura empresa" on public.novedades_libro;
create policy "novedades lectura empresa" on public.novedades_libro
for select to authenticated
using (
  (
    private."current_role"() <> 'vigilador'
    and id_empresa = private.current_company_id()
    and (visible_para_gestion_desde <= now() or creado_por = auth.uid())
  )
  or private."current_role"() = 'super_administrador'
  or (
    private."current_role"() = 'vigilador'
    and exists (
      select 1
      from public.asignaciones a
      join public.vigiladores v on v.id = a.id_vigilador
      join public.objetivos o on o.id = a.id_objetivo
      where a.id_objetivo = novedades_libro.id_objetivo
        and a.id_empresa = novedades_libro.id_empresa
        and v.id_empresa = novedades_libro.id_empresa
        and o.id_empresa = novedades_libro.id_empresa
        and a.activa = true
        and a.fecha_inicio <= current_date
        and (a.fecha_fin is null or a.fecha_fin >= current_date)
        and v.id_usuario = auth.uid()
    )
  )
);
