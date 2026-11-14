import React, { useEffect, useMemo, useState } from 'react'
import { Calculator, CalendarDays, Moon, Sun, Settings2, ChevronDown } from 'lucide-react'
import { Tarjeta, TarjetaContenido } from '@/componentes/ui/tarjeta'
import { useOperativo } from '@/contextos/contexto-operativo'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import { supabase } from '@/servicios/supabase'
import type { Turno } from '@/tipos'
import { eliminarTurnosDuplicados, obtenerIntervaloTurno } from '@/utilidades/calculo-horas-mes'

type ConfiguracionSalarial = {
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
  descuentoViaticos: number
  descuentoObraSocialNoRemunerativo: number
  descuentoSindicatoViaticos: number
  redondeo: number
}

const CONFIG_INICIAL: ConfiguracionSalarial = {
  basico: 1053200,
  presentismo: 180000,
  viaticos: 534000,
  noRemunerativo: 60000,
  divisorHora: 200,
  porcentajeNocturno: 20,
  recargoFeriado: 100,
  recargoHorasExtras: 50,
  descuentoJubilacion: 11,
  descuentoLey19032: 3,
  descuentoObraSocial: 3,
  descuentoSindicato: 3,
  descuentoViaticos: 3,
  descuentoObraSocialNoRemunerativo: 3,
  descuentoSindicatoViaticos: 3,
  redondeo: 0.45,
}

const formatoPesos = (valor: number) => valor.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const redondearImporte = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100
const formatoHoras = (valor: number) => {
  const minutos = Math.round(valor * 60)
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')} min`
}
const fechaLocal = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`

const fechaClave = (fecha: Date) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`

function obtenerHorasPorFranja(turno: Turno, feriados: Record<string, string>) {
  const { inicio, fin } = obtenerIntervaloTurno(turno)
  let diurnos = 0
  let nocturnos = 0
  let feriadoDiurno = 0
  let feriadoNocturno = 0

  // Recorremos el turno por minutos y consultamos la fecha real de cada minuto.
  // Nunca usamos turno.es_feriado para extender el feriado a toda la jornada:
  // esa marca corresponde al casillero de inicio, no a las 12 horas completas.
  for (let cursor = inicio.getTime(); cursor < fin.getTime(); cursor += 60000) {
    const fecha = new Date(cursor)
    const hora = fecha.getHours()
    const esNocturna = hora >= 21 || hora < 6
    const esFeriado = Object.prototype.hasOwnProperty.call(feriados, fechaClave(fecha))
    if (esNocturna) {
      nocturnos++
      if (esFeriado) feriadoNocturno++
    } else {
      diurnos++
      if (esFeriado) feriadoDiurno++
    }
  }

  return { diurnos: diurnos / 60, nocturnos: nocturnos / 60, feriadoDiurno: feriadoDiurno / 60, feriadoNocturno: feriadoNocturno / 60 }
}

