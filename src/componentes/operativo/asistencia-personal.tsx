import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Check, Clock3, Search, Plus, RefreshCw, UserRoundPlus, X, Trash2, Pencil } from 'lucide-react'
import { supabase } from '@/servicios/supabase'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import { useOperativo } from '@/contextos/contexto-operativo'

type Categoria = { id: string; nombre: string; activa: boolean }
type Personal = { id: string; nombre: string; apellido: string; categoria: string; estado_aprobacion: 'pendiente'|'aprobado'|'rechazado'; activo: boolean }
type Asistencia = { id: string; id_personal: string; fecha: string; ingreso: string|null; egreso: string|null; jornada_cerrada: boolean; informe_enviado_en: string|null }

function SelectorOdometro({valor,maximo,alCambiar,tono,etiqueta}:{valor:number;maximo:number;alCambiar:(valor:number)=>void;tono:'emerald'|'amber';etiqueta:string}) {
  const inicioY = useRef<number|null>(null)
  const valorInicial = useRef(valor)
  const pasosAplicados = useRef(0)
  const anterior = (valor + maximo) % (maximo + 1)
  const siguiente = (valor + 1) % (maximo + 1)
  const cambiarPor = (delta:number) => alCambiar((valor + delta + maximo + 1) % (maximo + 1))
  const color = tono === 'emerald'
    ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
    : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300'
  const comenzar = (e:React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    inicioY.current = e.clientY
    valorInicial.current = valor
    pasosAplicados.current = 0
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }
  const arrastrar = (e:React.PointerEvent<HTMLDivElement>) => {
    if (inicioY.current === null) return
    e.preventDefault()
    // Cada 12 px de recorrido cambia un número; cuanto más se arrastra, más pasos se aplican.
    const pasos = Math.trunc((inicioY.current - e.clientY) / 12)
    if (pasos === pasosAplicados.current) return
    pasosAplicados.current = pasos
    alCambiar((valorInicial.current + pasos + (maximo + 1) * 100) % (maximo + 1))
  }
  const terminar = () => { inicioY.current = null; pasosAplicados.current = 0 }
  return <div role="group" aria-label={etiqueta} className={`relative flex h-[104px] w-[68px] touch-none select-none flex-col items-center justify-center overflow-hidden rounded-xl border cursor-ns-resize ${color}`}
    onPointerDown={comenzar} onPointerMove={arrastrar} onPointerUp={terminar} onPointerCancel={terminar}
    onWheel={e=>{e.preventDefault();cambiarPor(e.deltaY>0?1:-1)}}>
    <div className="pointer-events-none absolute inset-x-1 top-1/3 border-t border-current opacity-15"/>
    <div className="pointer-events-none absolute inset-x-1 bottom-1/3 border-t border-current opacity-15"/>
    <div className="pointer-events-none flex h-7 w-full shrink-0 items-center justify-center text-sm font-semibold opacity-40">{String(anterior).padStart(2,'0')}</div>
    <div className="pointer-events-none flex h-10 w-full shrink-0 items-center justify-center bg-white/70 text-2xl font-black tabular-nums text-slate-900 dark:bg-slate-950/70 dark:text-white">{String(valor).padStart(2,'0')}</div>
    <div className="pointer-events-none flex h-7 w-full shrink-0 items-center justify-center text-sm font-semibold opacity-40">{String(siguiente).padStart(2,'0')}</div>
  </div>
}
const fechaLocal = () => {
  const ahora = new Date()
  return new Date(ahora.getTime() - ahora.getTimezoneOffset()*60000).toISOString().slice(0,10)
}
const hora = (value: string|null) => value ? new Date(value).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',hour12:false}) : '—'

