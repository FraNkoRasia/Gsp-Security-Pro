import React, { useEffect, useState } from 'react'
import { CalendarDays, Settings2, Save } from 'lucide-react'
import { Tarjeta, TarjetaContenido } from '@/componentes/ui/tarjeta'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import { supabase } from '@/servicios/supabase'

export type ConfiguracionSalarial = {
  basico: number
  presentismo: number
  viaticos: number
  noRemunerativo: number
  divisorHora: number
  porcentajeNocturno: number
  recargoFeriado: number
  recargoHorasExtras: number
  descuentoJubilacion: number
  descuentoLey19032: number
  descuentoObraSocial: number
  descuentoSindicato: number
  descuentoObraSocialNoRemunerativo: number
  descuentoSindicatoViaticos: number
  redondeo: number
}

export const CONFIG_INICIAL: ConfiguracionSalarial = {
  basico: 1053200,
  presentismo: 180000,
  viaticos: 534000,
  noRemunerativo: 60000,
  divisorHora: 200,
  porcentajeNocturno: 0.1,
  recargoFeriado: 100,
  recargoHorasExtras: 50,
  descuentoJubilacion: 11,
  descuentoLey19032: 3,
  descuentoObraSocial: 3,
  descuentoSindicato: 3,
  descuentoObraSocialNoRemunerativo: 3,
  descuentoSindicatoViaticos: 3,
  redondeo: 0.45,
}
const fechaLocal = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,'0')}`

export const ValoresSalariales: React.FC = () => {
 const { usuario } = useAutenticacion()
 const [mes,setMes]=useState(()=>fechaLocal(new Date()))
 const [config,setConfig]=useState<ConfiguracionSalarial>(CONFIG_INICIAL)
 const [cargando,setCargando]=useState(true)
 const [existe,setExiste]=useState(false)
 const [pendiente,setPendiente]=useState(false)
 const [confirmar,setConfirmar]=useState(false)
 const [guardando,setGuardando]=useState(false)

 useEffect(()=>{let cancelado=false;const cargar=async()=>{
  setCargando(true)
  if(!usuario?.id_empresa||!supabase){setCargando(false);return}
  try{
   const {data,error}=await supabase.from('configuraciones_salariales_mensuales').select('valores').eq('id_empresa',usuario.id_empresa).eq('mes',`${mes}-01`).maybeSingle()
   if(error)throw error
   if(cancelado)return
   if(data?.valores){const valores={...CONFIG_INICIAL,...data.valores as Partial<ConfiguracionSalarial>};if(valores.porcentajeNocturno===20)valores.porcentajeNocturno=.1;setConfig(valores);setExiste(true)}
   else{setConfig(CONFIG_INICIAL);setExiste(false)}
   setPendiente(false)
  }catch(error){console.error('Error cargando valores salariales',error);if(!cancelado)window.alert('No se pudieron cargar los valores salariales.')}
  finally{if(!cancelado)setCargando(false)}
 };void cargar();return()=>{cancelado=true}},[mes,usuario?.id_empresa])

 const actualizar=(campo:keyof ConfiguracionSalarial,valor:string)=>{setConfig(actual=>({...actual,[campo]:Math.max(0,Number(valor)||0)}));setPendiente(true)}
 const guardar=async()=>{
  if(!usuario?.id||!usuario.id_empresa||!supabase){window.alert('No se pudo identificar la empresa.');return}
  setGuardando(true)
  try{
   const {error}=await supabase.from('configuraciones_salariales_mensuales').upsert({id_usuario:usuario.id,id_empresa:usuario.id_empresa,mes:`${mes}-01`,valores:config,actualizado_por:usuario.id,actualizado_en:new Date().toISOString()},{onConflict:'id_empresa,mes'})
   if(error)throw error
   setExiste(true);setPendiente(false);setConfirmar(false)
  }catch(error){console.error('Error guardando valores salariales',error);window.alert('No se pudieron guardar los valores salariales.')}
  finally{setGuardando(false)}
 }
 const nombreMes=new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric'}).format(new Date(Number(mes.slice(0,4)),Number(mes.slice(5,7))-1,1))
 return <div className="space-y-5">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
   <div><div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-blue-500"/><h2 className="text-xl font-black text-slate-900 dark:text-white">Valores salariales y parámetros</h2></div><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Configuración mensual compartida con todos los vigiladores de la empresa.</p></div>
   <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300"><CalendarDays className="h-4 w-4"/><input type="month" value={mes} onChange={e=>setMes(e.target.value)} className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-[#0A0F1A] dark:text-white"/></label>
  </div>
  <Tarjeta><TarjetaContenido className="space-y-3 p-4 sm:p-5">
   <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-900 dark:text-white">Parámetros de {nombreMes}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${existe?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>{existe?'Configuración guardada':'Mes sin configurar'}</span></div>
   {cargando?<p className="py-6 text-center text-sm text-slate-500">Cargando valores salariales...</p>:<>
    <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
     {([
      ['basico','Sueldo básico'],['presentismo','Presentismo'],['viaticos','Viáticos'],['noRemunerativo','Suma no remunerativa'],
      ['divisorHora','Divisor para valor hora'],['porcentajeNocturno','Plus nocturno (% del sueldo básico por hora)'],
      ['recargoFeriado','Recargo feriado (%)'],['recargoHorasExtras','Recargo horas extras (%)'],
      ['descuentoJubilacion','Jubilación (%)'],['descuentoLey19032','Ley 19.032 (%)'],['descuentoObraSocial','Obra social remunerativa (%)'],
      ['descuentoSindicato','Sindicato remunerativo (%)'],['descuentoSindicatoViaticos','Sindicato sobre viáticos (%)'],
      ['descuentoObraSocialNoRemunerativo','Obra social no remunerativa (%)'],['redondeo','Redondeo del recibo ($)'],
     ] as [keyof ConfiguracionSalarial,string][]).map(([campo,label])=><label key={campo} className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>{label}</span><input type="number" min="0" step="any" value={config[campo]} onChange={e=>actualizar(campo,e.target.value)} className="min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-[#0A0F1A] dark:text-white"/></label>)}
    </div>
    <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500 dark:text-slate-400">{pendiente?'Tenés cambios sin guardar.':existe?'Los cambios están guardados.':'Cargá los valores y guardalos para habilitar la calculadora.'}</p><button type="button" onClick={()=>setConfirmar(true)} disabled={(!pendiente && existe)||guardando} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4"/>Guardar cambios</button></div>
    <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">Los valores se comparten con todos los vigiladores. Cada período conserva su configuración. La antigüedad todavía no se incluye en el cálculo.</p>
   </>}
  </TarjetaContenido></Tarjeta>
  {confirmar&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!guardando)setConfirmar(false)}}><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-[#111827]"><h3 className="text-lg font-bold text-slate-900 dark:text-white">Confirmar cambios</h3><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">¿Guardar los valores de <strong className="capitalize">{nombreMes}</strong> para todos los vigiladores?</p><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={()=>setConfirmar(false)} disabled={guardando} className="min-h-11 rounded-xl border px-4 py-2 text-sm">Cancelar</button><button type="button" onClick={guardar} disabled={guardando} className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">{guardando?'Guardando...':'Confirmar y guardar'}</button></div></div></div>}
 </div>
}
