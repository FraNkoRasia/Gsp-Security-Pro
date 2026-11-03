-- Un supervisor puede estar asignado a varios objetivos.
-- La unicidad necesaria es por objetivo (una sola columna id_supervisor por fila),
-- no por supervisor a través de toda la tabla.
drop index if exists public.objetivos_id_supervisor_unico;

create index if not exists objetivos_supervisor_idx
  on public.objetivos (id_supervisor)
  where id_supervisor is not null;
