import React, { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "@/servicios/supabase"
import { useAutenticacion } from "@/contextos/contexto-autenticacion"
import { useOperativo } from "@/contextos/contexto-operativo"
import { Boton } from "@/componentes/ui/boton"
import { Entrada } from "@/componentes/ui/entrada"
import { Etiqueta } from "@/componentes/ui/etiqueta"
import { Dialogo } from "@/componentes/ui/dialogo"
import { Insignia } from "@/componentes/ui/insignia"
import type { RolUsuario } from "@/tipos"

type RolPersonal = Extract<RolUsuario, "encargado_empresa" | "supervisor">
type Persona = { id:string; nombre:string; apellido:string; email:string; telefono:string|null; id_empresa:string; rol:RolPersonal; activo:boolean; debe_cambiar_contrasena:boolean; creado_en:string; dni:string; objetivo:{id:string;nombre:string}|null }
type Historial = { id:string; accion:string; entidad:string; detalle:unknown; fecha_hora:string }
type Props = { rol:RolPersonal; idEmpresaSeleccionada?:string; idObjetivoSeleccionado?:string; modoConsulta?:boolean }

export const GestionPersonalObjetivo: React.FC<Props> = ({ rol, idEmpresaSeleccionada, idObjetivoSeleccionado, modoConsulta=false }) => {
  const { usuario } = useAutenticacion()
  const { empresas, objetivos } = useOperativo()
  const [personal,setPersonal] = useState<Persona[]>([])
  const [cargando,setCargando] = useState(true)
  const [error,setError] = useState("")
  const [busqueda,setBusqueda] = useState("")
  const [filtro,setFiltro] = useState<"activos"|"inactivos">("activos")
  const [dialogo,setDialogo] = useState(false)
  const [editando,setEditando] = useState<Persona|null>(null)
  const [detalle,setDetalle] = useState<Persona|null>(null)
  const [historialPersona,setHistorialPersona] = useState<Persona|null>(null)
  const [historial,setHistorial] = useState<Historial[]>([])
  const [guardando,setGuardando] = useState(false)
  const [nombre,setNombre] = useState("")
  const [apellido,setApellido] = useState("")
  const [email,setEmail] = useState("")
  const [telefono,setTelefono] = useState("")
  const [dni,setDni] = useState("")
  const [objetivoId,setObjetivoId] = useState(idObjetivoSeleccionado||"")

  const idEmpresa = idEmpresaSeleccionada || usuario?.id_empresa || empresas[0]?.id || ""
  const objetivosEmpresa = useMemo(()=>objetivos.filter(o=>o.id_empresa===idEmpresa&&o.activo),[objetivos,idEmpresa])
  const titulo = rol === "supervisor" ? "Supervisores" : "Encargados"

  const ejecutar = useCallback(async (accion:string, extra:Record<string,unknown>={}) => {
    if(!supabase) throw new Error("Supabase no está configurado.")
    const {data,error:invokeError}=await supabase.functions.invoke("gestionar-personal-objetivo",{body:{accion,rol,id_empresa:idEmpresa,...extra}})
    if(invokeError||data?.error) throw new Error(data?.error||invokeError?.message||"No se pudo completar la operación.")
    return data
  },[rol,idEmpresa])

  const cargar = useCallback(async()=>{
    setCargando(true); setError("")
    try { const data=await ejecutar("listar"); setPersonal((data.personal||[]) as Persona[]) }
    catch(e){setError(e instanceof Error?e.message:"No se pudo cargar el personal.")}
    finally{setCargando(false)}
  },[ejecutar])
  useEffect(()=>{void cargar()},[cargar])

  const abrirCrear=()=>{setEditando(null);setNombre("");setApellido("");setEmail("");setTelefono("");setDni("");setObjetivoId(idObjetivoSeleccionado||"");setError("");setDialogo(true)}
  const abrirEditar=(p:Persona)=>{setEditando(p);setNombre(p.nombre);setApellido(p.apellido);setEmail(p.email);setTelefono(p.telefono||"");setDni(p.dni);setObjetivoId(p.objetivo?.id||"");setError("");setDialogo(true)}
  const guardar=async(e:React.FormEvent)=>{e.preventDefault();setGuardando(true);setError("")
    try{
      const payload={id:editando?.id,nombre:nombre.trim(),apellido:apellido.trim(),email:email.trim(),telefono:telefono.trim(),dni,id_objetivo:objetivoId}
      await ejecutar(editando?"editar":"crear",payload);setDialogo(false);await cargar()
    }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar la cuenta.")}
    finally{setGuardando(false)}
  }
  const restablecer=async(p:Persona)=>{if(!window.confirm("La contraseña volverá a ser el DNI y deberá cambiarla al ingresar. ¿Continuar?"))return;try{await ejecutar("restablecer_contrasena",{id:p.id});await cargar();window.alert("Contraseña restablecida correctamente. El cambio será obligatorio al ingresar.")}catch(e){setError(e instanceof Error?e.message:"No se pudo restablecer la contraseña.")}}
  const cambiarEstado=async(p:Persona)=>{const accion=p.activo?"dar_baja":"reactivar";if(!window.confirm(p.activo?"¿Dar de baja esta cuenta?":"¿Reactivar esta cuenta?"))return;try{await ejecutar(accion,{id:p.id});await cargar()}catch(e){setError(e instanceof Error?e.message:"No se pudo cambiar el estado.")}}
  const verHistorial=async(p:Persona)=>{setHistorialPersona(p);setHistorial([]);try{const d=await ejecutar("historial",{id:p.id});setHistorial(d.historial||[])}catch(e){setError(e instanceof Error?e.message:"No se pudo cargar el historial.")}}
  const visibles=personal.filter(p=>(filtro==="activos")===p.activo&&(!idObjetivoSeleccionado||p.objetivo?.id===idObjetivoSeleccionado)&&[p.nombre,p.apellido,p.email,p.dni,p.telefono||""].some(x=>x.toLowerCase().includes(busqueda.toLowerCase().trim())))
  const fmt=(fecha:string)=>{try{return new Date(fecha).toLocaleString("es-AR")}catch{return fecha}}

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-xl font-black text-slate-900 dark:text-white">{titulo}</h2><p className="mt-1 text-sm text-slate-500">Cuentas vinculadas a un único objetivo. La contraseña inicial y de restablecimiento es el DNI.</p></div>
      {!modoConsulta&&<Boton variante="primario" onClick={abrirCrear}>+ Nuevo {rol==="supervisor"?"Supervisor":"Encargado"}</Boton>}
    </div>
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-2 dark:border-slate-800">
      <button type="button" onClick={()=>setFiltro("activos")} className={`rounded-lg p-3 text-sm font-bold ${filtro==="activos"?"bg-emerald-600 text-white":"text-slate-500"}`}>Activos ({personal.filter(p=>p.activo&&(!idObjetivoSeleccionado||p.objetivo?.id===idObjetivoSeleccionado)).length})</button>
      <button type="button" onClick={()=>setFiltro("inactivos")} className={`rounded-lg p-3 text-sm font-bold ${filtro==="inactivos"?"bg-slate-600 text-white":"text-slate-500"}`}>Inactivos ({personal.filter(p=>!p.activo&&(!idObjetivoSeleccionado||p.objetivo?.id===idObjetivoSeleccionado)).length})</button>
    </div>
    <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar por nombre, DNI, teléfono o correo..." className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-[#0A0F1A] dark:text-white"/>
    {error&&<p className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">{error}</p>}
    {cargando?<p className="p-8 text-center text-sm text-slate-500">Cargando {titulo.toLowerCase()}…</p>:visibles.length===0?<p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">No hay {titulo.toLowerCase()} para mostrar.</p>:<div className="grid gap-4 lg:grid-cols-2">{visibles.map(p=><article key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0C121E]">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-lg font-bold text-slate-900 dark:text-white">{p.nombre} {p.apellido}</h3><p className="break-all text-sm text-slate-500">{p.email}</p><p className="mt-1 text-sm text-slate-500">DNI: {p.dni||"No registrado"}</p><p className="mt-1 text-sm text-slate-500">Objetivo: {p.objetivo?.nombre||"Sin objetivo"}</p></div><Insignia variante={p.activo?"verde":"gris"}>{p.activo?"Activo":"Inactivo"}</Insignia></div>
      {p.debe_cambiar_contrasena&&<p className="mt-3 rounded-lg bg-amber-500/10 p-2 text-xs font-semibold text-amber-600">Debe cambiar la contraseña al ingresar.</p>}
      <div className="mt-4 flex flex-wrap gap-2"><Boton variante="secundario" tamano="chico" onClick={()=>setDetalle(p)}>Ficha técnica</Boton><Boton variante="secundario" tamano="chico" onClick={()=>void verHistorial(p)}>Historial</Boton>{!modoConsulta&&<><Boton variante="secundario" tamano="chico" onClick={()=>abrirEditar(p)}>Editar / Asignar objetivo</Boton><Boton variante="secundario" tamano="chico" onClick={()=>void restablecer(p)}>Restablecer contraseña</Boton><Boton variante="secundario" tamano="chico" onClick={()=>void cambiarEstado(p)}>{p.activo?"Dar de baja":"Reactivar"}</Boton></>}</div>
    </article>)}</div>}
    <Dialogo abierto={dialogo} alCerrar={()=>setDialogo(false)} titulo={editando?"Editar "+(rol==="supervisor"?"supervisor":"encargado"):"Crear "+(rol==="supervisor"?"supervisor":"encargado")} subtitulo="La contraseña inicial será el DNI y el cambio será obligatorio al primer ingreso.">
      <form onSubmit={guardar} className="space-y-3">
        <div><Etiqueta requerido>Nombre</Etiqueta><Entrada value={nombre} onChange={e=>setNombre(e.target.value)} required/></div>
        <div><Etiqueta requerido>Apellido</Etiqueta><Entrada value={apellido} onChange={e=>setApellido(e.target.value)} required/></div>
        <div><Etiqueta requerido>Correo de acceso</Etiqueta><Entrada value={email} onChange={e=>setEmail(e.target.value)} type="email" required/></div>
        <div><Etiqueta requerido>DNI</Etiqueta><Entrada value={dni} onChange={e=>setDni(e.target.value)} required/><p className="mt-1 text-xs text-slate-500">Se usarán los dígitos del DNI como contraseña. Debe contener al menos 8 dígitos.</p></div>
        <div><Etiqueta>Teléfono</Etiqueta><Entrada value={telefono} onChange={e=>setTelefono(e.target.value)}/></div>
        <div><Etiqueta requerido>Objetivo exclusivo</Etiqueta><select value={objetivoId} onChange={e=>setObjetivoId(e.target.value)} required disabled={!!idObjetivoSeleccionado} className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-[#0A0F1A]"><option value="">Seleccionar objetivo</option>{objetivosEmpresa.map(o=><option key={o.id} value={o.id}>{o.nombre}</option>)}</select></div>
        {error&&<p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-3"><Boton type="button" variante="secundario" onClick={()=>setDialogo(false)}>Cancelar</Boton><Boton type="submit" variante="primario" disabled={guardando}>{guardando?"Guardando…":editando?"Guardar cambios":"Crear cuenta"}</Boton></div>
      </form>
    </Dialogo>
    <Dialogo abierto={!!detalle} alCerrar={()=>setDetalle(null)} titulo="Ficha técnica" subtitulo={titulo.slice(0,-1)}>
      {detalle&&<div className="space-y-2 text-sm"><p><strong>Nombre:</strong> {detalle.nombre} {detalle.apellido}</p><p><strong>DNI:</strong> {detalle.dni||"No registrado"}</p><p><strong>Correo:</strong> {detalle.email}</p><p><strong>Teléfono:</strong> {detalle.telefono||"No registrado"}</p><p><strong>Empresa:</strong> {empresas.find(e=>e.id===detalle.id_empresa)?.nombre||"Empresa"}</p><p><strong>Objetivo:</strong> {detalle.objetivo?.nombre||"Sin objetivo"}</p><p><strong>Alta:</strong> {fmt(detalle.creado_en)}</p><p><strong>Estado:</strong> {detalle.activo?"Activo":"Inactivo"}</p><p><strong>Contraseña:</strong> {detalle.debe_cambiar_contrasena?"Cambio obligatorio pendiente":"Contraseña personal establecida"}</p></div>}
    </Dialogo>
    <Dialogo abierto={!!historialPersona} alCerrar={()=>setHistorialPersona(null)} titulo="Historial de actividad" subtitulo={historialPersona?historialPersona.nombre+" "+historialPersona.apellido:""}>
      <div className="max-h-[60vh] space-y-2 overflow-y-auto">{historial.length?historial.map(h=><div key={h.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"><strong>{h.accion}</strong><p className="text-xs text-slate-500">{fmt(h.fecha_hora)}</p><p className="mt-1 text-xs text-slate-500">{typeof h.detalle==="object"?JSON.stringify(h.detalle):String(h.detalle||"")}</p></div>):<p className="text-sm text-slate-500">No hay registros de auditoría para esta cuenta.</p>}</div>
    </Dialogo>
  </div>
}
