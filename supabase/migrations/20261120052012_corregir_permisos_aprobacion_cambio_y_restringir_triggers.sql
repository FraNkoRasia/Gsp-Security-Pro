-- Restringe la aprobación de cambios de turno a administración.
-- El Supervisor mantiene su rol informativo y no puede aprobar/rechazar cambios.
CREATE OR REPLACE FUNCTION public.aprobar_cambio_turno(p_solicitud_id uuid, p_aprobar boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_s public.solicitudes_cambio%rowtype;
  v_admin public.perfiles%rowtype;
  v_solicitante public.vigiladores%rowtype;
  v_dest public.vigiladores%rowtype;
  v_origen public.turnos%rowtype;
  v_turno_dest public.turnos%rowtype;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Debés iniciar sesión para aprobar un cambio de turno'
      USING ERRCODE = '42501';
  END IF;

  IF p_solicitud_id IS NULL OR p_aprobar IS NULL THEN
    RAISE EXCEPTION 'La solicitud y la decisión de aprobación son obligatorias'
      USING ERRCODE = '22004';
  END IF;

  SELECT s.* INTO v_s
  FROM public.solicitudes_cambio AS s
  WHERE s.id = p_solicitud_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;

  SELECT p.* INTO v_admin
  FROM public.perfiles AS p
  WHERE p.id = (SELECT auth.uid())
    AND p.activo = true
    AND (
      p.rol = 'super_administrador'
      OR (p.rol = 'administrador' AND p.id_empresa = v_s.id_empresa)
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No autorizado para aprobar este cambio'
      USING ERRCODE = '42501';
  END IF;

  IF v_s.estado <> 'aceptada_vigilador' THEN
    RAISE EXCEPTION 'La solicitud no está pendiente de aprobación administrativa';
  END IF;

  IF v_s.id_solicitante = v_s.id_destinatario THEN
    RAISE EXCEPTION 'El solicitante y el destinatario deben ser distintos';
  END IF;

  IF NOT p_aprobar THEN
    UPDATE public.solicitudes_cambio
    SET estado = 'cancelada',
        revisado_por = v_admin.id,
        revisado_por_nombre = concat_ws(' ', v_admin.nombre, v_admin.apellido),
        actualizado_en = now()
    WHERE id = p_solicitud_id;
    RETURN jsonb_build_object('ok', true, 'estado', 'cancelada');
  END IF;

  SELECT t.* INTO v_origen
  FROM public.turnos AS t
  WHERE t.id = v_s.id_turno_origen
    AND t.id_empresa = v_s.id_empresa
    AND t.fecha = v_s.fecha_turno
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno de origen no encontrado o no coincide con la fecha de la solicitud';
  END IF;

  SELECT vg.* INTO v_solicitante
  FROM public.vigiladores AS vg
  WHERE vg.id = v_origen.id_vigilador
    AND vg.id_usuario = v_s.id_solicitante
    AND vg.id_empresa = v_s.id_empresa
    AND vg.activo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El turno de origen no pertenece al solicitante activo de esta empresa';
  END IF;

  SELECT vg.* INTO v_dest
  FROM public.vigiladores AS vg
  WHERE vg.id_usuario = v_s.id_destinatario
    AND vg.id_empresa = v_s.id_empresa
    AND vg.activo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vigilador destinatario no encontrado en la misma empresa';
  END IF;

  IF v_origen.id_vigilador = v_dest.id THEN
    RAISE EXCEPTION 'El vigilador destinatario ya tiene asignado este turno';
  END IF;

  SELECT t.* INTO v_turno_dest
  FROM public.turnos AS t
  WHERE t.id_vigilador = v_dest.id
    AND t.id_empresa = v_s.id_empresa
    AND t.fecha = v_s.fecha_turno
    AND t.id <> v_s.id_turno_origen
  FOR UPDATE;

  IF FOUND THEN
    SET CONSTRAINTS public.turnos_id_vigilador_fecha_key DEFERRED;
    UPDATE public.turnos
    SET id_vigilador = v_origen.id_vigilador,
        estado = 'reemplazado',
        actualizado_en = now()
    WHERE id = v_turno_dest.id;

    UPDATE public.turnos
    SET id_vigilador = v_dest.id,
        estado = 'reemplazado',
        actualizado_en = now()
    WHERE id = v_s.id_turno_origen;
    SET CONSTRAINTS public.turnos_id_vigilador_fecha_key IMMEDIATE;
  ELSE
    UPDATE public.turnos
    SET id_vigilador = v_dest.id,
        estado = 'reemplazado',
        actualizado_en = now()
    WHERE id = v_s.id_turno_origen;
  END IF;

  UPDATE public.solicitudes_cambio
  SET estado = 'aprobada_admin',
      revisado_por = v_admin.id,
      revisado_por_nombre = concat_ws(' ', v_admin.nombre, v_admin.apellido),
      actualizado_en = now()
  WHERE id = p_solicitud_id;

  RETURN jsonb_build_object(
    'ok', true,
    'estado', 'aprobada_admin',
    'tipo', CASE WHEN v_turno_dest.id IS NULL THEN 'reemplazo' ELSE 'intercambio' END
  );
END;
$function$;

-- Las funciones que retornan trigger solo deben ejecutarse mediante sus triggers.
-- Revocar EXECUTE no impide que PostgreSQL dispare los triggers asociados.
REVOKE ALL ON FUNCTION public.asignar_legajo_vigilador() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.proteger_cambio_obligatorio_contrasena() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_categoria_personal_empresa() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_solicitud_horas_extra() FROM PUBLIC, anon, authenticated;
