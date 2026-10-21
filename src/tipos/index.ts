export type RolUsuario = 'super_administrador' | 'administrador' | 'supervisor' | 'vigilador'

export interface Usuario {
  id: string
  /** ID de public.perfiles cuando el vigilador ya tiene una cuenta. Null si aún no fue vinculado. */
  id_usuario?: string | null
  legajo?: string | null
  email: string
  nombre: string
  apellido: string
  rol: RolUsuario
  id_empresa?: string | null
  empresa_nombre?: string | null
  telefono?: string | null
  activo: boolean
  debe_cambiar_contrasena: boolean
  creado_en: string
}

export interface Empresa {
  id: string
  nombre: string
  cuit?: string
  direccion?: string
  art_aseguradora?: string
  activa: boolean
  creada_en: string
}

export interface Objetivo {
  id: string
  id_empresa: string
  nombre: string
  descripcion?: string
  direccion: string
  localidad: string
  provincia: string
  elementos_a_cargo?: string | null
  supervisor_nombre?: string | null
  id_supervisor?: string | null
  activo: boolean
  creado_en: string
}

export interface Asignacion {
  id: string
  id_vigilador: string
  id_objetivo: string
  objetivo_nombre?: string
  fecha_inicio: string
  fecha_fin?: string | null
  activa: boolean
  motivo_traslado?: string | null
  creado_por: string
  creado_en: string
}

export type TipoTurno = 'diurno' | 'nocturno' | 'franco' | 'especial'

export interface TipoTurnoPersonalizado {
  id: string
  id_empresa: string
  id_objetivo?: string | null
  nombre: string
  abreviatura: string
  horas: number
  tipo: 'diurno' | 'nocturno' | 'mixto' | 'franco' | 'especial'
  hora_inicio?: string | null
  hora_fin?: string | null
  color?: string | null
  activo: boolean
}

export interface Turno {
  id: string
  id_empresa: string
  id_objetivo: string
  id_vigilador: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  horas_totales: number
  tipo: TipoTurno
  horas_diurnas: number
  horas_nocturnas: number
  es_feriado: boolean
  es_domingo: boolean
  horas_extra: number
  id_tipo_turno?: string | null
  estado: 'programado' | 'cumplido' | 'ausente' | 'reemplazado'
}

export interface NovedadLibro {
  id: string
  id_empresa: string
  id_objetivo: string
  id_vigilador: string
  nombre_vigilante: string
  nombre_supervisor: string
  fecha: string
  hora: string
  turno: string
  elementos_a_cargo: string
  informe_novedades: string
  creado_en: string
}

export type EstadoSolicitud = 'pendiente' | 'aceptada_vigilador' | 'rechazada_vigilador' | 'aprobada_admin' | 'cancelada'

export interface SolicitudCambio {
  id: string
  id_empresa: string
  id_solicitante: string
  id_destinatario: string
  id_turno_origen: string
  fecha_turno: string
  estado: EstadoSolicitud
  motivo: string
  creado_en: string
  revisado_por?: string | null
  revisado_por_nombre?: string | null
}

export interface Aviso {
  id: string
  id_empresa: string
  id_objetivo: string
  autor_nombre: string
  titulo: string
  contenido: string
  prioridad: 'baja' | 'media' | 'alta' | 'urgente'
  leido: boolean
  creado_en: string
}

export interface RegistroAuditoria {
  id: string
  id_usuario: string
  usuario_nombre: string
  accion: string
  entidad: string
  detalle: string
  fecha_hora: string
}

export type EstadoSolicitudHorasExtra = 'pendiente' | 'aprobada' | 'rechazada'

export interface SolicitudHorasExtra {
  id: string
  id_empresa: string
  id_objetivo: string
  id_vigilador: string
  id_turno: string
  fecha: string
  hora_salida_programada: string
  hora_salida_real: string
  minutos_solicitados: number
  minutos_aprobados?: number | null
  motivo: string
  observacion?: string | null
  estado: EstadoSolicitudHorasExtra
  creado_por: string
  revisado_por?: string | null
  revisado_en?: string | null
  creado_en: string
}