export const AsistenciaPersonal: React.FC<{ modoGestion?: boolean }> = ({ modoGestion = false }) => {
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
  const [categoriaFiltro,setCategoriaFiltro] = useState('Todas')
  const [nombre,setNombre] = useState('')
  const [apellido,setApellido] = useState('')
  const [categoria,setCategoria] = useState('')
  const [categorias,setCategorias] = useState<Categoria[]>([])
  const [nuevaCategoria,setNuevaCategoria] = useState('')
  const [guardandoCategoria,setGuardandoCategoria] = useState(false)
  const [categoriaAEliminar,setCategoriaAEliminar] = useState<Categoria|null>(null)
  const [confirmacionEliminarCategoria,setConfirmacionEliminarCategoria] = useState(false)
  const [modalAltaAbierto,setModalAltaAbierto] = useState(false)
  const [personaEditando,setPersonaEditando] = useState<Personal|null>(null)
  const [filtroEstadoPersonal,setFiltroEstadoPersonal] = useState<'activos'|'inactivos'>('activos')
  const [confirmacionEstadoPersonal,setConfirmacionEstadoPersonal] = useState<Personal|null>(null)
  useEffect(() => {
    const abrirAltaPersonal = () => { setError(''); setModalAltaAbierto(true) }
    window.addEventListener('gsp:abrir-alta-personal', abrirAltaPersonal)
    return () => window.removeEventListener('gsp:abrir-alta-personal', abrirAltaPersonal)
  }, [])
  const [cargando,setCargando] = useState(true)
  const [guardando,setGuardando] = useState(false)
  const [error,setError] = useState('')
  const [mensaje,setMensaje] = useState('')
  const [confirmacionMarca,setConfirmacionMarca] = useState<{persona: Personal; tipo: 'ingreso'|'egreso'}|null>(null)
  const [edicionHorario,setEdicionHorario] = useState<{persona: Personal; ingreso: string; egreso: string; original: Asistencia|null}|null>(null)

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
        supabase.from('personal_empresa').select('id,nombre,apellido,categoria,estado_aprobacion,activo').eq('id_objetivo',idObjetivo).order('nombre'),
        supabase.from('asistencias_personal_empresa').select('id,id_personal,fecha,ingreso,egreso,jornada_cerrada,informe_enviado_en').eq('id_objetivo',idObjetivo).eq('fecha',fecha),
        supabase.from('categorias_personal_empresa').select('id,nombre,activa').eq('id_objetivo',idObjetivo).order('nombre')
      ])
      if (p.error) throw p.error
      if (a.error) throw a.error
      if (c.error) throw c.error
      const todasLasCategorias = (c.data || []) as Categoria[]
      const categoriasActivas = todasLasCategorias.filter(cat => cat.activa)
      const nombresCategoriasActivas = new Set(categoriasActivas.map(cat => cat.nombre.trim().toLocaleLowerCase('es-AR')))
      // La gestión conserva visibles los registros inactivos y categorías históricas; asistencia solo muestra categorías activas.
      setPersonal(((p.data || []) as Personal[]).filter(persona => modoGestion || (persona.activo && nombresCategoriasActivas.has(persona.categoria.trim().toLocaleLowerCase('es-AR')))))
      setAsistencias((a.data || []) as Asistencia[])
      setCategorias(modoGestion ? todasLasCategorias : categoriasActivas)
      setCategoria(actual => categoriasActivas.some(x=>x.nombre===actual) ? actual : (categoriasActivas[0]?.nombre || ''))
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los registros.') }
    finally { setCargando(false) }
  },[usuario,objetivoId,objetivoVigilador,esEncargado,fecha,modoGestion])

  // Cargar al entrar y cuando el usuario cambia explícitamente la fecha o cambia la cuenta/objetivo; no depender de la identidad del callback, que puede recrearse en cada render del contexto.
  useEffect(() => { void cargar() },[usuario?.id, objetivoVigilador, esEncargado, fecha])

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
    const resultado = personaEditando
      ? await supabase.from('personal_empresa').update({nombre:nombre.trim(),apellido:apellido.trim(),categoria}).eq('id',personaEditando.id).eq('id_objetivo',objetivoId)
      : await supabase.from('personal_empresa').insert({
          id_empresa:idEmpresa,id_objetivo:objetivoId,nombre:nombre.trim(),apellido:apellido.trim(),
          categoria,estado_aprobacion:esEncargado?'aprobado':'pendiente',creado_por:usuario.id,revisado_por:esEncargado?usuario.id:null,revisado_en:esEncargado?new Date().toISOString():null
        })
    setGuardando(false)
    if (resultado.error) { setError(resultado.error.message.includes('row-level security') ? 'Tu cuenta no tiene permiso para modificar personal de este objetivo.' : resultado.error.message); return }
    setNombre(''); setApellido(''); setNuevaCategoria(''); setPersonaEditando(null); setModalAltaAbierto(false)
    setMensaje(personaEditando?'Datos del personal actualizados correctamente.':esEncargado?'Personal dado de alta correctamente.':'Alta propuesta; queda pendiente de aprobación del encargado. El registro se conserva para la jornada.')
    await cargar()
  }

  const abrirAltaPersonal = () => {
    setPersonaEditando(null); setNombre(''); setApellido(''); setCategoria(categorias.find(c=>c.activa)?.nombre || '')
    setNuevaCategoria(''); setError(''); setModalAltaAbierto(true)
  }

  const abrirEdicionPersonal = (persona: Personal) => {
    setPersonaEditando(persona); setNombre(persona.nombre); setApellido(persona.apellido); setCategoria(persona.categoria)
    setNuevaCategoria(''); setError(''); setModalAltaAbierto(true)
  }

  const confirmarCambioEstadoPersonal = async () => {
    if (!supabase || !usuario || !objetivoId || !confirmacionEstadoPersonal) return
    const persona = confirmacionEstadoPersonal
    setGuardando(true); setError(''); setMensaje('')
    const {error:err} = await supabase.from('personal_empresa').update({activo:!persona.activo}).eq('id',persona.id).eq('id_objetivo',objetivoId)
    setGuardando(false)
    if (err) { setError(err.message.includes('row-level security') ? 'Tu cuenta no tiene permiso para cambiar el estado de este personal.' : err.message); return }
    setConfirmacionEstadoPersonal(null)
    setMensaje(persona.activo?'Personal dado de baja. Se conservarán sus asistencias e historial.':'Personal reactivado correctamente.')
    await cargar()
  }

  const puedeEditarHorario = esEncargado ? fecha <= fechaLocal() : fecha === fechaLocal()
  const abrirEdicionHorario = (persona: Personal) => {
    if (!puedeEditarHorario) return
    const original = asistencias.find(a=>a.id_personal===persona.id) || null
    const aHora = (v: string|null|undefined) => v ? new Date(v).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}) : ''
    setEdicionHorario({persona,ingreso:aHora(original?.ingreso),egreso:aHora(original?.egreso),original})
    setError(''); setMensaje('')
  }

  const guardarEdicionHorario = async () => {
    if (!supabase || !usuario || !objetivoId || !edicionHorario || !puedeEditarHorario) return
    const {persona,ingreso,egreso,original} = edicionHorario
    if (!ingreso) { setError('Ingresá la hora de ingreso.'); return }
    if (egreso && egreso < ingreso) { setError('La hora de egreso no puede ser anterior al ingreso.'); return }
    const convertir = (horaValor: string) => new Date(`${fecha}T${horaValor}:00`).toISOString()
    const ingresoISO = convertir(ingreso)
    const egresoISO = egreso ? convertir(egreso) : null
    const ahora = new Date().toISOString()
    setGuardando(true); setError(''); setMensaje('')
    let result
    if (!original) {
      const objetivo = objetivos.find(o=>o.id===objetivoId)
      const idEmpresa = objetivo?.id_empresa || usuario.id_empresa
      if (!idEmpresa) { setGuardando(false); setError('No se pudo identificar la empresa.'); return }
      result = await supabase.from('asistencias_personal_empresa').insert({
        id_empresa:idEmpresa,id_objetivo:objetivoId,id_personal:persona.id,fecha,
        ingreso:ingresoISO,egreso:egresoISO,registrado_por:usuario.id,actualizado_en:ahora
      }).select('id,id_personal,fecha,ingreso,egreso,jornada_cerrada,informe_enviado_en').single()
    } else {
      let query = supabase.from('asistencias_personal_empresa').update({ingreso:ingresoISO,egreso:egresoISO,actualizado_en:ahora}).eq('id',original.id)
      query = original.ingreso ? query.eq('ingreso',original.ingreso) : query.is('ingreso',null)
      query = original.egreso ? query.eq('egreso',original.egreso) : query.is('egreso',null)
      result = await query.select('id,id_personal,fecha,ingreso,egreso,jornada_cerrada,informe_enviado_en').maybeSingle()
    }
    setGuardando(false)
    if (result.error) {
      setError(result.error.code==='23505' ? 'Ya existe una asistencia para esta persona y fecha.' : result.error.message.includes('row-level security') ? 'Tu cuenta no tiene permiso para editar esta asistencia.' : result.error.message)
      return
    }
    if (!result.data) {
      setError('La asistencia fue modificada por otro usuario. Tocá Actualizar y revisá los horarios antes de volver a editar.')
      return
    }
    setAsistencias(prev=>[...prev.filter(a=>a.id_personal!==persona.id),result.data as Asistencia])
    setEdicionHorario(null)
    setMensaje('Horario de asistencia actualizado correctamente.')
  }

  const guardarMarca = async (persona: Personal, tipo: 'ingreso'|'egreso') => {
    if (!supabase || !usuario || !objetivoId) return
    const existente = asistencias.find(a=>a.id_personal===persona.id)
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
      // Actualización condicional: si el otro rol ya registró esta marca, no se sobrescribe.
      result = await supabase.from('asistencias_personal_empresa')
        .update(tipo==='ingreso'?{ingreso:marca,actualizado_en:marca}:{egreso:marca,actualizado_en:marca})
        .eq('id',existente.id)
        .is(tipo, null)
        .select('id,id_personal,fecha,ingreso,egreso,jornada_cerrada,informe_enviado_en')
        .maybeSingle()
    }
    setGuardando(false)
    if (result.error) {
      const conflicto = result.error.code === '23505' || result.error.message.toLocaleLowerCase('es-AR').includes('duplicate')
      setError(conflicto ? 'Esta asistencia acaba de ser modificada por otro usuario. Actualizá la pantalla y verificá la marca antes de volver a intentarlo.' : result.error.message.includes('row-level security') ? 'Tu cuenta no tiene permiso para marcar asistencia en este objetivo.' : result.error.message)
      if (conflicto) setMensaje('')
    } else if (!result.data && existente) {
      setError('Esta asistencia ya fue modificada por otro usuario. Actualizá la pantalla para ver la marca registrada; no se sobrescribió el cambio.')
      setMensaje('')
    } else {
      if (result.data) {
        const asistenciaGuardada = result.data as Asistencia
        setAsistencias(prev => {
          const sinAnterior = prev.filter(a => a.id !== asistenciaGuardada.id)
          return [...sinAnterior, asistenciaGuardada]
        })
      } else if (!existente) {
        // Para un ingreso recién insertado, recuperar solo cuando sea necesario con el botón Actualizar.
        setMensaje('Ingreso registrado. Para ver la hora guardada, usá Actualizar.')
        return
      }
      setMensaje(tipo==='ingreso'?'Ingreso registrado.':'Egreso registrado.')
    }
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
    const filtrado = [...personal].filter(p => (!modoGestion || (filtroEstadoPersonal === 'activos') === p.activo) && (categoriaFiltro === 'Todas' || p.categoria === categoriaFiltro) && (!termino || `${p.apellido} ${p.nombre}`.toLocaleLowerCase('es-AR').includes(termino) || `${p.nombre} ${p.apellido}`.toLocaleLowerCase('es-AR').includes(termino)))
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
  }, [personal, busqueda, categoriaFiltro, modoGestion, filtroEstadoPersonal])
  const asistenciaDe = (id:string) => asistencias.find(a=>a.id_personal===id)
  const hoyLocal = fechaLocal()
  const fechaFutura = fecha > hoyLocal
  const fechaPasada = fecha < hoyLocal
  const puedeMarcarFecha = !fechaFutura && (esEncargado || !fechaPasada)

  return (
    <section className="space-y-5 animate-fadeIn">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="min-w-0 text-lg font-black text-slate-900 dark:text-white sm:text-2xl">{modoGestion?'Personal del objetivo':'Asistencia del personal'}</h2>
          {modoGestion && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Administrá las altas, los datos y el estado del personal de tu objetivo.</p>}</div>
          {modoGestion
            ? <button type="button" onClick={abrirAltaPersonal} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"><UserRoundPlus className="h-4 w-4"/>Agregar personal</button>
            : <label className="flex shrink-0 items-center rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-[#0C121E] dark:text-slate-200"><span className="sr-only">Fecha de asistencia</span><input aria-label="Fecha de asistencia" type="date" value={fecha} onChange={e=>setFecha(e.target.value)} className="w-[145px] min-w-0 bg-transparent outline-none"/></label>}
        </div>
        <label className="relative block"><Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"/><input type="search" value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar por nombre o apellido" aria-label="Buscar personal por nombre o apellido" className="block w-full rounded-xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-sm text-slate-900 outline-none focus:border-blue-500/60 dark:border-slate-700 dark:bg-[#0C121E] dark:text-white"/></label>
        
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar por categoría">
          {['Todas',...categorias.map(cat=>cat.nombre)].map(nombreCategoria=><button key={nombreCategoria} type="button" onClick={()=>setCategoriaFiltro(nombreCategoria)} aria-pressed={categoriaFiltro===nombreCategoria} className={`shrink-0 rounded-full border-2 px-5 py-2.5 text-sm font-semibold transition ${categoriaFiltro===nombreCategoria?'border-emerald-400 bg-emerald-500/10 text-emerald-500':'border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300'}`}>{nombreCategoria}</button>)}
        </div>
        {modoGestion && <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-2 dark:border-slate-800">
          <button type="button" onClick={()=>setFiltroEstadoPersonal('activos')} aria-pressed={filtroEstadoPersonal==='activos'} className={`rounded-lg px-3 py-3 text-sm font-bold transition ${filtroEstadoPersonal==='activos'?'bg-emerald-600 text-white':'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>Activos ({personal.filter(p=>p.activo).length})</button>
          <button type="button" onClick={()=>setFiltroEstadoPersonal('inactivos')} aria-pressed={filtroEstadoPersonal==='inactivos'} className={`rounded-lg px-3 py-3 text-sm font-bold transition ${filtroEstadoPersonal==='inactivos'?'bg-slate-700 text-white':'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>Inactivos ({personal.filter(p=>!p.activo).length})</button>
        </div>}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {modoGestion ? <><span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1">{personal.filter(p=>p.activo).length} activos</span><span className="rounded-full border border-slate-500/30 bg-slate-500/10 px-3 py-1">{personal.filter(p=>!p.activo).length} inactivos</span></> : <><span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1">{personal.filter(p=>p.estado_aprobacion==='aprobado').length} aprobados</span><span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1">{personal.filter(p=>p.estado_aprobacion==='pendiente').length} pendientes</span></>}
          <button type="button" onClick={()=>void cargar()} className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-700" aria-label="Actualizar"><RefreshCw className="mr-1 inline h-3.5 w-3.5"/>Actualizar</button>
        </div>
      </div>

      {fechaFutura && <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">No se pueden registrar ingresos ni egresos para un día posterior a hoy.</div>}
      {fechaPasada && !esEncargado && <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">Como vigilador, podés consultar días anteriores, pero no registrar ni modificar marcas de asistencia de esas fechas.</div>}
      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
      {mensaje && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{mensaje}</div>}

      {!objetivoId && !cargando && <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">{esEncargado?'Esta cuenta todavía no está vinculada a un objetivo.':'No tenés un objetivo activo asignado actualmente.'}</div>}

      {objetivoId && <div className="flex justify-end">
      </div>}

      {modalAltaAbierto && objetivoId && createPortal(<div className="fixed inset-0 z-[10000] flex h-[100dvh] w-full items-center justify-center overflow-y-auto overscroll-contain bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="alta-personal-titulo">
        <form onSubmit={registrarPersona} className="relative my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md shrink-0 space-y-4 overflow-y-auto overscroll-contain rounded-2xl border border-emerald-500/25 bg-white p-5 shadow-2xl dark:bg-[#0C121E] sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-300"><UserRoundPlus className="h-5 w-5"/></div>
            <div className="min-w-0 flex-1"><h3 id="alta-personal-titulo" className="text-lg font-black text-slate-900 dark:text-white">{personaEditando?'Editar personal':esEncargado?'Dar de alta personal':'Proponer alta de personal'}</h3><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{esEncargado?'Registrá el personal y elegí una categoría propia de este objetivo.':'El encargado debe haber creado la categoría para este objetivo. El alta quedará pendiente de aprobación.'}</p></div>
            <button type="button" onClick={()=>setModalAltaAbierto(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Cerrar"><X className="h-5 w-5"/></button>
          </div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre<input required value={nombre} onChange={e=>setNombre(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"/></label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Apellido<input value={apellido} onChange={e=>setApellido(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"/></label>
          <div className="space-y-2"><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Categoría<select required value={categoria} onChange={e=>setCategoria(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">Seleccionar categoría</option>{categorias.filter(c=>c.activa || (personaEditando?.categoria===c.nombre)).map(c=><option key={c.id} value={c.nombre}>{c.nombre}{!c.activa?' (categoría inactiva)':''}</option>)}</select></label>{esEncargado && <div className="flex gap-2"><input value={nuevaCategoria} onChange={e=>setNuevaCategoria(e.target.value)} placeholder="Crear categoría para este objetivo" maxLength={80} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"/><button type="button" disabled={!nuevaCategoria.trim()||guardandoCategoria} onClick={()=>void crearCategoria()} className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 disabled:opacity-50 dark:text-emerald-300"><Plus className="h-4 w-4"/>Crear</button></div>}{esEncargado && categorias.length>0 && <div className="flex items-end gap-2 pt-1"><label className="block min-w-0 flex-1 text-xs font-semibold text-slate-600 dark:text-slate-400">Categoría a eliminar<select value={categoriaAEliminar?.id || ''} onChange={e=>{const seleccionada=categorias.find(cat=>cat.id===e.target.value);setCategoriaAEliminar(seleccionada||null)}} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="">Seleccionar categoría…</option>{categorias.map(cat=><option key={cat.id} value={cat.id}>{cat.nombre}</option>)}</select></label><button type="button" disabled={!categoriaAEliminar||guardandoCategoria} onClick={()=>{if(categoriaAEliminar){setConfirmacionEliminarCategoria(true)}}} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-500/20 disabled:opacity-50 dark:text-red-300"><Trash2 className="h-3.5 w-3.5"/>Eliminar</button></div>}{categorias.length===0 && <p className="text-xs text-amber-700 dark:text-amber-300">{esEncargado?'Creá una categoría para poder dar de alta personal.':'Todavía no hay categorías creadas para este objetivo. Pedile al encargado que cree una.'}</p>}</div>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end"><button type="button" onClick={()=>setModalAltaAbierto(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancelar</button><button disabled={guardando||cargando||!categoria||categorias.length===0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Plus className="h-4 w-4"/>{guardando?'Guardando…':personaEditando?'Guardar cambios':esEncargado?'Dar de alta':'Proponer alta'}</button></div>
        </form>
      </div>, document.body)}

      {confirmacionEstadoPersonal && createPortal(<div className="fixed inset-0 z-[11000] flex h-[100dvh] w-full items-center justify-center bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="estado-personal-titulo">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-300 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#0C121E]">
          <div><h3 id="estado-personal-titulo" className="text-lg font-black text-slate-900 dark:text-white">{confirmacionEstadoPersonal.activo?'Dar de baja personal':'Reactivar personal'}</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{confirmacionEstadoPersonal.apellido}, {confirmacionEstadoPersonal.nombre}</p></div>
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">{confirmacionEstadoPersonal.activo?'El registro dejará de aparecer en la lista activa. Las asistencias y el historial se conservarán.':'El registro volverá a estar disponible en la lista activa.'}</p>
          <div className="flex justify-end gap-2"><button type="button" disabled={guardando} onClick={()=>setConfirmacionEstadoPersonal(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Cancelar</button><button type="button" disabled={guardando} onClick={()=>void confirmarCambioEstadoPersonal()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{guardando?'Procesando…':confirmacionEstadoPersonal.activo?'Confirmar baja':'Confirmar reactivación'}</button></div>
        </div>
      </div>,document.body)}
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h3 className="font-bold text-slate-900 dark:text-white">Personal del objetivo</h3></div>
        {cargando ? <div className="rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800"><RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin"/>Cargando registros…</div> : personal.length===0 ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">Todavía no hay personal registrado para este objetivo.</div> : personalPorCategoria.length===0 ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No se encontraron personas que coincidan con “{busqueda}”.</div> : <div className="space-y-5">{personalPorCategoria.map(grupo=><section key={grupo.nombre} className="space-y-2"><h4 className="sticky top-0 z-10 rounded-lg border border-slate-200 bg-slate-100/95 px-3 py-2 text-sm font-black text-slate-800 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100">{grupo.nombre}<span className="ml-2 text-xs font-semibold text-slate-500 dark:text-slate-400">({grupo.personas.length})</span></h4><div className="space-y-2">{grupo.personas.map(p=>{
          const a=asistenciaDe(p.id)
          const rechazado=p.estado_aprobacion==='rechazado'
          const marcaClase = (tipo: 'ingreso'|'egreso') => {
            const marcada = tipo === 'ingreso' ? !!a?.ingreso : !!a?.egreso
            const color = tipo === 'ingreso' ? 'emerald' : 'amber'
            return `flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${color==='emerald' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300'} ${marcada ? 'ring-1 ring-current/20' : ''} disabled:cursor-not-allowed disabled:opacity-40`
          }
          return <article key={p.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-[#0C121E]">
            {modoGestion ? <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">{p.apellido}{p.nombre ? `, ${p.nombre}` : ''}</h4><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><span>{p.categoria}</span><span className={`rounded-full px-2 py-0.5 font-semibold ${p.activo?'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300':'bg-slate-500/10 text-slate-600 dark:text-slate-300'}`}>{p.activo?'Activo':'Inactivo'}</span></div></div>
              <div className="flex shrink-0 gap-2"><button type="button" disabled={guardando} onClick={()=>abrirEdicionPersonal(p)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Pencil className="h-3.5 w-3.5"/>Editar</button><button type="button" disabled={guardando} onClick={()=>setConfirmacionEstadoPersonal(p)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${p.activo?'border-red-500/30 bg-red-500/5 text-red-700 hover:bg-red-500/10 dark:text-red-300':'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300'}`}>{p.activo?'Dar de baja':'Reactivar'}</button></div>
            </div> : <><div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">{p.apellido}{p.nombre ? `, ${p.nombre}` : ''}</h4>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400"><span>{p.categoria}</span>{p.estado_aprobacion!=='aprobado' && <span className={`font-semibold ${rechazado?'text-red-600 dark:text-red-300':'text-amber-600 dark:text-amber-300'}`}>{rechazado?'Rechazado':'Pendiente de aprobación'}</span>}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="flex w-[48px] flex-col items-center gap-1"><span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">Ingreso</span><button type="button" aria-label={a?.ingreso ? `Ingreso registrado a las ${hora(a.ingreso)}` : `Marcar ingreso de ${p.nombre} ${p.apellido}`} title={a?.ingreso ? `Ingreso: ${hora(a.ingreso)}` : 'Marcar ingreso'} disabled={guardando||rechazado||!!a?.ingreso||!puedeMarcarFecha} onClick={()=>setConfirmacionMarca({persona:p,tipo:'ingreso'})} className={marcaClase('ingreso')}><Check className={`h-5 w-5 ${a?.ingreso?'opacity-100':'opacity-0'}`}/><span className="sr-only">Marcar ingreso</span></button><span className="text-[10px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">{hora(a?.ingreso||null)}</span></div>
                <div className="flex w-[48px] flex-col items-center gap-1"><span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">Egreso</span><button type="button" aria-label={a?.egreso ? `Egreso registrado a las ${hora(a.egreso)}` : `Marcar egreso de ${p.nombre} ${p.apellido}`} title={a?.egreso ? `Egreso: ${hora(a.egreso)}` : 'Marcar egreso'} disabled={guardando||rechazado||!a?.ingreso||!!a?.egreso||!!a?.jornada_cerrada||!puedeMarcarFecha} onClick={()=>setConfirmacionMarca({persona:p,tipo:'egreso'})} className={marcaClase('egreso')}><Check className={`h-5 w-5 ${a?.egreso?'opacity-100':'opacity-0'}`}/></button><span className="text-[10px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">{hora(a?.egreso||null)}</span></div>
                <button type="button" aria-label="Editar ingreso y egreso" title={esEncargado?'Editar ingreso y egreso':'Editar ingreso'} disabled={guardando||rechazado||!puedeEditarHorario} onClick={()=>abrirEdicionHorario(p)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-400/40 bg-slate-500/10 text-slate-600 transition-colors hover:bg-slate-500/20 dark:text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"><Pencil className="h-4 w-4"/></button>
              </div>
            </div>
            {esEncargado && p.estado_aprobacion==='pendiente' && <div className="mt-2 flex gap-2 border-t border-slate-200 pt-2 dark:border-slate-800"><button type="button" disabled={guardando} onClick={()=>void revisar(p,true)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><Check className="h-4 w-4"/> Aprobar</button><button type="button" disabled={guardando} onClick={()=>void revisar(p,false)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-700 dark:text-red-300 disabled:opacity-50"><X className="h-4 w-4"/> Rechazar</button></div>}</>}
          </article>
        })}</div></section>)}</div>}
      </div>
      {edicionHorario && createPortal(<div className="fixed inset-0 z-[12100] flex h-[100dvh] w-full items-center justify-center overflow-y-auto overscroll-contain bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="editar-horario-titulo">
        <div className="my-auto w-full max-w-sm space-y-4 rounded-2xl border border-slate-400/30 bg-white p-5 shadow-2xl dark:bg-[#0C121E]">
          <div className="flex items-start gap-3"><div className="rounded-xl border border-slate-400/30 bg-slate-500/10 p-3 text-slate-700 dark:text-slate-200"><Pencil className="h-5 w-5"/></div><div className="min-w-0 flex-1"><h3 id="editar-horario-titulo" className="text-lg font-black text-slate-900 dark:text-white">Editar asistencia</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{edicionHorario.persona.apellido}, {edicionHorario.persona.nombre} · {fecha.split('-').reverse().join('-')}</p></div><button type="button" onClick={()=>setEdicionHorario(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Cancelar"><X className="h-5 w-5"/></button></div>
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Hora de ingreso</div>
              <div className="flex items-center justify-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
                <Clock3 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300"/>
                <SelectorOdometro etiqueta="Horas de ingreso" valor={Number(edicionHorario.ingreso.split(':')[0]||0)} maximo={23} tono="emerald" alCambiar={h=>setEdicionHorario(prev=>prev?{...prev,ingreso:`${String(h).padStart(2,'0')}:${prev.ingreso.split(':')[1]||'00'}`}:prev)}/>
                <span className="text-2xl font-black text-emerald-600">:</span>
                <SelectorOdometro etiqueta="Minutos de ingreso" valor={Number(edicionHorario.ingreso.split(':')[1]||0)} maximo={59} tono="emerald" alCambiar={m=>setEdicionHorario(prev=>prev?{...prev,ingreso:`${prev.ingreso.split(':')[0]||'00'}:${String(m).padStart(2,'0')}`}:prev)}/>
              </div>
              <div className="text-center text-[11px] font-medium text-slate-500 dark:text-slate-400">Deslizá arriba o abajo para cambiar horas y minutos</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Hora de egreso</div>
              <div className="flex items-center justify-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
                <Clock3 className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300"/>
                <SelectorOdometro etiqueta="Horas de egreso" valor={Number(edicionHorario.egreso.split(':')[0]||0)} maximo={23} tono="amber" alCambiar={h=>setEdicionHorario(prev=>prev?{...prev,egreso:`${String(h).padStart(2,'0')}:${prev.egreso.split(':')[1]||'00'}`}:prev)}/>
                <span className="text-2xl font-black text-amber-600">:</span>
                <SelectorOdometro etiqueta="Minutos de egreso" valor={Number(edicionHorario.egreso.split(':')[1]||0)} maximo={59} tono="amber" alCambiar={m=>setEdicionHorario(prev=>prev?{...prev,egreso:`${prev.egreso.split(':')[0]||'00'}:${String(m).padStart(2,'0')}`}:prev)}/>
              </div>
              <div className="text-center text-[11px] font-medium text-slate-500 dark:text-slate-400">Deslizá arriba o abajo para cambiar horas y minutos</div>
            </div>
            {!esEncargado && <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">Como vigilador, podés corregir el ingreso y el egreso del día de hoy. El encargado también puede editar días anteriores.</p>}
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end"><button type="button" onClick={()=>setEdicionHorario(null)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Cancelar</button><button type="button" disabled={guardando||!edicionHorario.ingreso} onClick={()=>void guardarEdicionHorario()} className="rounded-xl border border-emerald-500/30 bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{guardando?'Guardando…':'Guardar cambios'}</button></div>
        </div>
      </div>,document.body)}
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
      <p className="flex items-start gap-2 text-xs leading-5 text-slate-500 dark:text-slate-400"><Clock3 className="mt-0.5 h-4 w-4 shrink-0"/>El selector de fecha permite consultar jornadas anteriores. Las marcas guardadas se mantienen separadas de la grilla de vigilancia.</p>
    </section>
  )
}
