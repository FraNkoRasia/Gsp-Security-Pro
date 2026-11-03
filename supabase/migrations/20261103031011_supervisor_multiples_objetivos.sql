-- Un supervisor puede estar vinculado a varios objetivos.
-- La columna id_supervisor de cada objetivo sigue admitiendo un único usuario.
drop index if exists public.objetivos_id_supervisor_unico;
