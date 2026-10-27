import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ClipboardCheck, Clock3, Search, Plus, RefreshCw, Send, UserRoundPlus, X, AlertTriangle, Trash2 } from 'lucide-react'
import { supabase } from '@/servicios/supabase'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import { useOperativo } from '@/contextos/contexto-operativo'

type Categoria = { id: string; nombre: string; activa: boolean }
type Personal = { id: string; nombre: string; apellido: string; categoria: string; estado_aprobacion: 'pendiente'|'aprobado'|'rechazado'; activo: boolean }
type Asistencia = { id: string; id_personal: string; fecha: string; ingreso: string|null; egreso: string|null; jornada_cerrada: boolean; informe_enviado_en: string|null }
const fechaLocal = () => {
  const ahora = new Date()
  return new Date(ahora.getTime() - ahora.getTimezoneOffset()*60000).toISOString().slice(0,10)
}
const hora = (value: string|null) => value ? new Date(value).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',hour12:false}) : '—'

export const AsistenciaPersonal: React.FC = () => {
  const { usuario } = useAutenticacion()
  const { asignaciones, objetivos, vigiladores } = useOperativo()
  const esEncargado = usuario?.rol === 'encargado_empresa'
  const vigiladorActual = vigiladores.find(v => v.id_usuario === usuario?.id)
  const asignacion = asignaciones.find(a => a.id_vigilador === vigiladorActual?.id && a.activa)
  const objetivoVigilador = asignacion?.id_objetivo
  const [objetivoId,setObjetivoId] = useState<string>('')
  const [personal,setPersonal] = useState<Personal[]>([])
  const [asistencias,setAsistencias] = useState<Asistencia[]>([])
  const [fecha,setFecha] = useState(fechaLocal())
  const [busqueda,setBusqueda] = useState('')
  const [nombre,setNombre] = useState('')
  const [apellido,setApellido] = useState('')
  const [categoria,setCategoria] = useState('')
  const [categorias,setCategorias] = useState<Categoria[]>([])
  const [nuevaCategoria,setNuevaCategoria] = useState('')
  const [guardandoCategoria,setGuardandoCategoria] = useState(false)
  const [categoriaAEliminar,setCategoriaAEliminar] = useState<Categoria|null>(null)
  const [confirmacionEliminarCategoria,setConfirmacionEliminarCategoria] = useState(false)
  const [modalAltaAbierto,setModalAltaAbierto] = useState(false)
  const [cargando,setCargando] = useState(true)
  const [guardando,setGuardando] = useState(false)
  const [error,setError] = useState('')
  const [mensaje,setMensaje] = useState('')
  const [confirmarCierre,setConfirmarCierre] = useState(false)
  const [confirmacionMarca,setConfirmacionMarca] = useState<{persona: Personal; tipo: 'ingreso'|'egreso'}|null>(null)
  const [informeCerrado,setInformeCerrado] = useState(false)

  const cargar = useCallback(async () => {
    if (!supabase || !usuario) { setError('No hay conexión con la base de datos.'); setCargando(false); return }
    setCargando(true); setError('')
    try {
      let idObjetivo = objetivoId || objetivoVigilador || ''
      if (esEncargado && !idObjetivo) {
        const {data,error:err} = await supabase.from('objetivos').select('id').eq('id_encargado_empresa',usuario.id).eq('activo',true).limit(2)
        if (err) throw err
        if ((data || []).length > 1) throw new Error('Esta cuenta está vinculada a más de un objetivo. El administrador debe corregir la asignación.')
        idObjetivo = data?.[0]?.id || ''
      }
      if (!idObjetivo) { setObjetivoId(''); setPersonal([]); setAsistencias([]); setCargando(false); return }
      setObjetivoId(idObjetivo)
      const [p,a,c] = await Promise.all([
        supabase.from('personal_empresa').select('id,nombre,apellido,categoria,estado_aprobacion,activo').eq('id_objetivo',idObjetivo).eq('activo',true).order('nombre'),
        supabase.from('asistencias_personal_empresa').select('id,id_personal,fecha,ingreso,egreso,jornada_cerrada,informe_enviado_en').eq('id_objetivo',idObjetivo).eq('fecha',fecha),
        supabase.from('categorias_personal_empresa').select('id,nombre,activa').eq('id_objetivo',idObjetivo).eq('activa',true).order('nombre')
      ])
      if (p.error) throw p.error
      if (a.error) throw a.error
      if (c.error) throw c.error
      const categoriasActivas = (c.data || []) as Categoria[]
      const nombresCategoriasActivas = new Set(categoriasActivas.map(cat => cat.nombre.trim().toLocaleLowerCase('es-AR')))
      // Nunca mostrar personal con categorías fijas antiguas ni categorías de otro objetivo.
      setPersonal(((p.data || []) as Personal[]).filter(persona => nombresCategoriasActivas.has(persona.categoria.trim().toLocaleLowerCase('es-AR'))))
      setAsistencias((a.data || []) as Asistencia[])
      setCategorias(categoriasActivas)
      setCategoria(actual => c.data?.some(x=>x.nombre===actual) ? actual : (c.data?.[0]?.nombre || ''))
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los registros.') }
    finally { setCargando(false) }
  },[usuario,objetivoId,objetivoVigilador,esEncargado,fecha])

  useEffect(() => { void cargar() },[cargar])

  const crearCategoria = async () => {
    const nombreLimpio = nuevaCategoria.trim()
    if (!supabase || !usuario || !objetivoId || !esEncargado || !nombreLimpio) return
    setGuardandoCategoria(true); setError('')
    const objetivo = objetivos.find(o => o.id === objetivoId)
    const idEmpresa = objetivo?.id_empresa || usuario.id_empresa
    if (!idEmpresa) { setError('No se pudo identificar la empresa de este objetivo.'); setGuardandoCategoria(false); return }
    const {data,error:err} = await supabase.from('categorias_personal_empresa').insert({id_empresa:idEmpresa,id_objetivo:objetivoId,nombre:nombreLimpio,creado_por:usuario.id}).select('id,nombre,activa').single()
    setGuardandoCategoria(false)
    if (err) { setError(err.code==='23505' ? 'Ya existe una categoría con ese nombre en este objetivo.' : err.message); return }
    setCategorias(prev=>[...prev,data as Categoria].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'})))
    setCategoria(data.nombre); setNuevaCategoria('')
  }

  const eliminarCategoria = async (cat: Categoria) => {
    if (!supabase || !usuario || !objetivoId || !esEncargado) return
    setGuardandoCategoria(true); setError(''); setMensaje('')
    // Se desactiva en lugar de borrar físicamente para conservar referencias e historial.
    const {error:err} = await supabase.from('categorias_personal_empresa').update({activa:false}).eq('id',cat.id).eq('id_objetivo',objetivoId)
    setGuardandoCategoria(false)
    if (err) { setError(err.message); return }
    setCategorias(prev=>prev.filter(c=>c.id!==cat.id))
    setCategoria(actual=>actual===cat.nombre ? '' : actual)
    setMensaje(`Categoría “${cat.nombre}” eliminada de este objetivo. El historial de asistencias se conserva.`)
  }

  const registrarPersona = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !usuario || !objetivoId || !nombre.trim() || !categoria) return
    const objetivo = objetivos.find(o => o.id === objetivoId)
    const idEmpresa = objetivo?.id_empresa || usuario.id_empresa
    if (!idEmpresa) { setError('No se pudo identificar la empresa de este objetivo.'); return }
    setGuardando(true); setError(''); setMensaje('')
    const {error:err} = await supabase.from('personal_empresa').insert({
      id_empresa:idEmpresa,id_objetivo:objetivoId,nombre:nombre.trim(),apellido:apellido.trim(),
      categoria,estado_aprobacion:esEncargado?'aprobado':'pendiente',creado_por:usuario.id,revisado_por:esEncargado?usuario.id:null,revisado_en:esEncargado?new Date().toISOString():null
    })
    setGuardando(false)
    if (err) { setError(err.message.includes('row-level security') ? 'Tu cuenta no tiene permiso para registrar personal en este objetivo.' : err.message); return }
    setNombre(''); setApellido(''); setNuevaCategoria(''); setModalAltaAbierto(false)
    setMensaje(esEncargado?'Personal dado de alta correctamente.':'Alta propuesta; queda pendiente de aprobación del encargado. El registro se conserva para la jornada.')
    await cargar()
  }

  const guardarMarca = async (persona: Personal, tipo: 'ingreso'|'egreso') => {
    if (!supabase || !usuario || !objetivoId) return
    const existente = asistencias.find(a=>a.id_personal===persona.id)
    if (existente?.jornada_cerrada) { setError('La jornada ya está cerrada y no admite más marcas.'); return }
    setGuardando(true); setError(''); setMensaje('')
    const marca = new Date().toISOString()
    let result
    if (!existente) {
      if (tipo !== 'ingreso') { setError('Primero registrá el ingreso.'); setGuardando(false); return }
      const objetivo = objetivos.find(o=>o.id===objetivoId)
      const idEmpresa = objetivo?.id_empresa || usuario.id_empresa
      if (!idEmpresa) { setError('No se pudo identificar la empresa.'); setGuardando(false); return }
      result = await supabase.from('asistencias_personal_empresa').insert({
        id_empresa:idEmpresa,id_objetivo:objetivoId,id_personal:persona.id,fecha,
        ingreso:marca,registrado_por:usuario.id
      })
    } else {
      if (tipo==='ingreso' && existente.ingreso) { setError('El ingreso ya fue registrado.'); setGuardando(false); return }
      if (tipo==='egreso' && (!existente.ingreso || existente.egreso)) { setError('Para registrar el egreso debe existir un ingreso y no haberse marcado antes.'); setGuardando(false); return }
      result = await supabase.from('asistencias_personal_empresa').update(tipo==='ingreso'?{ingreso:marca,actualizado_en:marca}:{egreso:marca,actualizado_en:marca}).eq('id',existente.id)
    }
    setGuardando(false)
    if (result.error) setError(result.error.message.includes('row-level security') ? 'Tu cuenta no tiene permiso para marcar asistencia en este objetivo.' : result.error.message)
    else { setMensaje(tipo==='ingreso'?'Ingreso registrado.':'Egreso registrado.'); await cargar() }
  }

  const cerrarJornada = async () => {
    if (!supabase || !usuario || !objetivoId) return
    const abiertos = asistencias.filter(a=>a.ingreso && !a.egreso)
    if (abiertos.length) { setError('No se puede cerrar la jornada: hay personal con ingreso pero sin egreso.'); return }
    setConfirmarCierre(false)
    setGuardando(true); setError(''); setMensaje('')
    const ids = asistencias.filter(a=>!a.jornada_cerrada).map(a=>a.id)
    for (const id of ids) {
      const {error:err} = await supabase.from('asistencias_personal_empresa').update({jornada_cerrada:true,informe_enviado_en:new Date().toISOString(),actualizado_en:new Date().toISOString()}).eq('id',id)
      if (err) { setError(err.message); setGuardando(false); return }
    }
    setGuardando(false); setInformeCerrado(true); setMensaje('Jornada cerrada. El informe quedó registrado para consulta del encargado.'); await cargar()
  }

  const revisar = async (persona: Personal, aprobar: boolean) => {
    if (!supabase || !usuario) return
    setGuardando(true); setError(''); setMensaje('')
    const {error:err} = await supabase.from('personal_empresa').update({estado_aprobacion:aprobar?'aprobado':'rechazado',revisado_por:usuario.id,revisado_en:new Date().toISOString()}).eq('id',persona.id)
    setGuardando(false)
    if (err) setError(err.message)
    else { setMensaje(aprobar?'Personal aprobado.':'Alta rechazada.'); await cargar() }
  }

  const personalPorCategoria = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es-AR')
    const filtrado = [...personal].filter(p => !termino || `${p.apellido} ${p.nombre}`.toLocaleLowerCase('es-AR').includes(termino) || `${p.nombre} ${p.apellido}`.toLocaleLowerCase('es-AR').includes(termino))
    const prioridadCategoria = (nombre: string) => {
      const normalizado = nombre.trim().toLocaleLowerCase('es-AR')
      if (normalizado === 'operarios fijos') return 0
      if (normalizado === 'jornaleros') return 1
      return 2
    }
    const nombres = [...new Set(filtrado.map(p => p.categoria))].sort((a,b) =>
      prioridadCategoria(a)-prioridadCategoria(b) || a.localeCompare(b, 'es', {sensitivity:'base'})
    )
    return nombres.map(nombre => ({
      nombre,
      personas: filtrado.filter(p => p.categoria === nombre).sort((a,b) =>
        a.apellido.localeCompare(b.apellido, 'es', {sensitivity:'base'}) ||
        a.nombre.localeCompare(b.nombre, 'es', {sensitivity:'base'})
      )
    }))
  }, [personal, busqueda])
  const asistenciaDe = (id:string) => asistencias.find(a=>a.id_personal===id)
  const nombreObjetivo = objetivos.find(o=>o.id===objetivoId)?.nombre
  const hoyLocal = fechaLocal()
  const fechaFutura = fecha > hoyLocal
  const fechaPasada = fecha < hoyLocal
  const puedeMarcarFecha = !fechaFutura && (esEncargado || !fechaPasada)

  return (
    <section className="space-y-5 animate-fadeIn">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0C121E] sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-300"><ClipboardCheck className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-black text-slate-900 dark:text-white sm:text-2xl">Asistencia del personal</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Personal de empresa; independiente de las grillas y turnos de vigilancia.</p>
            {nombreObjetivo && <p className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{nombreObjetivo}</p>}
          </div>
          <button type="button" onClick={()=>void cargar()} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Actualizar"><RefreshCw className="h-4 w-4"/></button>
        </div>
      </header>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0C121E] sm:flex-row sm:items-end sm:justify-between">
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Fecha de asistencia
          <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"/>
        </label>
        <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400"><span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1">{personal.filter(p=>p.estado_aprobacion==='aprobado').length} aprobados</span><span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1">{personal.filter(p=>p.estado_aprobacion==='pendiente').length} pendientes</span></div>
      </div>

      {fechaFutura && <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">No se pueden registrar ingresos ni egresos para un día posterior a hoy.</div>}
      {fechaPasada && !esEncargado && <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">Como vigilador, podés consultar días anteriores, pero no registrar ni modificar marcas de asistencia de esas fechas.</div>}
      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
      {mensaje && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{mensaje}</div>}

      {!objetivoId && !cargando && <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">{esEncargado?'Esta cuenta todavía no está vinculada a un objetivo.':'No tenés un objetivo activo asignado actualmente.'}</div>}

      {objetivoId && <div className="flex justify-end">
        <button type="button" onClick={()=>{setError('');setModalAltaAbierto(true)}} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"><Plus className="h-4 w-4"/> Agregar personal</button>
      </div>}

      {modalAltaAbierto && objetivoId && createPortal(<div className="fixed inset-0 z-[10000] flex h-[100dvh] w-full items-center justify-center overflow-y-auto overscroll-contain bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="alta-personal-titulo">
        <form onSubmit={registrarPersona} className="relative my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md shrink-0 space-y-4 overflow-y-auto overscroll-contain rounded-2xl border border-emerald-500/25 bg-white p-5 shadow-2xl dark:bg-[#0C121E] sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-300"><UserRoundPlus className="h-5 w-5"/></div>
            <div className="min-w-0 flex-1"><h3 id="alta-personal-titulo" className="text-lg font-black text-slate-900 dark:text-white">{esEncargado?'Dar de alta personal':'Proponer alta de personal'}</h3><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{esEncargado?'Registrá el personal y elegí una categoría propia de este objetivo.':'El encargado debe haber creado la categoría para este objetivo. El alta quedará pendiente de aprobación.'}</p></div>
            <button type="button" onClick={()=>setModalAltaAbierto(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Cerrar"><X className="h-5 w-5"/></button>
          </div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre<input required value={nombre} onChange={e=>setNombre(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"/></label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Apellido<input value={apellido} onChange={e=>setApellido(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"/></label>
          <div className="space-y-2"><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Categoría<select required value={categoria} onChange={e=>setCategoria(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">Seleccionar categoría</option>{categorias.map(c=><option key={c.id} value={c.nombre}>{c.nombre}</option>)}</select></label>{esEncargado && <div className="flex gap-2"><input value={nuevaCategoria} onChange={e=>setNuevaCategoria(e.target.value)} placeholder="Crear categoría para este objetivo" maxLength={80} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"/><button type="button" disabled={!nuevaCategoria.trim()||guardandoCategoria} onClick={()=>void crearCategoria()} className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 disabled:opacity-50 dark:text-emerald-300"><Plus className="h-4 w-4"/>Crear</button></div>}{esEncargado && categorias.length>0 && <div className="flex items-end gap-2 pt-1"><label className="block min-w-0 flex-1 text-xs font-semibold text-slate-600 dark:text-slate-400">Categoría a eliminar<select value={categoriaAEliminar?.id || ''} onChange={e=>{const seleccionada=categorias.find(cat=>cat.id===e.target.value);setCategoriaAEliminar(seleccionada||null)}} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">Seleccionar categoría…</option>{categorias.map(cat=><option key={cat.id} value={cat.id}>{cat.nombre}</option>)}</select></label><button type="button" disabled={!categoriaAEliminar||guardandoCategoria} onClick={()=>{if(categoriaAEliminar){setConfirmacionEliminarCategoria(true)}}} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-500/20 disabled:opacity-50 dark:text-red-300"><Trash2 className="h-3.5 w-3.5"/>Eliminar</button></div>}{categorias.length===0 && <p className="text-xs text-amber-700 dark:text-amber-300">{esEncargado?'Creá una categoría para poder dar de alta personal.':'Todavía no hay categorías creadas para este objetivo. Pedile al encargado que cree una.'}</p>}</div>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end"><button type="button" onClick={()=>setModalAltaAbierto(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancelar</button><button disabled={guardando||cargando||!categoria||categorias.length===0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Plus className="h-4 w-4"/>{guardando?(esEncargado?'Guardando…':'Enviando…'):(esEncargado?'Dar de alta':'Proponer alta')}</button></div>
        </form>
      </div>, document.body)}

      {confirmacionEliminarCategoria && categoriaAEliminar && createPortal(<div className="fixed inset-0 z-[11000] flex h-[100dvh] w-full items-center justify-center overflow-y-auto overscroll-contain bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="eliminar-categoria-titulo">
        <div className="my-auto w-full max-w-sm space-y-4 rounded-2xl border border-red-500/25 bg-white p-5 shadow-2xl dark:bg-[#0C121E] sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-700 dark:text-red-300"><Trash2 className="h-5 w-5"/></div>
            <div className="min-w-0 flex-1"><h3 id="eliminar-categoria-titulo" className="text-lg font-black text-slate-900 dark:text-white">Eliminar categoría</h3><p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-400">¿Querés eliminar la categoría <span className="font-bold text-slate-900 dark:text-white">“{categoriaAEliminar.nombre}”</span> de este objetivo?</p></div>
          </div>
          <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-300">La categoría se desactivará y dejará de estar disponible. Las asistencias históricas se conservarán; el personal asociado dejará de aparecer en la lista activa hasta que tenga una categoría activa.</p>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end">
            <button type="button" onClick={()=>setConfirmacionEliminarCategoria(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancelar</button>
            <button type="button" disabled={guardandoCategoria} onClick={()=>{const cat=categoriaAEliminar;setConfirmacionEliminarCategoria(false);setCategoriaAEliminar(null);if(cat)void eliminarCategoria(cat)}} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"><Trash2 className="h-4 w-4"/>{guardandoCategoria?'Eliminando…':'Eliminar categoría'}</button>
          </div>
        </div>
      </div>,document.body)}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h3 className="font-bold text-slate-900 dark:text-white">Personal del objetivo</h3>{asistencias.some(a=>!a.jornada_cerrada) && <button type="button" disabled={guardando} onClick={()=>setConfirmarCierre(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 disabled:opacity-50"><Send className="h-3.5 w-3.5"/> Cerrar jornada e informar</button>}</div>
        <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input type="search" value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar por apellido o nombre…" aria-label="Buscar personal por apellido o nombre" className="block w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 dark:border-slate-800 dark:bg-[#0C121E] dark:text-white"/></label>
        {cargando ? <div className="rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800"><RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin"/>Cargando registros…</div> : personal.length===0 ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">Todavía no hay personal registrado para este objetivo.</div> : personalPorCategoria.length===0 ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No se encontraron personas que coincidan con “{busqueda}”.</div> : <div className="space-y-5">{personalPorCategoria.map(grupo=><section key={grupo.nombre} className="space-y-2"><h4 className="sticky top-0 z-10 rounded-lg border border-slate-200 bg-slate-100/95 px-3 py-2 text-sm font-black text-slate-800 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100">{grupo.nombre}<span className="ml-2 text-xs font-semibold text-slate-500 dark:text-slate-400">({grupo.personas.length})</span></h4><div className="space-y-2">{grupo.personas.map(p=>{
          const a=asistenciaDe(p.id)
          const rechazado=p.estado_aprobacion==='rechazado'
          const marcaClase = (tipo: 'ingreso'|'egreso') => {
            const marcada = tipo === 'ingreso' ? !!a?.ingreso : !!a?.egreso
            const color = tipo === 'ingreso' ? 'emerald' : 'amber'
            return `flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${color==='emerald' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300'} ${marcada ? 'ring-1 ring-current/20' : ''} disabled:cursor-not-allowed disabled:opacity-40`
          }
          return <article key={p.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-[#0C121E]">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">{p.apellido}{p.nombre ? `, ${p.nombre}` : ''}</h4>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>{p.categoria}</span>
                  {p.estado_aprobacion!=='aprobado' && <span className={`font-semibold ${rechazado?'text-red-600 dark:text-red-300':'text-amber-600 dark:text-amber-300'}`}>{rechazado?'Rechazado':'Pendiente de aprobación'}</span>}
                  {a?.jornada_cerrada && <span className="font-semibold text-emerald-700 dark:text-emerald-300">Jornada cerrada</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="flex w-[48px] flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">Ingreso</span>
                  <button type="button" aria-label={a?.ingreso ? `Ingreso registrado a las ${hora(a.ingreso)}` : `Marcar ingreso de ${p.nombre} ${p.apellido}`} title={a?.ingreso ? `Ingreso: ${hora(a.ingreso)}` : 'Marcar ingreso'} disabled={guardando||rechazado||!!a?.ingreso||!!a?.jornada_cerrada||!puedeMarcarFecha} onClick={()=>setConfirmacionMarca({persona:p,tipo:'ingreso'})} className={marcaClase('ingreso')}><Check className={`h-5 w-5 ${a?.ingreso?'opacity-100':'opacity-0'}`}/></button>
                  <span className="text-[10px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">{hora(a?.ingreso||null)}</span>
                </div>
                <div className="flex w-[48px] flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">Egreso</span>
                  <button type="button" aria-label={a?.egreso ? `Egreso registrado a las ${hora(a.egreso)}` : `Marcar egreso de ${p.nombre} ${p.apellido}`} title={a?.egreso ? `Egreso: ${hora(a.egreso)}` : 'Marcar egreso'} disabled={guardando||rechazado||!a?.ingreso||!!a?.egreso||!!a?.jornada_cerrada||!puedeMarcarFecha} onClick={()=>setConfirmacionMarca({persona:p,tipo:'egreso'})} className={marcaClase('egreso')}><Check className={`h-5 w-5 ${a?.egreso?'opacity-100':'opacity-0'}`}/></button>
                  <span className="text-[10px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">{hora(a?.egreso||null)}</span>
                </div>
              </div>
            </div>
            {esEncargado && p.estado_aprobacion==='pendiente' && <div className="mt-2 flex gap-2 border-t border-slate-200 pt-2 dark:border-slate-800"><button type="button" disabled={guardando} onClick={()=>void revisar(p,true)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><Check className="h-4 w-4"/> Aprobar</button><button type="button" disabled={guardando} onClick={()=>void revisar(p,false)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-700 dark:text-red-300 disabled:opacity-50"><X className="h-4 w-4"/> Rechazar</button></div>}
          </article>
        })}</div></section>)}</div>}
      </div>
      {confirmacionMarca && puedeMarcarFecha && createPortal(<div className="fixed inset-0 z-[12000] flex h-[100dvh] w-full items-center justify-center overflow-y-auto overscroll-contain bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirmar-marca-titulo">
        <div className={`my-auto w-full max-w-sm space-y-4 rounded-2xl border bg-white p-5 shadow-2xl dark:bg-[#0C121E] ${confirmacionMarca.tipo==='ingreso'?'border-emerald-500/30':'border-amber-500/30'}`}>
          <div className="flex items-start gap-3">
            <div className={`rounded-xl border p-3 ${confirmacionMarca.tipo==='ingreso'?'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300':'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}><Check className="h-5 w-5"/></div>
            <div className="min-w-0 flex-1">
              <h3 id="confirmar-marca-titulo" className="text-lg font-black text-slate-900 dark:text-white">Confirmar {confirmacionMarca.tipo}</h3>
              <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-400">¿Querés registrar el {confirmacionMarca.tipo} de <span className="font-bold text-slate-900 dark:text-white">{confirmacionMarca.persona.nombre} {confirmacionMarca.persona.apellido}</span> para el {fecha.split('-').reverse().join('-')}?</p>
            </div>
            <button type="button" onClick={()=>setConfirmacionMarca(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Cancelar"><X className="h-5 w-5"/></button>
          </div>
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">Al confirmar, se guardará la hora actual. Revisá que hayas seleccionado a la persona correcta.</p>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end">
            <button type="button" onClick={()=>setConfirmacionMarca(null)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancelar</button>
            <button type="button" disabled={guardando} onClick={()=>{const marcaPendiente=confirmacionMarca;setConfirmacionMarca(null);if(marcaPendiente)void guardarMarca(marcaPendiente.persona,marcaPendiente.tipo)}} className={`rounded-xl border px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${confirmacionMarca.tipo==='ingreso'?'border-emerald-500/30 bg-emerald-600 hover:bg-emerald-700':'border-amber-500/30 bg-amber-600 hover:bg-amber-700'}`}>{guardando?'Guardando…':'Confirmar marca'}</button>
          </div>
        </div>
      </div>,document.body)}
      {confirmarCierre && <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirmar-cierre-titulo">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-emerald-500/25 bg-white shadow-2xl dark:bg-[#0C121E]">
          <div className="flex items-start gap-3 border-b border-slate-200 p-5 dark:border-slate-800">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-300"><Send className="h-5 w-5"/></div>
            <div className="min-w-0"><h3 id="confirmar-cierre-titulo" className="text-lg font-black text-slate-900 dark:text-white">Cerrar jornada e informar</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{nombreObjetivo || 'Objetivo seleccionado'} · {fecha}</p></div>
            <button type="button" onClick={()=>setConfirmarCierre(false)} className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Cancelar"><X className="h-5 w-5"/></button>
          </div>
          <div className="space-y-3 p-5"><p className="text-sm leading-6 text-slate-700 dark:text-slate-300">¿Confirmás el cierre de la jornada y el registro del informe de asistencia para el encargado?</p><div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>Una vez cerrada, la jornada no permitirá nuevas marcas de ingreso o egreso.</div></div>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:justify-end"><button type="button" onClick={()=>setConfirmarCierre(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Seguir revisando</button><button type="button" disabled={guardando} onClick={()=>void cerrarJornada()} className="rounded-xl border border-emerald-500/30 bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{guardando?'Cerrando jornada…':'Confirmar cierre'}</button></div>
        </div>
      </div>}
      {informeCerrado && <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="informe-cerrado-titulo">
        <div className="w-full max-w-sm rounded-2xl border border-emerald-500/30 bg-white p-6 text-center shadow-2xl dark:bg-[#0C121E]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"><Check className="h-7 w-7"/></div><h3 id="informe-cerrado-titulo" className="mt-4 text-lg font-black text-slate-900 dark:text-white">Informe de asistencia cerrado</h3><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">La jornada quedó cerrada y el informe registrado para consulta del encargado.</p><button type="button" onClick={()=>setInformeCerrado(false)} className="mt-5 w-full rounded-xl border border-emerald-500/30 bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">Aceptar</button>
        </div>
      </div>}
      <p className="flex items-start gap-2 text-xs leading-5 text-slate-500 dark:text-slate-400"><Clock3 className="mt-0.5 h-4 w-4 shrink-0"/>El selector de fecha permite consultar jornadas anteriores. Las marcas guardadas se mantienen separadas de la grilla de vigilancia.</p>
    </section>
  )
}
