-- El Supervisor es un perfil de consulta. Conserva las operaciones propias de Vigiladores y Administradores.
drop policy if exists "correcciones alta autorizada" on public.novedades_correcciones;
create policy "correcciones alta autorizada" on public.novedades_correcciones for insert to authenticated
with check (id_empresa = (select private.current_company_id()) and corregido_por = (select auth.uid()) and private.is_company_admin());

drop policy if exists "correcciones lectura empresa" on public.novedades_correcciones;
create policy "correcciones lectura empresa" on public.novedades_correcciones for select to authenticated
using (private."current_role"() = 'super_administrador' or (private.is_company_admin() and id_empresa = (select private.current_company_id())));

drop policy if exists "solicitudes modificacion autorizada" on public.solicitudes_cambio;
create policy "solicitudes modificacion autorizada" on public.solicitudes_cambio for update to authenticated
using (id_empresa = (select private.current_company_id()) and ((id_destinatario = (select auth.uid()) and estado = 'pendiente') or private.is_company_admin()))
with check (id_empresa = (select private.current_company_id()) and ((id_destinatario = (select auth.uid()) and estado in ('aceptada_vigilador','rechazada_vigilador')) or private.is_company_admin()));

drop policy if exists "solicitudes lectura empresa" on public.solicitudes_cambio;
create policy "solicitudes lectura empresa" on public.solicitudes_cambio for select to authenticated
using (private."current_role"() <> 'supervisor' and id_empresa = (select private.current_company_id()));

drop policy if exists "extras modificacion gestion" on public.solicitudes_horas_extra;
create policy "extras modificacion gestion" on public.solicitudes_horas_extra for update to authenticated
using (private.is_company_admin() and id_empresa = (select private.current_company_id()))
with check (private.is_company_admin() and id_empresa = (select private.current_company_id()));

drop policy if exists "extras lectura autorizada" on public.solicitudes_horas_extra;
create policy "extras lectura autorizada" on public.solicitudes_horas_extra for select to authenticated
using (id_empresa = (select private.current_company_id()) and (private.is_company_admin() or id_vigilador in (select v.id from public.vigiladores v where v.id_usuario = (select auth.uid()))));

drop policy if exists "tipos turno gestion" on public.tipos_turno;
create policy "tipos turno gestion" on public.tipos_turno for insert to authenticated
with check (private.is_company_admin() and id_empresa = (select private.current_company_id()));

drop policy if exists "tipos turno modificacion" on public.tipos_turno;
create policy "tipos turno modificacion" on public.tipos_turno for update to authenticated
using (private.is_company_admin() and id_empresa = (select private.current_company_id()))
with check (private.is_company_admin() and id_empresa = (select private.current_company_id()));

drop policy if exists "auditoria lectura empresa" on public.auditoria;
create policy "auditoria lectura empresa" on public.auditoria for select to authenticated
using (private."current_role"() = 'super_administrador' or (private.is_company_admin() and id_empresa = (select private.current_company_id())));

drop policy if exists "avisos lectura empresa" on public.avisos;
create policy "avisos lectura empresa" on public.avisos for select to authenticated
using (
  private."current_role"() = 'super_administrador'
  or (private."current_role"() <> 'supervisor' and id_empresa = (select private.current_company_id()))
  or (private."current_role"() = 'supervisor' and exists (
    select 1 from public.objetivos o where o.id = avisos.id_objetivo
      and o.id_empresa = avisos.id_empresa and o.id_supervisor = (select auth.uid())
  ))
);

drop policy if exists "novedades alta empresa" on public.novedades_libro;
create policy "novedades alta empresa" on public.novedades_libro for insert to authenticated
with check (
  creado_por = (select auth.uid())
  and (
    (private.is_company_admin() and id_empresa = (select private.current_company_id()))
    or private."current_role"() = 'super_administrador'
    or (private."current_role"() = 'vigilador' and exists (
      select 1 from public.asignaciones a
      join public.vigiladores v on v.id = a.id_vigilador
      join public.objetivos o on o.id = a.id_objetivo
      where a.id_objetivo = novedades_libro.id_objetivo
        and a.id_vigilador = novedades_libro.id_vigilador
        and a.id_empresa = novedades_libro.id_empresa
        and v.id_empresa = novedades_libro.id_empresa
        and o.id_empresa = novedades_libro.id_empresa
        and a.activa = true and a.fecha_inicio <= novedades_libro.fecha
        and (a.fecha_fin is null or a.fecha_fin >= novedades_libro.fecha)
        and v.id_usuario = (select auth.uid())
    ))
  )
);
