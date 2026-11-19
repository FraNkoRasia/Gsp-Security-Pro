import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

type SelectorFechaProps = {
  id?: string
  value: string
  min?: string
  max?: string
  onChange: (evento: { target: { value: string } }) => void
  className?: string
  disabled?: boolean
}
const fechaISO = (fecha: Date) => [fecha.getFullYear(), String(fecha.getMonth()+1).padStart(2,'0'), String(fecha.getDate()).padStart(2,'0')].join('-')
const nombreMes = (anio: number, mes: number) => new Intl.DateTimeFormat('es-AR',{month:'long'}).format(new Date(anio,mes,1))

export const SelectorFecha: React.FC<SelectorFechaProps> = ({id,value,min,max,onChange,className='',disabled=false}) => {
  const fechaActual = value ? new Date(Number(value.slice(0,4)),Number(value.slice(5,7))-1,Number(value.slice(8,10))) : new Date()
  const [abierto,setAbierto] = useState(false)
  const [abrirArriba,setAbrirArriba] = useState(false)
  const contenedorRef = useRef<HTMLDivElement>(null)
  const botonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!abierto) return
    const cerrarFuera = (evento: PointerEvent) => { if (!contenedorRef.current?.contains(evento.target as Node)) setAbierto(false) }
    const cerrarEscape = (evento: KeyboardEvent) => { if (evento.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', cerrarFuera)
    document.addEventListener('keydown', cerrarEscape)
    const rect = botonRef.current?.getBoundingClientRect()
    if (rect) setAbrirArriba(window.innerHeight - rect.bottom < 370 && rect.top > 370)
    return () => { document.removeEventListener('pointerdown', cerrarFuera); document.removeEventListener('keydown', cerrarEscape) }
  }, [abierto])
  const [vista,setVista] = useState(() => ({anio:fechaActual.getFullYear(),mes:fechaActual.getMonth()}))
  const primerDia = new Date(vista.anio,vista.mes,1).getDay()
  const desplazamiento = (primerDia+6)%7
  const cantidadDias = new Date(vista.anio,vista.mes+1,0).getDate()
  const dias = useMemo(() => Array.from({length:Math.ceil((desplazamiento+cantidadDias)/7)*7},(_,i)=>i-desplazamiento+1),[desplazamiento,cantidadDias])
  const cambiarMes = (delta:number) => setVista(actual => { const d=new Date(actual.anio,actual.mes+delta,1); return {anio:d.getFullYear(),mes:d.getMonth()} })
  const seleccionar = (dia:number) => { const nueva=fechaISO(new Date(vista.anio,vista.mes,dia)); onChange({target:{value:nueva}}); setAbierto(false) }
  const mostrar = value ? new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'long',year:'numeric'}).format(fechaActual) : 'Seleccionar fecha'
  return <div ref={contenedorRef} className={'relative w-full '+className}>
    <button ref={botonRef} id={id} type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={abierto} onClick={()=>{setVista({anio:fechaActual.getFullYear(),mes:fechaActual.getMonth()});setAbierto(v=>!v)}} className="flex min-h-[46px] w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-left text-sm text-slate-900 shadow-xs transition hover:border-blue-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 dark:border-slate-700/80 dark:bg-[#0A0F1A] dark:text-slate-100 dark:hover:bg-slate-900">
      <span className={'truncate capitalize '+(value?'font-semibold':'text-slate-400')}>{mostrar}</span><CalendarDays className="h-4 w-4 shrink-0 text-blue-500"/>
    </button>
    {abierto && <div role="dialog" aria-label="Seleccionar fecha" className={"absolute left-0 "+(abrirArriba?"bottom-[calc(100%+8px)]":"top-[calc(100%+8px)]")+" z-[70] w-[min(100%,340px)] min-w-[280px] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-900/15 dark:border-slate-700 dark:bg-[#111827]"}>
      <div className="mb-4 flex items-center justify-between gap-2"><button type="button" aria-label="Mes anterior" onClick={()=>cambiarMes(-1)} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft className="h-4 w-4"/></button><div className="text-center"><div className="text-sm font-black capitalize text-slate-900 dark:text-white">{nombreMes(vista.anio,vista.mes)}</div><div className="text-xs font-semibold text-slate-500">{vista.anio}</div></div><button type="button" aria-label="Mes siguiente" onClick={()=>cambiarMes(1)} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4"/></button></div>
      <div className="mb-2 grid grid-cols-7 gap-1">{['Lu','Ma','Mi','Ju','Vi','Sá','Do'].map(d=><span key={d} className="py-1 text-center text-[10px] font-bold uppercase text-slate-400">{d}</span>)}</div>
      <div className="grid grid-cols-7 gap-1">{dias.map((dia,i)=>{if(dia<1||dia>cantidadDias)return <span key={i}/>;const iso=fechaISO(new Date(vista.anio,vista.mes,dia));const seleccionado=iso===value;const fuera=(min&&iso<min)||(max&&iso>max);return <button key={i} type="button" disabled={!!fuera} onClick={()=>seleccionar(dia)} className={'aspect-square rounded-xl text-xs font-semibold transition '+(seleccionado?'bg-blue-600 text-white shadow-md shadow-blue-600/20':fuera?'cursor-not-allowed text-slate-300 dark:text-slate-700':'text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-200 dark:hover:bg-blue-500/15 dark:hover:text-blue-300')}>{dia}</button>})}</div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-700"><button type="button" onClick={()=>{const hoy=fechaISO(new Date());onChange({target:{value:hoy}});setVista({anio:new Date().getFullYear(),mes:new Date().getMonth()});setAbierto(false)}} className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400">Hoy</button><button type="button" onClick={()=>setAbierto(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Cerrar</button></div>
    </div>}
  </div>
}
