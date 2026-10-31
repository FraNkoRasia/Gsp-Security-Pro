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
  v_activa boolean;
begin
  if new.categoria_id is not null then
    select c.nombre, c.activa into v_nombre, v_activa
    from public.categorias_personal_empresa c
    where c.id = new.categoria_id and c.id_objetivo = new.id_objetivo;
    if not found then
      raise exception 'La categoria seleccionada no pertenece al objetivo del personal.';
    end if;
    if not v_activa and (tg_op = 'INSERT' or old.categoria_id is distinct from new.categoria_id) then
      raise exception 'No se puede asignar una categoria inactiva. Reactivala o selecciona otra categoria.';
    end if;
    new.categoria := v_nombre;
  else
    select count(*) into v_cantidad
    from public.categorias_personal_empresa c
    where c.id_objetivo = new.id_objetivo and lower(btrim(c.nombre)) = lower(btrim(new.categoria));
    if v_cantidad = 1 then
      select c.id, c.nombre, c.activa into v_categoria_id, v_nombre, v_activa
      from public.categorias_personal_empresa c
      where c.id_objetivo = new.id_objetivo and lower(btrim(c.nombre)) = lower(btrim(new.categoria))
      limit 1;
      if not v_activa then
        raise exception 'No se puede asignar una categoria inactiva. Reactivala o selecciona otra categoria.';
      end if;
      new.categoria_id := v_categoria_id;
      new.categoria := v_nombre;
    end if;
  end if;
  return new;
end;
$$;