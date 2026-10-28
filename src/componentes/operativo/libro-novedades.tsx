import React, { useState } from 'react'
import { BookOpen, Plus, Search, Edit2, ChevronDown } from 'lucide-react'
import { Tarjeta, TarjetaContenido } from '@/componentes/ui/tarjeta'
import { Boton } from '@/componentes/ui/boton'
import { Insignia } from '@/componentes/ui/insignia'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Entrada } from '@/componentes/ui/entrada'
import { Etiqueta } from '@/componentes/ui/etiqueta'
import { useOperativo } from '@/contextos/contexto-operativo'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import type { NovedadLibro } from '@/tipos'
import { useTraduccion } from '@/i18n'
import { traducirTextoInterfaz } from '@/i18n/diccionario-interfaz'

export const LibroNovedades: React.FC = () => {
  const { novedades, objetivos, crearNovedad, editarNovedad, marcarNovedadLeida, novedadesLeidas, turnos, supervisores, asignaciones } = useOperativo()
  const { usuario } = useAutenticacion()
  const { idioma } = useTraduccion()
  const ahoraLocal = () => {
    const ahora = new Date()
    const fechaLocal = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
    const horaLocal = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ahora)
    return { fecha: fechaLocal, hora: horaLocal }
  }
  const formatoHoraTurno = (valor: string) => (valor || '').slice(0, 5)
  const turnoEnServicio = usuario?.rol === 'vigilador' ? turnos
    .filter(t => t.id_vigilador === usuario.id && t.horas_totales > 0 && t.estado !== 'ausente' && t.estado !== 'reemplazado')
    .map(t => {
      const inicio = new Date(`${t.fecha}T${formatoHoraTurno(t.hora_inicio)}:00-03:00`)
      const fin = new Date(`${t.fecha}T${formatoHoraTurno(t.hora_fin)}:00-03:00`)
      if (fin <= inicio) fin.setDate(fin.getDate() + 1)
      const ahora = Date.now()
      return { turno: t, inicio: inicio.getTime(), fin: fin.getTime(), vigente: ahora >= inicio.getTime() - 10 * 60_000 && ahora <= fin.getTime() + 10 * 60_000 }
    })
    .filter(x => x.vigente)
    .sort((a, b) => b.inicio - a.inicio)[0]?.turno : undefined
  const objetivoActual = usuario?.rol === 'vigilador'
    ? objetivos.find(o => o.id === turnoEnServicio?.id_objetivo)
    : objetivos.find(o => o.id === idObjetivo) || objetivos[0]
  const turnoActualTexto = turnoEnServicio
    ? `${turnoEnServicio.tipo === 'diurno' ? 'Diurno' : turnoEnServicio.tipo === 'nocturno' ? 'Nocturno' : turnoEnServicio.tipo} (${formatoHoraTurno(turnoEnServicio.hora_inicio)} - ${formatoHoraTurno(turnoEnServicio.hora_fin)})`
    : turno
  const supervisorActual = objetivoActual?.id_supervisor
    ? supervisores.find(s => s.id === objetivoActual.id_supervisor)
    : undefined
  const nombreSupervisorActual = supervisorActual
    ? `${supervisorActual.nombre} ${supervisorActual.apellido}`.trim()
    : objetivoActual?.supervisor_nombre || ''

  const [modalNuevoAbierto, setModalNuevoAbierto] = useState(false)
  const [modalEditarAbierto, setModalEditarAbierto] = useState(false)

  const [novedadSeleccionada, setNovedadSeleccionada] = useState<NovedadLibro | null>(null)
  const [filtroObjetivo, setFiltroObjetivo] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  // Datos del registro: se calculan desde el turno asignado, no se inventan valores por defecto.
  const [idObjetivo, setIdObjetivo] = useState(objetivos[0]?.id || '')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [turno, setTurno] = useState('')
  const [nombreSupervisor, setNombreSupervisor] = useState('')
  const [elementosACargo, setElementosACargo] = useState('')
  const [informeNovedades, setInformeNovedades] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Corrección con motivo obligatorio (Sección 32)
  const [informeCorregido, setInformeCorregido] = useState('')
  const [motivoCorreccion, setMotivoCorreccion] = useState('')

  const abrirCrear = () => {
    const ahora = ahoraLocal()
    const objetivo = usuario?.rol === 'vigilador' ? objetivoActual : objetivos.find(o => o.id === idObjetivo) || objetivos[0]
    setIdObjetivo(objetivo?.id || '')
    setFecha(ahora.fecha)
    setHora(ahora.hora)
    setTurno(turnoEnServicio ? turnoActualTexto : '')
    setNombreSupervisor(nombreSupervisorActual)
    setElementosACargo(objetivo?.elementos_a_cargo || '')
    setInformeNovedades('')
    setError(null)
    setModalNuevoAbierto(true)
  }

  const abrirEditar = (nov: NovedadLibro) => {
    setNovedadSeleccionada(nov)
    setInformeCorregido(nov.informe_novedades)
    setMotivoCorreccion('')
    setError(null)
    setModalEditarAbierto(true)
  }

  const manejarGuardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (usuario?.rol === 'vigilador' && (!turnoEnServicio || !objetivoActual)) {
      setError('No se detectó un turno asignado en servicio. Solo podés asentar novedades dentro del horario permitido.')
      return
    }

    if (!informeNovedades.trim()) {
      setError('El informe de novedades no puede estar vacío.')
      return
    }

    const nombreVigilante = usuario
      ? `${usuario.nombre} ${usuario.apellido}`
      : 'Vigilador'

    const resultado = await crearNovedad({
      id_objetivo: objetivoActual?.id || idObjetivo,
      id_vigilador: usuario?.id || '',
      nombre_vigilante: nombreVigilante,
      nombre_supervisor: nombreSupervisorActual || nombreSupervisor,
      fecha,
      hora,
      turno: turnoActualTexto || turno,
      elementos_a_cargo: elementosACargo,
      informe_novedades: informeNovedades.trim()
    })

    if (resultado) {
      setError(resultado)
      return
    }

    setModalNuevoAbierto(false)
  }

  const manejarGuardarCorreccion = (e: React.FormEvent) => {
    e.preventDefault()
    if (!motivoCorreccion.trim()) {
      setError('El motivo de la corrección es obligatorio para preservar la trazabilidad.')
      return
    }

    if (novedadSeleccionada) {
      editarNovedad(novedadSeleccionada.id, {
        informe_novedades: informeCorregido.trim(),
        motivo_correccion: motivoCorreccion.trim()
      })
    }
    setModalEditarAbierto(false)
  }

  const novedadesFiltradas = [...novedades]
    .filter((nov) => {
      const coincideObj = filtroObjetivo === 'todos' || nov.id_objetivo === filtroObjetivo
      const coincideDesde = !fechaDesde || nov.fecha >= fechaDesde
      const coincideHasta = !fechaHasta || nov.fecha <= fechaHasta
      const coincideTexto =
        nov.informe_novedades.toLowerCase().includes(busqueda.toLowerCase()) ||
        nov.nombre_vigilante.toLowerCase().includes(busqueda.toLowerCase())
      return coincideObj && coincideDesde && coincideHasta && coincideTexto
    })
    .sort((a, b) => {
      const aNoLeida = a.id_vigilador !== usuario?.id && !novedadesLeidas.includes(a.id)
      const bNoLeida = b.id_vigilador !== usuario?.id && !novedadesLeidas.includes(b.id)
      if (aNoLeida !== bNoLeida) return aNoLeida ? -1 : 1

      const fechaA = new Date(`${a.fecha}T${a.hora || '00:00'}`).getTime()
      const fechaB = new Date(`${b.fecha}T${b.hora || '00:00'}`).getTime()
      return fechaB - fechaA
    })

  const novedadesPorDia = novedadesFiltradas.reduce<Record<string, NovedadLibro[]>>((grupos, novedad) => {
    if (!grupos[novedad.fecha]) grupos[novedad.fecha] = []
    grupos[novedad.fecha].push(novedad)
    return grupos
  }, {})
  const diasNovedades = Object.keys(novedadesPorDia).sort((a, b) => b.localeCompare(a))
  const formatearDia = (valor: string) => {
    const [anio, mes, dia] = valor.split('-').map(Number)
    return new Intl.DateTimeFormat('es-AR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date(anio, mes - 1, dia)).replace(/^./, (letra) => letra.toLocaleUpperCase('es-AR'))
  }

  return (
    <div className="space-y-6">
      <div className="flex min-w-0 flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="min-w-0 w-full lg:flex-1">
          <h3 className="break-words text-xl font-black text-slate-900 dark:text-white font-['Outfit']">
            Libro Digital de Novedades
          </h3>
          <p className="max-w-full break-words text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Registro operativo oficial e inmutable de guardia por objetivo (Sección 32).
          </p>
        </div>
        {usuario?.rol !== 'administrador' && usuario?.rol !== 'super_administrador' && (
          <Boton
            variante="primario"
            onClick={abrirCrear}
            icono={<Plus className="w-4 h-4" />}
          >
            Asentar Novedad
          </Boton>
        )}
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="grid min-w-0 grid-cols-1 items-end gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_16rem]">
        <div className="min-w-0 w-full">
          <label htmlFor="novedades-busqueda" className="mb-1 block text-[11px] font-semibold text-slate-500">Buscar</label>
          <Entrada
            id="novedades-busqueda"
            placeholder="Buscar por vigilador, informe o palabras clave..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            iconoIzquierda={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0 w-full">
            <label htmlFor="novedades-desde" className="mb-1 block text-[11px] font-semibold text-slate-500">Desde</label>
            <Entrada id="novedades-desde" type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
          </div>
          <div className="min-w-0 w-full">
            <label htmlFor="novedades-hasta" className="mb-1 block text-[11px] font-semibold text-slate-500">Hasta</label>
            <Entrada id="novedades-hasta" type="date" value={fechaHasta} min={fechaDesde || undefined} onChange={(e) => setFechaHasta(e.target.value)} />
          </div>
        </div>
        {usuario?.rol !== 'vigilador' && (
          <div className="min-w-0 w-full">
            <label htmlFor="novedades-objetivo" className="mb-1 block text-[11px] font-semibold text-slate-500">Objetivo</label>
            <select
              id="novedades-objetivo"
              value={filtroObjetivo}
              onChange={(e) => setFiltroObjetivo(e.target.value)}
              className="w-full min-w-0 min-h-[46px] rounded-xl bg-white dark:bg-[#0A0F1A] border border-slate-300 dark:border-slate-700/80 px-3 py-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
            >
              <option value="todos">Todos los objetivos</option>
              {objetivos.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Listado de Novedades */}
      <div className="space-y-3">
        {novedadesFiltradas.length === 0 ? (
          <Tarjeta>
            <TarjetaContenido className="p-8 text-center text-slate-500">
              No se encontraron registros de novedades con los filtros seleccionados.
            </TarjetaContenido>
          </Tarjeta>
        ) : (usuario?.rol === 'vigilador' || usuario?.rol === 'administrador') ? (
          diasNovedades.map((dia) => (
            <details key={dia} className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0C121E] overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-5 hover:bg-slate-50 dark:hover:bg-slate-900/60">
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-900 dark:text-white">{formatearDia(dia)}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{novedadesPorDia[dia].length} {idioma === 'en' ? (novedadesPorDia[dia].length === 1 ? 'entry' : 'entries') : (novedadesPorDia[dia].length === 1 ? 'novedad' : 'novedades')}</div>
                </div>
                <ChevronDown className="w-5 h-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-slate-200 dark:border-slate-800 p-3 sm:p-4 space-y-2">
                {novedadesPorDia[dia].map((nov) => {
                  const obj = objetivos.find((o) => o.id === nov.id_objetivo)
                  const noLeida = nov.id_vigilador !== usuario?.id && !novedadesLeidas.includes(nov.id)
                  return (
                    <details key={nov.id} className="group/item rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-slate-900 dark:text-white">{nov.hora} hs</span>
                            <Insignia variante="azul">{idioma === 'en' ? traducirTextoInterfaz(nov.turno) : nov.turno}</Insignia>
                            {noLeida && <Insignia variante="verde">Nueva</Insignia>}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{obj?.nombre || 'Objetivo'} · {nov.nombre_vigilante}</div>
                        </div>
                        <ChevronDown className="w-4 h-4 shrink-0 text-slate-500 transition-transform group-open/item:rotate-180" />
                      </summary>
                      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                        <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line">{nov.informe_novedades}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800/60">
                          <div><span className="font-semibold text-slate-700 dark:text-slate-300">Vigilante:</span> {nov.nombre_vigilante}</div>
                          <div><span className="font-semibold text-slate-700 dark:text-slate-300">Supervisor:</span> {nov.nombre_supervisor}</div>
                        </div>
                        {noLeida && (
                          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                            <button type="button" onClick={() => marcarNovedadLeida(nov.id)} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">Marcar como leído</button>
                          </div>
                        )}
                      </div>
                    </details>
                  )
                })}
              </div>
            </details>
          ))
        ) : (
          novedadesFiltradas.map((nov) => {
            const obj = objetivos.find((o) => o.id === nov.id_objetivo)
            return (
              <Tarjeta key={nov.id} className="hover:border-blue-500/50 transition-all">
                <TarjetaContenido className="p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">{obj?.nombre || 'Objetivo'}</span>
                      <Insignia variante="azul">{idioma === 'en' ? traducirTextoInterfaz(nov.turno) : nov.turno}</Insignia>
                      {nov.id_vigilador !== usuario?.id && !novedadesLeidas.includes(nov.id) ? <Insignia variante="verde">Nueva</Insignia> : null}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono">{nov.fecha} — {nov.hora} hs</span>
                      {usuario?.rol !== 'administrador' && usuario?.rol !== 'vigilador' && (
                        <button type="button" onClick={() => abrirEditar(nov)} className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-amber-500 transition-colors" title="Corregir novedad (asienta auditoría)">
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line">{nov.informe_novedades}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800/60">
                    <div><span className="font-semibold text-slate-700 dark:text-slate-300">Vigilante:</span> {nov.nombre_vigilante}</div>
                    <div><span className="font-semibold text-slate-700 dark:text-slate-300">Supervisor:</span> {nov.nombre_supervisor}</div>
                  </div>
                  {usuario && (usuario.rol === 'administrador' || usuario.rol === 'supervisor' || nov.id_vigilador !== usuario.id) && (
                    <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-200 dark:border-slate-800">
                      <span className="text-[11px] text-slate-400 font-mono">{nov.fecha} — {nov.hora} hs</span>
                      {novedadesLeidas.includes(nov.id) ? (
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><span>Leído ✓</span></span>
                      ) : (
                        <button type="button" onClick={() => marcarNovedadLeida(nov.id)} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"><span>Marcar como leído</span></button>
                      )}
                    </div>
                  )}
                </TarjetaContenido>
              </Tarjeta>
            )
          })
        )}
      </div>

      {/* Modal Asentar Novedad (Sección 32) */}
      <Dialogo
        abierto={modalNuevoAbierto}
        alCerrar={() => setModalNuevoAbierto(false)}
        titulo="Asentar Novedad en Libro Digital"
        subtitulo={usuario?.rol === 'vigilador' ? 'Podés registrar novedades desde 10 minutos antes del inicio hasta 10 minutos después de finalizar tu turno.' : 'Registro formal de hechos y relevo operativo del puesto de vigilancia.'}
        icono={<BookOpen className="w-5 h-5 text-blue-500" />}
        tamano="grande"
      >
        <form onSubmit={manejarGuardar} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Etiqueta requerido>Objetivo del Servicio</Etiqueta>
              <div className="flex min-h-[46px] items-center rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-900 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-100">
                {objetivoActual ? `${objetivoActual.nombre}${objetivoActual.localidad ? ` (${objetivoActual.localidad})` : ''}` : 'No hay un objetivo asignado para este turno'}
              </div>
            </div>

            <div>
              <Etiqueta requerido>Turno Correspondiente</Etiqueta>
              <div className="flex min-h-[46px] items-center rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-900 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-100">
                {turnoActualTexto || 'No se detectó un turno en servicio'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Etiqueta requerido>Fecha</Etiqueta>
              <div className="flex min-h-[46px] items-center rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-900 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-100">{fecha || 'Se registra automáticamente'}</div>
            </div>
            <div>
              <Etiqueta requerido>Hora</Etiqueta>
              <div className="flex min-h-[46px] items-center rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-900 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-100">{hora ? `${hora} hs` : 'Se registra automáticamente'}</div>
            </div>
          </div>

          <div>
            <Etiqueta requerido>Supervisor a Cargo</Etiqueta>
            <div className="flex min-h-[46px] items-center rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-900 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-100">
              {nombreSupervisorActual || 'El objetivo no tiene un supervisor asignado'}
            </div>
          </div>

          <div>
            <Etiqueta requerido>Elementos a Cargo / Entrega</Etiqueta>
            <Entrada
              value={elementosACargo}
              onChange={(e) => setElementosACargo(e.target.value)}
              placeholder="Handy, linterna, llaves, detector, etc."
            />
          </div>

          <div>
            <Etiqueta requerido>Informe de Novedades</Etiqueta>
            <textarea
              value={informeNovedades}
              onChange={(e) => setInformeNovedades(e.target.value)}
              rows={4}
              placeholder="Detallá el relevo, novedades operativas, rondas, anomalías observadas o novedades ordinarias..."
              className="w-full rounded-xl bg-white dark:bg-[#0A0F1A] border border-slate-300 dark:border-slate-700/80 p-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Boton type="button" variante="secundario" onClick={() => setModalNuevoAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="primario">
              Registrar en Libro
            </Boton>
          </div>
        </form>
      </Dialogo>

      {/* Modal Corrección de Novedad (Sección 32: Con motivo obligatorio) */}
      <Dialogo
        abierto={modalEditarAbierto}
        alCerrar={() => setModalEditarAbierto(false)}
        titulo="Corrección de Novedad (Trazabilidad Oficial)"
        subtitulo="Las modificaciones quedan asentadas conservando usuario, fecha y justificación."
        icono={<Edit2 className="w-5 h-5 text-amber-500" />}
      >
        <form onSubmit={manejarGuardarCorreccion} className="space-y-4">
          <div>
            <Etiqueta requerido>Informe Modificado</Etiqueta>
            <textarea
              value={informeCorregido}
              onChange={(e) => setInformeCorregido(e.target.value)}
              rows={4}
              className="w-full rounded-xl bg-white dark:bg-[#0A0F1A] border border-slate-300 dark:border-slate-700/80 p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
            />
          </div>

          <div>
            <Etiqueta requerido>Motivo de la Modificación</Etiqueta>
            <textarea
              value={motivoCorreccion}
              onChange={(e) => setMotivoCorreccion(e.target.value)}
              rows={2}
              placeholder="Ingresá la justificación formal de la corrección..."
              className="w-full rounded-xl bg-white dark:bg-[#0A0F1A] border border-slate-300 dark:border-slate-700/80 p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Boton type="button" variante="secundario" onClick={() => setModalEditarAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="primario">
              Asentar Corrección Auditada
            </Boton>
          </div>
        </form>
      </Dialogo>

    </div>
  )
}
