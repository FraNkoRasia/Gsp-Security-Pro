import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, ClipboardList, FileText, Plus, Search, ShieldCheck, Clock3, MessageSquare, RefreshCw, X } from 'lucide-react'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import { useOperativo } from '@/contextos/contexto-operativo'
import { supabase } from '@/servicios/supabase'

type EstadoInforme = 'registrado' | 'pendiente_revision' | 'en_seguimiento' | 'resuelto'
type TipoInforme = 'incumplimiento' | 'observacion' | 'incidente' | 'supervision'
type GravedadInforme = 'baja' | 'media' | 'alta' | 'critica'
type Informe = {
  id: string
  id_empresa: string
  id_objetivo: string
  id_supervisor: string
  supervisor_nombre: string
  id_vigilador: string
  nombre_vigilante: string
  tipo: TipoInforme
  gravedad: GravedadInforme
  descripcion: string
  accion_tomada: string | null
  observaciones: string | null
  estado: EstadoInforme
  creado_en: string
}
type Actuacion = {
  id: string
  id_informe: string
  id_autor: string
  autor_nombre: string
  tipo: 'registro' | 'aclaracion' | 'seguimiento' | 'cambio_estado'
  estado: EstadoInforme | null
  comentario: string | null
  creado_en: string
}
type VigiladorObjetivo = { id: string; nombre: string; apellido: string; legajo: string | null }

const estados: { value: EstadoInforme; label: string }[] = [
  { value: 'registrado', label: 'Registrado' },
  { value: 'pendiente_revision', label: 'Pendiente de revisión' },
  { value: 'en_seguimiento', label: 'En seguimiento' },
  { value: 'resuelto', label: 'Resuelto' }
]
const tipos: { value: TipoInforme; label: string }[] = [
  { value: 'incumplimiento', label: 'Incumplimiento' },
  { value: 'observacion', label: 'Observación' },
  { value: 'incidente', label: 'Incidente' },
  { value: 'supervision', label: 'Supervisión' }
]
const gravedades: { value: GravedadInforme; label: string }[] = [
  { value: 'baja', label: 'Baja' },
  { value: 'media', label: 'Media' },
  { value: 'alta', label: 'Alta' },
  { value: 'critica', label: 'Crítica' }
]
const etiquetaEstado = (estado: EstadoInforme) => estados.find(x => x.value === estado)?.label || estado
const etiquetaTipo = (tipo: TipoInforme) => tipos.find(x => x.value === tipo)?.label || tipo
const etiquetaGravedad = (gravedad: GravedadInforme) => gravedades.find(x => x.value === gravedad)?.label || gravedad
const fechaHora = (valor: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(valor))
const claseEstado = (estado: EstadoInforme) => ({
  registrado: 'border-slate-400/30 bg-slate-500/10 text-slate-600 dark:text-slate-300',
  pendiente_revision: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  en_seguimiento: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  resuelto: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
}[estado])
const claseGravedad = (gravedad: GravedadInforme) => ({
  baja: 'text-slate-500 dark:text-slate-400',
  media: 'text-amber-600 dark:text-amber-300',
  alta: 'text-orange-600 dark:text-orange-300',
  critica: 'text-red-600 dark:text-red-300'
}[gravedad])

