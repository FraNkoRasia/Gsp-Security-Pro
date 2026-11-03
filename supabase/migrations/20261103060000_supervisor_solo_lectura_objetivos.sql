-- Limita la lectura del Supervisor a los objetivos asignados y sus datos operativos.
-- Las políticas de escritura de gestión quedan reservadas a Administración.

drop policy if exists "objetivos lectura empresa" on public.objetivos;
create policy "objetivos lectura empresa" on public.objetivos for select to authenticated
using (
  private."current_role"() = 'super_administrador'
  or (private."current_role"() = 'supervisor' and id_supervisor = (select auth.uid()))
  or (private."current_role"() not in ('vigilador','supervisor') and id_empresa = (select private.current_company_id()))
  or (private."current_role"() = 'vigilador' and exists (
    select 1 from public.asignaciones a join public.vigiladores v on v.id = a.id_vigilador
    where a.id_objetivo = objetivos.id and a.id_empresa = objetivos.id_empresa
      and v.id_empresa = objetivos.id_empresa and v.id_usuario = (select auth.uid())
      and a.activa = true and a.fecha_inicio <= current_date
      and (a.fecha_fin is null or a.fecha_fin >= current_date)
  ))
);

drop policy if exists "asignaciones lectura vigilador" on public.asignaciones;
create policy "asignaciones lectura vigilador" on public.asignaciones for select to authenticated
using (
  private."current_role"() = 'super_administrador'
  or (private."current_role"() = 'supervisor' and exists (
    select 1 from public.objetivos o where o.id = asignaciones.id_objetivo
      and o.id_empresa = asignaciones.id_empresa and o.id_supervisor = (select auth.uid())
  ))
  or (private."current_role"() not in ('vigilador','supervisor') and id_empresa = (select private.current_company_id()))
  or (private."current_role"() = 'vigilador' and id_objetivo in (select private.objetivos_asignados_vigilador_actual()))
);

drop policy if exists "vigiladores lectura empresa" on public.vigiladores;
create policy "vigiladores lectura empresa" on public.vigiladores for select to authenticated
using (
  (private."current_role"() not in ('vigilador','supervisor') and id_empresa = (select private.current_company_id()))
  or (private."current_role"() = 'supervisor' and exists (
    select 1 from public.asignaciones a join public.objetivos o on o.id = a.id_objetivo
    where a.id_vigilador = vigiladores.id and a.id_empresa = vigiladores.id_empresa
      and o.id_empresa = vigiladores.id_empresa and o.id_supervisor = (select auth.uid())
  ))
);

drop policy if exists "vigiladores lectura superadmin" on public.vigiladores;
create policy "vigiladores lectura superadmin" on public.vigiladores for select to authenticated
using (
  private."current_role"() = 'super_administrador'
  or (private."current_role"() = 'supervisor' and exists (
    select 1 from public.asignaciones a join public.objetivos o on o.id = a.id_objetivo
    where a.id_vigilador = vigiladores.id and a.id_empresa = vigiladores.id_empresa
      and o.id_empresa = vigiladores.id_empresa and o.id_supervisor = (select auth.uid())
  ))
);

drop policy if exists "turnos lectura empresa" on public.turnos;
create policy "turnos lectura empresa" on public.turnos for select to authenticated
using (
  (private."current_role"() <> 'supervisor' and id_empresa = (select private.current_company_id()))
  or (private."current_role"() = 'supervisor' and exists (
    select 1 from public.objetivos o where o.id = turnos.id_objetivo
      and o.id_empresa = turnos.id_empresa and o.id_supervisor = (select auth.uid())
  ))
);

drop policy if exists "novedades lectura empresa" on public.novedades_libro;
create policy "novedades lectura empresa" on public.novedades_libro for select to authenticated
using (
  (private."current_role"() not in ('vigilador','supervisor')
    and id_empresa = (select private.current_company_id())
    and (visible_para_gestion_desde <= now() or creado_por = (select auth.uid())))
  or private."current_role"() = 'super_administrador'
  or (private."current_role"() = 'supervisor'
    and (visible_para_gestion_desde <= now() or creado_por = (select auth.uid()))
    and exists (select 1 from public.objetivos o where o.id = novedades_libro.id_objetivo
      and o.id_empresa = novedades_libro.id_empresa and o.id_supervisor = (select auth.uid())))
  or (private."current_role"() = 'vigilador'
    and (visible_para_gestion_desde <= now() or creado_por = (select auth.uid()))
    and exists (
      select 1 from public.asignaciones a
      join public.vigiladores v on v.id = a.id_vigilador
      join public.objetivos o on o.id = a.id_objetivo
      where a.id_objetivo = novedades_libro.id_objetivo
        and a.id_empresa = novedades_libro.id_empresa and v.id_empresa = novedades_libro.id_empresa
        and o.id_empresa = novedades_libro.id_empresa
        and a.activa = true and a.fecha_inicio <= current_date
        and (a.fecha_fin is null or a.fecha_fin >= current_date)
        and v.id_usuario = (select auth.uid())
    ))
);

