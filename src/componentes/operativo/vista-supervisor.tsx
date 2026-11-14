import React, { useEffect, useMemo, useState } from 'react'
import { Activity, CalendarDays, FileText, MapPin, Users, ShieldCheck, Clock3, RefreshCw, Search, ClipboardCheck, Plus, ChevronDown } from 'lucide-react'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import { useOperativo } from '@/contextos/contexto-operativo'
import { supabase } from '@/servicios/supabase'
import { GestionVigiladores } from '@/componentes/operativo/gestion-vigiladores'
import { GrillaMensual } from '@/componentes/operativo/grilla-mensual'

type SupervisionResumen = {
  id: string
  id_objetivo: string
  id_vigilador: string | null
  resultado: 'conforme' | 'con_observaciones'
  observaciones: string
  fecha_supervision: string
}

type InformeResumen = {
  id: string
  id_objetivo: string
  tipo: 'incumplimiento' | 'observacion' | 'incidente' | 'supervision'
  estado: 'registrado' | 'pendiente_revision' | 'en_seguimiento' | 'resuelto'
  nombre_vigilante: string
  descripcion: string
  creado_en: string
}

const fechaArgentina = (fecha: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(fecha)

const horaArgentina = (fecha: Date) => new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
}).format(fecha)

const fechaHora = (valor: string) => new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  dateStyle: 'short',
  timeStyle: 'short'
}).format(new Date(valor))

const obtenerRangoTurno = (fecha: string, inicio: string, fin: string) => {
  const desde = new Date(`${fecha}T${(inicio || '00:00').slice(0, 5)}:00-03:00`)
  const hasta = new Date(`${fecha}T${(fin || '00:00').slice(0, 5)}:00-03:00`)
  if (hasta <= desde) hasta.setDate(hasta.getDate() + 1)
  return { desde: desde.getTime(), hasta: hasta.getTime() }
}

