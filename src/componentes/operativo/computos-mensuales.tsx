import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileDown, FileText, CalendarDays, Users, Clock3, ChevronLeft, ChevronRight, Calculator } from 'lucide-react'
import { CalculadoraSueldo } from '@/componentes/operativo/calculadora-sueldo'
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
const escaparHtml = (valor: string | number) => String(valor).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export const ComputosMensuales: React.FC = () => {
  const { usuario } = useAutenticacion()
  const { objetivos, vigiladores, asignaciones, turnos } = useOperativo()
  const [objetivoId, setObjetivoId] = useState('')
  const [mes, setMes] = useState(() => fechaLocal(new Date()))
  const [feriados, setFeriados] = useState<string[]>([])
  const [versionFeriados, setVersionFeriados] = useState(0)
  const [cargandoFeriados, setCargandoFeriados] = useState(false)
  const [error, setError] = useState('')
  const [calendarioAbierto, setCalendarioAbierto] = useState(false)
  const calendarioRef = useRef<HTMLDivElement>(null)
  const botonCalendarioRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!calendarioAbierto) return
    const cerrarFuera = (evento: PointerEvent) => { if (!calendarioRef.current?.contains(evento.target as Node) && !(evento.target as HTMLElement).closest?.('[data-calendar-popup]')) setCalendarioAbierto(false) }
    const cerrarEscape = (evento: KeyboardEvent) => { if (evento.key === 'Escape') setCalendarioAbierto(false) }
    document.addEventListener('pointerdown', cerrarFuera)
    document.addEventListener('keydown', cerrarEscape)
    return () => { document.removeEventListener('pointerdown', cerrarFuera); document.removeEventListener('keydown', cerrarEscape) }
  }, [calendarioAbierto])
  const [anioCalendario, setAnioCalendario] = useState(() => Number(fechaLocal(new Date()).slice(0, 4)))
  const [vigiladorSeleccionadoId, setVigiladorSeleccionadoId] = useState('')

  const objetivosEmpresa = useMemo(
    () => objetivos.filter(o => o.id_empresa === usuario?.id_empresa && o.activo).sort((a,b) => a.nombre.localeCompare(b.nombre)),
    [objetivos, usuario?.id_empresa]
  )

  useEffect(() => {
    if (!objetivoId && objetivosEmpresa.length) setObjetivoId(objetivosEmpresa[0].id)
    if (objetivoId && !objetivosEmpresa.some(o => o.id === objetivoId)) setObjetivoId(objetivosEmpresa[0]?.id || '')
  }, [objetivosEmpresa, objetivoId])

  useEffect(() => {
    const actualizarFeriados = () => setVersionFeriados(version => version + 1)
    window.addEventListener('gsp-feriados-grilla-actualizados', actualizarFeriados)
    return () => window.removeEventListener('gsp-feriados-grilla-actualizados', actualizarFeriados)
  }, [])

  useEffect(() => {
    let cancelado = false
    const cargar = async () => {
      // Nunca conservar feriados del objetivo/mes anterior mientras llega la consulta nueva.
      setFeriados([])
      setCargandoFeriados(true)
      setError('')
      if (!supabase || !objetivoId) {
        setCargandoFeriados(false)
        return
      }

      const [anio, numero] = mes.split('-').map(Number)
      const siguiente = new Date(anio, numero, 1)
      const mesSiguiente = fechaLocal(siguiente)
      const { data, error: errorConsulta } = await supabase
        .from('feriados_grilla_objetivo')
        .select('mes, fechas')
        .eq('id_objetivo', objetivoId)
        .in('mes', [`${mes}-01`, `${mesSiguiente}-01`])

      if (cancelado) return
      if (errorConsulta) {
        console.error('Error leyendo feriados para cómputos:', errorConsulta)
        setError('No se pudieron cargar los feriados configurados para este objetivo. Los totales de feriados no se actualizaron.')
        setFeriados([])
      } else {
        const fechasVigentes = (data || []).flatMap((fila: { mes: string; fechas: string[] | null }) => {
          // Cada fila solo puede aportar feriados del mes que identifica su columna "mes".
          // Evita que fechas antiguas copiadas en filas futuras vuelvan a activarse.
          const mesDeLaFila = String(fila.mes).slice(0, 7)
          if (mesDeLaFila !== mes && mesDeLaFila !== mesSiguiente) return []
          return (Array.isArray(fila.fechas) ? fila.fechas : [])
            .map((fecha: string) => String(fecha).trim().slice(0, 10))
            .filter((fecha: string) => /^\d{4}-\d{2}-\d{2}$/.test(fecha))
            .filter((fecha: string) => fecha.startsWith(mesDeLaFila + '-'))
        })
        setFeriados([...new Set(fechasVigentes)])
      }
      setCargandoFeriados(false)
    }

    void cargar()
    return () => { cancelado = true }
  }, [objetivoId, mes, versionFeriados])

  // Si el administrador modifica los feriados desde otra pestaña/sesión,
  // volver a consultar al recibir cambios en tiempo real o al regresar a la vista.
  useEffect(() => {
    const clienteSupabase = supabase
    if (!clienteSupabase || !objetivoId) return
    const refrescar = () => setVersionFeriados(version => version + 1)
    const canal = clienteSupabase
      .channel(`computos-feriados-${objetivoId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'feriados_grilla_objetivo',
        filter: `id_objetivo=eq.${objetivoId}`
      }, refrescar)
      .subscribe()
    window.addEventListener('focus', refrescar)
    return () => {
      window.removeEventListener('focus', refrescar)
      void clienteSupabase.removeChannel(canal)
    }
  }, [objetivoId])

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
  
  useEffect(() => {
    if (!filas.length) {
      setVigiladorSeleccionadoId('')
      return
    }
    if (!filas.some(fila => fila.id === vigiladorSeleccionadoId)) {
      setVigiladorSeleccionadoId(filas[0].id)
    }
  }, [filas, vigiladorSeleccionadoId])

  const mesesCalendario = Array.from({ length: 12 }, (_, indice) => {
    const valor = `${anioCalendario}-${String(indice + 1).padStart(2, '0')}`
    return { valor, nombre: new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(new Date(anioCalendario, indice, 1)) }
  })
  const mesSeleccionadoNombre = nombreMes(mes)


  const exportarPdf = () => {
    const objetivo = objetivos.find(o => o.id === objetivoId)
    const nombreObjetivo = objetivo?.nombre || 'Objetivo'
    const encabezados = ['N°','Vigilador','Hs. totales','Hs. extras','Hs. nocturnas','Básico','Presentismo','Viáticos','Feriados diurnos','Feriados nocturnos','Licencias','Ausencias','Suspensiones','Observaciones']
    const celdas = filas.map((fila, indice) => [
      indice + 1, fila.nombre, formatoHoras(fila.horas), formatoHoras(fila.extras), formatoHoras(fila.nocturnas),
      '—', '—', '—', formatoHoras(fila.feriadoDiurno), formatoHoras(fila.feriadoNocturno),
      '—', fila.ausencias, '—', '—'
    ])
    const renderFila = (linea: (string | number)[], encabezado = false) =>
      '<tr>' + linea.map(valor => encabezado ? '<th>' + escaparHtml(valor) + '</th>' : '<td>' + escaparHtml(valor) + '</td>').join('') + '</tr>'
    const totalNocturnas = filas.reduce((s, f) => s + f.nocturnas, 0)
    const fechaEmision = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date())
    const ventana = window.open('', '_blank')
    if (!ventana) {
      setError('El navegador bloqueó la ventana del PDF. Permití las ventanas emergentes e intentá nuevamente.')
      return
    }
    const cuerpo = celdas.map(fila => renderFila(fila)).join('')
    ventana.document.open()
    ventana.document.write(`
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Cómputos - ${escaparHtml(nombreObjetivo)} - ${escaparHtml(nombreMes(mes))}</title>
        <style>
          @page{size:A4 landscape;margin:8mm}
          *{box-sizing:border-box}
          html,body{margin:0;padding:0}
          body{background:#07101f;color:#eef4ff;font-family:Arial,Helvetica,sans-serif;font-size:8px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .documento{width:100%;margin:0 auto}
          .marca-superior{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:0 0 12px;border-bottom:2px solid #2878ff}
          .identidad{display:flex;align-items:center;gap:10px;min-width:0}
          .escudo{width:38px;height:42px;flex:0 0 38px}
          .marca{font-size:15px;font-weight:800;letter-spacing:-.3px;color:#fff}
          .descripcion-marca{margin-top:3px;color:#a9bddb;font-size:8px}
          .emision{text-align:right;color:#9eb2d0;font-size:8px;line-height:1.6;white-space:nowrap}
          .emision strong{display:block;color:#eef4ff;font-size:9px}
          .empresa{display:flex;align-items:center;gap:7px;color:#dceaff;font-weight:700;font-size:10px;white-space:nowrap}
          .empresa-marca{color:#347dff;font-size:20px;font-weight:900;letter-spacing:-3px}
          .titulo{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;padding:12px 14px;border:1px solid #203957;border-radius:10px;background:linear-gradient(110deg,#101d32,#0b1526)}
          .titulo-principal{display:flex;align-items:center;gap:11px;min-width:0}
          .icono-titulo{display:flex;width:42px;height:42px;align-items:center;justify-content:center;border-radius:9px;background:#12366a;color:#4b91ff;font-size:22px;font-weight:900}
          h1{margin:0;color:#fff;font-size:19px;letter-spacing:-.5px}
          .subtitulo{margin:3px 0 0;color:#a9bddb;font-size:9px}
          .periodo{padding:9px 12px;border:1px solid #203957;border-radius:8px;color:#b8c9e2;font-size:9px;white-space:nowrap}
          .periodo strong{color:#fff;text-transform:capitalize}
          .resumen{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:11px 0}
          .indicador{display:flex;align-items:center;gap:9px;min-width:0;padding:10px;border:1px solid #203957;border-radius:9px;background:linear-gradient(145deg,#10213d,#0c1729)}
          .indicador-icono{display:flex;width:29px;height:29px;flex:0 0 29px;align-items:center;justify-content:center;border-radius:7px;background:#12366a;color:#4b91ff;font-size:15px;font-weight:900}
          .indicador span{display:block;margin-bottom:3px;color:#9eb2d0;font-size:7px}
          .indicador strong{display:block;color:#f4f8ff;font-size:14px;line-height:1.1}
          .tabla-wrap{margin-top:10px;border:1px solid #294361;border-radius:9px;overflow:hidden}
          table{width:100%;border-collapse:collapse;table-layout:auto}
          thead{display:table-header-group}
          th{padding:7px 4px;background:#132b4e;color:#eaf2ff;font-size:6.6px;font-weight:700;text-align:left;white-space:normal;border-right:1px solid #294361;line-height:1.25}
          td{padding:7px 4px;color:#e4edfb;font-size:7px;border-bottom:1px solid #1d3049;border-right:1px solid #1d3049;white-space:nowrap;line-height:1.2}
          th:last-child,td:last-child{border-right:0}
          tbody tr:nth-child(even){background:#0d192b}
          tbody tr:nth-child(odd){background:#091424}
          td:nth-child(1){text-align:center;color:#9eb2d0}
          td:nth-child(2){font-weight:700;color:#fff;white-space:normal}
          td:nth-child(9){color:#ffc45c;font-weight:700}
          td:nth-child(10){color:#8fa8ff;font-weight:700}
          tfoot td{padding:8px 4px;background:#102b50;color:#8dbaff;font-size:7.2px;font-weight:800;border-top:1px solid #347dff}
          .nota{margin:9px 1px 0;color:#8ea4c2;font-size:7px;line-height:1.45}
          footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;padding-top:8px;border-top:1px solid #294361;color:#9eb2d0;font-size:7px}
          footer strong{color:#eaf2ff}
          .lema{font-style:italic;text-align:right}
          @media print{
            body{background:#07101f!important}
            .tabla-wrap{break-inside:auto}
            tr{break-inside:avoid;page-break-inside:avoid}
            .resumen,.titulo,.marca-superior{break-inside:avoid;page-break-inside:avoid}
            *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
          }
        </style>
      </head>
      <body>
        <main class="documento">
          <header class="marca-superior">
            <div class="identidad">
              <svg class="escudo" viewBox="0 0 100 110" role="img" aria-label="Escudo GSP Security Pro">
                <path d="M50 5 91 20v31c0 25-15 43-41 54C24 94 9 76 9 51V20L50 5Z" fill="#0d1b30" stroke="#347dff" stroke-width="5"/>
                <path d="M50 17 80 28v23c0 19-10 33-30 42-20-9-30-23-30-42V28l30-11Z" fill="#123f70" stroke="#d8edff" stroke-width="2.5"/>
                <path d="M50 29 68 39v14c0 12-7 22-18 29-11-7-18-17-18-29V39l18-10Z" fill="none" stroke="#e8f3ff" stroke-width="4"/>
              </svg>
              <div><div class="marca">GSP Security Pro</div><div class="descripcion-marca">Gestión de Seguridad Profesional</div></div>
            </div>
            <div class="emision">Fecha de generación<strong>${escaparHtml(fechaEmision)}</strong></div>
            <div class="empresa"><span class="empresa-marca">W</span>Wall Security</div>
          </header>
          <section class="titulo">
            <div class="titulo-principal"><div class="icono-titulo">▦</div><div><h1>Cómputos</h1><p class="subtitulo">Resumen de horas por vigilador y período · ${escaparHtml(nombreObjetivo)}</p></div></div>
            <div class="periodo">Período: <strong>${escaparHtml(nombreMes(mes))}</strong></div>
          </section>
          <section class="resumen">
            <div class="indicador"><div class="indicador-icono">♟</div><div><span>Total vigiladores</span><strong>${filas.length}</strong></div></div>
            <div class="indicador"><div class="indicador-icono">◷</div><div><span>Horas totales</span><strong>${formatoHoras(totalHoras)} h</strong></div></div>
            <div class="indicador"><div class="indicador-icono">★</div><div><span>Horas extras</span><strong>${formatoHoras(totalExtras)} h</strong></div></div>
            <div class="indicador"><div class="indicador-icono">☾</div><div><span>Horas nocturnas</span><strong>${formatoHoras(totalNocturnas)} h</strong></div></div>
            <div class="indicador"><div class="indicador-icono">F</div><div><span>Horas en feriados</span><strong>${formatoHoras(totalFeriadosDiurnos + totalFeriadosNocturnos)} h</strong></div></div>
          </section>
          <section class="tabla-wrap">
            <table>
              <thead>${renderFila(encabezados, true)}</thead>
              <tbody>${cuerpo}</tbody>
              <tfoot><tr><td colspan="2">Total general</td><td>${formatoHoras(totalHoras)}</td><td>${formatoHoras(totalExtras)}</td><td>${formatoHoras(totalNocturnas)}</td><td colspan="3">—</td><td>${formatoHoras(totalFeriadosDiurnos)}</td><td>${formatoHoras(totalFeriadosNocturnos)}</td><td colspan="4">—</td></tr></tfoot>
            </table>
          </section>
          <p class="nota">Los guiones indican conceptos que todavía no tienen un registro estructurado en GSP. Las horas extras se calculan sobre las 200 horas mensuales. Los feriados corresponden a las fechas configuradas para este objetivo.</p>
          <footer><div><strong>GSP Security Pro</strong> &nbsp;|&nbsp; Wall Security</div><div class="lema">Compromiso, Seguridad y Profesionalismo</div></footer>
        </main>
        <script>window.addEventListener("load",function(){window.focus();window.print()})</script>
      </body>
      </html>`)
    ventana.document.close()
    setError('')
  }

  const totalHoras = filas.reduce((s,f) => s + f.horas, 0)
  const totalExtras = filas.reduce((s,f) => s + f.extras, 0)
  const totalFeriadosDiurnos = filas.reduce((s,f) => s + f.feriadoDiurno, 0)
  const totalFeriadosNocturnos = filas.reduce((s,f) => s + f.feriadoNocturno, 0)

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0C121E] sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500"><FileText className="h-5 w-5" /></div>
          <div><h2 className="text-lg font-black text-slate-900 dark:text-white">Cómputos mensuales</h2><p className="text-sm text-slate-500 dark:text-slate-400">Resumen de horas por objetivo y período</p></div>
        </div>
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
          <label className="block min-w-0 space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
            <span className="block">Objetivo</span>
            <select value={objetivoId} onChange={e => setObjetivoId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
              <option value="">Seleccionar objetivo</option>
              {objetivosEmpresa.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </label>
          <div ref={calendarioRef} className="relative min-w-0 space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
            <span className="block">Mes</span>
            <button ref={botonCalendarioRef} type="button" aria-expanded={calendarioAbierto} aria-haspopup="dialog" onClick={() => { setAnioCalendario(Number(mes.slice(0, 4))); setCalendarioAbierto(abierto => !abierto) }} className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 text-left text-sm font-semibold capitalize text-slate-900 shadow-sm outline-none transition hover:border-blue-400 hover:bg-slate-50 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800">
              <span className="flex min-w-0 items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-blue-500"/><span className="truncate">{mesSeleccionadoNombre}</span></span>
              <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${calendarioAbierto ? 'rotate-90' : 'rotate-0'}`}/>
            </button>
            {calendarioAbierto && createPortal(<div data-calendar-popup role="dialog" aria-label="Seleccionar mes" style={{position:"fixed",left:Math.max(12,Math.min((botonCalendarioRef.current?.getBoundingClientRect().left||12),window.innerWidth-320)),top:(()=>{const r=botonCalendarioRef.current?.getBoundingClientRect();const h=270;return r&&window.innerHeight-r.bottom<h+16?Math.max(12,r.top-h-8):Math.min(window.innerHeight-h-12,(r?.bottom||12)+8)})(),zIndex:9999,maxHeight:"calc(100dvh - 24px)",overflowY:"auto",width:"min(320px, calc(100vw - 24px))"}} className={"rounded-2xl w-full min-w-[280px] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-900/15 dark:border-slate-700 dark:bg-[#111827]"}>
              <div className="mb-4 flex items-center justify-between">
                <button type="button" aria-label="Año anterior" onClick={() => setAnioCalendario(anio => anio - 1)} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"><ChevronLeft className="h-4 w-4"/></button>
                <span className="text-base font-black tabular-nums text-slate-900 dark:text-white">{anioCalendario}</span>
                <button type="button" aria-label="Año siguiente" onClick={() => setAnioCalendario(anio => anio + 1)} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"><ChevronRight className="h-4 w-4"/></button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {mesesCalendario.map(opcion => <button key={opcion.valor} type="button" onClick={() => { setMes(opcion.valor); setCalendarioAbierto(false) }} className={`min-h-10 rounded-xl px-2 text-xs font-bold capitalize transition ${mes === opcion.valor ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-blue-500/10 dark:hover:text-blue-300'}`}>{opcion.nombre}</button>)}
              </div>
              <button type="button" onClick={() => { const actual = fechaLocal(new Date()); setMes(actual); setAnioCalendario(Number(actual.slice(0,4))); setCalendarioAbierto(false) }} className="mt-3 w-full rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Ir al mes actual</button>
            </div>,document.body)}
          </div>
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
          <button type="button" onClick={exportarPdf} disabled={!filas.length || cargandoFeriados || Boolean(error)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"><FileDown className="h-4 w-4"/>Exportar PDF</button>
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

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0C121E] sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500"><Calculator className="h-5 w-5"/></div><div><h3 className="font-black text-slate-900 dark:text-white">Calculadora de sueldo por vigilador</h3><p className="text-xs text-slate-500 dark:text-slate-400">Consultá la estimación individual usando los turnos del período seleccionado.</p></div></div>
          <label className="w-full space-y-1 text-xs font-bold text-slate-500 dark:text-slate-400 sm:max-w-xs"><span>Seleccionar vigilador</span><select value={vigiladorSeleccionadoId} onChange={e=>setVigiladorSeleccionadoId(e.target.value)} disabled={!filas.length} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white">{filas.map(f=><option key={f.id} value={f.id}>{f.nombre}</option>)}</select></label>
        </div>
        {vigiladorSeleccionadoId ? <CalculadoraSueldo vigiladorId={vigiladorSeleccionadoId} mesInicial={mes} mostrarEncabezadoVigilador={false}/> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900/60">No hay vigiladores asignados a este objetivo y período.</p>}
      </section>
    </div>
  )
}
