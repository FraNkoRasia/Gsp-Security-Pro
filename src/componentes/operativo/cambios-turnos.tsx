import React, { useState } from 'react'
import { ArrowRightLeft, CheckCircle2, Search } from 'lucide-react'
import { Tarjeta, TarjetaContenido } from '@/componentes/ui/tarjeta'
import { Boton } from '@/componentes/ui/boton'
import { Insignia } from '@/componentes/ui/insignia'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Entrada } from '@/componentes/ui/entrada'
import { Etiqueta } from '@/componentes/ui/etiqueta'
import { useOperativo } from '@/contextos/contexto-operativo'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'

export const CambiosTurnos: React.FC = () => {
  const {
    solicitudesCambio,
    turnos,
    vigiladores,
    asignaciones,
    solicitarCambioTurno,
    responderSolicitudCambio,
    aprobarCambioAdmin
  } = useOperativo()
  const { usuario } = useAutenticacion()

  const [modalNuevaSolicitud, setModalNuevaSolicitud] = useState(false)
  const [modalBuscadorReemplazos, setModalBuscadorReemplazos] = useState(false)

  // Formulario solicitud
  const [idDestinatario, setIdDestinatario] = useState('')
  const [fechaTurno, setFechaTurno] = useState('2026-10-15')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [historialDesde, setHistorialDesde] = useState('')
  const [historialHasta, setHistorialHasta] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')

  // Buscador de Reemplazos (Sección 30)
  const [fechaReemplazo, setFechaReemplazo] = useState('2026-10-15')

  const esAdmin = usuario?.rol === 'super_administrador' || usuario?.rol === 'administrador'
  const asignacionActivaUsuario = asignaciones.find((asignacion) =>
    asignacion.id_vigilador === usuario?.id &&
    asignacion.activa &&
    asignacion.fecha_inicio <= new Date().toISOString().slice(0, 10) &&
    (!asignacion.fecha_fin || asignacion.fecha_fin >= new Date().toISOString().slice(0, 10))
  )
  const idObjetivoUsuario = asignacionActivaUsuario?.id_objetivo
  // Los vigiladores solo pueden solicitar cambios y buscar reemplazos dentro de su objetivo actual.
  const vigiladoresDelObjetivo = esAdmin
    ? vigiladores
    : idObjetivoUsuario
    ? vigiladores.filter((vigilador) =>
        vigilador.id !== usuario?.id &&
        asignaciones.some((asignacion) =>
          asignacion.id_vigilador === vigilador.id &&
          asignacion.id_objetivo === idObjetivoUsuario &&
          asignacion.activa &&
          asignacion.fecha_inicio <= new Date().toISOString().slice(0, 10) &&
          (!asignacion.fecha_fin || asignacion.fecha_fin >= new Date().toISOString().slice(0, 10))
        )
      )
    : []

  const solicitudesVisibles = solicitudesCambio.filter((sol) => {
    const autorizado = esAdmin || sol.id_solicitante === usuario?.id || sol.id_destinatario === usuario?.id
    const coincideDesde = !historialDesde || sol.fecha_turno >= historialDesde
    const coincideHasta = !historialHasta || sol.fecha_turno <= historialHasta
    const coincideEstado = filtroEstado === 'todos' || sol.estado === filtroEstado
    return autorizado && coincideDesde && coincideHasta && coincideEstado
  })

  const notificacionesCambio = solicitudesCambio.filter((sol) =>
    usuario?.rol === 'vigilador'
      ? sol.id_destinatario === usuario.id && sol.estado === 'pendiente'
      : esAdmin && sol.estado === 'aceptada_vigilador'
  )

  const abrirSolicitud = () => {
    setIdDestinatario(vigiladoresDelObjetivo[0]?.id || '')
    setFechaTurno('2026-10-15')
    setMotivo('')
    setError(null)
    setModalNuevaSolicitud(true)
  }

  const manejarCrearSolicitud = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!idDestinatario) {
      setError('Debes seleccionar al colega con quien deseas cambiar el turno.')
      return
    }
    if (!motivo.trim()) {
      setError('Debes especificar un motivo para la solicitud.')
      return
    }

    const turnoOrigen = turnos.find(
      (t) => t.id_vigilador === usuario?.id && t.fecha === fechaTurno
    )

    solicitarCambioTurno({
      id_solicitante: usuario?.id || 'usr-vig-01',
      id_destinatario: idDestinatario,
      id_turno_origen: turnoOrigen?.id || `trn-temp-${Date.now()}`,
      fecha_turno: fechaTurno,
      motivo: motivo.trim()
    })

    setModalNuevaSolicitud(false)
  }

  // Detectar vigiladores disponibles para reemplazo (Sección 30)
  const vigiladoresDisponibles = vigiladoresDelObjetivo.map((v) => {
    const turnoEnFecha = turnos.find((t) => t.id_vigilador === v.id && t.fecha === fechaReemplazo)
    const tieneConflicto = turnoEnFecha && turnoEnFecha.tipo !== 'franco' && turnoEnFecha.horas_totales > 0
    return {
      vigilador: v,
      disponible: !tieneConflicto,
      turnoActual: turnoEnFecha
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white font-['Outfit']">
            Cambios de Turno y Reemplazos Operativos
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Flujo oficial: Solicitud entre vigiladores → Aprobación administrativa → Impacto en grilla (Secciones 29 y 30).
          </p>
        </div>

        {!esAdmin && (
          <div className="flex items-center gap-2">
            <Boton
              variante="secundario"
              onClick={() => setModalBuscadorReemplazos(true)}
              icono={<Search className="w-4 h-4 text-blue-500" />}
            >
              Buscar Reemplazos
            </Boton>
            <Boton
              variante="primario"
              onClick={abrirSolicitud}
              icono={<ArrowRightLeft className="w-4 h-4" />}
            >
              Solicitar Cambio
            </Boton>
          </div>
        )}
      </div>

      {notificacionesCambio.length > 0 && (
        <div className="space-y-2">
          {notificacionesCambio.map((sol) => {
            const solicitante = vigiladores.find((v) => v.id === sol.id_solicitante)
            const destinatario = vigiladores.find((v) => v.id === sol.id_destinatario)
            const esPedidoVigilador = usuario?.rol === 'vigilador'
            return (
              <Tarjeta key={'notificacion-' + sol.id} className="border-l-4 border-l-blue-500 bg-blue-50/60 dark:bg-blue-950/20">
                <TarjetaContenido className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-bold text-slate-900 dark:text-white">Nueva solicitud de cambio de turno</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                      {esPedidoVigilador
                        ? `${solicitante?.nombre || 'Un vigilador'} ${solicitante?.apellido || ''} te solicita un cambio para el ${sol.fecha_turno}.`
                        : `${solicitante?.nombre || 'Un vigilador'} ${solicitante?.apellido || ''} y ${destinatario?.nombre || 'otro vigilador'} ${destinatario?.apellido || ''} acordaron el cambio para el ${sol.fecha_turno}. Requiere tu aprobación.`}
                    </p>
                  </div>
                  <Insignia variante="azul">Nuevo</Insignia>
                </TarjetaContenido>
              </Tarjeta>
            )
          })}
        </div>
      )}

      {/* Filtros del historial de solicitudes */}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
        <div>
          <label htmlFor="cambios-desde" className="mb-1 block text-[11px] font-semibold text-slate-500">Turnos desde</label>
          <Entrada id="cambios-desde" type="date" value={historialDesde} onChange={(e) => setHistorialDesde(e.target.value)} />
        </div>
        <div>
          <label htmlFor="cambios-hasta" className="mb-1 block text-[11px] font-semibold text-slate-500">Turnos hasta</label>
          <Entrada id="cambios-hasta" type="date" min={historialDesde || undefined} value={historialHasta} onChange={(e) => setHistorialHasta(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label htmlFor="cambios-estado" className="mb-1 block text-[11px] font-semibold text-slate-500">Estado de solicitud</label>
          <select id="cambios-estado" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="w-full min-h-[46px] rounded-xl bg-white dark:bg-[#0A0F1A] border border-slate-300 dark:border-slate-700 px-3 text-sm text-slate-900 dark:text-slate-100">
            <option value="todos">Todos los estados</option>
            <option value="pendiente">Pendiente de colega</option>
            <option value="aceptada_vigilador">Pendiente de administración</option>
            <option value="aprobada_admin">Aprobada</option>
            <option value="rechazada_vigilador">Rechazada por colega</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
      </div>

      {/* Listado de Solicitudes */}
      <div className="space-y-3">
        {solicitudesVisibles.length === 0 ? (
          <Tarjeta>
            <TarjetaContenido className="p-8 text-center text-slate-500">
              No hay solicitudes de cambio de turno registradas en este período.
            </TarjetaContenido>
          </Tarjeta>
        ) : (
          solicitudesVisibles.map((sol) => {
            const solicitante = vigiladores.find((v) => v.id === sol.id_solicitante)
            const destinatario = vigiladores.find((v) => v.id === sol.id_destinatario)

            return (
              <Tarjeta key={sol.id} className="hover:border-blue-500/50 transition-all">
                <TarjetaContenido className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">
                        {solicitante?.nombre} {solicitante?.apellido}
                      </span>
                      <ArrowRightLeft className="w-4 h-4 text-blue-500" />
                      <span className="font-bold text-slate-900 dark:text-white text-sm">
                        {destinatario?.nombre} {destinatario?.apellido}
                      </span>

                      {sol.estado === 'pendiente' && (
                        <Insignia variante="dorado">Pendiente de colega</Insignia>
                      )}
                      {sol.estado === 'aceptada_vigilador' && (
                        <Insignia variante="azul">Aceptada • Pendiente aprobación admin</Insignia>
                      )}
                      {sol.estado === 'aprobada_admin' && (
                        <Insignia variante="verde">Aprobada en Grilla Oficial</Insignia>
                      )}
                      {sol.estado === 'rechazada_vigilador' && (
                        <Insignia variante="rojo">Rechazada por colega</Insignia>
                      )}
                      {sol.estado === 'cancelada' && (
                        <Insignia variante="gris">Cancelada por administración</Insignia>
                      )}
                    </div>

                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Fecha del turno: <span className="font-bold text-slate-700 dark:text-slate-300">{sol.fecha_turno}</span>
                      <span className="mx-2">•</span>
                      <span>Motivo: &quot;{sol.motivo}&quot;</span>
                    </div>
                  </div>

                  {/* Acciones del Flujo Oficial */}
                  <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                    {/* El colega destinatario puede Aceptar o Rechazar */}
                    {sol.estado === 'pendiente' && usuario?.id === sol.id_destinatario && (
                      <div className="flex items-center gap-2">
                        <Boton
                          variante="peligro"
                          tamano="chico"
                          onClick={() => responderSolicitudCambio(sol.id, false)}
                        >
                          Rechazar
                        </Boton>
                        <Boton
                          variante="primario"
                          tamano="chico"
                          onClick={() => responderSolicitudCambio(sol.id, true)}
                        >
                          Aceptar Cambio
                        </Boton>
                      </div>
                    )}

                    {/* El Administrador puede Aprobar o Cancelar para impactar la Grilla */}
                    {esAdmin && sol.estado === 'aceptada_vigilador' && (
                      <div className="flex items-center gap-2">
                        <Boton
                          variante="secundario"
                          tamano="chico"
                          onClick={() => aprobarCambioAdmin(sol.id, false)}
                        >
                          Rechazar
                        </Boton>
                        <Boton
                          variante="primario"
                          tamano="chico"
                          onClick={() => aprobarCambioAdmin(sol.id, true)}
                          icono={<CheckCircle2 className="w-3.5 h-3.5" />}
                        >
                          Aprobar en Grilla
                        </Boton>
                      </div>
                    )}
                  </div>
                </TarjetaContenido>
              </Tarjeta>
            )
          })
        )}
      </div>

      {/* Modal Nueva Solicitud (Sección 29) */}
      <Dialogo
        abierto={modalNuevaSolicitud}
        alCerrar={() => setModalNuevaSolicitud(false)}
        titulo="Solicitar Cambio de Turno"
        subtitulo="La grilla oficial se actualizará una vez ratificado por tu colega y aprobado por la administración."
        icono={<ArrowRightLeft className="w-5 h-5 text-blue-500" />}
      >
        <form onSubmit={manejarCrearSolicitud} className="space-y-4">
          <div>
            <Etiqueta requerido>Fecha del Turno a Cambiar</Etiqueta>
            <Entrada
              type="date"
              value={fechaTurno}
              onChange={(e) => setFechaTurno(e.target.value)}
            />
          </div>

          <div>
            <Etiqueta requerido>Colega Destinatario</Etiqueta>
            <select
              value={idDestinatario}
              onChange={(e) => setIdDestinatario(e.target.value)}
              className="w-full min-h-[46px] rounded-xl bg-white dark:bg-[#0A0F1A] border border-slate-300 dark:border-slate-700/80 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
            >
              <option value="">Seleccioná un vigilador...</option>
              {vigiladoresDelObjetivo.length === 0 ? (
                <option value="" disabled>
                  {idObjetivoUsuario ? 'No hay colegas asignados a tu objetivo' : 'No tenés un objetivo activo asignado'}
                </option>
              ) : vigiladoresDelObjetivo.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre} {v.apellido} ({v.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <Etiqueta requerido>Motivo de la Solicitud</Etiqueta>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ej: Trámite médico impostergable, permuta voluntaria acordada con el colega..."
              className="w-full rounded-xl bg-white dark:bg-[#0A0F1A] border border-slate-300 dark:border-slate-700/80 p-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Boton type="button" variante="secundario" onClick={() => setModalNuevaSolicitud(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="primario">
              Enviar Solicitud
            </Boton>
          </div>
        </form>
      </Dialogo>

      {/* Modal Buscador de Reemplazos (Sección 30) */}
      <Dialogo
        abierto={modalBuscadorReemplazos}
        alCerrar={() => setModalBuscadorReemplazos(false)}
        titulo="Búsqueda de Vigiladores Disponibles"
        subtitulo="Detección automática de conflictos de horario y francos disponibles (Sección 30)."
        icono={<Search className="w-5 h-5 text-blue-500" />}
        tamano="grande"
      >
        <div className="space-y-4">
          <div>
            <Etiqueta>Seleccionar Fecha a Cubrir</Etiqueta>
            <Entrada
              type="date"
              value={fechaReemplazo}
              onChange={(e) => setFechaReemplazo(e.target.value)}
            />
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            {vigiladoresDisponibles.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                {idObjetivoUsuario ? 'No hay otros vigiladores asignados a tu objetivo.' : 'No tenés un objetivo activo asignado.'}
              </p>
            ) : vigiladoresDisponibles.map(({ vigilador, disponible, turnoActual }) => (
              <div key={vigilador.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900 dark:text-white text-sm">
                    {vigilador.nombre} {vigilador.apellido}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-xs">
                    {turnoActual
                      ? `Turno asignado: ${turnoActual.tipo.toUpperCase()} (${turnoActual.hora_inicio} a ${turnoActual.hora_fin})`
                      : 'Sin turno registrado (Franco o libre)'}
                  </div>
                </div>

                <div>
                  {disponible ? (
                    <Insignia variante="verde">Disponible para cubrir</Insignia>
                  ) : (
                    <Insignia variante="rojo">Conflicto de guardia</Insignia>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <Boton variante="secundario" onClick={() => setModalBuscadorReemplazos(false)}>
              Cerrar
            </Boton>
          </div>
        </div>
      </Dialogo>
    </div>
  )
}
