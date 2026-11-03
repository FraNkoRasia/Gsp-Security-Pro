import React, { useEffect, useMemo, useState } from 'react'
import { Activity, CalendarDays, FileText, MapPin, Users, ShieldCheck, Clock3, RefreshCw } from 'lucide-react'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import { useOperativo } from '@/contextos/contexto-operativo'
import { supabase } from '@/servicios/supabase'
import { GestionVigiladores } from '@/componentes/operativo/gestion-vigiladores'
import { GrillaMensual } from '@/componentes/operativo/grilla-mensual'
import { AsistenciaPersonal } from '@/componentes/operativo/asistencia-personal'
import { InformesSupervision } from '@/componentes/operativo/informes-supervision'

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
    <select value={valor} onChange={e => alCambiar(e.target.value)} className="min-w-0 flex-1 bg-transparent py-2 outline-none">
      {objetivos.map(objetivo => <option key={objetivo.id} value={objetivo.id}>{objetivo.nombre}</option>)}
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
  const [cargandoInformes, setCargandoInformes] = useState(false)
  const [errorInformes, setErrorInformes] = useState('')

  useEffect(() => {
    let vigente = true
    const cargar = async () => {
      if (!supabase || !usuario || !objetivosSupervisor.length) {
        setInformes([])
        return
      }
      setCargandoInformes(true)
      setErrorInformes('')
      const { data, error } = await supabase
        .from('informes_supervision')
        .select('id,id_objetivo,tipo,estado,nombre_vigilante,descripcion,creado_en')
        .order('creado_en', { ascending: false })
        .limit(30)
      if (!vigente) return
      if (error) setErrorInformes('No se pudo actualizar el resumen de informes.')
      else setInformes((data || []) as InformeResumen[])
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
    .filter(t => t.desde > ahora)
    .sort((a, b) => a.desde - b.desde)
    .slice(0, 4)
  const novedadesRecientes = novedades.filter(n => idsObjetivos.has(n.id_objetivo)).slice(0, 4)
  const informesPendientes = informes.filter(i => i.estado !== 'resuelto').length
  const supervisionesRecientes = informes.filter(i => i.tipo === 'supervision').slice(0, 3)

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
          <div className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-blue-500" />
            <h2 className="font-black text-slate-900 dark:text-white">Personal en servicio</h2>
          </div>
          {turnosEnCurso.length ? <div className="mt-3 space-y-2">
            {turnosEnCurso.slice(0, 5).map(({ turno }) => {
              const vigilador = vigiladores.find(v => v.id === turno.id_vigilador)
              const objetivo = objetivosSupervisor.find(o => o.id === turno.id_objetivo)
              return <div key={turno.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
                <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800 dark:text-slate-200">{vigilador ? `${vigilador.apellido}, ${vigilador.nombre}` : 'Vigilador'}</p><p className="truncate text-xs text-slate-500">{objetivo?.nombre || 'Objetivo'} · {turno.hora_inicio.slice(0,5)} a {turno.hora_fin.slice(0,5)}</p></div>
                <span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">En servicio</span>
              </div>
            })}
          </div> : <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">No hay turnos en curso en este momento.</p>}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0C121E]">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-blue-500" />
            <h2 className="font-black text-slate-900 dark:text-white">Próximos relevos</h2>
          </div>
          {proximosTurnos.length ? <div className="mt-3 space-y-2">
            {proximosTurnos.map(({ turno }) => {
              const vigilador = vigiladores.find(v => v.id === turno.id_vigilador)
              const objetivo = objetivosSupervisor.find(o => o.id === turno.id_objetivo)
              return <div key={turno.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
                <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800 dark:text-slate-200">{vigilador ? `${vigilador.apellido}, ${vigilador.nombre}` : 'Vigilador'}</p><p className="truncate text-xs text-slate-500">{objetivo?.nombre || 'Objetivo'} · {turno.fecha.split('-').reverse().join('/')} · {turno.hora_inicio.slice(0,5)}</p></div>
                <span className="shrink-0 text-[11px] font-semibold text-slate-500">{horaArgentina(new Date(`${turno.fecha}T${turno.hora_inicio.slice(0,5)}:00-03:00`))}</span>
              </div>
            })}
          </div> : <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">No hay próximos turnos cargados.</p>}
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
            {supervisionesRecientes.map(i => <div key={i.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
              <div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">{objetivosSupervisor.find(o => o.id === i.id_objetivo)?.nombre || 'Objetivo'} · {i.nombre_vigilante}</p><span className="shrink-0 text-[10px] text-slate-500">{fechaHora(i.creado_en)}</span></div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-400">{i.descripcion}</p>
            </div>)}
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
      <div><h2 className="text-xl font-black text-slate-900 dark:text-white">Plantel de Vigiladores</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Consulta del personal de tus objetivos asignados.</p></div>
      {objetivosSupervisor.length > 1 && <div className="w-full sm:max-w-xs"><SelectorObjetivo objetivos={objetivosSupervisor} valor={objetivoId} alCambiar={setObjetivoId} /></div>}
    </div>
    {objetivoActual && <GestionVigiladores key={objetivoId} idEmpresaSeleccionada={usuario.id_empresa || undefined} idObjetivoSeleccionado={objetivoId} modoConsulta />}
  </section>
}

export const GrillaSupervisor: React.FC = () => {
  const { objetivosSupervisor, objetivoActual, objetivoId, setObjetivoId } = useObjetivosSupervisor()
  if (!objetivosSupervisor.length) return <SinObjetivos />
  return <section className="space-y-4 animate-fadeIn">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black text-slate-900 dark:text-white">Grilla de Vigiladores</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Consulta de turnos de los objetivos asignados.</p></div>
      {objetivosSupervisor.length > 1 && <div className="w-full sm:max-w-xs"><SelectorObjetivo objetivos={objetivosSupervisor} valor={objetivoId} alCambiar={setObjetivoId} /></div>}
    </div>
    {objetivoActual && <GrillaMensual key={objetivoId} objetivoInicial={objetivoId} soloLectura />}
  </section>
}

export const AsistenciaSupervisor: React.FC = () => {
  const { objetivosSupervisor, objetivoActual, objetivoId, setObjetivoId } = useObjetivosSupervisor()
  if (!objetivosSupervisor.length) return <SinObjetivos />
  return <section className="space-y-4 animate-fadeIn">
    {objetivosSupervisor.length > 1 && <div className="flex justify-end"><div className="w-full sm:max-w-xs"><SelectorObjetivo objetivos={objetivosSupervisor} valor={objetivoId} alCambiar={setObjetivoId} /></div></div>}
    {objetivoActual && <AsistenciaPersonal key={objetivoId} objetivoInicial={objetivoId} soloLectura />}
  </section>
}

export const SupervisionesSupervisor: React.FC = () => <InformesSupervision tipoInicial="supervision" />
