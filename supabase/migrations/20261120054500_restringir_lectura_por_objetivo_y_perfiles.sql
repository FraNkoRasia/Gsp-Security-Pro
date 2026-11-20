-- Limitar lecturas por objetivo para Encargados y perfiles a datos propios/administracion.
DROP POLICY IF EXISTS "objetivos lectura empresa" ON public.objetivos;
CREATE POLICY "objetivos lectura empresa" ON public.objetivos FOR SELECT TO authenticated
USING (
  private.current_role() = 'super_administrador'
  OR (private.is_company_admin() AND id_empresa = (SELECT private.current_company_id()))
  OR (private.current_role() = 'supervisor' AND id_supervisor = (SELECT auth.uid()))
  OR (private.current_role() = 'encargado_empresa' AND id_encargado_empresa = (SELECT auth.uid()))
  OR (private.current_role() = 'vigilador' AND id IN (SELECT private.objetivos_asignados_vigilador_actual()))
);

DROP POLICY IF EXISTS "perfiles lectura segun alcance" ON public.perfiles;
CREATE POLICY "perfiles lectura segun alcance" ON public.perfiles FOR SELECT TO authenticated
USING (
  id = (SELECT auth.uid())
  OR private.current_role() = 'super_administrador'
  OR (private.current_role() = 'administrador' AND id_empresa = (SELECT private.current_company_id()))
);

DROP POLICY IF EXISTS "vigiladores lectura segun objetivo" ON public.vigiladores;
CREATE POLICY "vigiladores lectura segun objetivo" ON public.vigiladores FOR SELECT TO authenticated
USING (
  private.current_role() = 'super_administrador'
  OR (private.is_company_admin() AND id_empresa = (SELECT private.current_company_id()))
  OR (private.current_role() = 'supervisor' AND EXISTS (
    SELECT 1 FROM public.asignaciones a JOIN public.objetivos o ON o.id = a.id_objetivo
    WHERE a.id_vigilador = vigiladores.id AND a.id_empresa = vigiladores.id_empresa
      AND o.id_empresa = vigiladores.id_empresa AND o.id_supervisor = (SELECT auth.uid()) AND a.activa = true
  ))
  OR (private.current_role() = 'encargado_empresa' AND EXISTS (
    SELECT 1 FROM public.asignaciones a JOIN public.objetivos o ON o.id = a.id_objetivo
    WHERE a.id_vigilador = vigiladores.id AND a.id_empresa = vigiladores.id_empresa
      AND o.id_empresa = vigiladores.id_empresa AND o.id_encargado_empresa = (SELECT auth.uid()) AND a.activa = true
  ))
  OR (private.current_role() = 'vigilador' AND EXISTS (
    SELECT 1 FROM public.asignaciones a
    WHERE a.id_vigilador = vigiladores.id AND a.id_empresa = vigiladores.id_empresa
      AND a.id_objetivo IN (SELECT private.objetivos_asignados_vigilador_actual()) AND a.activa = true
  ))
);

DROP POLICY IF EXISTS "asignaciones lectura vigilador" ON public.asignaciones;
CREATE POLICY "asignaciones lectura vigilador" ON public.asignaciones FOR SELECT TO authenticated
USING (
  private.current_role() = 'super_administrador'
  OR (private.is_company_admin() AND id_empresa = (SELECT private.current_company_id()))
  OR (private.current_role() = 'supervisor' AND EXISTS (
    SELECT 1 FROM public.objetivos o WHERE o.id = asignaciones.id_objetivo
      AND o.id_empresa = asignaciones.id_empresa AND o.id_supervisor = (SELECT auth.uid())
  ))
  OR (private.current_role() = 'encargado_empresa' AND EXISTS (
    SELECT 1 FROM public.objetivos o WHERE o.id = asignaciones.id_objetivo
      AND o.id_empresa = asignaciones.id_empresa AND o.id_encargado_empresa = (SELECT auth.uid())
  ))
  OR (private.current_role() = 'vigilador' AND id_objetivo IN (SELECT private.objetivos_asignados_vigilador_actual()))
);

DROP POLICY IF EXISTS "turnos lectura empresa" ON public.turnos;
CREATE POLICY "turnos lectura empresa" ON public.turnos FOR SELECT TO authenticated
USING (
  private.current_role() = 'super_administrador'
  OR (private.is_company_admin() AND id_empresa = (SELECT private.current_company_id()))
  OR (private.current_role() = 'supervisor' AND EXISTS (
    SELECT 1 FROM public.objetivos o WHERE o.id = turnos.id_objetivo
      AND o.id_empresa = turnos.id_empresa AND o.id_supervisor = (SELECT auth.uid())
  ))
  OR (private.current_role() = 'encargado_empresa' AND EXISTS (
    SELECT 1 FROM public.objetivos o WHERE o.id = turnos.id_objetivo
      AND o.id_empresa = turnos.id_empresa AND o.id_encargado_empresa = (SELECT auth.uid())
  ))
  OR (private.current_role() = 'vigilador' AND id_objetivo IN (SELECT private.objetivos_asignados_vigilador_actual()))
);

