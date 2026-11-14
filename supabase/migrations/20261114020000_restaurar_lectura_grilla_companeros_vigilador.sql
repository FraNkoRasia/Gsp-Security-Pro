-- Restaura la consulta de la grilla completa para Vigiladores.
-- Un Vigilador puede ver el roster y los turnos de los compañeros que comparten
-- cualquiera de sus objetivos actualmente asignados, sin acceder a otros objetivos.

drop policy if exists "vigiladores lectura empresa" on public.vigiladores;
drop policy if exists "vigiladores lectura superadmin" on public.vigiladores;

create policy "vigiladores lectura segun objetivo"
on public.vigiladores
for select
to authenticated
using (
  private."current_role"() = 'super_administrador'
  or (
    private."current_role"() = 'supervisor'
    and exists (
      select 1
      from public.asignaciones a
      join public.objetivos o on o.id = a.id_objetivo
      where a.id_vigilador = vigiladores.id
        and a.id_empresa = vigiladores.id_empresa
        and o.id_empresa = vigiladores.id_empresa
        and o.id_supervisor = (select auth.uid())
        and a.activa = true
    )
  )
  or (
    private."current_role"() not in ('vigilador', 'supervisor')
    and vigiladores.id_empresa = (select private.current_company_id())
  )
  or (
    private."current_role"() = 'vigilador'
    and exists (
      select 1
      from public.asignaciones a
      where a.id_vigilador = vigiladores.id
        and a.id_empresa = vigiladores.id_empresa
        and a.id_objetivo in (
          select private.objetivos_asignados_vigilador_actual()
        )
        and a.activa = true
    )
  )
);

-- La grilla solo necesita turnos de los objetivos asignados al Vigilador.
-- Se evita que la consulta directa a turnos exponga toda la empresa.
drop policy if exists "turnos lectura empresa" on public.turnos;

create policy "turnos lectura empresa"
on public.turnos
for select
to authenticated
using (
  (
    private."current_role"() not in ('vigilador', 'supervisor')
    and id_empresa = (select private.current_company_id())
  )
  or (
    private."current_role"() = 'supervisor'
    and exists (
      select 1
      from public.objetivos o
      where o.id = turnos.id_objetivo
        and o.id_empresa = turnos.id_empresa
        and o.id_supervisor = (select auth.uid())
    )
  )
  or (
    private."current_role"() = 'vigilador'
    and id_objetivo in (
      select private.objetivos_asignados_vigilador_actual()
    )
  )
);
