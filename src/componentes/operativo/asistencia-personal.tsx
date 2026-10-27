import React, { useCallback, useEffect, useState } from 'react'
import { Check, ClipboardCheck, Clock3, LogIn, LogOut, Plus, RefreshCw, Send, UserRoundPlus, X } from 'lucide-react'
import { supabase } from '@/servicios/supabase'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import { useOperativo } from '@/contextos/contexto-operativo'

type Categoria = 'operario_fijo' | 'jornalero' | 'limpieza' | 'encargado' | 'otro'
type Personal = { id: string; nombre: string; apellido: string; categoria: Categoria; estado_aprobacion: 'pendiente'|'aprobado'|'rechazado'; activo: boolean }
type Asistencia = { id: string; id_personal: string; fecha: string; ingreso: string|null; egreso: string|null; jornada_cerrada: boolean; informe_enviado_en: string|null }
const categorias: {value: Categoria; label: string}[] = [
  {value:'operario_fijo',label:'Operario fijo'}, {value:'jornalero',label:'Operario jornalero'},
  {value:'limpieza',label:'Personal de limpieza'}, {value:'encargado',label:'Personal encargado'}, {value:'otro',label:'Otro'}
]
const fechaLocal = () => {
  const ahora = new Date()
  return new Date(ahora.getTime() - ahora.getTimezoneOffset()*60000).toISOString().slice(0,10)
}
const hora = (value: string|null) => value ? new Date(value).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '—'

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
  const [nombre,setNombre] = useState('')
  const [apellido,setApellido] = useState('')
  const [categoria,setCategoria] = useState<Categoria>('operario_fijo')
  const [cargando,setCargando] = useState(true)
  const [guardando,setGuardando] = useState(false)
  const [error,setError] = useState('')
  const [mensaje,setMensaje] = useState('')

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
      const [p,a] = await Promise.all([
        supabase.from('personal_empresa').select('id,nombre,apellido,categoria,estado_aprobacion,activo').eq('id_objetivo',idObjetivo).eq('activo',true).order('nombre'),
        supabase.from('asistencias_personal_empresa').select('id,id_personal,fecha,ingreso,egreso,jornada_cerrada,informe_enviado_en').eq('id_objetivo',idObjetivo).eq('fecha',fecha)
      ])
      if (p.error) throw p.error
      if (a.error) throw a.error
      setPersonal((p.data || []) as Personal[])
      setAsistencias((a.data || []) as Asistencia[])
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los registros.') }
    finally { setCargando(false) }
  },[usuario,objetivoId,objetivoVigilador,esEncargado,fecha])

  useEffect(() => { void cargar() },[cargar])

  const registrarPersona = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !usuario || !objetivoId || !nombre.trim()) return
    const objetivo = objetivos.find(o => o.id === objetivoId)
    const idEmpresa = objetivo?.id_empresa || usuario.id_empresa
    if (!idEmpresa) { setError('No se pudo identificar la empresa de este objetivo.'); return }
    setGuardando(true); setError(''); setMensaje('')
    const {error:err} = await supabase.from('personal_empresa').insert({
      id_empresa:idEmpresa,id_objetivo:objetivoId,nombre:nombre.trim(),apellido:apellido.trim(),
      categoria,estado_aprobacion:'pendiente',creado_por:usuario.id
    })
    setGuardando(false)
    if (err) { setError(err.message.includes('row-level security') ? 'Tu cuenta no tiene permiso para registrar personal en este objetivo.' : err.message); return }
    setNombre(''); setApellido(''); setCategoria('operario_fijo')
    setMensaje('Personal agregado. Queda pendiente de aprobación del encargado; el registro se conserva para la jornada.')
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
    if (!window.confirm('¿Cerrar la jornada de este objetivo y dejar el informe enviado al encargado?')) return
    setGuardando(true); setError(''); setMensaje('')
    const ids = asistencias.filter(a=>!a.jornada_cerrada).map(a=>a.id)
    for (const id of ids) {
      const {error:err} = await supabase.from('asistencias_personal_empresa').update({jornada_cerrada:true,informe_enviado_en:new Date().toISOString(),actualizado_en:new Date().toISOString()}).eq('id',id)
      if (err) { setError(err.message); setGuardando(false); return }
    }
    setGuardando(false); setMensaje('Jornada cerrada. El informe quedó registrado para consulta del encargado.'); await cargar()
  }

  const revisar = async (persona: Personal, aprobar: boolean) => {
    if (!supabase || !usuario) return
    setGuardando(true); setError(''); setMensaje('')
    const {error:err} = await supabase.from('personal_empresa').update({estado_aprobacion:aprobar?'aprobado':'rechazado',revisado_por:usuario.id,revisado_en:new Date().toISOString()}).eq('id',persona.id)
    setGuardando(false)
    if (err) setError(err.message)
    else { setMensaje(aprobar?'Personal aprobado.':'Alta rechazada.'); await cargar() }
  }

  const asistenciaDe = (id:string) => asistencias.find(a=>a.id_personal===id)
  const nombreObjetivo = objetivos.find(o=>o.id===objetivoId)?.nombre

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

      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
      {mensaje && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{mensaje}</div>}

      {!objetivoId && !cargando && <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">{esEncargado?'Esta cuenta todavía no está vinculada a un objetivo.':'No tenés un objetivo activo asignado actualmente.'}</div>}

      {objetivoId && <form onSubmit={registrarPersona} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0C121E] sm:p-5">
        <h3 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white"><UserRoundPlus className="h-5 w-5 text-emerald-600"/> Proponer alta de personal</h3>
        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Las altas nuevas quedan pendientes de revisión del encargado. La asistencia de la jornada se conserva mientras se revisa.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Nombre<input required value={nombre} onChange={e=>setNombre(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"/></label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Apellido<input value={apellido} onChange={e=>setApellido(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"/></label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 sm:col-span-2">Categoría<select value={categoria} onChange={e=>setCategoria(e.target.value as Categoria)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white">{categorias.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
        </div>
        <button disabled={guardando||cargando} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Plus className="h-4 w-4"/>{guardando?'Guardando…':'Agregar personal'}</button>
      </form>}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2"><h3 className="font-bold text-slate-900 dark:text-white">Personal del objetivo</h3>{asistencias.some(a=>!a.jornada_cerrada) && <button type="button" disabled={guardando} onClick={()=>void cerrarJornada()} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 disabled:opacity-50"><Send className="h-3.5 w-3.5"/> Cerrar jornada e informar</button>}</div>
        {cargando ? <div className="rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800"><RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin"/>Cargando registros…</div> : personal.length===0 ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">Todavía no hay personal registrado para este objetivo.</div> : personal.map(p=>{
          const a=asistenciaDe(p.id)
          const rechazado=p.estado_aprobacion==='rechazado'
          return <article key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0C121E]">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="font-bold text-slate-900 dark:text-white">{p.nombre} {p.apellido}</h4><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{categorias.find(c=>c.value===p.categoria)?.label || p.categoria}</p></div><span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${p.estado_aprobacion==='aprobado'?'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300':rechazado?'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300':'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>{p.estado_aprobacion==='aprobado'?'Aprobado':rechazado?'Rechazado':'Pendiente de aprobación'}</span></div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60"><span className="text-slate-500 dark:text-slate-400">Ingreso</span><p className="mt-1 flex items-center gap-1 font-bold text-slate-800 dark:text-slate-100"><LogIn className="h-3.5 w-3.5 text-emerald-600"/>{hora(a?.ingreso||null)}</p></div><div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60"><span className="text-slate-500 dark:text-slate-400">Egreso</span><p className="mt-1 flex items-center gap-1 font-bold text-slate-800 dark:text-slate-100"><LogOut className="h-3.5 w-3.5 text-amber-600"/>{hora(a?.egreso||null)}</p></div></div>
            {a?.jornada_cerrada && <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><Check className="h-4 w-4"/>Jornada cerrada{a.informe_enviado_en?' · informe registrado':''}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={guardando||rechazado||!!a?.ingreso||!!a?.jornada_cerrada} onClick={()=>void guardarMarca(p,'ingreso')} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300 disabled:opacity-40"><LogIn className="h-3.5 w-3.5"/> Marcar ingreso</button>
              <button type="button" disabled={guardando||rechazado||!a?.ingreso||!!a?.egreso||!!a?.jornada_cerrada} onClick={()=>void guardarMarca(p,'egreso')} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-500/20 dark:text-amber-300 disabled:opacity-40"><LogOut className="h-3.5 w-3.5"/> Marcar egreso</button>
            </div>
            {esEncargado && p.estado_aprobacion==='pendiente' && <div className="mt-3 flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-800"><button type="button" disabled={guardando} onClick={()=>void revisar(p,true)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Check className="h-4 w-4"/> Aprobar</button><button type="button" disabled={guardando} onClick={()=>void revisar(p,false)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-700 dark:text-red-300 disabled:opacity-50"><X className="h-4 w-4"/> Rechazar</button></div>}
          </article>
        })}
      </div>
      <p className="flex items-start gap-2 text-xs leading-5 text-slate-500 dark:text-slate-400"><Clock3 className="mt-0.5 h-4 w-4 shrink-0"/>El selector de fecha permite consultar jornadas anteriores. Las marcas guardadas se mantienen separadas de la grilla de vigilancia.</p>
    </section>
  )
}