drop policy if exists "personal_empresa_select_objetivo" on public.personal_empresa;
create policy "personal_empresa_select_objetivo" on public.personal_empresa for select to authenticated
using (exists (
  select 1 from public.perfiles p where p.id = (select auth.uid()) and p.activo = true
    and (
      p.rol = 'super_administrador'
      or (p.rol = 'administrador' and p.id_empresa = personal_empresa.id_empresa)
      or (p.rol = 'encargado_empresa' and exists (
        select 1 from public.objetivos o where o.id = personal_empresa.id_objetivo
          and o.id_empresa = personal_empresa.id_empresa and o.id_encargado_empresa = p.id
      ))
      or (p.rol = 'supervisor' and exists (
        select 1 from public.objetivos o where o.id = personal_empresa.id_objetivo
          and o.id_empresa = personal_empresa.id_empresa and o.id_supervisor = p.id
      ))
      or (p.rol = 'vigilador' and exists (
        select 1 from public.asignaciones a join public.vigiladores v on v.id = a.id_vigilador
        where a.id_objetivo = personal_empresa.id_objetivo
          and a.id_empresa = personal_empresa.id_empresa and v.id_usuario = p.id
          and a.activa = true and a.fecha_inicio <= current_date
          and (a.fecha_fin is null or a.fecha_fin >= current_date)
      ))
    )
));

drop policy if exists "asistencias_personal_select_objetivo" on public.asistencias_personal_empresa;
create policy "asistencias_personal_select_objetivo" on public.asistencias_personal_empresa for select to authenticated
using (exists (
  select 1 from public.perfiles p where p.id = (select auth.uid()) and p.activo = true
    and (
      p.rol = 'super_administrador'
      or (p.rol = 'administrador' and p.id_empresa = asistencias_personal_empresa.id_empresa)
      or (p.rol = 'encargado_empresa' and exists (
        select 1 from public.objetivos o where o.id = asistencias_personal_empresa.id_objetivo
          and o.id_empresa = asistencias_personal_empresa.id_empresa and o.id_encargado_empresa = p.id
      ))
      or (p.rol = 'supervisor' and exists (
        select 1 from public.objetivos o where o.id = asistencias_personal_empresa.id_objetivo
          and o.id_empresa = asistencias_personal_empresa.id_empresa and o.id_supervisor = p.id
      ))
      or (p.rol = 'vigilador' and exists (
        select 1 from public.asignaciones a join public.vigiladores v on v.id = a.id_vigilador
        where a.id_objetivo = asistencias_personal_empresa.id_objetivo
          and a.id_empresa = asistencias_personal_empresa.id_empresa and v.id_usuario = p.id
          and a.activa = true and a.fecha_inicio <= asistencias_personal_empresa.fecha
          and (a.fecha_fin is null or a.fecha_fin >= asistencias_personal_empresa.fecha)
      ))
    )
));

drop policy if exists "Usuarios del objetivo pueden ver categorias activas" on public.categorias_personal_empresa;
create policy "Usuarios del objetivo pueden ver categorias activas" on public.categorias_personal_empresa for select to authenticated
using (exists (
  select 1 from public.perfiles p where p.id = (select auth.uid()) and p.activo = true
    and (
      p.rol in ('administrador','super_administrador')
      or (p.rol = 'encargado_empresa' and exists (
        select 1 from public.objetivos o where o.id = categorias_personal_empresa.id_objetivo and o.id_encargado_empresa = p.id
      ))
      or (p.rol = 'supervisor' and exists (
        select 1 from public.objetivos o where o.id = categorias_personal_empresa.id_objetivo and o.id_supervisor = p.id
      ))
      or (p.rol = 'vigilador' and exists (
        select 1 from public.vigiladores v join public.asignaciones a on a.id_vigilador = v.id
        where v.id_usuario = p.id and a.id_objetivo = categorias_personal_empresa.id_objetivo and a.activa = true
      ))
    )
));

