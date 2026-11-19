import React, { useEffect, useMemo, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { Tarjeta, TarjetaContenido } from '@/componentes/ui/tarjeta'
import { useOperativo } from '@/contextos/contexto-operativo'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import { useTraduccion } from '@/i18n'
import { supabase } from '@/servicios/supabase'
import { eliminarTurnosDuplicados, obtenerHorasProgramadasEnMes, obtenerResumenDetalladoHorasMes, turnoSeSuperponeConMes } from '@/utilidades/calculo-horas-mes'

const formatearHorasMinutos = (horas: number) => {
  const minutosTotales = Math.round(horas * 60)
  const horasEnteras = Math.floor(minutosTotales / 60)
  const minutosRestantes = minutosTotales % 60
  return `${horasEnteras}.${String(minutosRestantes).padStart(2, '0')}`
}


export const MiMes: React.FC = () => {
  const { turnos } = useOperativo()
  const { usuario } = useAutenticacion()
  const { idioma } = useTraduccion()

  const idVig = usuario?.id || 'usr-vig-01'
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const intervalo = window.setInterval(() => setAhora(new Date()), 60_000)
    return () => window.clearInterval(intervalo)
  }, [])
  const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
  const [mesSeleccionado, setMesSeleccionado] = useState(mesActual)
  // Al cambiar de mes calendario, Mi Mes pasa automáticamente al nuevo mes.
  useEffect(() => {
    setMesSeleccionado(mesActual)
  }, [mesActual])
  const mesesDisponibles = useMemo(() => {
    const anios = new Set(turnos.filter(t => t.id_vigilador === idVig).map(t => t.fecha.slice(0, 4)))
    anios.add(String(ahora.getFullYear()))
    return Array.from(anios).sort((a, b) => b.localeCompare(a))
  }, [turnos, idVig, ahora.getFullYear()])
  const fechaMesSeleccionado = new Date(Number(mesSeleccionado.slice(0, 4)), Number(mesSeleccionado.slice(5, 7)) - 1, 1)
  const nombreMesSeleccionadoBase = new Intl.DateTimeFormat(idioma === 'en' ? 'en-US' : 'es-AR', { month: 'long', year: 'numeric' }).format(fechaMesSeleccionado)
  const nombreMesSeleccionado = nombreMesSeleccionadoBase.charAt(0).toLocaleUpperCase(idioma === 'en' ? 'en-US' : 'es-AR') + nombreMesSeleccionadoBase.slice(1)

  // Turnos del mes seleccionado para este vigilador
  const turnosMes = useMemo(() => turnos.filter(
    (t) => t.id_vigilador === idVig && turnoSeSuperponeConMes(t, mesSeleccionado)
  ), [turnos, idVig, mesSeleccionado])

  // Excluye reemplazos y evita duplicar registros antes de aplicar el cálculo compartido.
  const turnosContables = eliminarTurnosDuplicados(turnosMes.filter(t => t.estado !== 'reemplazado'))

  // El objetivo conserva las horas programadas; las horas realizadas se calculan solo al finalizar.
  const horasObjetivoMes = turnosContables.reduce((acc, t) => {
    const horasProgramadas = obtenerHorasProgramadasEnMes(t, mesSeleccionado)
    const extrasDelMes = t.fecha.startsWith(mesSeleccionado) ? t.horas_extra : 0
    return acc + horasProgramadas + extrasDelMes
  }, 0)
  const idsObjetivos = useMemo(() => [...new Set(turnosContables
    .filter(t => t.tipo !== 'franco' && t.estado !== 'reemplazado' && t.estado !== 'ausente' && t.horas_totales > 0)
    .map(t => t.id_objetivo).filter(Boolean))], [turnosContables])
  const claveObjetivos = idsObjetivos.join(',')
  const [feriadosPorObjetivo, setFeriadosPorObjetivo] = useState<Record<string, Record<string, string>>>({})
  useEffect(() => {
    let cancelado = false
    const cargar = async () => {
      setFeriadosPorObjetivo({})
      if (!supabase || !idsObjetivos.length) return
      const [anio, numeroMes] = mesSeleccionado.split('-').map(Number)
      const siguiente = new Date(anio, numeroMes, 1)
      const mesSiguiente = `${siguiente.getFullYear()}-${String(siguiente.getMonth() + 1).padStart(2, '0')}`
      const { data, error } = await supabase.from('feriados_grilla_objetivo')
        .select('id_objetivo, mes, fechas').in('id_objetivo', idsObjetivos)
        .in('mes', [`${mesSeleccionado}-01`, `${mesSiguiente}-01`])
      if (cancelado) return
      if (error) { console.error('No se pudieron cargar los feriados de Mi Mes:', error); return }
      const resultado: Record<string, Record<string, string>> = {}
      for (const fila of data || []) {
        const mesFila = String(fila.mes).slice(0, 7)
        if (mesFila !== mesSeleccionado && mesFila !== mesSiguiente) continue
        resultado[fila.id_objetivo] ||= {}
        for (const fecha of fila.fechas || []) {
          const clave = String(fecha).trim().slice(0, 10)
          if (/^\\d{4}-\\d{2}-\\d{2}$/.test(clave) && clave.startsWith(`${mesFila}-`)) resultado[fila.id_objetivo][clave] = 'Feriado marcado por administrador'
        }
      }
      setFeriadosPorObjetivo(resultado)
    }
    void cargar()
    return () => { cancelado = true }
  }, [mesSeleccionado, claveObjetivos])
  const resumenHoras = useMemo(
    () => obtenerResumenDetalladoHorasMes(turnosContables, mesSeleccionado, feriadosPorObjetivo, ahora),
    [turnosContables, mesSeleccionado, feriadosPorObjetivo, ahora]
  )
  const horasTrabajadasAlMomento = resumenHoras.horasTurno
  const horasDiurnas = resumenHoras.horasDiurnas
  const horasNocturnas = resumenHoras.horasNocturnas
  const horasDomingos = resumenHoras.turnosFinalizados
    .filter(t => t.es_domingo)
    .reduce((acc, t) => acc + t.horas_totales, 0)
  const horasFeriadoDiurnas = resumenHoras.horasFeriadoDiurno
  const horasFeriadoNocturnas = resumenHoras.horasFeriadoNocturno
  const horasExtraDiurnas = resumenHoras.horasExtraDiurnas
  const horasExtraNocturnas = resumenHoras.horasExtraNocturnas
  const horasExtra = resumenHoras.horasExtra
  const francos = turnosContables.filter(t => t.tipo === 'franco' && t.fecha <= ahora.toISOString().slice(0, 10)).length
  const diasTrabajados = resumenHoras.turnosFinalizados.length

  const porcentajeCumplimiento = horasObjetivoMes > 0
    ? Math.min(100, Math.round((horasTrabajadasAlMomento / horasObjetivoMes) * 100))
    : 0
  const horasPendientes = Math.max(0, horasObjetivoMes - horasTrabajadasAlMomento)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white font-['Outfit']">
            Mi Mes — {nombreMesSeleccionado}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Cálculo consolidado de horas de servicio, nocturnidad y objetivo laboral (Sección 34).
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <label htmlFor="mi-mes-selector" className="sr-only">Seleccionar mes y año</label>
          <select
            id="mi-mes-selector"
            value={mesSeleccionado}
            onChange={(e) => setMesSeleccionado(e.target.value)}
            className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold capitalize text-slate-800 dark:border-slate-700 dark:bg-[#0A0F1A] dark:text-slate-100"
          >
            {mesesDisponibles.flatMap(anio => Array.from({ length: 12 }, (_, i) => {
              const valor = `${anio}-${String(i + 1).padStart(2, '0')}`
              const etiquetaBase = new Intl.DateTimeFormat(idioma === 'en' ? 'en-US' : 'es-AR', { month: 'long', year: 'numeric' }).format(new Date(Number(anio), i, 1))
              const etiqueta = etiquetaBase.charAt(0).toLocaleUpperCase(idioma === 'en' ? 'en-US' : 'es-AR') + etiquetaBase.slice(1)
              return { valor, etiqueta }
            }).filter(m => m.valor <= mesActual))
              .sort((a, b) => b.valor.localeCompare(a.valor))
              .map(m => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
          </select>
        </div>
      </div>

      {/* Tarjeta de Progreso Principal hacia 204 hs */}
      <Tarjeta className="border-blue-500/30">
        <TarjetaContenido className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                Horas Acumuladas en el Mes
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
                  {formatearHorasMinutos(horasTrabajadasAlMomento)} hs
                </span>
                <span className="text-sm font-bold text-slate-500">/ {formatearHorasMinutos(horasObjetivoMes)} hs objetivo</span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                {porcentajeCumplimiento}%
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {horasObjetivoMes > 0 && horasTrabajadasAlMomento >= horasObjetivoMes
                  ? (idioma === 'en' ? 'Monthly target reached' : 'Objetivo mensual alcanzado')
                  : idioma === 'en' ? `${formatearHorasMinutos(horasPendientes)} h remaining to reach the target` : `Faltan ${formatearHorasMinutos(horasPendientes)} hs para cumplir el objetivo`}
              </p>
            </div>
          </div>

          <div className="w-full bg-slate-200 dark:bg-slate-800 h-3 rounded-full overflow-hidden p-0.5">
            <div
              className="bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${porcentajeCumplimiento}%` }}
            />
          </div>
        </TarjetaContenido>
      </Tarjeta>

      {/* Grid de Métricas Detalladas (Sección 34) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tarjeta>
          <TarjetaContenido className="p-4 text-center">
            <span className="text-slate-500 dark:text-slate-400 text-xs block">Días Trabajados</span>
            <span className="text-2xl font-black text-slate-900 dark:text-white mt-1 block">
              {diasTrabajados}
            </span>
          </TarjetaContenido>
        </Tarjeta>

        <Tarjeta>
          <TarjetaContenido className="p-4 text-center">
            <span className="text-slate-500 dark:text-slate-400 text-xs block">Francos de Guardia</span>
            <span className="text-2xl font-black text-slate-900 dark:text-white mt-1 block">
              {francos}
            </span>
          </TarjetaContenido>
        </Tarjeta>

        <Tarjeta>
          <TarjetaContenido className="p-4 text-center">
            <span className="text-slate-500 dark:text-slate-400 text-xs block flex items-center justify-center gap-1">
              <Sun className="w-3.5 h-3.5 text-amber-500" /> Diurnas
            </span>
            <span className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 block">
              {formatearHorasMinutos(horasDiurnas)} hs
            </span>
          </TarjetaContenido>
        </Tarjeta>

        <Tarjeta>
          <TarjetaContenido className="p-4 text-center">
            <span className="text-slate-500 dark:text-slate-400 text-xs block flex items-center justify-center gap-1">
              <Moon className="w-3.5 h-3.5 text-blue-500" /> Nocturnas
            </span>
            <span className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1 block">
              {formatearHorasMinutos(horasNocturnas)} hs
            </span>
          </TarjetaContenido>
        </Tarjeta>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tarjeta>
          <TarjetaContenido className="p-4">
            <span className="text-slate-500 dark:text-slate-400 text-xs block">Domingos Trabajados</span>
            <span className="text-xl font-bold text-slate-900 dark:text-white mt-1 block">
              {horasDomingos} hs
            </span>
            <p className="text-[10px] text-slate-400 mt-0.5">Computan recargo dominical</p>
          </TarjetaContenido>
        </Tarjeta>

        <Tarjeta>
          <TarjetaContenido className="p-4 space-y-2">
            <span className="text-slate-500 dark:text-slate-400 text-xs block">Feriados trabajados</span>
            <div className="flex justify-between gap-2 text-sm"><span className="text-amber-600">Diurnas</span><strong>{formatearHorasMinutos(horasFeriadoDiurnas)} hs</strong></div>
            <div className="flex justify-between gap-2 text-sm"><span className="text-blue-500">Nocturnas</span><strong>{formatearHorasMinutos(horasFeriadoNocturnas)} hs</strong></div>
          </TarjetaContenido>
        </Tarjeta>

        <Tarjeta>
          <TarjetaContenido className="p-4 space-y-2">
            <span className="text-slate-500 dark:text-slate-400 text-xs block">Horas extra (más de 200 hs)</span>
            <div className="flex justify-between gap-2 text-sm"><span className="text-amber-600">Diurnas</span><strong className="text-emerald-600">{formatearHorasMinutos(horasExtraDiurnas)} hs</strong></div>
            <div className="flex justify-between gap-2 text-sm"><span className="text-blue-500">Nocturnas</span><strong className="text-emerald-600">{formatearHorasMinutos(horasExtraNocturnas)} hs</strong></div>
            <p className="text-[10px] text-slate-400">Se calculan al superar las 200 horas mensuales.</p>
          </TarjetaContenido>
        </Tarjeta>
      </div>
    </div>
  )
}
