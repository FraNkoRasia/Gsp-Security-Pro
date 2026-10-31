-- Relacion estable entre personal y categorias, conservando el texto historico.
-- Los registros cuya categoria no coincide con una categoria del objetivo quedan sin categoria_id
-- y siguen visibles para que puedan corregirse manualmente sin perder informacion.

create unique index if not exists categorias_personal_empresa_id_objetivo_uidx
  on public.categorias_personal_empresa (id, id_objetivo);

create unique index if not exists categorias_personal_empresa_nombre_normalizado_uidx
  on public.categorias_personal_empresa (id_objetivo, lower(btrim(nombre)));

alter table public.personal_empresa
  add column if not exists categoria_id uuid;

update public.personal_empresa p
set categoria_id = c.id
from public.categorias_personal_empresa c
where p.categoria_id is null
  and p.id_objetivo = c.id_objetivo
  and lower(btrim(p.categoria)) = lower(btrim(c.nombre))
  and (
    select count(*)
    from public.categorias_personal_empresa coincidencia
    where coincidencia.id_objetivo = p.id_objetivo
      and lower(btrim(coincidencia.nombre)) = lower(btrim(p.categoria))
  ) = 1;

alter table public.personal_empresa
  add constraint personal_empresa_categoria_objetivo_fkey
  foreign key (categoria_id, id_objetivo)
  references public.categorias_personal_empresa (id, id_objetivo)
  on delete restrict;

create index if not exists personal_empresa_categoria_objetivo_idx
  on public.personal_empresa (categoria_id, id_objetivo);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.vincular_categoria_personal_empresa()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_categoria_id uuid;
  v_nombre text;
  v_cantidad integer;
begin
  if new.categoria_id is not null then
    select c.nombre into v_nombre
    from public.categorias_personal_empresa c
    where c.id = new.categoria_id and c.id_objetivo = new.id_objetivo;
    if not found then
      raise exception 'La categoria seleccionada no pertenece al objetivo del personal.';
    end if;
    new.categoria := v_nombre;
  else
    select count(*) into v_cantidad
    from public.categorias_personal_empresa c
    where c.id_objetivo = new.id_objetivo
      and lower(btrim(c.nombre)) = lower(btrim(new.categoria));
    if v_cantidad = 1 then
      select c.id, c.nombre into v_categoria_id, v_nombre
      from public.categorias_personal_empresa c
      where c.id_objetivo = new.id_objetivo
        and lower(btrim(c.nombre)) = lower(btrim(new.categoria))
      limit 1;
      new.categoria_id := v_categoria_id;
      new.categoria := v_nombre;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists personal_empresa_vincular_categoria on public.personal_empresa;
create trigger personal_empresa_vincular_categoria
before insert or update of categoria, categoria_id, id_objetivo
on public.personal_empresa
for each row execute function private.vincular_categoria_personal_empresa();

create or replace function private.sincronizar_nombre_categoria_personal_empresa()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.nombre is distinct from old.nombre then
    update public.personal_empresa
    set categoria = new.nombre
    where categoria_id = new.id and id_objetivo = new.id_objetivo;
  end if;
  return new;
end;
$$;

drop trigger if exists categorias_personal_empresa_sincronizar_nombre on public.categorias_personal_empresa;
create trigger categorias_personal_empresa_sincronizar_nombre
after update of nombre on public.categorias_personal_empresa
for each row execute function private.sincronizar_nombre_categoria_personal_empresa();