export const InformesSupervision: React.FC = () => {
  const { usuario } = useAutenticacion()
  const { objetivos, vigiladores } = useOperativo()
  const esSupervisor = usuario?.rol === 'supervisor'
  const esAdmin = usuario?.rol === 'administrador'
  const esEncargado = usuario?.rol === 'encargado_empresa'
  const objetivosVisibles = useMemo(() => objetivos.filter(o => (
    esSupervisor ? o.id_supervisor === usuario?.id :
    esEncargado ? o.id_encargado_empresa === usuario?.id :
    esAdmin ? o.id_empresa === usuario?.id_empresa : false
  )), [objetivos, esSupervisor, esEncargado, esAdmin, usuario?.id, usuario?.id_empresa])

  const [informes, setInformes] = useState<Informe[]>([])
  const [actuaciones, setActuaciones] = useState<Actuacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtroObjetivo, setFiltroObjetivo] = useState('todos')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [objetivoId, setObjetivoId] = useState('')
  const [vigiladorId, setVigiladorId] = useState('')
  const [vigiladoresObjetivo, setVigiladoresObjetivo] = useState<VigiladorObjetivo[]>([])
  const [tipo, setTipo] = useState<TipoInforme>('observacion')
  const [gravedad, setGravedad] = useState<GravedadInforme>('media')
  const [descripcion, setDescripcion] = useState('')
  const [accionTomada, setAccionTomada] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [comentarios, setComentarios] = useState<Record<string, string>>({})
  const [estadosPendientes, setEstadosPendientes] = useState<Record<string, EstadoInforme>>({})

  const cargar = useCallback(async () => {
    if (!supabase || !usuario) { setError('No hay conexión con la base de datos.'); setCargando(false); return }
    setCargando(true)
    setError('')
    const { data, error: errorInformes } = await supabase.from('informes_supervision').select('*').order('creado_en', { ascending: false })
    if (errorInformes) {
      setError('No se pudieron cargar los informes. ' + errorInformes.message)
      setInformes([])
      setActuaciones([])
      setCargando(false)
      return
    }
    const lista = (data || []) as Informe[]
    setInformes(lista)
    if (lista.length) {
      const { data: acciones, error: errorAcciones } = await supabase.from('informes_supervision_actuaciones').select('*').in('id_informe', lista.map(x => x.id)).order('creado_en', { ascending: true })
      if (errorAcciones) setError('Los informes se cargaron, pero no se pudo recuperar su seguimiento. ' + errorAcciones.message)
      else setActuaciones((acciones || []) as Actuacion[])
    } else setActuaciones([])
    setCargando(false)
  }, [usuario])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => {
    if (!supabase || !usuario?.id_empresa) return
    const canal = supabase.channel('gsp-informes-supervision-' + usuario.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'informes_supervision', filter: 'id_empresa=eq.' + usuario.id_empresa }, () => { void cargar() })
      .subscribe()
    return () => { void supabase?.removeChannel(canal) }
  }, [usuario?.id, usuario?.id_empresa, cargar])

  const abrirNuevo = () => {
    setObjetivoId(objetivosVisibles.find(o => o.activo)?.id || '')
    setVigiladorId('')
    setTipo('observacion')
    setGravedad('media')
    setDescripcion('')
    setAccionTomada('')
    setObservaciones('')
    setError('')
    setMensaje('')
    setModalAbierto(true)
  }

  useEffect(() => {
    const cargarVigiladores = async () => {
      if (!supabase || !usuario || !objetivoId || !esSupervisor) { setVigiladoresObjetivo([]); setVigiladorId(''); return }
      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
      const { data: asignaciones, error: errorAsignaciones } = await supabase.from('asignaciones')
        .select('id_vigilador')
        .eq('id_objetivo', objetivoId)
        .eq('id_empresa', usuario.id_empresa || '')
        .eq('activa', true)
        .lte('fecha_inicio', hoy)
        .or('fecha_fin.is.null,fecha_fin.gte.' + hoy)
      if (errorAsignaciones) { setError(errorAsignaciones.message); setVigiladoresObjetivo([]); return }
      const ids = Array.from(new Set((asignaciones || []).map(x => x.id_vigilador)))
      if (!ids.length) { setVigiladoresObjetivo([]); setVigiladorId(''); return }
      const { data, error: errorVigiladores } = await supabase.from('vigiladores')
        .select('id,id_usuario,nombre,apellido,legajo,activo')
        .in('id', ids)
        .eq('activo', true)
        .order('apellido')
      if (errorVigiladores) { setError(errorVigiladores.message); setVigiladoresObjetivo([]); return }
      const lista = (data || []).filter(v => !v.id_usuario || vigiladores.some(p => p.id === v.id_usuario && p.activo))
        .map(v => ({ id: v.id, nombre: v.nombre, apellido: v.apellido, legajo: v.legajo || null })) as VigiladorObjetivo[]
      setVigiladoresObjetivo(lista)
      setVigiladorId(actual => lista.some(v => v.id === actual) ? actual : lista[0]?.id || '')
    }
    void cargarVigiladores()
  }, [objetivoId, usuario?.id, usuario?.id_empresa, esSupervisor, vigiladores])

  const crearInforme = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !usuario || !esSupervisor) return
    if (!objetivosVisibles.some(o => o.id === objetivoId && o.activo)) { setError('Seleccioná uno de tus objetivos asignados.'); return }
    const vigilador = vigiladoresObjetivo.find(v => v.id === vigiladorId)
    if (!vigilador) { setError('Seleccioná un vigilador actualmente asignado a ese objetivo.'); return }
    if (descripcion.trim().length < 10) { setError('La descripción debe tener al menos 10 caracteres para que el informe sea claro.'); return }
    setGuardando(true); setError('')
    const nombreSupervisor = (usuario.nombre + ' ' + usuario.apellido).trim()
    const { error: errorCrear } = await supabase.from('informes_supervision').insert({
      id_empresa: usuario.id_empresa,
      id_objetivo: objetivoId,
      id_supervisor: usuario.id,
      supervisor_nombre: nombreSupervisor,
      id_vigilador: vigilador.id,
      nombre_vigilante: (vigilador.apellido + ', ' + vigilador.nombre).trim(),
      tipo,
      gravedad,
      descripcion: descripcion.trim(),
      accion_tomada: accionTomada.trim() || null,
      observaciones: observaciones.trim() || null,
      creado_por: usuario.id
    })
    if (errorCrear) { setError(errorCrear.message); setGuardando(false); return }
    setModalAbierto(false)
    setMensaje('Informe registrado. Quedó disponible para la administración y los responsables autorizados del objetivo.')
    await cargar()
    setGuardando(false)
  }

  const agregarActuacion = async (informe: Informe) => {
    if (!supabase || !usuario) return
    const comentario = (comentarios[informe.id] || '').trim()
    if (!comentario) { setError('Escribí una aclaración o comentario antes de enviarlo.'); return }
    setGuardando(true); setError('')
    const { error: errorAccion } = await supabase.from('informes_supervision_actuaciones').insert({
      id_informe: informe.id,
      id_autor: usuario.id,
      autor_nombre: (usuario.nombre + ' ' + usuario.apellido).trim(),
      tipo: esAdmin ? 'seguimiento' : 'aclaracion',
      comentario
    })
    if (errorAccion) setError(errorAccion.message)
    else {
      setComentarios(actual => ({ ...actual, [informe.id]: '' }))
      setMensaje('La actuación quedó agregada al historial del informe.')
      await cargar()
    }
    setGuardando(false)
  }

  const cambiarEstado = async (informe: Informe) => {
    if (!supabase || !esAdmin) return
    const nuevoEstado = estadosPendientes[informe.id] || informe.estado
    if (nuevoEstado === informe.estado) return
    setGuardando(true); setError('')
    const { error: errorEstado } = await supabase.from('informes_supervision')
      .update({ estado: nuevoEstado })
      .eq('id', informe.id)
    if (errorEstado) setError(errorEstado.message)
    else {
      const comentario = (comentarios[informe.id] || '').trim()
      if (comentario) {
        const { error: errorComentario } = await supabase.from('informes_supervision_actuaciones').insert({
          id_informe: informe.id,
          id_autor: usuario?.id,
          autor_nombre: (usuario?.nombre + ' ' + usuario?.apellido).trim(),
          tipo: 'seguimiento',
          comentario
        })
        if (errorComentario) setError('El estado se actualizó, pero no se pudo guardar el comentario: ' + errorComentario.message)
      }
      setMensaje('Estado actualizado y registrado en el historial.')
      setComentarios(actual => ({ ...actual, [informe.id]: '' }))
      await cargar()
    }
    setGuardando(false)
  }

  const informesFiltrados = useMemo(() => informes.filter(informe => {
    const coincideObjetivo = filtroObjetivo === 'todos' || informe.id_objetivo === filtroObjetivo
    const coincideEstado = filtroEstado === 'todos' || informe.estado === filtroEstado
    const texto = [informe.nombre_vigilante, informe.supervisor_nombre, informe.descripcion, informe.accion_tomada || '', informe.observaciones || ''].join(' ').toLocaleLowerCase('es-AR')
    return coincideObjetivo && coincideEstado && texto.includes(busqueda.toLocaleLowerCase('es-AR').trim())
  }), [informes, filtroObjetivo, filtroEstado, busqueda])

  const objetivoNombre = (id: string) => objetivos.find(o => o.id === id)?.nombre || 'Objetivo'
  const actuacionesDe = (id: string) => actuaciones.filter(a => a.id_informe === id)
  const totalPendientes = informes.filter(i => i.estado === 'registrado' || i.estado === 'pendiente_revision').length

  if (!usuario || (!esSupervisor && !esAdmin && !esEncargado)) return null

  return (
    <section className="space-y-5 animate-fadeIn">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-300"><ClipboardList className="h-5 w-5" /></div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white sm:text-2xl">Informes de Supervisión</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Registro formal de incumplimientos, observaciones, incidentes y controles operativos.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">{totalPendientes} pendientes</span>
          {esSupervisor && <button type="button" onClick={abrirNuevo} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"><Plus className="h-4 w-4" />Nuevo informe</button>}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)_minmax(0,220px)]">
        <label className="relative block"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar vigilador o contenido..." className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-[#0C121E] dark:text-white" /></label>
        <select value={filtroObjetivo} onChange={e => setFiltroObjetivo(e.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-[#0C121E] dark:text-white"><option value="todos">Todos los objetivos</option>{objetivosVisibles.filter(o => o.activo).map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-[#0C121E] dark:text-white"><option value="todos">Todos los estados</option>{estados.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}</select>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
      {mensaje && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{mensaje}</div>}

      {cargando ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#0C121E]"><RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />Cargando informes…</div>
      : informesFiltrados.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700"><FileText className="mx-auto mb-3 h-8 w-8 text-slate-400" /><p className="font-semibold text-slate-700 dark:text-slate-200">Todavía no hay informes para mostrar</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{esSupervisor ? 'Cuando registres una supervisión o novedad, aparecerá en este historial.' : 'Los informes de los objetivos autorizados aparecerán en esta sección.'}</p></div>
      : <div className="space-y-3">
        {informesFiltrados.map(informe => {
          const acciones = actuacionesDe(informe.id)
          const objetivo = objetivoNombre(informe.id_objetivo)
          const estadoActual = estadosPendientes[informe.id] || informe.estado
          return <article key={informe.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0C121E]">
            <div className="space-y-3 p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-900 dark:text-white">{etiquetaTipo(informe.tipo)}</span>
                    <span className={'rounded-full border px-2.5 py-1 text-[10px] font-bold ' + claseEstado(informe.estado)}>{etiquetaEstado(informe.estado)}</span>
                    <span className={'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ' + claseGravedad(informe.gravedad)}><AlertTriangle className="h-3.5 w-3.5" />{etiquetaGravedad(informe.gravedad)}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{objetivo} · {informe.nombre_vigilante}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400"><Clock3 className="h-3.5 w-3.5" />{fechaHora(informe.creado_en)}</div>
              </div>
              <p className="whitespace-pre-line text-sm leading-6 text-slate-700 dark:text-slate-200">{informe.descripcion}</p>
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                {informe.accion_tomada && <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60"><span className="font-bold text-slate-600 dark:text-slate-300">Acción tomada</span><p className="mt-1 whitespace-pre-line text-slate-600 dark:text-slate-400">{informe.accion_tomada}</p></div>}
                {informe.observaciones && <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60"><span className="font-bold text-slate-600 dark:text-slate-300">Observaciones</span><p className="mt-1 whitespace-pre-line text-slate-600 dark:text-slate-400">{informe.observaciones}</p></div>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <span>Supervisor: <strong className="font-semibold text-slate-700 dark:text-slate-300">{informe.supervisor_nombre}</strong></span>
                <span>{acciones.length} {acciones.length === 1 ? 'actuación' : 'actuaciones'} en el historial</span>
              </div>
            </div>
            <details className="group border-t border-slate-200 dark:border-slate-800">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-bold text-blue-700 hover:bg-slate-50 dark:text-blue-300 dark:hover:bg-slate-900/50 sm:px-5">
                <span className="inline-flex items-center gap-2"><MessageSquare className="h-4 w-4" />Ver seguimiento e historial</span>
                <span className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="space-y-4 border-t border-slate-100 p-4 dark:border-slate-800 sm:p-5">
                <div className="space-y-3">
                  {acciones.length === 0 ? <p className="text-xs text-slate-500">Sin actuaciones adicionales.</p> : acciones.map(accion => <div key={accion.id} className="relative border-l-2 border-blue-500/30 pl-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs text-slate-800 dark:text-slate-200">{accion.tipo === 'registro' ? 'Informe registrado' : accion.tipo === 'cambio_estado' ? 'Cambio de estado · ' + (accion.estado ? etiquetaEstado(accion.estado) : '') : accion.tipo === 'seguimiento' ? 'Seguimiento administrativo' : 'Aclaración del supervisor'}</strong><time className="text-[10px] text-slate-500">{fechaHora(accion.creado_en)}</time></div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{accion.autor_nombre}</p>
                    {accion.comentario && <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-700 dark:text-slate-300">{accion.comentario}</p>}
                  </div>)}
                </div>
                {(esSupervisor || esAdmin) && <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">{esAdmin ? 'Agregar seguimiento administrativo' : 'Agregar aclaración o seguimiento'}<textarea rows={2} value={comentarios[informe.id] || ''} onChange={e => setComentarios(actual => ({ ...actual, [informe.id]: e.target.value }))} placeholder="Dejá asentada una aclaración. El informe original no se modifica." className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    {esAdmin ? <div className="flex flex-1 gap-2"><select value={estadoActual} onChange={e => setEstadosPendientes(actual => ({ ...actual, [informe.id]: e.target.value as EstadoInforme }))} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-white">{estados.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}</select><button type="button" onClick={() => void cambiarEstado(informe)} disabled={guardando || estadoActual === informe.estado} className="rounded-lg border border-blue-500/30 bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Actualizar estado</button></div> : null}
                    <button type="button" onClick={() => void agregarActuacion(informe)} disabled={guardando || !(comentarios[informe.id] || '').trim()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><MessageSquare className="h-3.5 w-3.5" />Guardar actuación</button>
                  </div>
                </div>}
              </div>
            </details>
          </article>
        })}
      </div>}

      {modalAbierto && createPortal(<div className="fixed inset-0 z-[12000] flex h-[100dvh] w-full items-center justify-center overflow-y-auto bg-black/65 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="informe-supervision-titulo">
        <form onSubmit={crearInforme} className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-slate-300 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#0C121E] sm:p-6">
          <div className="flex items-start gap-3"><div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-3 text-blue-600 dark:text-blue-300"><ShieldCheck className="h-5 w-5" /></div><div className="min-w-0 flex-1"><h3 id="informe-supervision-titulo" className="text-lg font-black text-slate-900 dark:text-white">Nuevo informe de supervisión</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">El registro quedará fechado y asociado a tu cuenta. No se podrá editar ni eliminar.</p></div><button type="button" onClick={() => setModalAbierto(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Cerrar"><X className="h-5 w-5" /></button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Objetivo<select required value={objetivoId} onChange={e => setObjetivoId(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">Seleccionar objetivo</option>{objetivosVisibles.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></label>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Vigilador<select required value={vigiladorId} onChange={e => setVigiladorId(e.target.value)} disabled={!vigiladoresObjetivo.length} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">{vigiladoresObjetivo.length ? 'Seleccionar vigilador' : 'Sin vigiladores asignados'}</option>{vigiladoresObjetivo.map(v => <option key={v.id} value={v.id}>{v.apellido}, {v.nombre}{v.legajo ? ' · Leg. ' + v.legajo : ''}</option>)}</select></label>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Tipo de informe<select value={tipo} onChange={e => setTipo(e.target.value as TipoInforme)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal dark:border-slate-700 dark:bg-slate-950 dark:text-white">{tipos.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Gravedad<select value={gravedad} onChange={e => setGravedad(e.target.value as GravedadInforme)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal dark:border-slate-700 dark:bg-slate-950 dark:text-white">{gravedades.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</select></label>
          </div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Descripción del hecho<textarea required minLength={10} rows={4} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Describí objetivamente qué ocurrió, cuándo y en qué circunstancias." className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Acción tomada<textarea rows={2} value={accionTomada} onChange={e => setAccionTomada(e.target.value)} placeholder="Medidas adoptadas en el momento, comunicación realizada, etc." className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Observaciones adicionales<textarea rows={2} value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Información complementaria (opcional)." className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
          {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">{error}</div>}
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end"><button type="button" onClick={() => setModalAbierto(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Cancelar</button><button type="submit" disabled={guardando || !objetivoId || !vigiladorId || descripcion.trim().length < 10} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{guardando ? 'Registrando…' : 'Registrar informe'}</button></div>
        </form>
      </div>, document.body)}
    </section>
  )
}