const SelectorObjetivo: React.FC<{
  objetivos: { id: string; nombre: string }[]
  valor: string
  alCambiar: (id: string) => void
}> = ({ objetivos, valor, alCambiar }) => (
  <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-[#0C121E] dark:text-slate-200">
    <MapPin className="h-4 w-4 shrink-0 text-blue-500" />
    <span className="sr-only">Objetivo</span>
    <select value={valor} onChange={e => alCambiar(e.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-sm font-semibold text-slate-900 outline-none dark:text-slate-100">
      {objetivos.map(objetivo => <option key={objetivo.id} value={objetivo.id} className="bg-white text-slate-900 dark:bg-[#0C121E] dark:text-slate-100">{objetivo.nombre}</option>)}
    </select>
  </label>
)

const SinObjetivos: React.FC = () => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center dark:border-slate-700 dark:bg-[#0C121E]">
    <MapPin className="mx-auto h-8 w-8 text-slate-400" />
    <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">No tenés objetivos activos asignados</p>
    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Cuando Administración te asigne un objetivo, vas a poder consultar su información desde acá.</p>
  </div>
)

export const InicioSupervisor: React.FC = () => {
  const { usuario } = useAutenticacion()
  const { objetivos, vigiladores, asignaciones, turnos, novedades } = useOperativo()
  const objetivosSupervisor = useMemo(
    () => objetivos.filter(o => o.id_supervisor === usuario?.id && o.activo),
    [objetivos, usuario?.id]
  )
  const idsObjetivos = useMemo(() => new Set(objetivosSupervisor.map(o => o.id)), [objetivosSupervisor])
  const claveObjetivos = objetivosSupervisor.map(o => o.id).sort().join('|')
  const [informes, setInformes] = useState<InformeResumen[]>([])
  const [supervisiones, setSupervisiones] = useState<SupervisionResumen[]>([])
  const [cargandoInformes, setCargandoInformes] = useState(false)
  const [errorInformes, setErrorInformes] = useState('')
  const [objetivosServicioAbiertos, setObjetivosServicioAbiertos] = useState<Set<string>>(() => new Set())
  const [objetivosRelevosAbiertos, setObjetivosRelevosAbiertos] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    let vigente = true
    const cargar = async () => {
      if (!supabase || !usuario || !objetivosSupervisor.length) {
        setInformes([])
        return
      }
      setCargandoInformes(true)
      setErrorInformes('')
      const [{ data, error }, { data: datosSupervisiones, error: errorSupervisiones }] = await Promise.all([
        supabase.from('informes_supervision')
          .select('id,id_objetivo,tipo,estado,nombre_vigilante,descripcion,creado_en')
          .in('id_objetivo', objetivosSupervisor.map(o => o.id))
          .order('creado_en', { ascending: false })
          .limit(30),
        supabase.from('supervisiones_operativas')
          .select('id,id_objetivo,id_vigilador,resultado,observaciones,fecha_supervision')
          .in('id_objetivo', objetivosSupervisor.map(o => o.id))
          .order('fecha_supervision', { ascending: false })
          .limit(1)
      ])
      if (!vigente) return
      if (error) setErrorInformes('No se pudo actualizar el resumen de informes.')
      else setInformes((data || []) as InformeResumen[])
      if (errorSupervisiones) setErrorInformes('No se pudieron cargar las últimas supervisiones.')
      else setSupervisiones((datosSupervisiones || []) as SupervisionResumen[])
      setCargandoInformes(false)
    }
    void cargar()
    return () => { vigente = false }
  }, [usuario?.id, claveObjetivos])

  const ahora = Date.now()
  const hoy = fechaArgentina(new Date())
  const ayer = fechaArgentina(new Date(Date.now() - 24 * 60 * 60 * 1000))
  const asignacionesActivas = asignaciones.filter(a =>
    idsObjetivos.has(a.id_objetivo) &&
    a.activa &&
    a.fecha_inicio <= hoy &&
    (!a.fecha_fin || a.fecha_fin >= hoy)
  )
  const vigiladoresActivos = vigiladores.filter(v =>
    v.activo && asignacionesActivas.some(a => a.id_vigilador === v.id)
  )
  const turnosRelevantes = turnos.filter(t =>
    idsObjetivos.has(t.id_objetivo) &&
    (t.fecha === hoy || t.fecha === ayer) &&
    t.estado !== 'ausente' &&
    t.estado !== 'reemplazado' &&
    t.horas_totales > 0
  ).map(t => ({ turno: t, ...obtenerRangoTurno(t.fecha, t.hora_inicio, t.hora_fin) }))
  const turnosEnCurso = turnosRelevantes.filter(t => t.desde <= ahora && t.hasta > ahora)
  const proximosTurnos = turnos
    .filter(t => idsObjetivos.has(t.id_objetivo) && t.estado !== 'ausente' && t.estado !== 'reemplazado' && t.horas_totales > 0)
    .map(t => ({ turno: t, ...obtenerRangoTurno(t.fecha, t.hora_inicio, t.hora_fin) }))
    .filter(t => t.desde > ahora && t.desde <= ahora + 24 * 60 * 60 * 1000)
    .sort((a, b) => a.desde - b.desde)
  const servicioPorObjetivo = objetivosSupervisor.map(objetivo => ({ objetivo, turnos: turnosEnCurso.filter(item => item.turno.id_objetivo === objetivo.id) }))
  const relevosPorObjetivo = objetivosSupervisor.map(objetivo => ({ objetivo, turnos: proximosTurnos.filter(item => item.turno.id_objetivo === objetivo.id) }))
  const alternarObjetivo = (actualizar: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    actualizar(actual => { const siguiente = new Set(actual); if (siguiente.has(id)) siguiente.delete(id); else siguiente.add(id); return siguiente })
  }
  const novedadesRecientes = novedades.filter(n => idsObjetivos.has(n.id_objetivo)).slice(0, 4)
  const informesPendientes = informes.filter(i => i.estado !== 'resuelto').length
  const supervisionesRecientes = supervisiones.slice(0, 1)

  if (!objetivosSupervisor.length) return <SinObjetivos />

  return (
    <section className="space-y-5 animate-fadeIn">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Objetivos asignados', value: objetivosSupervisor.length, icon: MapPin, color: 'blue' },
          { label: 'Vigiladores activos', value: vigiladoresActivos.length, icon: Users, color: 'emerald' },
          { label: 'En servicio ahora', value: turnosEnCurso.length, icon: Activity, color: 'amber' },
          { label: 'Informes pendientes', value: informesPendientes, icon: FileText, color: 'violet' }
        ].map(item => {
          const Icono = item.icon
          return <article key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0C121E]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold leading-4 text-slate-500 dark:text-slate-400">{item.label}</span>
              <Icono className="h-4 w-4 shrink-0 text-slate-400" />
            </div>
            <p className="mt-2 text-2xl font-black tabular-nums text-slate-900 dark:text-white">{item.value}</p>
          </article>
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0C121E]">
          <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-blue-500" /><h2 className="font-black text-slate-900 dark:text-white">Personal en servicio</h2></div><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">{turnosEnCurso.length} en total</span></div>
          <div className="mt-3 space-y-2">
            {servicioPorObjetivo.map(({ objetivo, turnos: items }) => { const abierto = objetivosServicioAbiertos.has(objetivo.id); return <div key={objetivo.id} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <button type="button" aria-expanded={abierto} onClick={() => alternarObjetivo(setObjetivosServicioAbiertos, objetivo.id)} className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60">
                <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800 dark:text-slate-100">{objetivo.nombre}</span><span className="mt-0.5 block text-xs text-slate-500">{items.length ? `${items.length} vigilador${items.length === 1 ? '' : 'es'} en servicio` : 'Sin personal en servicio'}</span></span>
                <span className="flex shrink-0 items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${items.length ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{items.length}</span><ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${abierto ? 'rotate-180' : ''}`} /></span>
              </button>
              {abierto && <div className="space-y-2 border-t border-slate-200 p-2 dark:border-slate-700">{items.length ? items.map(({ turno }) => { const vigilador = vigiladores.find(v => v.id === turno.id_vigilador); return <div key={turno.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/60"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800 dark:text-slate-200">{vigilador ? `${vigilador.apellido}, ${vigilador.nombre}` : 'Vigilador'}</p><p className="truncate text-xs text-slate-500">{turno.hora_inicio.slice(0,5)} a {turno.hora_fin.slice(0,5)}</p></div><span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">En servicio</span></div> }) : <p className="px-2 py-3 text-xs text-slate-500">Este objetivo no tiene vigiladores trabajando en este momento.</p>}</div>}
            </div> })}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0C121E]">
          <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-blue-500" /><h2 className="font-black text-slate-900 dark:text-white">Próximos relevos</h2></div><span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300">{proximosTurnos.length} en total</span></div>
          <div className="mt-3 space-y-2">
            {relevosPorObjetivo.map(({ objetivo, turnos: items }) => { const abierto = objetivosRelevosAbiertos.has(objetivo.id); const primero = items[0]?.turno; return <div key={objetivo.id} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <button type="button" aria-expanded={abierto} onClick={() => alternarObjetivo(setObjetivosRelevosAbiertos, objetivo.id)} className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60">
                <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800 dark:text-slate-100">{objetivo.nombre}</span><span className="mt-0.5 block text-xs text-slate-500">{items.length ? `Próximo relevo: ${primero?.fecha.split('-').reverse().join('/')} · ${primero?.hora_inicio.slice(0,5)}` : 'Sin próximos relevos cargados'}</span></span>
                <span className="flex shrink-0 items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${items.length ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{items.length}</span><ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${abierto ? 'rotate-180' : ''}`} /></span>
              </button>
              {abierto && <div className="space-y-2 border-t border-slate-200 p-2 dark:border-slate-700">{items.length ? items.map(({ turno }) => { const vigilador = vigiladores.find(v => v.id === turno.id_vigilador); return <div key={turno.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/60"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800 dark:text-slate-200">{vigilador ? `${vigilador.apellido}, ${vigilador.nombre}` : 'Vigilador'}</p><p className="truncate text-xs text-slate-500">{turno.fecha.split('-').reverse().join('/')} · {turno.hora_inicio.slice(0,5)}</p></div><span className="shrink-0 text-[11px] font-semibold text-slate-500">{horaArgentina(new Date(`${turno.fecha}T${turno.hora_inicio.slice(0,5)}:00-03:00`))}</span></div> }) : <p className="px-2 py-3 text-xs text-slate-500">Este objetivo no tiene próximos turnos cargados.</p>}</div>}
            </div> })}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0C121E]">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            <h2 className="font-black text-slate-900 dark:text-white">Novedades recientes</h2>
          </div>
          {novedadesRecientes.length ? <div className="mt-3 space-y-2">
            {novedadesRecientes.map(n => <div key={n.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
              <div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">{n.nombre_vigilante}</p><span className="shrink-0 text-[10px] text-slate-500">{n.fecha.split('-').reverse().join('/')} · {n.hora.slice(0,5)}</span></div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-400">{n.informe_novedades}</p>
            </div>)}
          </div> : <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">Todavía no hay novedades disponibles.</p>}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0C121E]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-500" />
            <h2 className="font-black text-slate-900 dark:text-white">Últimas supervisiones</h2>
            {cargandoInformes && <RefreshCw className="ml-auto h-4 w-4 animate-spin text-slate-400" />}
          </div>
          {supervisionesRecientes.length ? <div className="mt-3 space-y-2">
            {supervisionesRecientes.map(i => {
              const vigilador = vigiladores.find(v => v.id === i.id_vigilador)
              return <div key={i.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
                <div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">{objetivosSupervisor.find(o => o.id === i.id_objetivo)?.nombre || 'Objetivo'}{vigilador ? ` · ${vigilador.apellido}, ${vigilador.nombre}` : ''}</p><span className="shrink-0 text-[10px] text-slate-500">{fechaHora(i.fecha_supervision)}</span></div>
                <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${i.resultado === 'conforme' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>{i.resultado === 'conforme' ? 'Conforme' : 'Con observaciones'}</span>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-400">{i.observaciones}</p>
              </div>
            })}
          </div> : <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">{errorInformes || 'Todavía no hay supervisiones registradas.'}</p>}
          {errorInformes && supervisionesRecientes.length > 0 && <p className="mt-2 text-xs text-amber-600">{errorInformes}</p>}
        </article>
      </div>
    </section>
  )
}

const useObjetivosSupervisor = () => {
  const { usuario } = useAutenticacion()
  const { objetivos } = useOperativo()
  const objetivosSupervisor = useMemo(
    () => objetivos.filter(o => o.id_supervisor === usuario?.id && o.activo),
    [objetivos, usuario?.id]
  )
  const [objetivoId, setObjetivoId] = useState('')
  const objetivoActual = objetivosSupervisor.find(o => o.id === objetivoId) || objetivosSupervisor[0]
  useEffect(() => {
    if (!objetivosSupervisor.some(o => o.id === objetivoId)) setObjetivoId(objetivosSupervisor[0]?.id || '')
  }, [objetivosSupervisor, objetivoId])
  return { usuario, objetivosSupervisor, objetivoActual, objetivoId: objetivoActual?.id || '', setObjetivoId }
}

export const PersonalSupervisor: React.FC = () => {
  const { usuario, objetivosSupervisor, objetivoActual, objetivoId, setObjetivoId } = useObjetivosSupervisor()
  if (!usuario) return null
  if (!objetivosSupervisor.length) return <SinObjetivos />
  return <section className="space-y-4 animate-fadeIn">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-2xl font-black text-slate-900 dark:text-white">Plantel de Vigiladores</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Consulta del personal de tus objetivos asignados.</p></div>
      {objetivosSupervisor.length > 1 && <div className="w-full sm:max-w-xs"><SelectorObjetivo objetivos={objetivosSupervisor} valor={objetivoId} alCambiar={setObjetivoId} /></div>}
    </div>
    {objetivoActual && <GestionVigiladores key={objetivoId} idEmpresaSeleccionada={usuario.id_empresa || undefined} idObjetivoSeleccionado={objetivoId} modoConsulta ocultarTitulo />}
  </section>
}

export const GrillaSupervisor: React.FC = () => {
  const { objetivosSupervisor, objetivoActual, objetivoId, setObjetivoId } = useObjetivosSupervisor()
  if (!objetivosSupervisor.length) return <SinObjetivos />
  return <section className="space-y-4 animate-fadeIn">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-black text-slate-900 dark:text-white">Grilla de Vigiladores</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Consulta de turnos de los objetivos asignados.</p></div>
      {objetivosSupervisor.length > 1 && <div className="w-full sm:max-w-xs"><SelectorObjetivo objetivos={objetivosSupervisor} valor={objetivoId} alCambiar={setObjetivoId} /></div>}
    </div>
    {objetivoActual && <GrillaMensual key={objetivoId} objetivoInicial={objetivoId} soloLectura ocultarTitulo />}
  </section>
}

export const NovedadesSupervisor: React.FC = () => {
  const { usuario } = useAutenticacion()
  const { objetivos, novedades } = useOperativo()
  const objetivosSupervisor = useMemo(
    () => objetivos.filter(o => o.id_supervisor === usuario?.id && o.activo),
    [objetivos, usuario?.id]
  )
  const idsObjetivos = useMemo(() => new Set(objetivosSupervisor.map(o => o.id)), [objetivosSupervisor])
  const [objetivoId, setObjetivoId] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const novedadesVisibles = useMemo(() => novedades.filter(n => {
    const coincideObjetivo = !idsObjetivos.size ? false : (objetivoId === 'todos' ? idsObjetivos.has(n.id_objetivo) : n.id_objetivo === objetivoId && idsObjetivos.has(n.id_objetivo))
    const texto = [n.nombre_vigilante, n.informe_novedades, n.fecha, n.hora].join(' ').toLocaleLowerCase('es-AR')
    return coincideObjetivo && texto.includes(busqueda.toLocaleLowerCase('es-AR').trim())
  }), [novedades, idsObjetivos, objetivoId, busqueda])

  if (!objetivosSupervisor.length) return <SinObjetivos />

  return <section className="space-y-4 animate-fadeIn">
    <div><h2 className="text-xl font-black text-slate-900 dark:text-white">Novedades e incumplimientos</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Consulta del Libro de Novedades de tus objetivos asignados.</p></div>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,240px)]">
      <label className="relative block"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por vigilador o contenido..." className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-[#0C121E] dark:text-white" /></label>
      {objetivosSupervisor.length > 1 && <label className="flex h-11 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-[#0C121E] dark:text-slate-200"><span className="sr-only">Filtrar por objetivo</span><select value={objetivoId} onChange={e => setObjetivoId(e.target.value)} className="w-full bg-transparent outline-none"><option value="todos">Todos mis objetivos</option>{objetivosSupervisor.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></label>}
    </div>
    <div className="space-y-3">
      {novedadesVisibles.length ? novedadesVisibles.map(n => <article key={n.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0C121E]">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900 dark:text-white">{n.nombre_vigilante || 'Vigilador'}</p><p className="text-xs text-slate-500 dark:text-slate-400">{objetivosSupervisor.find(o => o.id === n.id_objetivo)?.nombre || 'Objetivo'}</p></div><span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{n.fecha.split('-').reverse().join('/')} · {n.hora.slice(0,5)}</span></div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">{n.informe_novedades}</p>
      </article>) : <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No hay novedades disponibles para los filtros seleccionados.</div>}
    </div>
  </section>
}

type SupervisionOperativa = {
  id: string
  id_objetivo: string
  fecha_supervision: string
  resultado: 'conforme' | 'con_observaciones'
  observaciones: string
}

export const SupervisionesSupervisor: React.FC = () => {
  const { usuario, objetivosSupervisor, objetivoActual, objetivoId, setObjetivoId } = useObjetivosSupervisor()
  const [resultado, setResultado] = useState<'conforme' | 'con_observaciones'>('conforme')
  const [observaciones, setObservaciones] = useState('')
  const [registros, setRegistros] = useState<SupervisionOperativa[]>([])
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const claveObjetivos = objetivosSupervisor.map(o => o.id).sort().join('|')

  useEffect(() => {
    let vigente = true
    const cargar = async () => {
      if (!supabase || !usuario || !objetivosSupervisor.length) {
        setRegistros([])
        return
      }
      setCargando(true)
      setError('')
      const { data, error: errorCarga } = await supabase
        .from('supervisiones_operativas')
        .select('id,id_objetivo,fecha_supervision,resultado,observaciones')
        .eq('id_supervisor', usuario.id)
        .in('id_objetivo', objetivosSupervisor.map(o => o.id))
        .order('fecha_supervision', { ascending: false })
        .limit(100)
      if (!vigente) return
      if (errorCarga) setError('No se pudo cargar el historial de supervisiones.')
      else setRegistros((data || []) as SupervisionOperativa[])
      setCargando(false)
    }
    void cargar()
    return () => { vigente = false }
  }, [usuario?.id, claveObjetivos])

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !usuario || !objetivoActual || !observaciones.trim()) return
    setGuardando(true)
    setError('')
    setMensaje('')
    const { error: errorGuardar } = await supabase.from('supervisiones_operativas').insert({
      id_empresa: objetivoActual.id_empresa,
      id_objetivo: objetivoActual.id,
      id_supervisor: usuario.id,
      resultado,
      observaciones: observaciones.trim()
    })
    if (errorGuardar) {
      setError(errorGuardar.message.includes('row-level security')
        ? 'No tenés autorización para registrar una supervisión en este objetivo.'
        : 'No se pudo guardar la supervisión. Revisá los datos e intentá nuevamente.')
      setGuardando(false)
      return
    }
    setObservaciones('')
    setResultado('conforme')
    setMensaje('La supervisión quedó registrada correctamente.')
    const { data } = await supabase.from('supervisiones_operativas')
      .select('id,id_objetivo,fecha_supervision,resultado,observaciones')
      .eq('id_supervisor', usuario.id)
      .in('id_objetivo', objetivosSupervisor.map(o => o.id))
      .order('fecha_supervision', { ascending: false })
      .limit(100)
    setRegistros((data || []) as SupervisionOperativa[])
    setGuardando(false)
  }

  if (!objetivosSupervisor.length) return <SinObjetivos />

  return <section className="space-y-5 animate-fadeIn">
    <header className="flex items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-300"><ClipboardCheck className="h-5 w-5" /></div>
      <div className="min-w-0"><h2 className="text-xl font-black text-slate-900 dark:text-white">Supervisiones</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Registrá los controles realizados y consultá su historial en tus objetivos asignados.</p></div>
    </header>

    <form onSubmit={registrar} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0C121E] sm:p-5">
      <div className="flex items-center gap-2"><Plus className="h-4 w-4 text-blue-600 dark:text-blue-400" /><h3 className="text-sm font-bold text-slate-900 dark:text-white">Registrar control</h3></div>
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Objetivo supervisado</span>
        <select value={objetivoId} onChange={e => setObjetivoId(e.target.value)} required className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
          {objetivosSupervisor.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
      </label>
      <fieldset className="space-y-2"><legend className="text-xs font-semibold text-slate-600 dark:text-slate-300">Resultado del control</legend>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setResultado('conforme')} aria-pressed={resultado === 'conforme'} className={'rounded-xl border px-3 py-3 text-sm font-semibold transition ' + (resultado === 'conforme' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300')}>Conforme</button>
          <button type="button" onClick={() => setResultado('con_observaciones')} aria-pressed={resultado === 'con_observaciones'} className={'rounded-xl border px-3 py-3 text-sm font-semibold transition ' + (resultado === 'con_observaciones' ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300')}>Con observaciones</button>
        </div>
      </fieldset>
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Detalle del control y observaciones</span>
        <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} required minLength={3} rows={4} placeholder="Describí el estado del servicio, los controles realizados y cualquier observación..." className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
      </label>
      {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{error}</p>}
      {mensaje && <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{mensaje}</p>}
      <button type="submit" disabled={guardando || !observaciones.trim() || !objetivoActual} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{guardando ? 'Guardando...' : 'Guardar supervisión'}</button>
    </form>

    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3"><h3 className="text-base font-bold text-slate-900 dark:text-white">Historial de supervisiones</h3><span className="text-xs text-slate-500 dark:text-slate-400">{registros.length} registros</span></div>
      {cargando ? <p className="py-6 text-center text-sm text-slate-500">Cargando historial...</p> : registros.length ? registros.map(r => {
        const objetivo = objetivosSupervisor.find(o => o.id === r.id_objetivo)
        return <article key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0C121E]">
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900 dark:text-white">{objetivo?.nombre || 'Objetivo asignado'}</p><p className="text-xs text-slate-500 dark:text-slate-400">{new Date(r.fecha_supervision).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</p></div><span className={'rounded-full px-2.5 py-1 text-[10px] font-bold ' + (r.resultado === 'conforme' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300')}>{r.resultado === 'conforme' ? 'Conforme' : 'Con observaciones'}</span></div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">{r.observaciones}</p>
        </article>
      }) : <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Todavía no hay supervisiones registradas.</div>}
    </div>
  </section>
}
