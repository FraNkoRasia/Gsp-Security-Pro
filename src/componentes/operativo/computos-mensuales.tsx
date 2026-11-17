import React, { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, CalendarDays, Users, Clock3 } from 'lucide-react'
import { useOperativo } from '@/contextos/contexto-operativo'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import { supabase } from '@/servicios/supabase'
import { eliminarTurnosDuplicados, obtenerIntervaloTurno } from '@/utilidades/calculo-horas-mes'

type FilaComputo = {
  id: string
  nombre: string
  horas: number
  extras: number
  nocturnas: number
  feriadoDiurno: number
  feriadoNocturno: number
  ausencias: number
}

const fechaLocal = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
const claveFecha = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
const formatoHoras = (valor: number) => Number(valor.toFixed(2)).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const nombreMes = (mes: string) => {
  const [anio, numero] = mes.split('-').map(Number)
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(anio, numero - 1, 1))
}
const escaparCsv = (valor: string | number) => `"${String(valor).replace(/"/g, '""')}"`

export const ComputosMensuales: React.FC = () => {
  const { usuario } = useAutenticacion()
  const { objetivos, vigiladores, asignaciones, turnos } = useOperativo()
  const [objetivoId, setObjetivoId] = useState('')
  const [mes, setMes] = useState(() => fechaLocal(new Date()))
  const [feriados, setFeriados] = useState<string[]>([])
  const [cargandoFeriados, setCargandoFeriados] = useState(false)
  const [error, setError] = useState('')

  const objetivosEmpresa = useMemo(
    () => objetivos.filter(o => o.id_empresa === usuario?.id_empresa && o.activo).sort((a,b) => a.nombre.localeCompare(b.nombre)),
    [objetivos, usuario?.id_empresa]
  )

  useEffect(() => {
    if (!objetivoId && objetivosEmpresa.length) setObjetivoId(objetivosEmpresa[0].id)
    if (objetivoId && !objetivosEmpresa.some(o => o.id === objetivoId)) setObjetivoId(objetivosEmpresa[0]?.id || '')
  }, [objetivosEmpresa, objetivoId])

  useEffect(() => {
    let cancelado = false
    const cargar = async () => {
      if (!supabase || !objetivoId) { setFeriados([]); return }
      setCargandoFeriados(true)
      setError('')
      const [anio, numero] = mes.split('-').map(Number)
      const siguiente = new Date(anio, numero, 1)
      const mesSiguiente = fechaLocal(siguiente)
      const { data, error: errorConsulta } = await supabase
        .from('feriados_grilla_objetivo')
        .select('fechas')
        .eq('id_objetivo', objetivoId)
        .in('mes', [`${mes}-01`, `${mesSiguiente}-01`])
      if (cancelado) return
      if (errorConsulta) {
        setError('No se pudieron cargar los feriados configurados para este objetivo.')
        setFeriados([])
      } else {
        const permitidas = (data || []).flatMap((fila: { fechas: string[] | null }) => (fila.fechas || []).map((fecha: string) => String(fecha).slice(0,10)))
        setFeriados([...new Set(permitidas.filter(fecha => fecha.startsWith(mes + '-') || fecha.startsWith(mesSiguiente + '-')))])
      }
      setCargandoFeriados(false)
    }
    void cargar()
    return () => { cancelado = true }
  }, [objetivoId, mes])

  const filas = useMemo<FilaComputo[]>(() => {
    if (!objetivoId) return []
    const vigiladoresObjetivo = vigiladores.filter(v =>
      asignaciones.some(a => a.id_vigilador === v.id && a.id_objetivo === objetivoId &&
        a.fecha_inicio <= `${mes}-31` && (!a.fecha_fin || a.fecha_fin >= `${mes}-01`))
    )
    const turnosObjetivo = eliminarTurnosDuplicados(turnos.filter(t =>
      t.id_objetivo === objetivoId && t.fecha.startsWith(mes) &&
      t.tipo !== 'franco' && t.estado !== 'reemplazado' && t.horas_totales > 0
    ))
    return vigiladoresObjetivo.map(vigilador => {
      const propios = turnosObjetivo.filter(t => t.id_vigilador === vigilador.id)
      let horas = 0, nocturnas = 0, feriadoDiurno = 0, feriadoNocturno = 0
      for (const turno of propios) {
        if (turno.estado === 'ausente') continue
        const { inicio, fin } = obtenerIntervaloTurno(turno)
        for (let cursor = inicio.getTime(); cursor < fin.getTime(); cursor += 60000) {
          const fecha = new Date(cursor)
          const esNocturna = fecha.getHours() >= 21 || fecha.getHours() < 6
          const esFeriado = feriados.includes(claveFecha(fecha))
          horas++
          if (esNocturna) nocturnas++
          if (esFeriado && esNocturna) feriadoNocturno++
          if (esFeriado && !esNocturna) feriadoDiurno++
        }
      }
      const totalHoras = horas / 60
      return {
        id: vigilador.id,
        nombre: `${vigilador.apellido} ${vigilador.nombre}`.trim(),
        horas: totalHoras,
        extras: Math.max(0, totalHoras - 200),
        nocturnas: nocturnas / 60,
        feriadoDiurno: feriadoDiurno / 60,
        feriadoNocturno: feriadoNocturno / 60,
        ausencias: propios.filter(t => t.estado === 'ausente').length
      }
    }).sort((a,b) => a.nombre.localeCompare(b.nombre))
  }, [objetivoId, mes, vigiladores, asignaciones, turnos, feriados])

  const exportarExcel = () => {
    const objetivo = objetivos.find(o => o.id === objetivoId)
    const encabezados = ['N°','VIGILADOR','HS TOTALES','HS EXTRAS','HS NOCTURNAS','BASICO','PRESENTISMO','VIATICOS','FERIADOS DIURNOS','FERIADOS NOCTURNOS','LICENCIAS','AUSENCIAS','SUSPENSIONES','OBSERVACIONES']
    const lineas = filas.map((fila, indice) => [
      indice + 1, fila.nombre, formatoHoras(fila.horas), formatoHoras(fila.extras), formatoHoras(fila.nocturnas),
      'Sin registro en GSP', 'Sin registro en GSP', 'Sin registro en GSP',
      formatoHoras(fila.feriadoDiurno), formatoHoras(fila.feriadoNocturno),
      'Sin registro en GSP', fila.ausencias, 'Sin registro en GSP', ''
    ])
    const csv = [encabezados, ...lineas].map(linea => linea.map(escaparCsv).join(';')).join('\r\n')
    const blob = new Blob(['\\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = `Computos_${(objetivo?.nombre || 'Objetivo').replace(/[^a-z0-9-_]/gi, '_')}_${mes}.csv`
    document.body.appendChild(enlace)
    enlace.click()
    enlace.remove()
    URL.revokeObjectURL(url)
  }

  const totalHoras = filas.reduce((s,f) => s + f.horas, 0)
  const totalExtras = filas.reduce((s,f) => s + f.extras, 0)
  const totalFeriadosDiurnos = filas.reduce((s,f) => s + f.feriadoDiurno, 0)
  const totalFeriadosNocturnos = filas.reduce((s,f) => s + f.feriadoNocturno, 0)

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0C121E] sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500"><FileSpreadsheet className="h-5 w-5" /></div>
          <div><h2 className="text-lg font-black text-slate-900 dark:text-white">Cómputos mensuales</h2><p className="text-sm text-slate-500 dark:text-slate-400">Resumen de horas por objetivo y período</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Objetivo
            <select value={objetivoId} onChange={e => setObjetivoId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
              <option value="">Seleccionar objetivo</option>
              {objetivosEmpresa.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Mes
            <input type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
          </label>
        </div>
      </section>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">{error}</div>}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#0C121E]"><Users className="mb-2 h-4 w-4 text-blue-500"/><p className="text-xs text-slate-500">Vigiladores</p><p className="text-xl font-black text-slate-900 dark:text-white">{filas.length}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#0C121E]"><Clock3 className="mb-2 h-4 w-4 text-blue-500"/><p className="text-xs text-slate-500">Horas totales</p><p className="text-xl font-black text-slate-900 dark:text-white">{formatoHoras(totalHoras)}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#0C121E]"><CalendarDays className="mb-2 h-4 w-4 text-amber-500"/><p className="text-xs text-slate-500">Feriados diurnos</p><p className="text-xl font-black text-slate-900 dark:text-white">{formatoHoras(totalFeriadosDiurnos)} h</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#0C121E]"><CalendarDays className="mb-2 h-4 w-4 text-indigo-500"/><p className="text-xs text-slate-500">Feriados nocturnos</p><p className="text-xl font-black text-slate-900 dark:text-white">{formatoHoras(totalFeriadosNocturnos)} h</p></div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0C121E]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
          <div><h3 className="font-bold text-slate-900 dark:text-white">{objetivos.find(o => o.id === objetivoId)?.nombre || 'Seleccioná un objetivo'}</h3><p className="text-xs capitalize text-slate-500 dark:text-slate-400">{nombreMes(mes)} · {filas.length} vigiladores</p></div>
          <button type="button" onClick={exportarExcel} disabled={!filas.length || cargandoFeriados} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4"/>Exportar Excel</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
              <tr>{['N°','Vigilador','Hs. totales','Hs. extras','Hs. nocturnas','Básico','Presentismo','Viáticos','Feriados diurnos','Feriados nocturnos','Licencias','Ausencias','Suspensiones','Observaciones'].map(h=><th key={h} className="whitespace-nowrap px-3 py-3 font-bold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filas.map((fila,i)=><tr key={fila.id} className="text-slate-700 dark:text-slate-200"><td className="px-3 py-3 text-slate-400">{i+1}</td><td className="whitespace-nowrap px-3 py-3 font-semibold">{fila.nombre}</td><td className="px-3 py-3 tabular-nums">{formatoHoras(fila.horas)}</td><td className="px-3 py-3 tabular-nums">{formatoHoras(fila.extras)}</td><td className="px-3 py-3 tabular-nums">{formatoHoras(fila.nocturnas)}</td><td className="px-3 py-3 text-slate-400">—</td><td className="px-3 py-3 text-slate-400">—</td><td className="px-3 py-3 text-slate-400">—</td><td className="px-3 py-3 font-semibold text-amber-600 dark:text-amber-300 tabular-nums">{formatoHoras(fila.feriadoDiurno)}</td><td className="px-3 py-3 font-semibold text-indigo-600 dark:text-indigo-300 tabular-nums">{formatoHoras(fila.feriadoNocturno)}</td><td className="px-3 py-3 text-slate-400">—</td><td className="px-3 py-3 tabular-nums">{fila.ausencias}</td><td className="px-3 py-3 text-slate-400">—</td><td className="px-3 py-3 text-slate-400">—</td></tr>)}
              {!filas.length && <tr><td colSpan={14} className="px-4 py-10 text-center text-sm text-slate-500">{objetivoId ? 'No hay vigiladores asignados ni turnos para este objetivo en el período.' : 'Seleccioná un objetivo para consultar los cómputos.'}</td></tr>}
            </tbody>
            {filas.length > 0 && <tfoot className="bg-slate-50 font-bold text-slate-900 dark:bg-slate-900/70 dark:text-white"><tr><td colSpan={2} className="px-3 py-3">Totales</td><td className="px-3 py-3">{formatoHoras(totalHoras)}</td><td className="px-3 py-3">{formatoHoras(totalExtras)}</td><td className="px-3 py-3">{formatoHoras(filas.reduce((s,f)=>s+f.nocturnas,0))}</td><td colSpan={3}/><td className="px-3 py-3">{formatoHoras(totalFeriadosDiurnos)}</td><td className="px-3 py-3">{formatoHoras(totalFeriadosNocturnos)}</td><td colSpan={4}/></tr></tfoot>}
          </table>
        </div>
        <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">Los guiones indican conceptos que todavía no tienen un registro estructurado en GSP. Las horas extras se calculan sobre las 200 horas mensuales, igual que en la calculadora actual. Los feriados se leen de las marcas manuales de la grilla del objetivo.</p>
      </section>
    </div>
  )
}
