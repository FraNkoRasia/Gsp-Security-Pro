import React, { useEffect, useMemo, useState } from 'react'
import { Calculator, CalendarDays, Moon, Sun, Settings2, ChevronDown, Save } from 'lucide-react'
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

const formatoPesos = (valor: number) => valor.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const redondearImporte = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100
const formatoHoras = (valor: number) => {
  const minutos = Math.round(valor * 60)
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')} min`
}
const HORAS_BASE_MENSUAL = 200

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
  const [cambiosPendientes, setCambiosPendientes] = useState(false)
  const [mostrarConfirmacionGuardado, setMostrarConfirmacionGuardado] = useState(false)
  const [guardandoConfiguracion, setGuardandoConfiguracion] = useState(false)

  // La configuración salarial se consulta siempre en Supabase.
  // Si el mes no tiene una fila propia, hereda la última configuración anterior.
  useEffect(() => {
    let cancelado = false
    const clienteSupabase = supabase
    const cargarConfiguracion = async () => {
      if (!usuario?.id || !clienteSupabase) {
        setConfig(CONFIG_INICIAL)
        setCambiosPendientes(false)
        return
      }

      try {
        const { data: configuracionMensual, error: errorMensual } = await clienteSupabase
          .from('configuraciones_salariales_mensuales')
          .select('valores')
          .eq('id_usuario', usuario.id)
          .eq('mes', `${mes}-01`)
          .maybeSingle()

        if (errorMensual) throw errorMensual

        let valoresGuardados = configuracionMensual?.valores as Partial<ConfiguracionSalarial> | null

        if (!valoresGuardados) {
          const { data: configuracionAnterior, error: errorAnterior } = await clienteSupabase
            .from('configuraciones_salariales_mensuales')
            .select('valores')
            .eq('id_usuario', usuario.id)
            .lt('mes', `${mes}-01`)
            .order('mes', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (errorAnterior) throw errorAnterior
          valoresGuardados = configuracionAnterior?.valores as Partial<ConfiguracionSalarial> | null
        }

        if (cancelado) return
        const valores = { ...CONFIG_INICIAL, ...(valoresGuardados || {}) }
        if (valores.porcentajeNocturno === 20) valores.porcentajeNocturno = 0.1
        setConfig(valores)
      } catch (error) {
        console.error('No se pudo cargar la configuración salarial desde Supabase:', error)
        if (!cancelado) {
          setConfig(CONFIG_INICIAL)
          window.alert('No se pudieron cargar los valores salariales desde la base de datos. Verificá tu conexión e intentá nuevamente.')
        }
      } finally {
        if (!cancelado) setCambiosPendientes(false)
      }
    }

    void cargarConfiguracion()
    return () => { cancelado = true }
  }, [mes, usuario?.id])

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
      const [anioMes, numeroMes] = mes.split('-').map(Number)
      const fechaMesSiguiente = new Date(anioMes, numeroMes, 1)
      const mesSiguiente = `${fechaMesSiguiente.getFullYear()}-${String(fechaMesSiguiente.getMonth() + 1).padStart(2, '0')}`
      const mesesConsulta = [`${mes}-01`, `${mesSiguiente}-01`]
      const { data, error } = await (supabase as any)
        .from('feriados_grilla_objetivo')
        .select('id_objetivo, fechas')
        .in('id_objetivo', idsObjetivos)
        .in('mes', mesesConsulta)
      if (cancelado) return
      if (error) {
        console.error('No se pudieron cargar los feriados configurados en la grilla:', error)
        setFeriadosPorObjetivo({})
        return
      }
      const resultado: Record<string, Record<string, string>> = {}
      for (const fila of data || []) {
        // Un objetivo puede tener una fila por cada mes consultado.
        // No reiniciar el mapa: eso borraba las fechas del primer mes al leer el segundo.
        resultado[fila.id_objetivo] ||= {}
        for (const fecha of fila.fechas || []) {
          const fechaClave = String(fecha).trim().slice(0, 10)
          // Un turno puede cruzar al mes siguiente; se conservan ambos meses.
          if (/^\\d{4}-\\d{2}-\\d{2}$/.test(fechaClave) &&
            (fechaClave.startsWith(`${mes}-`) || fechaClave.startsWith(`${mesSiguiente}-`))) {
            resultado[fila.id_objetivo][fechaClave] = 'Feriado marcado por administrador'
          }
        }
      }
      setFeriadosPorObjetivo(resultado)
    }
    const recargar = () => { void cargar() }
    void cargar()
    window.addEventListener('gsp-feriados-grilla-actualizados', recargar)
    window.addEventListener('focus', recargar)
    document.addEventListener('visibilitychange', recargar)
    return () => {
      cancelado = true
      window.removeEventListener('gsp-feriados-grilla-actualizados', recargar)
      window.removeEventListener('focus', recargar)
      document.removeEventListener('visibilitychange', recargar)
    }
  }, [turnosMes, mes])

  const horas = useMemo(() => turnosMes.reduce((total, turno) => {
    const parte = obtenerHorasPorFranja(turno, feriadosPorObjetivo[turno.id_objetivo] || {})
    total.diurnas += parte.diurnos
    total.nocturnas += parte.nocturnos
    total.feriadoDiurno += parte.feriadoDiurno
    total.feriadoNocturno += parte.feriadoNocturno
    total.totales += parte.diurnos + parte.nocturnos
    return total
  }, { diurnas: 0, nocturnas: 0, feriadoDiurno: 0, feriadoNocturno: 0, totales: 0, extras: 0 }), [turnosMes, feriadosPorObjetivo])

  // El convenio liquida como extras las horas que superan las 200 horas mensuales.
  // No dependemos del campo horas_extra de cada turno, que puede permanecer en cero.
  horas.extras = Math.max(0, horas.totales - HORAS_BASE_MENSUAL)

  const horasFeriado = horas.feriadoDiurno + horas.feriadoNocturno

  const liquidacion = useMemo(() => {
    const valorHora = config.divisorHora > 0 ? config.basico / config.divisorHora : 0
    // El adicional nocturno es el 0,10% del sueldo básico por cada hora nocturna.
    // Las horas nocturnas feriadas también conservan su adicional nocturno.
    const adicionalNocturnoPorHora = config.basico * (config.porcentajeNocturno / 100)
    const adicionalNocturno = horas.nocturnas * adicionalNocturnoPorHora
    const adicionalFeriadoDiurno = horas.feriadoDiurno * valorHora * (config.recargoFeriado / 100)
    // El feriado nocturno suma el recargo de feriado y el adicional nocturno propio de esas horas.
    // El adicional nocturno mensual general se mantiene separado; este importe evita perder el plus nocturno en el concepto feriado.
    const adicionalFeriadoNocturno = horas.feriadoNocturno * (valorHora * (config.recargoFeriado / 100) + adicionalNocturnoPorHora)
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
    const descuentoSindicatoViaticos = redondearImporte(config.viaticos * config.descuentoSindicatoViaticos / 100)
    const descuentoNoRem = redondearImporte(config.noRemunerativo * config.descuentoObraSocialNoRemunerativo / 100)
    const netoRem = remunerativo - descuentoRem
    // El recibo aplica un único descuento del 3% sobre viáticos: sindicato s/AC.
    const netoViaticos = config.viaticos - descuentoSindicatoViaticos
    const netoNoRem = config.noRemunerativo - descuentoNoRem
    const neto = netoRem + netoViaticos + netoNoRem + config.redondeo
    return { adicionalNocturno, adicionalFeriado, adicionalFeriadoDiurno, adicionalFeriadoNocturno, adicionalHorasExtras, remunerativo, descuentoJubilacion, descuentoLey19032, descuentoObraSocial, descuentoSindicato, descuentoRem, descuentoSindicatoViaticos, descuentoNoRem, netoRem, netoViaticos, netoNoRem, neto }
  }, [config, horas])

  const actualizar = (campo: keyof ConfiguracionSalarial, valor: string) => {
    setConfig(actual => ({ ...actual, [campo]: Math.max(0, Number(valor) || 0) }))
    setCambiosPendientes(true)
  }

  const guardarConfiguracion = async () => {
    const clienteSupabase = supabase
    if (!usuario?.id || !clienteSupabase) {
      window.alert('No se pudo identificar el usuario para guardar los valores salariales.')
      return
    }

    setGuardandoConfiguracion(true)
    try {
      const { error } = await clienteSupabase
        .from('configuraciones_salariales_mensuales')
        .upsert({
          id_usuario: usuario.id,
          mes: `${mes}-01`,
          valores: config,
          actualizado_por: usuario.id,
          actualizado_en: new Date().toISOString(),
        }, { onConflict: 'id_usuario,mes' })

      if (error) throw error

      setCambiosPendientes(false)
      setMostrarConfirmacionGuardado(false)
    } catch (error) {
      console.error('No se pudieron guardar los valores salariales:', error)
      window.alert('No se pudieron guardar los valores salariales en la base de datos.')
    } finally {
      setGuardandoConfiguracion(false)
    }
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
          { label: 'Horas trabajadas', value: formatoHoras(horas.totales), icon: <CalendarDays className="h-4 w-4" /> },
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
            [`Horas nocturnas · ${horas.nocturnas.toFixed(2)} hs`, liquidacion.adicionalNocturno],
            [`Horas extras al ${config.recargoHorasExtras}% · ${horas.extras.toFixed(2)} hs`, liquidacion.adicionalHorasExtras],
            [`Feriados · ${horasFeriado.toFixed(2)} hs`, liquidacion.adicionalFeriado],
            ['Viáticos', config.viaticos],
            ['Suma no remunerativa', config.noRemunerativo],
          ].map(([label, value]) => (
            <React.Fragment key={String(label)}>
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm dark:border-slate-800"><span className="text-slate-600 dark:text-slate-300">{label}</span><strong className="tabular-nums text-slate-900 dark:text-white">{formatoPesos(Number(value))}</strong></div>
              {String(label).startsWith('Feriados') && (
                <div className="-mt-2 flex flex-col gap-1 border-b border-slate-100 pb-3 pl-3 text-xs dark:border-slate-800">
                  <div className="flex items-center justify-between gap-3"><span className="text-slate-500 dark:text-slate-400">Horas feriadas diurnas</span><span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{horas.feriadoDiurno.toFixed(2)} hs</span></div>
                  <div className="flex items-center justify-between gap-3"><span className="text-slate-500 dark:text-slate-400">Horas feriadas nocturnas</span><span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{horas.feriadoNocturno.toFixed(2)} hs</span></div>
                </div>
              )}
            </React.Fragment>
          ))}
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
              ['porcentajeNocturno', 'Plus nocturno (% del sueldo básico por hora)'],
              ['recargoFeriado', 'Recargo feriado (%)'],
              ['recargoHorasExtras', 'Recargo horas extras (%)'],
              ['descuentoJubilacion', 'Jubilación (%)'],
              ['descuentoLey19032', 'Ley 19.032 (%)'],
              ['descuentoObraSocial', 'Obra social remunerativa (%)'],
              ['descuentoSindicato', 'Sindicato remunerativo (%)'],
              ['descuentoSindicatoViaticos', 'Sindicato sobre viáticos (%)'],
              ['descuentoObraSocialNoRemunerativo', 'Obra social no remunerativa (%)'],
              ['redondeo', 'Redondeo del recibo ($)'],
            ] as [keyof ConfiguracionSalarial, string][]).map(([campo, etiqueta]) => <label key={campo} className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>{etiqueta}</span><input type="number" min="0" step="any" value={config[campo]} onChange={e => actualizar(campo, e.target.value)} className="min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-[#0A0F1A] dark:text-white" /></label>)}
            <div className="sm:col-span-2 flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500 dark:text-slate-400">Configuración correspondiente a {nombreMes}. {cambiosPendientes ? 'Tenés cambios sin guardar.' : 'Todos los cambios están guardados.'}</p>
              <button type="button" onClick={() => setMostrarConfirmacionGuardado(true)} disabled={!cambiosPendientes} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" />Guardar cambios</button>
            </div>
            <p className="sm:col-span-2 text-xs leading-5 text-amber-700 dark:text-amber-300">Los valores se guardan en la base de datos. Las horas extras se calculan automáticamente sobre el total mensual trabajado: toda hora que supere las 200 horas se liquida con el recargo configurado. La configuración es personal y no modifica la liquidación oficial ni los datos de otros vigiladores.</p>
          </div>}
        </TarjetaContenido>
      </Tarjeta>

      {mostrarConfirmacionGuardado && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !guardandoConfiguracion) setMostrarConfirmacionGuardado(false) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="titulo-confirmar-guardado" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#111827] sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                <Save className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="titulo-confirmar-guardado" className="text-lg font-bold text-slate-900 dark:text-white">Confirmar cambios</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  ¿Querés guardar los valores salariales y parámetros de <strong className="capitalize">{nombreMes}</strong>?
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Se guardarán en la base de datos para este mes y reemplazarán la configuración que ya estuviera guardada para ese período. Los demás meses no se modificarán.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setMostrarConfirmacionGuardado(false)} disabled={guardandoConfiguracion} className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                Cancelar
              </button>
              <button type="button" onClick={guardarConfiguracion} disabled={guardandoConfiguracion} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
                {guardandoConfiguracion ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />Guardando...</> : <><Save className="h-4 w-4" />Confirmar y guardar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