export const CalculadoraSueldo: React.FC = () => {
  const { turnos } = useOperativo()
  const { usuario } = useAutenticacion()
  const ahora = new Date()
  const [mes, setMes] = useState(() => fechaLocal(new Date()))
  const [config, setConfig] = useState<ConfiguracionSalarial>(CONFIG_INICIAL)
  const [mostrarConfiguracion, setMostrarConfiguracion] = useState(false)

  useEffect(() => {
    const guardado = window.localStorage.getItem('gsp-calculadora-sueldo-config')
    if (guardado) {
      try { setConfig({ ...CONFIG_INICIAL, ...JSON.parse(guardado) }) } catch { /* conserva valores iniciales */ }
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('gsp-calculadora-sueldo-config', JSON.stringify(config))
  }, [config])

  const mesesDisponibles = useMemo(() => {
    const lista = new Set(turnos.filter(t => t.id_vigilador === usuario?.id).map(t => t.fecha.slice(0, 7)))
    lista.add(fechaLocal(ahora))
    return Array.from(lista).sort((a, b) => b.localeCompare(a))
  }, [turnos, usuario?.id, ahora])

  // Se incluyen todos los turnos asignados en el mes, también los futuros:
  // la calculadora estima el mes completo según la grilla y no solo lo ya trabajado.
  const turnosMes = useMemo(() => eliminarTurnosDuplicados(turnos.filter(t =>
    t.id_vigilador === usuario?.id && t.fecha.startsWith(mes) &&
    t.tipo !== 'franco' && t.estado !== 'reemplazado' && t.estado !== 'ausente' &&
    t.horas_totales > 0
  )), [turnos, usuario?.id, mes])

  // Lee las fechas activas compartidas por objetivo y mes desde Supabase.
  // No reconstruye feriados con el calendario del dispositivo: utiliza la
  // misma lista que administra la cabecera de la grilla.
  const [feriadosPorObjetivo, setFeriadosPorObjetivo] = useState<Record<string, Record<string, string>>>({})
  useEffect(() => {
    let cancelado = false
    const cargar = async () => {
      const idsObjetivos = [...new Set(turnosMes.map(turno => turno.id_objetivo).filter(Boolean))]
      if (!idsObjetivos.length) {
        setFeriadosPorObjetivo({})
        return
      }
      const { data, error } = await (supabase as any)
        .from('feriados_grilla_objetivo')
        .select('id_objetivo, fechas')
        .in('id_objetivo', idsObjetivos)
        .eq('mes', `${mes}-01`)
      if (cancelado) return
      if (error) {
        console.error('No se pudieron cargar los feriados configurados en la grilla:', error)
        setFeriadosPorObjetivo({})
        return
      }
      const resultado: Record<string, Record<string, string>> = {}
      for (const fila of data || []) {
        resultado[fila.id_objetivo] = {}
        for (const fecha of fila.fechas || []) {
          resultado[fila.id_objetivo][String(fecha).slice(0, 10)] = 'Feriado marcado en grilla'
        }
      }
      setFeriadosPorObjetivo(resultado)
    }
    void cargar()
    return () => { cancelado = true }
  }, [turnosMes, mes])

  const horas = useMemo(() => turnosMes.reduce((total, turno) => {
    const parte = obtenerHorasPorFranja(turno, feriadosPorObjetivo[turno.id_objetivo] || {})
    total.diurnas += parte.diurnos
    total.nocturnas += parte.nocturnos
    total.feriadoDiurno += parte.feriadoDiurno
    total.feriadoNocturno += parte.feriadoNocturno
    total.extras += Number(turno.horas_extra || 0)
    return total
  }, { diurnas: 0, nocturnas: 0, feriadoDiurno: 0, feriadoNocturno: 0, extras: 0 }), [turnosMes, feriadosPorObjetivo])

  const horasFeriado = horas.feriadoDiurno + horas.feriadoNocturno

  const liquidacion = useMemo(() => {
    const valorHora = config.divisorHora > 0 ? config.basico / config.divisorHora : 0
    // El plus nocturno se calcula sobre el valor de una hora, no sobre el sueldo básico completo.
    // Las horas nocturnas feriadas también conservan su adicional nocturno.
    const adicionalNocturno = horas.nocturnas * valorHora * (config.porcentajeNocturno / 100)
    const adicionalFeriadoDiurno = horas.feriadoDiurno * valorHora * (config.recargoFeriado / 100)
    const adicionalFeriadoNocturno = horas.feriadoNocturno * valorHora * (config.recargoFeriado / 100)
    const adicionalFeriado = adicionalFeriadoDiurno + adicionalFeriadoNocturno
    // Las horas extra aprobadas en cada turno se abonan completas más su recargo.
    const adicionalHorasExtras = horas.extras * valorHora * (1 + config.recargoHorasExtras / 100)
    const remunerativo = config.basico + config.presentismo + adicionalNocturno + adicionalFeriado + adicionalHorasExtras

    // Cada concepto se redondea individualmente, como en el recibo oficial.
    const descuentoJubilacion = redondearImporte(remunerativo * config.descuentoJubilacion / 100)
    const descuentoLey19032 = redondearImporte(remunerativo * config.descuentoLey19032 / 100)
    const descuentoObraSocial = redondearImporte(remunerativo * config.descuentoObraSocial / 100)
    const descuentoSindicato = redondearImporte(remunerativo * config.descuentoSindicato / 100)
    const descuentoRem = descuentoJubilacion + descuentoLey19032 + descuentoObraSocial + descuentoSindicato
    const descuentoViaticos = redondearImporte(config.viaticos * config.descuentoViaticos / 100)
    const descuentoSindicatoViaticos = redondearImporte(config.viaticos * config.descuentoSindicatoViaticos / 100)
    const descuentoNoRem = redondearImporte(config.noRemunerativo * config.descuentoObraSocialNoRemunerativo / 100)
    const netoRem = remunerativo - descuentoRem
    const netoViaticos = config.viaticos - descuentoViaticos - descuentoSindicatoViaticos
    const netoNoRem = config.noRemunerativo - descuentoNoRem
    const valorHoraNocturna = valorHora * (1 + config.porcentajeNocturno / 100)
    const neto = netoRem + netoViaticos + netoNoRem + config.redondeo
    return { valorHora, valorHoraNocturna, adicionalNocturno, adicionalFeriadoDiurno, adicionalFeriadoNocturno, adicionalFeriado, adicionalHorasExtras, remunerativo, descuentoJubilacion, descuentoLey19032, descuentoObraSocial, descuentoSindicato, descuentoRem, descuentoViaticos, descuentoSindicatoViaticos, descuentoNoRem, netoRem, netoViaticos, netoNoRem, neto }
  }, [config, horas])

  const actualizar = (campo: keyof ConfiguracionSalarial, valor: string) => {
    setConfig(actual => ({ ...actual, [campo]: Math.max(0, Number(valor) || 0) }))
  }

  const nombreMes = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1))

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-blue-500" />
            <h2 className="text-xl font-black text-slate-900 dark:text-white">Calculadora de sueldo</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Estimación basada en tus turnos registrados en la grilla.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
          <CalendarDays className="h-4 w-4" />
          <select value={mes} onChange={e => setMes(e.target.value)} className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm capitalize text-slate-800 dark:border-slate-700 dark:bg-[#0A0F1A] dark:text-white">
            {mesesDisponibles.map(m => <option key={m} value={m}>{new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1))}</option>)}
          </select>
        </label>
      </div>

      <Tarjeta className="border-emerald-500/30">
        <TarjetaContenido className="space-y-2 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Neto estimado a cobrar · {nombreMes}</p>
          <p className="text-3xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">{formatoPesos(liquidacion.neto)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Estimación orientativa, sujeta al convenio y a la liquidación de la empresa.</p>
        </TarjetaContenido>
      </Tarjeta>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Jornadas', value: String(turnosMes.length), icon: <CalendarDays className="h-4 w-4" /> },
          { label: 'Horas diurnas', value: formatoHoras(horas.diurnas), icon: <Sun className="h-4 w-4 text-amber-500" /> },
          { label: 'Horas nocturnas', value: formatoHoras(horas.nocturnas), icon: <Moon className="h-4 w-4 text-blue-500" /> },
          { label: 'Horas feriado', value: formatoHoras(horasFeriado), icon: <CalendarDays className="h-4 w-4 text-amber-600" /> },
          { label: 'Horas extras', value: formatoHoras(horas.extras), icon: <CalendarDays className="h-4 w-4 text-rose-500" /> },
        ].map(item => <Tarjeta key={item.label}><TarjetaContenido className="p-3"><div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">{item.icon}{item.label}</div><p className="mt-2 text-lg font-black tabular-nums text-slate-900 dark:text-white">{item.value}</p></TarjetaContenido></Tarjeta>)}
      </div>

      <Tarjeta>
        <TarjetaContenido className="space-y-3 p-4 sm:p-5">
          <h3 className="font-bold text-slate-900 dark:text-white">Detalle de la liquidación</h3>
          {[
            ['Sueldo básico', config.basico],
            ['Presentismo', config.presentismo],
            [`Plus nocturno · ${horas.nocturnas.toFixed(2)} hs`, liquidacion.adicionalNocturno],
            [`Horas extras al ${config.recargoHorasExtras}% · ${horas.extras.toFixed(2)} hs`, liquidacion.adicionalHorasExtras],
            ['Valor de una hora diurna', liquidacion.valorHora],
            ['Valor de una hora nocturna (incluye plus)', liquidacion.valorHoraNocturna],
            [`Feriado diurno · ${horas.feriadoDiurno.toFixed(2)} hs`, liquidacion.adicionalFeriadoDiurno],
            [`Feriado nocturno · ${horas.feriadoNocturno.toFixed(2)} hs`, liquidacion.adicionalFeriadoNocturno],
            ['Viáticos', config.viaticos],
            ['Suma no remunerativa', config.noRemunerativo],
            ['Redondeo', config.redondeo],
          ].map(([label, value]) => <div key={String(label)} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm dark:border-slate-800"><span className="text-slate-600 dark:text-slate-300">{label}</span><strong className="tabular-nums text-slate-900 dark:text-white">{formatoPesos(Number(value))}</strong></div>)}
          <div className="space-y-2 pt-2">
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">Descuentos estimados</h4>
            {[
              [`Jubilación · ${config.descuentoJubilacion}%`, liquidacion.descuentoJubilacion],
              [`Ley 19.032 · ${config.descuentoLey19032}%`, liquidacion.descuentoLey19032],
              [`Obra social remunerativa · ${config.descuentoObraSocial}%`, liquidacion.descuentoObraSocial],
              [`Sindicato remunerativo · ${config.descuentoSindicato}%`, liquidacion.descuentoSindicato],
              [`Sindicato sobre viáticos · ${config.descuentoSindicatoViaticos}%`, liquidacion.descuentoSindicatoViaticos],
              [`Obra social no remunerativa · ${config.descuentoObraSocialNoRemunerativo}%`, liquidacion.descuentoNoRem],
            ].map(([label, value]) => <div key={String(label)} className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-500 dark:text-slate-400">{label}</span><span className="tabular-nums text-red-500">− {formatoPesos(Number(value))}</span></div>)}
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-base font-black dark:border-slate-700"><span>Neto estimado</span><span className="tabular-nums text-emerald-600 dark:text-emerald-400">{formatoPesos(liquidacion.neto)}</span></div>
        </TarjetaContenido>
      </Tarjeta>

      <Tarjeta>
        <TarjetaContenido className="space-y-3 p-4 sm:p-5">
          <button type="button" onClick={() => setMostrarConfiguracion(v => !v)} aria-expanded={mostrarConfiguracion} className="flex w-full items-center justify-between gap-3 text-left font-bold text-slate-900 dark:text-white">
            <span className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-blue-500" /> Valores salariales y parámetros</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${mostrarConfiguracion ? 'rotate-180' : ''}`} />
          </button>
          {mostrarConfiguracion && <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
            {([
              ['basico', 'Sueldo básico'],
              ['presentismo', 'Presentismo'],
              ['viaticos', 'Viáticos'],
              ['noRemunerativo', 'Suma no remunerativa'],
              ['divisorHora', 'Divisor para valor hora'],
              ['porcentajeNocturno', 'Plus nocturno (%) por hora'],
              ['recargoFeriado', 'Recargo feriado (%)'],
              ['recargoHorasExtras', 'Recargo horas extras (%)'],
              ['descuentoJubilacion', 'Jubilación (%)'],
              ['descuentoLey19032', 'Ley 19.032 (%)'],
              ['descuentoObraSocial', 'Obra social remunerativa (%)'],
              ['descuentoSindicato', 'Sindicato remunerativo (%)'],
              ['descuentoViaticos', 'Obra social sobre viáticos (%)'],
              ['descuentoSindicatoViaticos', 'Sindicato sobre viáticos (%)'],
              ['descuentoObraSocialNoRemunerativo', 'Obra social no remunerativa (%)'],
              ['redondeo', 'Redondeo del recibo ($)'],
            ] as [keyof ConfiguracionSalarial, string][]).map(([campo, etiqueta]) => <label key={campo} className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>{etiqueta}</span><input type="number" min="0" step="any" value={config[campo]} onChange={e => actualizar(campo, e.target.value)} className="min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-[#0A0F1A] dark:text-white" /></label>)}
            <p className="sm:col-span-2 text-xs leading-5 text-amber-700 dark:text-amber-300">Los valores se guardan en este dispositivo. Las horas extras se toman de las horas aprobadas registradas en cada turno y se liquidan con el recargo configurado. La configuración es personal y no modifica la liquidación oficial ni los datos de otros vigiladores.</p>
          </div>}
        </TarjetaContenido>
      </Tarjeta>
    </div>
  )
}