drop policy if exists "grillas_mensuales_select_empresa" on public.grillas_mensuales;
create policy "grillas_mensuales_select_empresa" on public.grillas_mensuales for select to authenticated
using (exists (
  select 1 from public.perfiles p where p.id = (select auth.uid()) and p.activo = true
    and (
      p.rol = 'super_administrador'
      or (p.rol = 'administrador' and p.id_empresa = grillas_mensuales.id_empresa)
      or (p.rol = 'supervisor' and exists (
        select 1 from public.objetivos o where o.id = grillas_mensuales.id_objetivo
          and o.id_empresa = grillas_mensuales.id_empresa and o.id_supervisor = p.id
      ))
    )
));

drop policy if exists "grillas_mensuales_vigiladores_select_empresa" on public.grillas_mensuales_vigiladores;
create policy "grillas_mensuales_vigiladores_select_empresa" on public.grillas_mensuales_vigiladores for select to authenticated
using (exists (
  select 1 from public.perfiles p where p.id = (select auth.uid()) and p.activo = true
    and (
      p.rol = 'super_administrador'
      or (p.rol = 'administrador' and p.id_empresa = grillas_mensuales_vigiladores.id_empresa)
      or (p.rol = 'supervisor' and exists (
        select 1 from public.objetivos o where o.id = grillas_mensuales_vigiladores.id_objetivo
          and o.id_empresa = grillas_mensuales_vigiladores.id_empresa and o.id_supervisor = p.id
      ))
    )
));

-- El Supervisor es un perfil de consulta, no de administración.
drop policy if exists "objetivos gestion" on public.objetivos;
create policy "objetivos gestion" on public.objetivos for insert to authenticated
with check (private."current_role"() = 'super_administrador'
  or (private.is_company_admin() and id_empresa = (select private.current_company_id())));

drop policy if exists "objetivos modificacion" on public.objetivos;
create policy "objetivos modificacion" on public.objetivos for update to authenticated
using (private."current_role"() = 'super_administrador'
  or (private.is_company_admin() and id_empresa = (select private.current_company_id())))
with check (private."current_role"() = 'super_administrador'
  or (private.is_company_admin() and id_empresa = (select private.current_company_id())));

drop policy if exists "asignaciones alta" on public.asignaciones;
create policy "asignaciones alta" on public.asignaciones for insert to authenticated
with check (private.is_company_admin() and id_empresa = (select private.current_company_id()));

drop policy if exists "asignaciones modificacion" on public.asignaciones;
create policy "asignaciones modificacion" on public.asignaciones for update to authenticated
using (private.is_company_admin() and id_empresa = (select private.current_company_id()))
with check (private.is_company_admin() and id_empresa = (select private.current_company_id()));

drop policy if exists "vigiladores alta" on public.vigiladores;
create policy "vigiladores alta" on public.vigiladores for insert to authenticated
with check (private.is_company_admin() and id_empresa = (select private.current_company_id()));

drop policy if exists "vigiladores modificacion" on public.vigiladores;
create policy "vigiladores modificacion" on public.vigiladores for update to authenticated
using (private.is_company_admin() and id_empresa = (select private.current_company_id()))
with check (private.is_company_admin() and id_empresa = (select private.current_company_id()));

drop policy if exists "turnos alta gestion" on public.turnos;
create policy "turnos alta gestion" on public.turnos for insert to authenticated
with check (private.is_company_admin() and id_empresa = (select private.current_company_id()));

drop policy if exists "turnos modificacion gestion" on public.turnos;
create policy "turnos modificacion gestion" on public.turnos for update to authenticated
using (private.is_company_admin() and id_empresa = (select private.current_company_id()))
with check (private.is_company_admin() and id_empresa = (select private.current_company_id()));

drop policy if exists "avisos alta gestion" on public.avisos;
create policy "avisos alta gestion" on public.avisos for insert to authenticated
with check (id_empresa = (select private.current_company_id())
  and autor_id = (select auth.uid()) and private.is_company_admin());

drop policy if exists "avisos modificacion gestion" on public.avisos;
create policy "avisos modificacion gestion" on public.avisos for update to authenticated
using (private.is_company_admin() and id_empresa = (select private.current_company_id()))
with check (private.is_company_admin() and id_empresa = (select private.current_company_id()));
