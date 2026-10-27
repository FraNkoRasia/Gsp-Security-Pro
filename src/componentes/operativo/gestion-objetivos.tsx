import React, { useEffect, useState } from 'react'
import { MapPin, Plus, Edit2, Shield, Users, CheckCircle2, XCircle } from 'lucide-react'
import { Tarjeta, TarjetaContenido } from '@/componentes/ui/tarjeta'
import { Boton } from '@/componentes/ui/boton'
import { Insignia } from '@/componentes/ui/insignia'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Entrada } from '@/componentes/ui/entrada'
import { Etiqueta } from '@/componentes/ui/etiqueta'
import { useOperativo } from '@/contextos/contexto-operativo'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import type { Objetivo } from '@/tipos'
import { supabase } from '@/servicios/supabase'

export const GestionObjetivos: React.FC<{ onSeleccionarObjetivo?: (id: string) => void; idEmpresaSeleccionada?: string; modoConsulta?: boolean }> = ({ onSeleccionarObjetivo, idEmpresaSeleccionada, modoConsulta = false }) => {
  const { objetivos, asignaciones, empresas, supervisores, crearObjetivo, editarObjetivo, cambiarEstadoObjetivo } = useOperativo()
  const { usuario } = useAutenticacion()

  const [modalAbierto, setModalAbierto] = useState(false)
  const [objetivoEditando, setObjetivoEditando] = useState<Objetivo | null>(null)
  const [modalEstadoAbierto, setModalEstadoAbierto] = useState(false)
  const [objetivoEstado, setObjetivoEstado] = useState<Objetivo | null>(null)
  const [filtroEstadoObjetivos, setFiltroEstadoObjetivos] = useState<'activos' | 'inactivos'>('activos')

  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [elementosACargo, setElementosACargo] = useState('')
  const [supervisorNombre, setSupervisorNombre] = useState('')
  const [encargadoId, setEncargadoId] = useState('')
  const [crearEncargadoNuevo, setCrearEncargadoNuevo] = useState(true)
  const [encargadoNombre, setEncargadoNombre] = useState('')
  const [encargadoApellido, setEncargadoApellido] = useState('')
  const [encargadoEmail, setEncargadoEmail] = useState('')
  const [encargadoTelefono, setEncargadoTelefono] = useState('')
  const [encargadoPassword, setEncargadoPassword] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [encargadoEditando, setEncargadoEditando] = useState<{id:string;nombre:string;apellido:string;email:string;telefono:string|null;id_empresa:string|null}|null>(null)
  const [encargados, setEncargados] = useState<{id:string;nombre:string;apellido:string;id_empresa:string|null}[]>([])
  const [direccion, setDireccion] = useState('')
  const [localidad, setLocalidad] = useState('Río Cuarto')
  const [provincia, setProvincia] = useState('Córdoba')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { let vigente = true; void (async () => { if (!supabase) return; const q = supabase.from('perfiles').select('id,nombre,apellido,id_empresa').eq('rol','encargado_empresa').eq('activo',true); const {data,error:err}=await q; if(vigente && !err) setEncargados((data||[]) as {id:string;nombre:string;apellido:string;id_empresa:string|null}[]) })(); return () => { vigente=false } }, [])

  // Filtrar objetivos si es admin de empresa
  const idEmpresaActiva = idEmpresaSeleccionada || usuario?.id_empresa || empresas[0]?.id || 'emp-wall-01'
  const objetivosDeEmpresa = usuario?.rol === 'super_administrador' && !idEmpresaSeleccionada
    ? objetivos
    : objetivos.filter((o) => o.id_empresa === idEmpresaActiva)
  const objetivosMostrados = objetivosDeEmpresa.filter((o) =>
    (filtroEstadoObjetivos === 'activos') === o.activo
  )

  const abrirCrear = () => {
    setObjetivoEditando(null)
    setNombre('')
    setDescripcion('')
    setElementosACargo('')
    setSupervisorNombre('')
    setEncargadoId('')
    setCrearEncargadoNuevo(true)
    setEncargadoNombre(''); setEncargadoApellido(''); setEncargadoEmail(''); setEncargadoTelefono(''); setEncargadoPassword('')
    setDireccion('')
    setLocalidad('Río Cuarto')
    setProvincia('Córdoba')
    setError(null)
    setModalAbierto(true)
  }

  const abrirEstado = (obj: Objetivo) => {
    setObjetivoEstado(obj)
    setModalEstadoAbierto(true)
  }

  const confirmarEstado = async () => {
    if (!objetivoEstado) return
    const errorEstado = await cambiarEstadoObjetivo(objetivoEstado.id, !objetivoEstado.activo)
    if (errorEstado) { setError(errorEstado); return }
    setModalEstadoAbierto(false)
    setObjetivoEstado(null)
  }

  const abrirEditar = (obj: Objetivo) => {
    setObjetivoEditando(obj)
    setNombre(obj.nombre)
    setDescripcion(obj.descripcion || '')
    setElementosACargo(obj.elementos_a_cargo || '')
    const supervisorExistente = supervisores.find(s => s.id === obj.id_supervisor)
    setSupervisorNombre(obj.supervisor_nombre || (supervisorExistente ? `${supervisorExistente.nombre} ${supervisorExistente.apellido}`.trim() : ''))
    setEncargadoId(obj.id_encargado_empresa || '')
    setCrearEncargadoNuevo(false)
    setEncargadoNombre(''); setEncargadoApellido(''); setEncargadoEmail(''); setEncargadoTelefono(''); setEncargadoPassword('')
    setDireccion(obj.direccion)
    setLocalidad(obj.localidad)
    setProvincia(obj.provincia)
    setError(null)
    setModalAbierto(true)
  }

  const manejarGuardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!nombre.trim() || !direccion.trim()) {
      setError('El nombre y la dirección son obligatorios.')
      return
    }

    setGuardando(true)
    try {
      let idEncargado = encargadoId || null
      if (!objetivoEditando && crearEncargadoNuevo) {
        if (!encargadoNombre.trim() || !encargadoApellido.trim() || !encargadoEmail.trim() || encargadoPassword.length < 8) {
          setError('Completá nombre, apellido, correo y una contraseña inicial de al menos 8 caracteres para el encargado.')
          return
        }
        if (!supabase) { setError('Supabase no está configurado.'); return }
        const alta = await supabase.functions.invoke('gestionar-encargado-empresa', { body: { nombre: encargadoNombre.trim(), apellido: encargadoApellido.trim(), email: encargadoEmail.trim(), telefono: encargadoTelefono.trim(), password: encargadoPassword, id_empresa: idEmpresaActiva } })
        if (alta.error || alta.data?.error || !alta.data?.encargado?.id) {
          let mensaje = String(alta.data?.error || alta.error?.message || 'No se pudo crear la cuenta del encargado.')
          const contexto = (alta.error as {context?:Response}|null)?.context
          if (contexto) { try { const cuerpo = await contexto.clone().json() as {error?:string}; mensaje = cuerpo.error || mensaje } catch {} }
          setError(mensaje); return
        }
        const nuevo = alta.data.encargado as {id:string;nombre:string;apellido:string;email:string;telefono:string|null;id_empresa:string|null}
        idEncargado = nuevo.id
        setEncargados(p => [...p.filter(x => x.id !== nuevo.id), nuevo])
      }
      if (objetivoEditando) {
        editarObjetivo(objetivoEditando.id, { nombre:nombre.trim(), descripcion:descripcion.trim(), elementos_a_cargo:elementosACargo.trim(), supervisor_nombre:supervisorNombre.trim()||null, direccion:direccion.trim(), localidad:localidad.trim(), provincia:provincia.trim(), id_encargado_empresa:idEncargado })
      } else {
        crearObjetivo({ id_empresa:idEmpresaActiva, nombre:nombre.trim(), descripcion:descripcion.trim(), elementos_a_cargo:elementosACargo.trim(), supervisor_nombre:supervisorNombre.trim()||null, direccion:direccion.trim(), localidad:localidad.trim(), provincia:provincia.trim(), id_encargado_empresa:idEncargado })
      }
      setModalAbierto(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el objetivo y su encargado.')
    } finally { setGuardando(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white font-['Outfit']">
            Objetivos y Puestos de Vigilancia
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Gestión de servicios contratados, ubicaciones físicas y asignación de puestos.
          </p>
        </div>
        {!modoConsulta && <Boton
          variante="primario"
          onClick={abrirCrear}
          icono={<Plus className="w-4 h-4" />}
        >
          Nuevo Objetivo
        </Boton>}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 p-2">
        <button type="button" onClick={() => setFiltroEstadoObjetivos('activos')} aria-pressed={filtroEstadoObjetivos === 'activos'} className={`flex-1 min-w-[140px] rounded-lg px-4 py-3 text-sm font-bold transition-colors ${filtroEstadoObjetivos === 'activos' ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
          <CheckCircle2 className="inline w-4 h-4 mr-2" />Activos ({objetivosDeEmpresa.filter(o => o.activo).length})
        </button>
        <button type="button" onClick={() => setFiltroEstadoObjetivos('inactivos')} aria-pressed={filtroEstadoObjetivos === 'inactivos'} className={`flex-1 min-w-[140px] rounded-lg px-4 py-3 text-sm font-bold transition-colors ${filtroEstadoObjetivos === 'inactivos' ? 'bg-slate-700 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
          <XCircle className="inline w-4 h-4 mr-2" />Inactivos ({objetivosDeEmpresa.filter(o => !o.activo).length})
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {objetivosMostrados.map((obj) => {
          const vigiladoresAsignados = new Set(
            asignaciones
              .filter((a) => a.id_objetivo === obj.id && a.activa)
              .map((a) => a.id_vigilador)
          ).size

          return (
            <Tarjeta key={obj.id} className="hover:border-blue-500/50 transition-all flex flex-col justify-between">
              <TarjetaContenido className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 text-blue-600 dark:text-blue-400">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-base leading-snug">
                        {obj.nombre}
                      </h4>
                      <span className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                        {obj.localidad}, {obj.provincia}
                      </span>
                    </div>
                  </div>
                  {!modoConsulta && (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => abrirEditar(obj)} title="Editar objetivo" className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => abrirEstado(obj)} title={obj.activo ? 'Dar de baja' : 'Dar de alta'} className={`p-1.5 rounded-lg transition-colors ${obj.activo ? 'text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30' : 'text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'}`}>
                        {obj.activo ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>{obj.direccion}</span>
                </p>

                {obj.id_encargado_empresa && (() => { const encargado = encargados.find(e => e.id === obj.id_encargado_empresa); return <div className="flex items-start justify-between gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3"><div className="min-w-0"><p className="text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400 font-bold">Encargado de empresa</p><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{encargado ? `${encargado.nombre} ${encargado.apellido}` : 'Cuenta asignada'}</p><p className="text-xs text-slate-500 dark:text-slate-400 break-all">{encargado?.email || ''}</p></div>{!modoConsulta && encargado && <button type="button" title="Editar datos del encargado" onClick={() => setEncargadoEditando(encargado)} className="shrink-0 rounded-lg border border-slate-300/70 dark:border-slate-700 bg-white/50 dark:bg-slate-900/40 p-2 text-slate-500 hover:text-emerald-600"><Edit2 className="w-4 h-4"/></button>}</div> })()}
                {obj.descripcion && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800/80">
                    {obj.descripcion}
                  </p>
                )}

                <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                    <Users className="w-4 h-4 text-blue-500" />
                    <span>Personal: {vigiladoresAsignados} vig.</span>
                  </div>
                  <Insignia variante={obj.activo ? 'verde' : 'gris'}>
                    {obj.activo ? 'Operativo' : 'Inactivo'}
                  </Insignia>
                </div>

                {onSeleccionarObjetivo && (
                  <Boton
                    variante="primario"
                    tamano="chico"
                    className="w-fit mt-1 px-3"
                    onClick={() => onSeleccionarObjetivo(obj.id)}
                  >
                    Ver Objetivo
                  </Boton>
                )}
              </TarjetaContenido>
            </Tarjeta>
          )
        })}
        {objetivosMostrados.length === 0 && <div className="md:col-span-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500">{filtroEstadoObjetivos === 'activos' ? 'No hay objetivos activos para esta empresa.' : 'No hay objetivos inactivos para esta empresa.'}</div>}
      </div>

      <Dialogo
        abierto={modalEstadoAbierto}
        alCerrar={() => { setModalEstadoAbierto(false); setObjetivoEstado(null) }}
        titulo={objetivoEstado?.activo ? 'Dar de baja objetivo' : 'Dar de alta objetivo'}
        subtitulo={objetivoEstado?.activo ? 'El objetivo quedará inactivo para la operación.' : 'El objetivo volverá a estar disponible para la operación.'}
        icono={objetivoEstado?.activo ? <XCircle className="w-5 h-5 text-red-500" /> : <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            ¿Deseas {objetivoEstado?.activo ? 'dar de baja' : 'dar de alta'} el objetivo <strong>{objetivoEstado?.nombre}</strong>?
          </p>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Boton variante="secundario" onClick={() => { setModalEstadoAbierto(false); setObjetivoEstado(null) }}>Cancelar</Boton>
            <Boton variante={objetivoEstado?.activo ? "peligro" : "primario"} onClick={() => void confirmarEstado()}>
              {objetivoEstado?.activo ? 'Confirmar baja' : 'Confirmar alta'}
            </Boton>
          </div>
        </div>
      </Dialogo>

      <Dialogo abierto={!!encargadoEditando} alCerrar={() => setEncargadoEditando(null)} titulo="Editar encargado del objetivo" subtitulo="Actualizá los datos de acceso del encargado asignado." icono={<Users className="w-5 h-5 text-emerald-500"/>}>
        {encargadoEditando && <form className="space-y-4" onSubmit={async e => {
          e.preventDefault()
          if (!supabase || !encargadoEditando) return
          setError(null)
          try {
            const r = await supabase.functions.invoke('gestionar-encargado-empresa', { body: { accion:'editar', id:encargadoEditando.id, id_empresa:encargadoEditando.id_empresa, nombre:encargadoEditando.nombre.trim(), apellido:encargadoEditando.apellido.trim(), email:encargadoEditando.email.trim(), telefono:encargadoEditando.telefono || '' } })
            if (r.error || r.data?.error) { setError(String(r.data?.error || r.error?.message || 'No se pudieron guardar los datos.')); return }
            const actualizado = r.data.encargado
            setEncargados(p => p.map(x => x.id === actualizado.id ? actualizado : x))
            setEncargadoEditando(null)
          } catch (err) { setError(err instanceof Error ? err.message : 'No se pudieron guardar los datos.') }
        }}>
          <div><Etiqueta requerido>Nombre</Etiqueta><Entrada value={encargadoEditando.nombre} onChange={e=>setEncargadoEditando(p=>p?{...p,nombre:e.target.value}:p)}/></div>
          <div><Etiqueta requerido>Apellido</Etiqueta><Entrada value={encargadoEditando.apellido} onChange={e=>setEncargadoEditando(p=>p?{...p,apellido:e.target.value}:p)}/></div>
          <div><Etiqueta requerido>Correo de acceso</Etiqueta><Entrada type="email" value={encargadoEditando.email} onChange={e=>setEncargadoEditando(p=>p?{...p,email:e.target.value}:p)}/></div>
          <div><Etiqueta>Teléfono</Etiqueta><Entrada value={encargadoEditando.telefono||''} onChange={e=>setEncargadoEditando(p=>p?{...p,telefono:e.target.value}:p)}/></div>
          {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800 pt-3"><Boton type="button" variante="secundario" onClick={()=>setEncargadoEditando(null)}>Cancelar</Boton><Boton type="submit" variante="primario">Guardar datos</Boton></div>
        </form>}
      </Dialogo>

      {/* Modal Crear / Editar Objetivo */}
      <Dialogo
        abierto={modalAbierto}
        alCerrar={() => setModalAbierto(false)}
        titulo={objetivoEditando ? 'Editar Objetivo' : 'Nuevo Objetivo de Guardia'}
        subtitulo="Configuración del puesto de seguridad y ubicación geográfica."
        icono={<MapPin className="w-5 h-5 text-blue-500" />}
      >
        <form onSubmit={manejarGuardar} className="space-y-4">
          <div>
            <Etiqueta requerido>Nombre del Objetivo</Etiqueta>
            <Entrada
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: MercadoLibre Río Cuarto"
              autoFocus
            />
          </div>

          <div>
            <Etiqueta requerido>Dirección Completa</Etiqueta>
            <Entrada
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="Ruta Nacional 8 Km 605, Parque Industrial"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Etiqueta requerido>Localidad</Etiqueta>
              <Entrada
                value={localidad}
                onChange={(e) => setLocalidad(e.target.value)}
                placeholder="Río Cuarto"
              />
            </div>
            <div>
              <Etiqueta requerido>Provincia</Etiqueta>
              <Entrada
                value={provincia}
                onChange={(e) => setProvincia(e.target.value)}
                placeholder="Córdoba"
              />
            </div>
          </div>

          <div>
            <Etiqueta>Supervisor a Cargo</Etiqueta>
            <Entrada
              value={supervisorNombre}
              onChange={(e) => setSupervisorNombre(e.target.value)}
              placeholder="Nombre y apellido del supervisor (opcional)"
            />
          </div>

          <div>
            <Etiqueta>Elementos a Cargo del Puesto</Etiqueta>
            <textarea
              value={elementosACargo}
              onChange={(e) => setElementosACargo(e.target.value)}
              rows={3}
              placeholder="Ej: Handy Motorola VHF #12, linterna LED, llaves de acceso, libro de novedades..."
              className="w-full rounded-xl bg-white dark:bg-[#0A0F1A] border border-slate-300 dark:border-slate-700/80 p-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
            />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Estos elementos quedarán registrados en el objetivo y serán visibles para los vigiladores.</p>
          </div>

          <div>
            <Etiqueta>Descripción / Puntos de Cobertura</Etiqueta>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
              placeholder="Ej: Control de acceso vehicular, rondas perimetrales cada 2 horas, control de cámaras..."
              className="w-full rounded-xl bg-white dark:bg-[#0A0F1A] border border-slate-300 dark:border-slate-700/80 p-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Etiqueta>Encargado de empresa para este objetivo</Etiqueta>
            {!objetivoEditando && <label className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-slate-700 dark:text-slate-200"><input type="checkbox" checked={crearEncargadoNuevo} onChange={e=>setCrearEncargadoNuevo(e.target.checked)} className="mt-1 accent-emerald-600"/><span><strong>Crear una cuenta nueva para este objetivo</strong><span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">Se creará el encargado y quedará asignado al objetivo al guardar.</span></span></label>}
            {(!crearEncargadoNuevo || objetivoEditando) ? <select value={encargadoId} onChange={e=>setEncargadoId(e.target.value)} className="w-full rounded-xl bg-white dark:bg-[#0A0F1A] border border-slate-300 dark:border-slate-700/80 p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"><option value="">Sin encargado asignado</option>{encargados.filter(e=>!e.id_empresa || e.id_empresa===idEmpresaActiva).map(e=><option key={e.id} value={e.id}>{e.nombre} {e.apellido}</option>)}</select> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Etiqueta requerido>Nombre del encargado</Etiqueta><Entrada value={encargadoNombre} onChange={e=>setEncargadoNombre(e.target.value)} placeholder="Nombre"/></div>
              <div><Etiqueta requerido>Apellido del encargado</Etiqueta><Entrada value={encargadoApellido} onChange={e=>setEncargadoApellido(e.target.value)} placeholder="Apellido"/></div>
              <div><Etiqueta requerido>Correo de acceso</Etiqueta><Entrada value={encargadoEmail} onChange={e=>setEncargadoEmail(e.target.value)} placeholder="encargado@empresa.com" type="email"/></div>
              <div><Etiqueta>Teléfono</Etiqueta><Entrada value={encargadoTelefono} onChange={e=>setEncargadoTelefono(e.target.value)} placeholder="Teléfono"/></div>
              <div className="sm:col-span-2"><Etiqueta requerido>Contraseña inicial (mínimo 8 caracteres)</Etiqueta><Entrada value={encargadoPassword} onChange={e=>setEncargadoPassword(e.target.value)} placeholder="Contraseña inicial" type="password"/><p className="mt-1 text-[11px] text-slate-500">El encargado deberá cambiarla al ingresar por primera vez.</p></div>
            </div>}
            <p className="text-xs text-slate-500 dark:text-slate-400">Cada objetivo tendrá un encargado asignado; la cuenta se crea de forma segura en Supabase.</p>
          </div>

          {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Boton type="button" variante="secundario" onClick={() => setModalAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="primario" disabled={guardando}>
              {guardando ? 'Guardando…' : objetivoEditando ? 'Guardar Cambios' : 'Crear Objetivo'}
            </Boton>
          </div>
        </form>
      </Dialogo>
    </div>
  )
}