DROP POLICY IF EXISTS "avisos lectura empresa" ON public.avisos;
CREATE POLICY "avisos lectura empresa" ON public.avisos FOR SELECT TO authenticated
USING (
  private.current_role() = 'super_administrador'
  OR (private.is_company_admin() AND id_empresa = (SELECT private.current_company_id()))
  OR (private.current_role() = 'supervisor' AND EXISTS (
    SELECT 1 FROM public.objetivos o WHERE o.id = avisos.id_objetivo
      AND o.id_empresa = avisos.id_empresa AND o.id_supervisor = (SELECT auth.uid())
  ))
  OR (private.current_role() = 'encargado_empresa' AND EXISTS (
    SELECT 1 FROM public.objetivos o WHERE o.id = avisos.id_objetivo
      AND o.id_empresa = avisos.id_empresa AND o.id_encargado_empresa = (SELECT auth.uid())
  ))
  OR (private.current_role() = 'vigilador' AND id_objetivo IN (SELECT private.objetivos_asignados_vigilador_actual()))
);

DROP POLICY IF EXISTS "novedades lectura empresa" ON public.novedades_libro;
CREATE POLICY "novedades lectura empresa" ON public.novedades_libro FOR SELECT TO authenticated
USING (
  private.current_role() = 'super_administrador'
  OR (private.is_company_admin() AND id_empresa = (SELECT private.current_company_id())
      AND (visible_para_gestion_desde <= now() OR creado_por = (SELECT auth.uid())))
  OR (private.current_role() = 'supervisor'
      AND (visible_para_gestion_desde <= now() OR creado_por = (SELECT auth.uid()))
      AND EXISTS (SELECT 1 FROM public.objetivos o WHERE o.id = novedades_libro.id_objetivo
        AND o.id_empresa = novedades_libro.id_empresa AND o.id_supervisor = (SELECT auth.uid())))
  OR (private.current_role() = 'encargado_empresa'
      AND (visible_para_gestion_desde <= now() OR creado_por = (SELECT auth.uid()))
      AND EXISTS (SELECT 1 FROM public.objetivos o WHERE o.id = novedades_libro.id_objetivo
        AND o.id_empresa = novedades_libro.id_empresa AND o.id_encargado_empresa = (SELECT auth.uid())))
  OR (private.current_role() = 'vigilador'
      AND (visible_para_gestion_desde <= now() OR creado_por = (SELECT auth.uid()))
      AND EXISTS (
        SELECT 1 FROM public.asignaciones a JOIN public.vigiladores v ON v.id = a.id_vigilador
        JOIN public.objetivos o ON o.id = a.id_objetivo
        WHERE a.id_objetivo = novedades_libro.id_objetivo AND a.id_empresa = novedades_libro.id_empresa
          AND v.id_empresa = novedades_libro.id_empresa AND o.id_empresa = novedades_libro.id_empresa
          AND a.activa = true AND a.fecha_inicio <= CURRENT_DATE
          AND (a.fecha_fin IS NULL OR a.fecha_fin >= CURRENT_DATE) AND v.id_usuario = (SELECT auth.uid())
      ))
);

DROP POLICY IF EXISTS "solicitudes lectura empresa" ON public.solicitudes_cambio;
CREATE POLICY "solicitudes lectura empresa" ON public.solicitudes_cambio FOR SELECT TO authenticated
USING (
  private.current_role() = 'super_administrador'
  OR (private.current_role() = 'administrador' AND id_empresa = (SELECT private.current_company_id()))
  OR id_solicitante = (SELECT auth.uid())
  OR id_destinatario = (SELECT auth.uid())
);

DROP POLICY IF EXISTS "feriados_grilla_lectura" ON public.feriados_grilla_objetivo;
CREATE POLICY "feriados_grilla_lectura" ON public.feriados_grilla_objetivo FOR SELECT TO authenticated
USING (
  private.current_role() = 'super_administrador'
  OR (private.is_company_admin() AND id_empresa = (SELECT private.current_company_id()))
  OR (private.current_role() = 'vigilador' AND id_objetivo IN (SELECT private.objetivos_asignados_vigilador_actual()))
  OR (private.current_role() = 'supervisor' AND EXISTS (
    SELECT 1 FROM public.objetivos o WHERE o.id = feriados_grilla_objetivo.id_objetivo
      AND o.id_supervisor = (SELECT auth.uid())
  ))
  OR (private.current_role() = 'encargado_empresa' AND EXISTS (
    SELECT 1 FROM public.objetivos o WHERE o.id = feriados_grilla_objetivo.id_objetivo
      AND o.id_empresa = feriados_grilla_objetivo.id_empresa AND o.id_encargado_empresa = (SELECT auth.uid())
  ))
);
