import React, { useEffect, useMemo, useState } from 'react'
import { Calculator, CalendarDays, Moon, Sun } from 'lucide-react'
import { Tarjeta, TarjetaContenido } from '@/componentes/ui/tarjeta'
import { useOperativo } from '@/contextos/contexto-operativo'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import { supabase } from '@/servicios/supabase'
import { CONFIG_INICIAL, type ConfiguracionSalarial } from '@/componentes/operativo/valores-salariales'
import { eliminarTurnosDuplicados, obtenerIntervaloTurno } from '@/utilidades/calculo-horas-mes'

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

type CalculadoraSueldoProps = { vigiladorId?: string; mesInicial?: string; mostrarEncabezadoVigilador?: boolean }

export const CalculadoraSueldo: React.FC<CalculadoraSueldoProps> = ({ vigiladorId, mesInicial, mostrarEncabezadoVigilador = true }) => {
  const { turnos } = useOperativo()
  const { usuario } = useAutenticacion()
  const ahora = new Date()
  const idVigilador = vigiladorId || usuario?.id
  const [mes, setMes] = useState(() => mesInicial || fechaLocal(new Date()))
  useEffect(() => { if (mesInicial) setMes(mesInicial) }, [mesInicial])
  const [config, setConfig] = useState<ConfiguracionSalarial | null>(null)
  const [configuracionDisponible, setConfiguracionDisponible] = useState(false)
  const [cargandoConfiguracion, setCargandoConfiguracion] = useState(true)

  // La configuración salarial es compartida por empresa y período.
  // El vigilador solo consulta los valores que el administrador haya guardado.
  useEffect(() => {
    let cancelado = false
    const cargarConfiguracion = async () => {
      setCargandoConfiguracion(true)
      setConfiguracionDisponible(false)
      setConfig(null)
      if (!usuario?.id_empresa || !supabase) { setCargandoConfiguracion(false); return }
      try {
        const { data, error } = await supabase.from('configuraciones_salariales_mensuales')
          .select('valores').eq('id_empresa', usuario.id_empresa).eq('mes', `${mes}-01`).maybeSingle()
        if (error) throw error
        if (cancelado) return
        if (data?.valores) {
          const valores = { ...CONFIG_INICIAL, ...(data.valores as Partial<ConfiguracionSalarial>) }
          if (valores.porcentajeNocturno === 20) valores.porcentajeNocturno = 0.1
          setConfig(valores)
          setConfiguracionDisponible(true)
        }
      } catch (error) {
        console.error('No se pudieron cargar los valores salariales:', error)
        if (!cancelado) window.alert('No se pudieron cargar los valores salariales. Verificá tu conexión e intentá nuevamente.')
      } finally { if (!cancelado) setCargandoConfiguracion(false) }
    }
    void cargarConfiguracion()
    return () => { cancelado = true }
  }, [mes, usuario?.id_empresa])

  const mesesDisponibles = useMemo(() => {
    const lista = new Set(turnos.filter(t => t.id_vigilador === idVigilador).map(t => t.fecha.slice(0, 7)))
    lista.add(fechaLocal(ahora))
    return Array.from(lista).sort((a, b) => b.localeCompare(a))
  }, [turnos, idVigilador, ahora])

  // Se incluyen todos los turnos asignados en el mes, también los futuros:
  // la calculadora estima el mes completo según la grilla y no solo lo ya trabajado.
  const turnosMes = useMemo(() => eliminarTurnosDuplicados(turnos.filter(t =>
    t.id_vigilador === idVigilador && t.fecha.startsWith(mes) &&
    t.tipo !== 'franco' && t.estado !== 'reemplazado' && t.estado !== 'ausente' &&
    t.horas_totales > 0
  )), [turnos, idVigilador, mes])

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
        .select('id_objetivo, mes, fechas')
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
        // Cada fila solo aporta fechas del mes que identifica su columna "mes",
        // igual que en Cómputos mensuales del administrador.
        const mesDeLaFila = String(fila.mes).slice(0, 7)
        if (mesDeLaFila !== mes && mesDeLaFila !== mesSiguiente) continue
        resultado[fila.id_objetivo] ||= {}
        for (const fecha of fila.fechas || []) {
          const fechaClave = String(fecha).trim().slice(0, 10)
          if (/^\d{4}-\d{2}-\d{2}$/.test(fechaClave) &&
            fechaClave.startsWith(`${mesDeLaFila}-`)) {
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

  const horas = useMemo(() => {
    const total = { diurnas: 0, nocturnas: 0, feriadoDiurno: 0, feriadoNocturno: 0, totales: 0, extrasDiurnas: 0, extrasNocturnas: 0, extras: 0 }
    let minutosAcumulados = 0
    const turnosOrdenados = [...turnosMes].sort((a, b) =>
      obtenerIntervaloTurno(a).inicio.getTime() - obtenerIntervaloTurno(b).inicio.getTime()
    )
    for (const turno of turnosOrdenados) {
      const feriados = feriadosPorObjetivo[turno.id_objetivo] || {}
      const { inicio, fin } = obtenerIntervaloTurno(turno)
      for (let cursor = inicio.getTime(); cursor < fin.getTime(); cursor += 60000) {
        const fecha = new Date(cursor)
        const esNocturna = fecha.getHours() >= 21 || fecha.getHours() < 6
        const fechaDelMinuto = fechaClave(fecha)
        const esFeriado = Object.prototype.hasOwnProperty.call(feriados, fechaDelMinuto)
        const esExtra = minutosAcumulados >= HORAS_BASE_MENSUAL * 60
        minutosAcumulados++
        total.totales += 1 / 60
        if (esNocturna) {
          total.nocturnas += 1 / 60
          if (esExtra) total.extrasNocturnas += 1 / 60
          if (esFeriado) total.feriadoNocturno += 1 / 60
        } else {
          total.diurnas += 1 / 60
          if (esExtra) total.extrasDiurnas += 1 / 60
          if (esFeriado) total.feriadoDiurno += 1 / 60
        }
      }
    }
    total.extras = total.extrasDiurnas + total.extrasNocturnas
    return total
  }, [turnosMes, feriadosPorObjetivo])

  // Las horas extras empiezan exactamente después de completar las primeras 200 hs.

  const horasFeriado = horas.feriadoDiurno + horas.feriadoNocturno

  const liquidacion = useMemo(() => {
    if (!config) return null
    const valorHora = config.divisorHora > 0 ? config.basico / config.divisorHora : 0
    // porcentajeNocturno se guarda como proporción: 0.1 equivale al 10%.
    // Las extras nocturnas reciben ese plus dentro de su propia fórmula para no duplicarlo.
    const proporcionNocturna = config.porcentajeNocturno <= 1 ? config.porcentajeNocturno : config.porcentajeNocturno / 100
    const adicionalNocturnoPorHora = valorHora * proporcionNocturna
    const horasNocturnasNoExtra = Math.max(0, horas.nocturnas - horas.extrasNocturnas)
    const adicionalNocturno = horasNocturnasNoExtra * adicionalNocturnoPorHora
    const adicionalFeriadoDiurno = horas.feriadoDiurno * valorHora * (config.recargoFeriado / 100)
    // El feriado nocturno suma el recargo de feriado y el adicional nocturno propio de esas horas.
    // El adicional nocturno mensual general se mantiene separado; este importe evita perder el plus nocturno en el concepto feriado.
    const adicionalFeriadoNocturno = horas.feriadoNocturno * (valorHora * (config.recargoFeriado / 100) + adicionalNocturnoPorHora)
    const adicionalFeriado = adicionalFeriadoDiurno + adicionalFeriadoNocturno
    // Extras diurnas: hora base + recargo. Extras nocturnas: hora base + plus nocturno + recargo,
    // aplicando ambos factores una sola vez.
    const adicionalHorasExtras =
      horas.extrasDiurnas * valorHora * (1 + config.recargoHorasExtras / 100) +
      horas.extrasNocturnas * valorHora * (1 + proporcionNocturna) * (1 + config.recargoHorasExtras / 100)
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



  const nombreMes = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1))

  return (
    <div className="space-y-5">
      {mostrarEncabezadoVigilador && <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-blue-500" />
            <h2 className="text-xl font-black text-slate-900 dark:text-white">Calculadora de sueldo</h2>
          </div>
          {mostrarEncabezadoVigilador && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Estimación basada en tus turnos registrados en la grilla.</p>}
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
          <CalendarDays className="h-4 w-4" />
          <select value={mes} onChange={e => setMes(e.target.value)} className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm capitalize text-slate-800 dark:border-slate-700 dark:bg-[#0A0F1A] dark:text-white">
            {mesesDisponibles.map(m => <option key={m} value={m}>{new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1))}</option>)}
          </select>
        </label>
      </div>}

      <Tarjeta className="border-emerald-500/30">
        <TarjetaContenido className="space-y-2 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Neto estimado a cobrar · {nombreMes}</p>
          <p className="text-3xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">{liquidacion ? formatoPesos(liquidacion.neto) : '—'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Estimación orientativa, sujeta al convenio y a la liquidación de la empresa.</p>
        </TarjetaContenido>
      </Tarjeta>

      {cargandoConfiguracion ? <p className="text-sm text-slate-500">Cargando valores salariales del período...</p> : !configuracionDisponible || !config || !liquidacion ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">El administrador todavía no configuró los valores salariales de este mes. La estimación estará disponible cuando los cargue.</div> : <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Jornadas', value: String(turnosMes.length), icon: <CalendarDays className="h-4 w-4" /> },
          { label: 'Horas trabajadas', value: formatoHoras(horas.totales), icon: <CalendarDays className="h-4 w-4" /> },
          { label: 'Horas diurnas', value: formatoHoras(horas.diurnas), icon: <Sun className="h-4 w-4 text-amber-500" /> },
          { label: 'Horas nocturnas', value: formatoHoras(horas.nocturnas), icon: <Moon className="h-4 w-4 text-blue-500" /> },
          { label: 'Horas feriado', value: formatoHoras(horasFeriado), icon: <CalendarDays className="h-4 w-4 text-amber-600" /> },
          { label: 'Extras diurnas', value: formatoHoras(horas.extrasDiurnas), icon: <Sun className="h-4 w-4 text-amber-500" /> },
          { label: 'Extras nocturnas', value: formatoHoras(horas.extrasNocturnas), icon: <Moon className="h-4 w-4 text-blue-500" /> },
        ].map(item => <Tarjeta key={item.label}><TarjetaContenido className="p-3"><div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">{item.icon}{item.label}</div><p className="mt-2 text-lg font-black tabular-nums text-slate-900 dark:text-white">{item.value}</p></TarjetaContenido></Tarjeta>)}
      </div>

      <Tarjeta>
        <TarjetaContenido className="space-y-3 p-4 sm:p-5">
          <h3 className="font-bold text-slate-900 dark:text-white">Detalle de la liquidación</h3>
          {[
            ['Sueldo básico', config.basico],
            ['Presentismo', config.presentismo],
            [`Horas nocturnas · ${horas.nocturnas.toFixed(2)} hs`, liquidacion.adicionalNocturno],
            [`Horas extras diurnas al ${config.recargoHorasExtras}% · ${horas.extrasDiurnas.toFixed(2)} hs`, horas.extrasDiurnas * (config.basico / config.divisorHora) * (1 + config.recargoHorasExtras / 100)],
            [`Horas extras nocturnas al ${config.recargoHorasExtras}% + ${proporcionNocturna * 100}% nocturno · ${horas.extrasNocturnas.toFixed(2)} hs`, horas.extrasNocturnas * (config.basico / config.divisorHora) * (1 + proporcionNocturna) * (1 + config.recargoHorasExtras / 100)],
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

      </>}
    </div>
  )
}
