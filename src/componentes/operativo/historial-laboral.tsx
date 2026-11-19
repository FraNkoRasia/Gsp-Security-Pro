import React, { useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { Tarjeta, TarjetaContenido } from '@/componentes/ui/tarjeta'
import { useOperativo } from '@/contextos/contexto-operativo'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import { useTraduccion } from '@/i18n'
import { supabase } from '@/servicios/supabase'
import { eliminarTurnosDuplicados, obtenerMesesDeTurnos, obtenerResumenDetalladoHorasMes, turnoFinalizado, turnoSeSuperponeConMes } from '@/utilidades/calculo-horas-mes'

const formatearHoras = (horas: number) => {
  const minutos = Math.round(horas * 60)
  return `${Math.floor(minutos / 60)}.${String(minutos % 60).padStart(2, '0')}`
}

export const HistorialLaboral: React.FC = () => {
  const { turnos } = useOperativo()
  const { usuario } = useAutenticacion()
  const { idioma } = useTraduccion()
  const idVigilador = usuario?.id || ''
  const [ahora, setAhora] = useState(() => new Date())
  React.useEffect(() => {
    const intervalo = window.setInterval(() => setAhora(new Date()), 60_000)
    return () => window.clearInterval(intervalo)
  }, [])
  const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
  const [mesSeleccionado, setMesSeleccionado] = useState(mesActual)

  const turnosVigilador = useMemo(
    () => eliminarTurnosDuplicados(turnos.filter(t => t.id_vigilador === idVigilador)).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [turnos, idVigilador]
  )

  const mesesDisponibles = useMemo(() => {
    const lista = new Set(obtenerMesesDeTurnos(turnosVigilador).filter(m => m <= mesActual))
    lista.add(mesActual)
    return Array.from(lista).sort((a, b) => b.localeCompare(a))
  }, [turnosVigilador, mesActual])
  const meses = mesesDisponibles.map(valor => ({
    valor,
    etiqueta: new Intl.DateTimeFormat(idioma === 'en' ? 'en-US' : 'es-AR', { month: 'long', year: 'numeric' }).format(
      new Date(Number(valor.slice(0, 4)), Number(valor.slice(5, 7)) - 1, 1)
    ),
  }))

  const turnosMes = turnosVigilador.filter(t =>
    t.estado !== 'reemplazado' && turnoFinalizado(t, ahora) && turnoSeSuperponeConMes(t, mesSeleccionado)
  )
  const idsObjetivos = useMemo(() => [...new Set(turnosVigilador
    .filter(t => t.fecha.startsWith(mesSeleccionado) && t.tipo !== 'franco' && t.estado !== 'reemplazado' && t.estado !== 'ausente' && t.horas_totales > 0)
    .map(t => t.id_objetivo).filter(Boolean))], [turnosVigilador, mesSeleccionado])
  const claveObjetivos = idsObjetivos.join(',')
  const [feriadosPorObjetivo, setFeriadosPorObjetivo] = useState<Record<string, Record<string, string>>>({})
  React.useEffect(() => {
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
      if (error) { console.error('No se pudieron cargar los feriados del historial laboral:', error); return }
      const resultado: Record<string, Record<string, string>> = {}
      for (const fila of data || []) {
        const mesFila = String(fila.mes).slice(0, 7)
        if (mesFila !== mesSeleccionado && mesFila !== mesSiguiente) continue
        resultado[fila.id_objetivo] ||= {}
        for (const fecha of fila.fechas || []) {
          const clave = String(fecha).trim().slice(0, 10)
          if (/^\d{4}-\d{2}-\d{2}$/.test(clave) && clave.startsWith(`${mesFila}-`)) resultado[fila.id_objetivo][clave] = 'Feriado marcado por administrador'
        }
      }
      setFeriadosPorObjetivo(resultado)
    }
    void cargar()
    return () => { cancelado = true }
  }, [mesSeleccionado, claveObjetivos])
  const resumen = useMemo(
    () => obtenerResumenDetalladoHorasMes(turnosVigilador, mesSeleccionado, feriadosPorObjetivo, ahora),
    [turnosVigilador, mesSeleccionado, feriadosPorObjetivo, ahora]
  )
  const horasNormales = resumen.horasTurno
  const horasExtra = resumen.horasExtra
  const horasExtraDiurnas = resumen.horasExtraDiurnas
  const horasExtraNocturnas = resumen.horasExtraNocturnas
  const horasDiurnas = resumen.horasDiurnas
  const horasNocturnas = resumen.horasNocturnas
  const horasFeriadoDiurno = resumen.horasFeriadoDiurno
  const horasFeriadoNocturno = resumen.horasFeriadoNocturno
  const diasTrabajados = resumen.turnosFinalizados.length
  const nombreMesBase = new Intl.DateTimeFormat(idioma === 'en' ? 'en-US' : 'es-AR', { month: 'long', year: 'numeric' }).format(
    new Date(Number(mesSeleccionado.slice(0, 4)), Number(mesSeleccionado.slice(5, 7)) - 1, 1)
  )
  const nombreMes = nombreMesBase.charAt(0).toLocaleUpperCase(idioma === 'en' ? 'en-US' : 'es-AR') + nombreMesBase.slice(1)

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-black text-slate-900 dark:text-white">
            <History className="h-5 w-5 text-blue-500" /> Historial laboral
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Consultá tus turnos y horas registradas por mes y año. Solo se muestran turnos cuyo horario ya finalizó; los turnos futuros no se contabilizan.</p>
        </div>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
          Mes y año
          <select value={mesSeleccionado} onChange={e => setMesSeleccionado(e.target.value)} className="min-h-[42px] min-w-[190px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold capitalize text-slate-800 dark:border-slate-700 dark:bg-[#0A0F1A] dark:text-slate-100">
            {meses.map(m => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tarjeta><TarjetaContenido className="p-4"><p className="text-xs text-slate-500">Días trabajados</p><p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{diasTrabajados}</p></TarjetaContenido></Tarjeta>
        <Tarjeta><TarjetaContenido className="p-4"><p className="text-xs text-slate-500">Horas de turno</p><p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{formatearHoras(horasNormales)} h</p></TarjetaContenido></Tarjeta>
        <Tarjeta><TarjetaContenido className="p-4"><p className="text-xs text-slate-500">Horas diurnas</p><p className="mt-1 text-2xl font-black text-amber-600">{formatearHoras(horasDiurnas)} h</p></TarjetaContenido></Tarjeta>
        <Tarjeta><TarjetaContenido className="p-4"><p className="text-xs text-slate-500">Horas nocturnas</p><p className="mt-1 text-2xl font-black text-indigo-600">{formatearHoras(horasNocturnas)} h</p></TarjetaContenido></Tarjeta>
        <Tarjeta><TarjetaContenido className="space-y-2 p-4"><p className="text-xs text-slate-500">Feriados trabajados</p><div className="flex justify-between gap-2 text-sm"><span className="text-amber-600">Diurnas</span><strong>{formatearHoras(horasFeriadoDiurno)} h</strong></div><div className="flex justify-between gap-2 text-sm"><span className="text-indigo-600">Nocturnas</span><strong>{formatearHoras(horasFeriadoNocturno)} h</strong></div></TarjetaContenido></Tarjeta>
        <Tarjeta><TarjetaContenido className="space-y-2 p-4"><p className="text-xs text-slate-500">Horas extra (más de 200 hs)</p><div className="flex justify-between gap-2 text-sm"><span className="text-amber-600">Diurnas</span><strong className="text-emerald-600">{formatearHoras(horasExtraDiurnas)} h</strong></div><div className="flex justify-between gap-2 text-sm"><span className="text-indigo-600">Nocturnas</span><strong className="text-emerald-600">{formatearHoras(horasExtraNocturnas)} h</strong></div></TarjetaContenido></Tarjeta>
        <Tarjeta><TarjetaContenido className="p-4"><p className="text-xs text-slate-500">Total del mes</p><p className="mt-1 text-2xl font-black text-blue-600">{formatearHoras(horasNormales + horasExtra)} h</p></TarjetaContenido></Tarjeta>
      </div>

      <Tarjeta className="overflow-hidden">
        <TarjetaContenido className="p-0">
          <div className="border-b border-slate-200 p-4 dark:border-slate-800">
            <h4 className="font-bold capitalize text-slate-900 dark:text-white">{nombreMes}</h4>
            <p className="text-xs text-slate-500">{idioma === 'en' ? `${turnosMes.length} shift records` : `${turnosMes.length} registros de turno`}</p>
          </div>
          {turnosMes.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">No hay turnos registrados para este mes.</p>
          ) : (
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900/70">
                  <tr><th className="p-3">Fecha</th><th className="p-3">Turno</th><th className="p-3">Horario</th><th className="p-3 text-right">Hs turno</th><th className="p-3 text-right">Hs extra</th><th className="p-3 text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {turnosMes.map(t => {
                    const extrasTurno = resumen.horasExtraPorTurno[t.id] || { total: 0 }
                    return (
                    <tr key={t.id} className="text-slate-700 dark:text-slate-200">
                      <td className="whitespace-nowrap p-3">{new Intl.DateTimeFormat(idioma === 'en' ? 'en-US' : 'es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${t.fecha}T12:00:00Z`))}</td>
                      <td className="p-3 capitalize">{idioma === 'en' ? (t.tipo === 'diurno' ? 'Day Shift' : t.tipo === 'nocturno' ? 'Night Shift' : t.tipo === 'franco' ? 'Day Off' : t.tipo) : t.tipo}</td>
                      <td className="whitespace-nowrap p-3">{t.hora_inicio.slice(0, 5)} – {t.hora_fin.slice(0, 5)}</td>
                      <td className="p-3 text-right tabular-nums">{formatearHoras(resumenTurno.horasTurno)} h</td>
                      <td className="p-3 text-right tabular-nums text-emerald-600">{formatearHoras(extrasTurno.total)} h</td>
                      <td className="p-3 text-right font-bold tabular-nums">{formatearHoras(resumenTurno.horasTurno + resumenTurno.horasExtra)} h</td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TarjetaContenido>
      </Tarjeta>
    </div>
  )
}
