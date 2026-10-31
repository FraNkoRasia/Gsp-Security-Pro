import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Pencil, Plus, RefreshCw, Tags, X } from 'lucide-react'
import { supabase } from '@/servicios/supabase'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import { useOperativo } from '@/contextos/contexto-operativo'

type Categoria = { id: string; nombre: string; activa: boolean }
type PersonalVinculado = { id: string; categoria_id: string | null; activo: boolean }

export const GestionCategoriasPersonal: React.FC = () => {
  const { usuario } = useAutenticacion()
  const { objetivos } = useOperativo()
  const esEncargado = usuario?.rol === 'encargado_empresa'
  const objetivoAsignado = objetivos.find(o => o.id_encargado_empresa === usuario?.id && o.activo)
  const [objetivoId, setObjetivoId] = useState('')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [personal, setPersonal] = useState<PersonalVinculado[]>([])
  const [filtroEstado, setFiltroEstado] = useState<'activas'|'inactivas'>('activas')
  const [nuevaCategoria, setNuevaCategoria] = useState('')
  const [categoriaAEditar, setCategoriaAEditar] = useState<Categoria|null>(null)
  const [nombreEditado, setNombreEditado] = useState('')
  const [categoriaADesactivar, setCategoriaADesactivar] = useState<Categoria|null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  const cargar = useCallback(async () => {
    if (!supabase || !usuario || !esEncargado) {
      setError('No tenés permisos para administrar categorías de personal.')
      setCargando(false)
      return
    }
    setCargando(true)
    setError('')
    try {
      let idObjetivo = objetivoAsignado?.id || ''
      if (!idObjetivo) {
        const { data, error: errorObjetivo } = await supabase
          .from('objetivos').select('id').eq('id_encargado_empresa', usuario.id).eq('activo', true).limit(2)
        if (errorObjetivo) throw errorObjetivo
        if ((data || []).length > 1) throw new Error('Esta cuenta está vinculada a más de un objetivo. El administrador debe corregir la asignación.')
        idObjetivo = data?.[0]?.id || ''
      }
      setObjetivoId(idObjetivo)
      if (!idObjetivo) {
        setCategorias([])
        setPersonal([])
        return
      }
      const [resultadoCategorias, resultadoPersonal] = await Promise.all([
        supabase.from('categorias_personal_empresa').select('id,nombre,activa').eq('id_objetivo', idObjetivo).order('nombre'),
        supabase.from('personal_empresa').select('id,categoria_id,activo').eq('id_objetivo', idObjetivo)
      ])
      if (resultadoCategorias.error) throw resultadoCategorias.error
      if (resultadoPersonal.error) throw resultadoPersonal.error
      setCategorias((resultadoCategorias.data || []) as Categoria[])
      setPersonal((resultadoPersonal.data || []) as PersonalVinculado[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las categorías.')
    } finally {
      setCargando(false)
    }
  }, [usuario, esEncargado, objetivoAsignado?.id])

  useEffect(() => { void cargar() }, [cargar])

  const crearCategoria = async () => {
    const nombre = nuevaCategoria.trim()
    if (!supabase || !usuario || !objetivoId || !nombre) return
    if (categorias.some(c => c.nombre.trim().toLocaleLowerCase('es-AR') === nombre.toLocaleLowerCase('es-AR'))) {
      setError('Ya existe una categoría con ese nombre en este objetivo.')
      return
    }
    const objetivo = objetivos.find(o => o.id === objetivoId)
    const idEmpresa = objetivo?.id_empresa || usuario.id_empresa
    if (!idEmpresa) { setError('No se pudo identificar la empresa de este objetivo.'); return }
    setGuardando(true); setError(''); setMensaje('')
    const { error: err } = await supabase.from('categorias_personal_empresa')
      .insert({ id_empresa: idEmpresa, id_objetivo: objetivoId, nombre, creado_por: usuario.id })
    setGuardando(false)
    if (err) { setError(err.code === '23505' ? 'Ya existe una categoría con ese nombre en este objetivo.' : err.message); return }
    setNuevaCategoria('')
    setMensaje(`Categoría “${nombre}” creada correctamente.`)
    await cargar()
  }

  const guardarEdicion = async () => {
    const nombre = nombreEditado.trim()
    if (!supabase || !objetivoId || !categoriaAEditar || !nombre) return
    if (categorias.some(c => c.id !== categoriaAEditar.id && c.nombre.trim().toLocaleLowerCase('es-AR') === nombre.toLocaleLowerCase('es-AR'))) {
      setError('Ya existe una categoría con ese nombre en este objetivo.')
      return
    }
    setGuardando(true); setError(''); setMensaje('')
    const { error: err } = await supabase.from('categorias_personal_empresa')
      .update({ nombre }).eq('id', categoriaAEditar.id).eq('id_objetivo', objetivoId)
    setGuardando(false)
    if (err) { setError(err.code === '23505' ? 'Ya existe una categoría con ese nombre en este objetivo.' : err.message); return }
    setCategoriaAEditar(null); setNombreEditado('')
    setMensaje('Nombre actualizado. El personal vinculado y su historial se conservaron.')
    await cargar()
  }

  const cambiarEstado = async (categoria: Categoria) => {
    if (!supabase || !objetivoId) return
    const activa = !categoria.activa
    setGuardando(true); setError(''); setMensaje('')
    const { error: err } = await supabase.from('categorias_personal_empresa')
      .update({ activa }).eq('id', categoria.id).eq('id_objetivo', objetivoId)
    setGuardando(false)
    if (err) { setError(err.message); return }
    setCategoriaADesactivar(null)
    setMensaje(activa
      ? `Categoría “${categoria.nombre}” reactivada y disponible para nuevas altas.`
      : `Categoría “${categoria.nombre}” desactivada. El personal vinculado sigue visible y conserva su historial.`)
    await cargar()
  }

  const categoriasVisibles = categorias.filter(c => filtroEstado === 'activas' ? c.activa : !c.activa)
  const cantidadPersonalActivo = (id: string) => personal.filter(p => p.categoria_id === id && p.activo).length

  return (
    <section className="space-y-5 animate-fadeIn">
      <header className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900/70 dark:bg-blue-950/50 dark:text-blue-400">
          <Tags className="h-5 w-5"/>
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-black text-slate-900 dark:text-white sm:text-2xl">Categorías del objetivo</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{objetivoAsignado?.nombre || 'Administrá las categorías del personal de tu objetivo.'}</p>
        </div>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0C121E]">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={nuevaCategoria} onChange={e=>setNuevaCategoria(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void crearCategoria()}}} placeholder="Nombre de la nueva categoría" maxLength={80} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"/>
          <button type="button" disabled={!nuevaCategoria.trim()||guardando||!objetivoId} onClick={()=>void crearCategoria()} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4"/>Agregar categoría</button>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Las categorías no se eliminan definitivamente. Al desactivarlas, el personal y sus registros históricos se conservan.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-1.5 dark:border-slate-800 dark:bg-[#0C121E]">
        <button type="button" onClick={()=>setFiltroEstado('activas')} aria-pressed={filtroEstado==='activas'} className={`rounded-lg px-3 py-3 text-sm font-bold transition ${filtroEstado==='activas'?'bg-emerald-600 text-white':'text-slate-600 dark:text-slate-300'}`}>Activas ({categorias.filter(c=>c.activa).length})</button>
        <button type="button" onClick={()=>setFiltroEstado('inactivas')} aria-pressed={filtroEstado==='inactivas'} className={`rounded-lg px-3 py-3 text-sm font-bold transition ${filtroEstado==='inactivas'?'bg-slate-700 text-white':'text-slate-600 dark:text-slate-300'}`}>Inactivas ({categorias.filter(c=>!c.activa).length})</button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
      {mensaje && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{mensaje}</div>}

      {cargando
        ? <div className="rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800"><RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin"/>Cargando categorías…</div>
        : !objetivoId
        ? <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">Esta cuenta todavía no está vinculada a un objetivo.</div>
        : categoriasVisibles.length === 0
        ? <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">No hay categorías {filtroEstado} para este objetivo.</div>
        : <div className="space-y-2">
            {categoriasVisibles.map(cat => {
              const cantidad = cantidadPersonalActivo(cat.id)
              return <article key={cat.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#0C121E]">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cat.activa?'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300':'bg-slate-500/10 text-slate-500 dark:text-slate-400'}`}><Tags className="h-4 w-4"/></div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">{cat.nombre}</h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{cat.activa?'Disponible para nuevas altas':'No disponible para nuevas altas'} · {cantidad} persona(s) activa(s)</p>
                </div>
                <button type="button" disabled={guardando} onClick={()=>{setCategoriaAEditar(cat);setNombreEditado(cat.nombre);setError('')}} aria-label={`Editar ${cat.nombre}`} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><Pencil className="h-4 w-4"/></button>
                <button type="button" disabled={guardando} onClick={()=>cat.activa?setCategoriaADesactivar(cat):void cambiarEstado(cat)} aria-label={cat.activa?`Desactivar ${cat.nombre}`:`Reactivar ${cat.nombre}`} className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${cat.activa?'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300':'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>{cat.activa?<X className="h-4 w-4"/>:<Check className="h-4 w-4"/>}</button>
              </article>
            })}
          </div>
      }

      {categoriaAEditar && createPortal(<div className="fixed inset-0 z-[11000] flex h-[100dvh] w-full items-center justify-center bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="editar-categoria-titulo">
        <form onSubmit={e=>{e.preventDefault();void guardarEdicion()}} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-300 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#0C121E]">
          <div><h3 id="editar-categoria-titulo" className="text-lg font-black text-slate-900 dark:text-white">Editar categoría</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">El personal vinculado y sus registros conservarán la relación.</p></div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre<input autoFocus required maxLength={80} value={nombreEditado} onChange={e=>setNombreEditado(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"/></label>
          <div className="flex justify-end gap-2"><button type="button" disabled={guardando} onClick={()=>setCategoriaAEditar(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Cancelar</button><button type="submit" disabled={guardando||!nombreEditado.trim()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{guardando?'Guardando…':'Guardar cambios'}</button></div>
        </form>
      </div>,document.body)}

      {categoriaADesactivar && createPortal(<div className="fixed inset-0 z-[11000] flex h-[100dvh] w-full items-center justify-center bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="desactivar-categoria-titulo">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-amber-500/25 bg-white p-5 shadow-2xl dark:bg-[#0C121E]">
          <div><h3 id="desactivar-categoria-titulo" className="text-lg font-black text-slate-900 dark:text-white">Desactivar categoría</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">¿Querés desactivar “{categoriaADesactivar.nombre}”?</p></div>
          <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm leading-5 text-amber-800 dark:text-amber-300">{cantidadPersonalActivo(categoriaADesactivar.id)} persona(s) activa(s) están vinculadas. Seguirán apareciendo en Personal y en los registros de asistencia, pero esta categoría no estará disponible para nuevas altas. No se borra ningún dato.</p>
          <div className="flex justify-end gap-2"><button type="button" disabled={guardando} onClick={()=>setCategoriaADesactivar(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Cancelar</button><button type="button" disabled={guardando} onClick={()=>void cambiarEstado(categoriaADesactivar)} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{guardando?'Procesando…':'Confirmar baja'}</button></div>
        </div>
      </div>,document.body)}
    </section>
  )
}
