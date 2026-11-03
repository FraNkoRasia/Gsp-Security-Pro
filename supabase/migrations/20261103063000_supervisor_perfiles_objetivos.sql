-- El Supervisor solo puede consultar su propio perfil y perfiles vinculados a sus objetivos.
drop policy if exists "perfil propio o empresa" on public.perfiles;
drop policy if exists "perfiles lectura superadmin" on public.perfiles;
create policy "perfiles lectura segun alcance"
on public.perfiles for select to authenticated
using (
  private."current_role"() = 'super_administrador'
  or (
    private."current_role"() <> 'supervisor'
    and (id = (select auth.uid()) or id_empresa = (select private.current_company_id()))
  )
  or (
    private."current_role"() = 'supervisor'
    and (
      id = (select auth.uid())
      or exists (
        select 1 from public.objetivos o
        where o.id_supervisor = (select auth.uid())
          and o.id_empresa = perfiles.id_empresa
          and o.id_encargado_empresa = perfiles.id
      )
      or exists (
        select 1 from public.objetivos o
        join public.asignaciones a on a.id_objetivo = o.id
        join public.vigiladores v on v.id = a.id_vigilador
        where o.id_supervisor = (select auth.uid())
          and o.id_empresa = perfiles.id_empresa
          and a.id_empresa = o.id_empresa
          and v.id_empresa = o.id_empresa
          and v.id_usuario = perfiles.id
      )
    )
  )
);