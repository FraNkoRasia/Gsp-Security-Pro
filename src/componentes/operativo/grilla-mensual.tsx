import React, { useEffect, useRef, useState } from 'react'
import {
  Download,
  Edit3,
  ChevronLeft,
  ChevronRight,
  Settings2,
} from 'lucide-react'
import { GestionTiposTurno } from '@/componentes/operativo/gestion-tipos-turno'
import { Tarjeta } from '@/componentes/ui/tarjeta'
import { Boton } from '@/componentes/ui/boton'
import { Dialogo } from '@/componentes/ui/dialogo'
import { useOperativo } from '@/contextos/contexto-operativo'
import { cargarFeriadosManuales, guardarFeriadosManuales } from '@/utilidades/feriados-manuales'
import { cargarFeriadosArgentina } from '@/utilidades/feriados-argentina'
import type { Turno } from '@/tipos'
import { supabase } from '@/servicios/supabase'
import { useTraduccion } from '@/i18n'

const formatearHorasMinutos = (horas: number) => {
  const minutosTotales = Math.round(horas * 60)
  const horasEnteras = Math.floor(minutosTotales / 60)
  const minutosRestantes = minutosTotales % 60
  return `${horasEnteras}.${String(minutosRestantes).padStart(2, '0')}`
}

const formatearTotalDiario = (horas: number) => {
  const redondeado = Math.round((horas + Number.EPSILON) * 100) / 100
  return Number.isInteger(redondeado) ? String(redondeado) : redondeado.toFixed(2)
}

const formatearHorasCasillero = (turno: Turno) => {
  if (turno.horas_extra <= 0) return String(turno.horas_totales)
  const minutos = Math.round((turno.horas_totales + turno.horas_extra) * 60)
  return `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, '0')}`
}

const fechaClave = (fecha: Date) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`

type OperacionGrilla = { id_vigilador: string; fecha: string; codigo: string; id_tipo_turno?: string | null }

export const GrillaMensual: React.FC<{ objetivoInicial?: string; soloLectura?: boolean; onCambiosPendientesChange?: (pendientes: boolean) => void }> = ({ objetivoInicial = '', soloLectura = false, onCambiosPendientesChange }) => {
  const { objetivos, vigiladores, asignaciones, turnos, tiposTurno, guardarGrillaMensual } = useOperativo()
  const { idioma } = useTraduccion()
  const contenedorDesplazamientoRef = useRef<HTMLDivElement>(null)
  const arrastreRef = useRef({ activo: false, inicioX: 0, scrollInicial: 0, seMovio: false })
  const suprimirClickRef = useRef(false)

  const iniciarArrastre = (evento: React.PointerEvent<HTMLDivElement>) => {
    if (evento.button !== 0) return
    const contenedor = contenedorDesplazamientoRef.current
    if (!contenedor) return
    evento.currentTarget.setPointerCapture(evento.pointerId)
    arrastreRef.current = {
      activo: true,
      inicioX: evento.clientX,
      scrollInicial: contenedor.scrollLeft,
      seMovio: false,
    }
  }

  const moverArrastre = (evento: React.PointerEvent<HTMLDivElement>) => {
    const arrastre = arrastreRef.current
    const contenedor = contenedorDesplazamientoRef.current
    if (!arrastre.activo || !contenedor) return
    const desplazamiento = evento.clientX - arrastre.inicioX
    if (Math.abs(desplazamiento) > 5) {
      arrastre.seMovio = true
      suprimirClickRef.current = true
      contenedor.scrollLeft = arrastre.scrollInicial - desplazamiento
    }
  }

  const finalizarArrastre = () => {
    if (arrastreRef.current.seMovio) {
      // Evita que el gesto de arrastre active accidentalmente un casillero.
      suprimirClickRef.current = true
    }
    arrastreRef.current.activo = false
  }

  const controlarClickTrasArrastre = (evento: React.MouseEvent<HTMLDivElement>) => {
    if (!suprimirClickRef.current) return
    evento.preventDefault()
    evento.stopPropagation()
    suprimirClickRef.current = false
  }
  const [objetivoSeleccionado] = useState(objetivoInicial)
  const objetivoActual = objetivos.find((objetivo) => objetivo.id === objetivoSeleccionado)

  const [mesSeleccionado, setMesSeleccionado] = useState(() => {
    const hoy = new Date()
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  })
  const [anioSeleccionado, numeroMesSeleccionado] = mesSeleccionado.split('-').map(Number)
  const hoy = new Date()
  const fechaHoyClave = fechaClave(hoy)
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const soloLecturaEfectiva = soloLectura || mesSeleccionado < mesActual
  const [grillaCreada, setGrillaCreada] = useState(false)
  const [grillasVigiladoresCreadas, setGrillasVigiladoresCreadas] = useState<string[]>([])
  const [cargandoEstadoGrilla, setCargandoEstadoGrilla] = useState(true)
  const [borradores, setBorradores] = useState<Record<string, OperacionGrilla>>({})
  const [modalPrimeraCreacion, setModalPrimeraCreacion] = useState(false)
  const [modalCambiosSinGuardar, setModalCambiosSinGuardar] = useState(false)
  const [mesPendiente, setMesPendiente] = useState<string | null>(null)
  const [avisoBloqueo, setAvisoBloqueo] = useState('')
  const [errorGuardado, setErrorGuardado] = useState('')
  const hayCambiosPendientes = Object.keys(borradores).length > 0
  useEffect(() => { onCambiosPendientesChange?.(hayCambiosPendientes) }, [hayCambiosPendientes, onCambiosPendientesChange])
  useEffect(() => {
    let cancelado = false
    setCargandoEstadoGrilla(true)
    setGrillaCreada(false)
    setGrillasVigiladoresCreadas([])
    if (soloLectura || !supabase || !objetivoSeleccionado) {
      setGrillaCreada(true)
      setCargandoEstadoGrilla(false)
      return
    }
    // Capturar el cliente ya validado para conservar el estrechamiento de tipo dentro de la función async.
    const dbClient = supabase
    const cargarEstado = async () => {
      const [estadoObjetivo, estadoVigiladores] = await Promise.all([
        dbClient.from('grillas_mensuales').select('mes').eq('id_objetivo', objetivoSeleccionado).eq('mes', `${mesSeleccionado}-01`).maybeSingle(),
        dbClient.from('grillas_mensuales_vigiladores').select('id_vigilador').eq('id_objetivo', objetivoSeleccionado).eq('mes', `${mesSeleccionado}-01`)
      ])
      if (cancelado) return
      setGrillaCreada(estadoObjetivo.error ? true : Boolean(estadoObjetivo.data))
      if (estadoObjetivo.error || estadoVigiladores.error) {
        setErrorGuardado('No se pudo verificar el estado de esta grilla. Por seguridad, las fechas históricas quedan bloqueadas.')
        setGrillasVigiladoresCreadas(vigiladores.map(v => v.id))
        setCargandoEstadoGrilla(false)
        return
      }
      const idsDb = (estadoVigiladores.data || []).map(row => row.id_vigilador)
      if (idsDb.length === 0) {
        setGrillasVigiladoresCreadas([])
        setCargandoEstadoGrilla(false)
        return
      }
      const { data: vigiladoresDb, error: errorVigiladores } = await dbClient.from('vigiladores').select('id,id_usuario').in('id', idsDb)
      if (cancelado) return
      if (errorVigiladores) {
        setErrorGuardado('No se pudo verificar el estado de esta grilla. Por seguridad, las fechas históricas quedan bloqueadas.')
        setGrillasVigiladoresCreadas(vigiladores.map(v => v.id))
      } else {
        setGrillasVigiladoresCreadas((vigiladoresDb || []).map(v => v.id_usuario || v.id))
      }
      setCargandoEstadoGrilla(false)
    }
    void cargarEstado()
    return () => { cancelado = true }
  }, [objetivoSeleccionado, mesSeleccionado, soloLectura, vigiladores])
  useEffect(() => {
    const antesDeSalir = (evento: BeforeUnloadEvent) => { if (!hayCambiosPendientes) return; evento.preventDefault(); evento.returnValue = '' }
    window.addEventListener('beforeunload', antesDeSalir)
    return () => window.removeEventListener('beforeunload', antesDeSalir)
  }, [hayCambiosPendientes])
  const mostrarAvisoBloqueo = () => { setAvisoBloqueo('No se puede editar un día anterior o igual al día de hoy.'); window.setTimeout(() => setAvisoBloqueo(''), 1600) }
  const claveBorrador = (idVigilador: string, fecha: string) => `${idVigilador}:${fecha}`
  const vigiladorTieneGrillaCreada = (idVigilador: string) => grillasVigiladoresCreadas.includes(idVigilador)
  const turnosVisibles = [
    ...turnos.filter(t => t.id_objetivo !== objetivoSeleccionado || !t.fecha.startsWith(mesSeleccionado) || !Object.prototype.hasOwnProperty.call(borradores, claveBorrador(t.id_vigilador, t.fecha))),
    ...Object.values(borradores).filter(op => op.codigo !== 'borrar').map(op => {
      const tipoAtajo = op.id_tipo_turno ? tiposTurno.find(t => t.id === op.id_tipo_turno) : null
      let tipo: Turno['tipo'] = 'diurno', horas = 12, inicio = '07:00', fin = '19:00', diurnas = 12, nocturnas = 0
      if (tipoAtajo) { horas = tipoAtajo.horas; tipo = tipoAtajo.tipo === 'mixto' ? 'especial' : tipoAtajo.tipo === 'franco' ? 'franco' : tipoAtajo.tipo; inicio = tipoAtajo.hora_inicio || '00:00'; fin = tipoAtajo.hora_fin || '00:00'; diurnas = tipo === 'diurno' ? horas : 0; nocturnas = tipo === 'nocturno' ? horas : 0; if (tipo === 'franco') { horas = 0; diurnas = 0; nocturnas = 0 } }
      else if (op.codigo === '12🌙') { tipo = 'nocturno'; inicio = '19:00'; fin = '07:00'; diurnas = 3; nocturnas = 9 }
      else if (op.codigo === '10') { tipo = 'especial'; horas = 10; inicio = '08:00'; fin = '18:00'; diurnas = 10 }
      else if (op.codigo === '8') { tipo = 'diurno'; horas = 8; inicio = '08:00'; fin = '16:00'; diurnas = 8 }
      else if (op.codigo === 'F') { tipo = 'franco'; horas = 0; inicio = '00:00'; fin = '00:00'; diurnas = 0 }
      const fechaObj = new Date(`${op.fecha}T12:00:00`)
      return { id: `borrador:${claveBorrador(op.id_vigilador, op.fecha)}`, id_empresa: objetivoActual?.id_empresa || '', id_objetivo: objetivoSeleccionado, id_vigilador: op.id_vigilador, fecha: op.fecha, hora_inicio: inicio, hora_fin: fin, horas_totales: horas, tipo, horas_diurnas: diurnas, horas_nocturnas: nocturnas, es_feriado: false, es_domingo: fechaObj.getDay() === 0, horas_extra: 0, id_tipo_turno: op.id_tipo_turno || null, estado: 'programado' as const }
    })
  ]
  const fechaMesSeleccionado = new Date(anioSeleccionado, numeroMesSeleccionado - 1, 1)
  const nombreMesSeleccionado = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(fechaMesSeleccionado)
  const totalDiasMes = new Date(anioSeleccionado, numeroMesSeleccionado, 0).getDate()

  const cambiarMes = (cantidad: number) => { const nuevoMes = new Date(anioSeleccionado, numeroMesSeleccionado - 1 + cantidad, 1); setMesSeleccionado(`${nuevoMes.getFullYear()}-${String(nuevoMes.getMonth() + 1).padStart(2, '0')}`) }
  const desplazarMes = (cantidad: number) => { if (hayCambiosPendientes) { const nuevoMes = new Date(anioSeleccionado, numeroMesSeleccionado - 1 + cantidad, 1); setMesPendiente(`${nuevoMes.getFullYear()}-${String(nuevoMes.getMonth() + 1).padStart(2, '0')}`); setModalCambiosSinGuardar(true); return } cambiarMes(cantidad) }
  const claveFeriadosManuales = `${objetivoActual?.id_empresa || 'sin-empresa'}:${objetivoSeleccionado || 'sin-objetivo'}`
  const [feriadosManuales, setFeriadosManuales] = useState<string[]>([])
  const [feriadosNacionales, setFeriadosNacionales] = useState<Record<string, string>>({})
  const [feriadosNacionalesIgnorados, setFeriadosNacionalesIgnorados] = useState<string[]>([])
  const claveFeriadosIgnorados = `gsp-feriados-nacionales-ignorados:${claveFeriadosManuales}`

  useEffect(() => {
    let cancelado = false
    cargarFeriadosArgentina(anioSeleccionado).then((feriados) => {
      if (!cancelado) setFeriadosNacionales(feriados)
    })
    return () => { cancelado = true }
  }, [anioSeleccionado])
  useEffect(() => {
    if (objetivoActual?.id_empresa && objetivoSeleccionado) {
      setFeriadosManuales(cargarFeriadosManuales(objetivoActual.id_empresa, objetivoSeleccionado))
    } else {
      setFeriadosManuales([])
    }
    try {
      const guardados = window.localStorage.getItem(claveFeriadosIgnorados)
      setFeriadosNacionalesIgnorados(guardados ? JSON.parse(guardados) as string[] : [])
    } catch {
      setFeriadosNacionalesIgnorados([])
    }
  }, [claveFeriadosManuales, claveFeriadosIgnorados, objetivoActual?.id_empresa, objetivoSeleccionado])

  const alternarFeriadoNacional = (fecha: string) => {
    setFeriadosNacionalesIgnorados((actuales) => {
      const nuevasFechas = actuales.includes(fecha)
        ? actuales.filter((dia) => dia !== fecha)
        : [...actuales, fecha]
      try {
        window.localStorage.setItem(claveFeriadosIgnorados, JSON.stringify(nuevasFechas))
      } catch {
        // La grilla sigue funcionando aunque no se pueda guardar la preferencia local.
      }
      return nuevasFechas
    })
  }

  const alternarFeriadoManual = (fecha: string) => {
    setFeriadosManuales((actuales) => {
      const nuevasFechas = actuales.includes(fecha)
        ? actuales.filter((dia) => dia !== fecha)
        : [...actuales, fecha]
      if (objetivoActual?.id_empresa && objetivoSeleccionado) {
        guardarFeriadosManuales(objetivoActual.id_empresa, objetivoSeleccionado, nuevasFechas)
      }
      return nuevasFechas
    })
  }

  const nombreFeriadoEnFecha = (fecha: string) => feriadosNacionalesIgnorados.includes(fecha) ? (feriadosManuales.includes(fecha) ? 'Feriado manual' : undefined) : feriadosNacionales[fecha] || (feriadosManuales.includes(fecha) ? 'Feriado manual' : undefined)

  // Modal para edición interactiva de celda
  const [modalEdicionAbierto, setModalEdicionAbierto] = useState(false)
  const [celdaEditando, setCeldaEditando] = useState<{
    idVigilador: string
    nombreVigilador: string
    fecha: string
    dia: number
    turnoActual?: Turno
  } | null>(null)

  const [modalTiposTurnoAbierto, setModalTiposTurnoAbierto] = useState(false)
  // Filtrado de vigiladores
  const vigiladoresMostrados = objetivoSeleccionado
    ? vigiladores.filter((v) => asignaciones.some((a) => a.id_vigilador === v.id && a.id_objetivo === objetivoSeleccionado && a.activa))
    : []
  const abrirEditarCelda = (idVig: string, nombreVig: string, dia: number) => {
    const diaStr = dia < 10 ? `0${dia}` : `${dia}`
    const fecha = `${mesSeleccionado}-${diaStr}`
    if (soloLecturaEfectiva || cargandoEstadoGrilla) return
    if (vigiladorTieneGrillaCreada(idVig) && fecha <= fechaHoyClave) { mostrarAvisoBloqueo(); return }
    const turnoActual = turnosVisibles.find(
      (t) => t.id_vigilador === idVig && t.id_objetivo === objetivoSeleccionado && t.fecha === fecha
    )

    setCeldaEditando({
      idVigilador: idVig,
      nombreVigilador: nombreVig,
      fecha,
      dia,
      turnoActual
    })
    setModalEdicionAbierto(true)
  }

  const aplicarCodigoTurno = (codigo: string, idTipoTurno?: string) => {
    if (!celdaEditando) return
    const clave = claveBorrador(celdaEditando.idVigilador, celdaEditando.fecha)
    const turnoOriginal = turnos.find(
      (t) => t.id_vigilador === celdaEditando.idVigilador &&
        t.id_objetivo === objetivoSeleccionado && t.fecha === celdaEditando.fecha
    )
    const codigoOriginal = turnoOriginal
      ? turnoOriginal.tipo === 'franco' ? 'F'
        : turnoOriginal.tipo === 'nocturno' ? '12🌙'
        : turnoOriginal.tipo === 'especial' && Number(turnoOriginal.horas_totales) === 10 ? '10'
        : turnoOriginal.tipo === 'diurno' && Number(turnoOriginal.horas_totales) === 8 ? '8'
        : '12☀️'
      : null
    const esValorOriginal = turnoOriginal
      ? (idTipoTurno
          ? turnoOriginal.id_tipo_turno === idTipoTurno
          : !turnoOriginal.id_tipo_turno && codigo === codigoOriginal)
      : codigo === 'borrar'

    setBorradores(actuales => {
      const siguientes = { ...actuales }
      if (esValorOriginal) delete siguientes[clave]
      else siguientes[clave] = {
        id_vigilador: celdaEditando.idVigilador,
        fecha: celdaEditando.fecha,
        codigo,
        id_tipo_turno: idTipoTurno || null
      }
      return siguientes
    })
    setErrorGuardado('')
    setModalEdicionAbierto(false)
  }

  const guardarCambios = async () => {
    if (!objetivoSeleccionado || !hayCambiosPendientes) return
    setErrorGuardado('')
    const operaciones = Object.values(borradores)
    const error = await guardarGrillaMensual(objetivoSeleccionado, mesSeleccionado, operaciones)
    if (error) { setErrorGuardado(error); return }
    setBorradores({})
    setGrillaCreada(true)
    setModalPrimeraCreacion(false)
    setModalCambiosSinGuardar(false)
  }

  const iniciarGuardado = () => { if (!hayCambiosPendientes || cargandoEstadoGrilla) return; if (!grillaCreada) setModalPrimeraCreacion(true); else void guardarCambios() }

  // Cálculos por vigilador (Sección 24)
  const calcularTotalesVigilador = (idVig: string) => {
    const turnosVig = turnosVisibles.filter(
      (t) => t.id_vigilador === idVig && t.id_objetivo === objetivoSeleccionado && t.fecha.startsWith(mesSeleccionado)
    )

    const horasTotales = turnosVig.reduce((acc, t) => acc + t.horas_totales + t.horas_extra, 0)
    const horasDiurnas = turnosVig.reduce((acc, t) => acc + t.horas_diurnas, 0)
    const horasNocturnas = turnosVig.reduce((acc, t) => acc + t.horas_nocturnas, 0)
    const francos = turnosVig.filter((t) => t.tipo === 'franco').length

    const metaHoras = 204
    let estadoMeta: 'verde' | 'amarillo' | 'rojo' = 'amarillo'
    if (horasTotales >= metaHoras && horasTotales <= 220) {
      estadoMeta = 'verde'
    } else if (horasTotales > 220) {
      estadoMeta = 'rojo'
    }

    return {
      horasTotales,
      horasDiurnas,
      horasNocturnas,
      francos,
      metaHoras,
      estadoMeta
    }
  }

  // Total diario de horas del servicio
  const calcularTotalDiario = (dia: number) => {
    const diaStr = dia < 10 ? `0${dia}` : `${dia}`
    const fecha = `${mesSeleccionado}-${diaStr}`
    const turnosDia = turnosVisibles.filter((t) => t.id_objetivo === objetivoSeleccionado && t.fecha === fecha)
    return turnosDia.reduce((acc, t) => acc + t.horas_totales + t.horas_extra, 0)
  }

  const obtenerEtiquetaTurno = (t?: Turno) => {
    if (!t) return <span className="text-slate-400 dark:text-slate-600">-</span>
    const duracion = formatearHorasCasillero(t)
    const textoHoras = t.horas_extra > 0 ? 'text-emerald-700 dark:text-emerald-400' : ''
    if (t.tipo === 'franco') {
      return <span className="text-slate-700 dark:text-slate-300 font-extrabold text-xs">F</span>
    }
    if (t.tipo === 'nocturno') {
      return (
        <span className="font-extrabold flex flex-col items-center justify-center leading-none gap-0.5 text-blue-700 dark:text-blue-400">
          <span className={`whitespace-nowrap text-[10px] sm:text-[11px] ${textoHoras}`}>{duracion}</span>
          <span className="text-[11px] leading-none" aria-label="Nocturno">🌙</span>
        </span>
      )
    }
    if (t.tipo === 'diurno') {
      return (
        <span className="font-extrabold flex flex-col items-center justify-center leading-none gap-0.5 text-amber-700 dark:text-amber-400">
          <span className={`whitespace-nowrap text-[8px] sm:text-[10px] ${textoHoras}`}>{duracion}</span>
          <span className="text-[11px] leading-none" aria-label="Diurno">☀️</span>
        </span>
      )
    }
    const personalizado = t.id_tipo_turno ? tiposTurno.find((x) => x.id === t.id_tipo_turno) : null
    return <span className="text-emerald-700 dark:text-emerald-400 font-extrabold flex flex-col items-center justify-center leading-none gap-0.5"><span className="text-[10px]">{personalizado?.abreviatura || t.horas_totales}</span><span className="text-[8px] text-slate-600 dark:text-slate-400">{personalizado?.nombre || 'Especial'}</span></span>
  }

  const descargarGrilla = () => {
    if (!objetivoSeleccionado) return

    const ventana = window.open('', '_blank')
    if (!ventana) {
      window.alert('El navegador bloqueó la ventana de impresión. Permití las ventanas emergentes e intentá nuevamente.')
      return
    }

    const escaparHtml = (valor: string) => valor
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
    const [anio, numeroMes] = mesSeleccionado.split('-').map(Number)
    const fechaMes = new Date(anio, numeroMes - 1, 1)
    const nombreMes = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(fechaMes)
    const quincenas = [
      { titulo: 'Primera quincena', inicio: 1, fin: 15 },
      { titulo: 'Segunda quincena', inicio: 16, fin: totalDiasMes }
    ]

    const paginas = quincenas.map((quincena) => {
      const dias = Array.from(
        { length: quincena.fin - quincena.inicio + 1 },
        (_, indice) => quincena.inicio + indice
      )
      const encabezados = dias.map((dia) => {
        const fecha = new Date(anio, numeroMes - 1, dia)
        const diaSemana = new Intl.DateTimeFormat('es-AR', { weekday: 'short' }).format(fecha)
        const finDeSemana = fecha.getDay() === 0 || fecha.getDay() === 6
        const feriado = nombreFeriadoEnFecha(fechaClave(fecha))
        const clases = [finDeSemana ? 'fin-de-semana' : '', feriado ? 'feriado' : ''].filter(Boolean).join(' ')
        return `<th class="${clases}"${feriado ? ` title="${escaparHtml(feriado)}"` : ''}><span>${escaparHtml(diaSemana)}</span><strong>${dia}</strong>${feriado ? '<small>Feriado</small>' : ''}</th>`
      }).join('')
      const filas = vigiladoresMostrados.map((vigilador) => {
        const celdas = dias.map((dia) => {
          const fecha = `${mesSeleccionado}-${String(dia).padStart(2, '0')}`
          const turno = turnosVisibles.find((item) =>
            item.id_vigilador === vigilador.id &&
            item.id_objetivo === objetivoSeleccionado &&
            item.fecha === fecha
          )
          if (!turno) return '<td class="sin-turno">—</td>'

          const codigo = turno.tipo === 'franco'
            ? 'F'
            : turno.horas_extra > 0
              ? formatearHorasCasillero(turno)
              : `${turno.horas_totales}h`
          const iconoTurno = turno.tipo === 'diurno'
            ? '☀️'
            : turno.tipo === 'nocturno'
              ? '🌙'
              : turno.tipo === 'franco'
                ? ''
                : '◆'
          const extra = ''
          const claseTurno = turno.tipo === 'diurno'
            ? 'turno-diurno'
            : turno.tipo === 'nocturno'
              ? 'turno-nocturno'
              : turno.tipo === 'franco'
                ? 'turno-franco'
                : 'turno-especial'
          const icono = iconoTurno ? `<span class="icono-turno">${iconoTurno}</span>` : ''
          const estiloExtra = turno.horas_extra > 0 ? ' turno-con-extra' : ''
          return `<td><span class="turno-casillero ${claseTurno}${estiloExtra}"><strong>${escaparHtml(codigo)}</strong>${icono}</span>${extra}</td>`
        }).join('')
        const horasQuincena = turnos
          .filter((turno) => {
            const dia = Number(turno.fecha.slice(8, 10))
            return turno.id_vigilador === vigilador.id &&
              turno.id_objetivo === objetivoSeleccionado &&
              turno.fecha.startsWith(mesSeleccionado) &&
              dia >= quincena.inicio && dia <= quincena.fin
          })
          .reduce((total, turno) => total + turno.horas_totales + turno.horas_extra, 0)

        return `<tr><th scope="row">${escaparHtml(`${vigilador.apellido}, ${vigilador.nombre}`)}</th>${celdas}<td class="total">${formatearHorasMinutos(horasQuincena)} hs</td></tr>`
      }).join('')
      const filasVacias = vigiladoresMostrados.length === 0
        ? `<tr><td colspan="${dias.length + 2}" class="vacio">No hay vigiladores asignados a este objetivo.</td></tr>`
        : filas
      const totalesDiarios = dias.map((dia) => `<td>${formatearTotalDiario(calcularTotalDiario(dia))}h</td>`).join('')

      return `<section class="quincena"><header><h2>${quincena.titulo}</h2><p>${quincena.inicio} al ${quincena.fin} de ${escaparHtml(nombreMes)}</p></header><table><thead><tr><th>Vigilador</th>${encabezados}<th>Horas</th></tr></thead><tbody>${filasVacias}</tbody><tfoot><tr><th>Total Día</th>${totalesDiarios}<td>Total</td></tr></tfoot></table></section>`
    }).join('')

    ventana.opener = null
    ventana.document.open()
    ventana.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Grilla ${escaparHtml(objetivoActual?.nombre || 'objetivo')} - ${escaparHtml(nombreMes)}</title><style>
      @page { size: 297mm 210mm; margin: 8mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; font-family: Arial, sans-serif; }
      body { height: 194mm; display: flex; flex-direction: column; }
      .titulo { flex: none; display: flex; justify-content: space-between; align-items: center; margin: 0 0 2mm; padding: 0 1mm 2mm; border-bottom: 2px solid #2563eb; }
      .titulo h1 { margin: 1px 0; font-size: 17px; font-weight: 800; }
      .marca { color: #2563eb; font-size: 7px; font-weight: 800; letter-spacing: 1px; }
      .titulo p { margin: 0; font-size: 9px; color: #475569; }
      .mes { padding: 5px 9px; border: 1px solid #93c5fd; border-radius: 7px; color: #1d4ed8; background: #eff6ff; font-size: 10px; text-transform: capitalize; }
      .quincena { flex: 1 1 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
      .quincena + .quincena { margin-top: 2mm; }
      .quincena header { flex: none; display: flex; justify-content: space-between; align-items: center; margin-bottom: 1mm; padding: 1mm 2mm; border-left: 3px solid #2563eb; border-radius: 0 5px 5px 0; background: #eff6ff; }
      h2 { margin: 0; color: #1e3a8a; font-size: 11px; font-weight: 800; }
      .quincena header p { margin: 0; color: #475569; font-size: 8px; }
      table { flex: 1 1 auto; width: 100%; height: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; font-size: 8px; }
      th, td { border-right: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; padding: 1px; text-align: center; overflow-wrap: anywhere; line-height: 1.1; }
      thead th { border-top: 1px solid #94a3b8; background: #e2e8f0; color: #334155; }
      thead th:first-child, tbody th:first-child, tfoot th:first-child { border-left: 1px solid #94a3b8; }
      thead th:first-child { border-radius: 6px 0 0 0; }
      thead th:last-child { border-radius: 0 6px 0 0; }
      thead th:first-child, tbody th { width: 20%; text-align: left; }
      thead th:last-child, tbody td:last-child, tfoot td:last-child { width: 7%; font-weight: 700; }
      thead th span, thead th strong { display: block; }
      thead th span { font-size: 7px; font-weight: 600; }
      thead th strong { font-size: 10px; }
      thead th.fin-de-semana { background: #dbeafe; color: #1e40af; }
      thead th.feriado { background: #fef3c7; color: #92400e; }
      thead th.feriado.fin-de-semana { background: #fde68a; color: #78350f; }
      thead th small { display: block; font-size: 5px; font-weight: 700; }
      tbody th { padding-left: 2mm; background: #f8fafc; font-size: 8px; font-weight: 700; }
      .turno-casillero { min-height: 23px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; border: 1.5px solid; border-radius: 6px; font-size: 8px; line-height: 1; }
      .turno-casillero strong { font-size: 8px; }
      .icono-turno { font-size: 9px; }
      td small { display: block; margin-top: 1px; color: #047857; font-size: 6px; font-weight: 700; }
      .turno-casillero.turno-diurno { border-color: #f59e0b; background: #fef3c7; color: #92400e; }
      .turno-casillero.turno-nocturno { border-color: #3b82f6; background: #dbeafe; color: #1e40af; }
      .turno-casillero.turno-franco { border-color: #22c55e; background: #dcfce7; color: #166534; }
      .turno-casillero.turno-especial { border-color: #8b5cf6; background: #ede9fe; color: #5b21b6; }
      .turno-casillero.turno-con-extra strong { color: #047857; }
      tfoot th, tfoot td { border-top: 2px solid #64748b; background: #f1f5f9; color: #1e293b; font-weight: 800; }
      tfoot th { border-radius: 0 0 0 5px; text-align: left; }
      tfoot td { color: #1d4ed8; font-family: Arial, sans-serif; }
      tfoot td:last-child { border-radius: 0 0 5px 0; }
      .vacio { padding: 3px; color: #475569; }
      @media print {
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; }
      }
    </style></head><body><header class="titulo"><div><span class="marca">GPS SECURITY PRO</span><h1>Grilla de turnos</h1><p>${escaparHtml(objetivoActual?.nombre || 'Objetivo')}</p></div><strong class="mes">${escaparHtml(nombreMes)}</strong></header>${paginas}</body></html>`)
    ventana.document.close()
    ventana.focus()
    window.setTimeout(() => ventana.print(), 250)
  }

  return (
    <div className="grilla-mensual space-y-5">
      {avisoBloqueo && <div role="status" className="fixed bottom-5 left-1/2 z-[10000] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white shadow-xl">{avisoBloqueo}</div>}
      {/* Controles de la grilla mensual */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white font-['Outfit']">
            Grilla Mensual Operativa
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Visualizá y administrá los turnos del mes completo.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto justify-between lg:justify-end">
          <div className="flex items-center gap-2 flex-wrap">
            {!soloLectura && (
              <Boton type="button" variante="primario" tamano="chico" disabled={!hayCambiosPendientes || cargandoEstadoGrilla || soloLecturaEfectiva} onClick={iniciarGuardado}>Guardar cambios{hayCambiosPendientes ? ` (${Object.keys(borradores).length})` : ''}</Boton>
            )}
            <Boton
              type="button"
              variante="secundario"
              tamano="chico"
              onClick={descargarGrilla}
              icono={<Download className="w-3.5 h-3.5 text-blue-500" />}
            >
              Descargar Grilla
            </Boton>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-[#0C121E]">
        <button
          type="button"
          onClick={() => desplazarMes(-1)}
          className="rounded-lg border border-slate-300 p-1.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          title="Mes anterior"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[160px] text-center text-sm font-bold capitalize text-slate-800 dark:text-slate-200" aria-live="polite">
          {nombreMesSeleccionado}
        </span>
        <button
          type="button"
          onClick={() => desplazarMes(1)}
          className="rounded-lg border border-slate-300 p-1.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          title="Mes siguiente"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {!soloLecturaEfectiva && (
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          Usá el botón de cada día para marcar o quitar feriados, incluidos los nacionales automáticos. Los cambios se guardan en este navegador para este objetivo y no se comparten con otros usuarios.
        </p>
      )}

      {/* Tabla de la grilla mensual con desplazamiento horizontal */}
      <Tarjeta className="overflow-hidden rounded-2xl border-slate-200 dark:border-slate-800">
        <div
          ref={contenedorDesplazamientoRef}
          onPointerDown={iniciarArrastre}
          onPointerMove={moverArrastre}
          onPointerUp={finalizarArrastre}
          onPointerCancel={finalizarArrastre}
          onClickCapture={controlarClickTrasArrastre}
          className="max-w-full overflow-x-auto scrollbar-thin cursor-grab active:cursor-grabbing select-none touch-pan-x"
          style={{ overscrollBehaviorX: 'contain' }}
          aria-label="Grilla mensual. Deslizá o arrastrá para ver todos los días."
        >
          <table className="w-max min-w-full text-xs text-left border-separate border-spacing-0 bg-white dark:bg-[#0C121E]">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-[11px] select-none">
                <th className="p-2.5 sm:p-3 sticky left-0 z-20 bg-slate-100 dark:bg-[#0C121E] border-r border-slate-200 dark:border-slate-800 font-bold text-slate-800 dark:text-white w-[120px] min-w-[120px] sm:w-32 sm:min-w-[128px] rounded-tl-xl">
                  Vigilador
                </th>
                {Array.from({ length: totalDiasMes }, (_, i) => i + 1).map((dia) => {
                  const dateObj = new Date(anioSeleccionado, numeroMesSeleccionado - 1, dia)
                  const esFinDeSemana = dateObj.getDay() === 0 || dateObj.getDay() === 6
                  const claveFecha = fechaClave(dateObj)
                  const nombreFeriado = nombreFeriadoEnFecha(claveFecha)
                  const esFeriado = Boolean(nombreFeriado)
                  return (
                    <th
                      key={dia}
                      title={nombreFeriado}
                      aria-label={`${dia} de ${nombreMesSeleccionado}${nombreFeriado ? `, feriado: ${nombreFeriado}` : ''}`}
                      className={`p-1.5 text-center border-r border-slate-200 dark:border-slate-800/80 font-semibold ${
                        'min-w-[42px] max-w-[42px]'
                      } ${
                        esFeriado
                          ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                          : esFinDeSemana
                          ? 'bg-slate-200/50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300'
                          : 'bg-slate-100 dark:bg-[#0C121E] text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <div className="text-[10px] leading-tight opacity-75 font-semibold">
                        <span className="sm:hidden">
                          {(idioma === 'en' ? ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] : ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'])[dateObj.getDay()] }
                        </span>
                        <span className="hidden sm:inline">
                          {(idioma === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'])[dateObj.getDay()] }
                        </span>
                      </div>
                      <div className="font-extrabold text-sm">{dia}</div>
                      {!(soloLecturaEfectiva || claveFecha < fechaHoyClave) ? (
                        <button
                          type="button"
                          onClick={() => feriadosNacionales[claveFecha]
                            ? alternarFeriadoNacional(claveFecha)
                            : alternarFeriadoManual(claveFecha)}
                          aria-pressed={esFeriado}
                          aria-label={`${esFeriado ? 'Quitar' : 'Marcar'} feriado el ${dia} de ${nombreMesSeleccionado}`}
                          title={feriadosNacionales[claveFecha]
                            ? (feriadosNacionalesIgnorados.includes(claveFecha) ? 'Restaurar feriado nacional automático' : 'Quitar feriado nacional automático')
                            : (feriadosManuales.includes(claveFecha) ? 'Quitar feriado manual' : 'Marcar feriado manual')}
                          className="mt-0.5 rounded px-1 text-[9px] font-bold text-amber-700 hover:bg-amber-200 dark:text-amber-300 dark:hover:bg-amber-900/50"
                        >
                          {feriadosNacionales[claveFecha] ? (feriadosNacionalesIgnorados.includes(claveFecha) ? 'Rest.' : 'Fer') : (feriadosManuales.includes(claveFecha) ? 'Fer' : '+ Fer')}
                        </button>
                      ) : esFeriado ? (
                        <div className="text-[9px] text-amber-700 dark:text-amber-300 font-bold" title={nombreFeriado}>Fer</div>
                      ) : null}
                    </th>
                  )
                })}
                <th className="p-1.5 sm:p-2 text-center bg-slate-100 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 font-bold text-slate-800 dark:text-slate-200 min-w-[78px] sm:min-w-[88px]">
                  Total hs
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {vigiladoresMostrados.map((vig) => {
                const totales = calcularTotalesVigilador(vig.id)

                return (
                  <tr
                    key={vig.id}
                    className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors"
                  >
                    {/* Columna Vigilador Sticky */}
                    <td className="p-2 sm:p-2.5 sticky left-0 z-10 bg-white dark:bg-[#0C121E] border-r border-slate-200 dark:border-slate-800 shadow-xs">
                      <div className="font-bold text-slate-900 dark:text-white leading-tight truncate">
                        {vig.apellido}, {vig.nombre.charAt(0)}.
                      </div>
                      <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold truncate max-w-[105px]">
                        {formatearHorasMinutos(totales.horasTotales)}h mes
                      </div>
                    </td>

                    {/* Celdas de Días Editables */}
                    {Array.from({ length: totalDiasMes }, (_, i) => i + 1).map((dia) => {
                      const diaStr = dia < 10 ? `0${dia}` : `${dia}`
                      const fecha = `${mesSeleccionado}-${diaStr}`
                      const turno = turnosVisibles.find(
                        (t) => t.id_vigilador === vig.id && t.id_objetivo === objetivoSeleccionado && t.fecha === fecha
                      )
                      const fechaCelda = fecha
                      const celdaBloqueada = soloLecturaEfectiva || cargandoEstadoGrilla || (vigiladorTieneGrillaCreada(vig.id) && fechaCelda <= fechaHoyClave)
                      const feriadoCelda = nombreFeriadoEnFecha(fechaCelda)

                      return (
                        <td
                          key={dia}
                          onClick={() => { if (celdaBloqueada) { if (!soloLectura && vigiladorTieneGrillaCreada(vig.id) && fechaCelda <= fechaHoyClave) mostrarAvisoBloqueo(); return } abrirEditarCelda(vig.id, `${vig.nombre} ${vig.apellido}`, dia) }}
                          className={`p-1 text-center border-r border-slate-200 dark:border-slate-800/70 transition-colors select-none group ${feriadoCelda ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-white dark:bg-[#0C121E]'} ${celdaBloqueada ? '' : 'cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-800/80'}`}
                          title={feriadoCelda ? `${feriadoCelda} · ${fechaCelda}` : celdaBloqueada ? 'Día bloqueado para edición' : 'Clic para modificar turno'}
                        >
                          <div
                            className={`h-10 min-w-[38px] flex items-center justify-center rounded-lg border transition-transform group-hover:scale-105 ${
                              !turno
                                ? 'border-transparent'
                                : turno.tipo === 'franco'
                                ? 'bg-slate-200/80 dark:bg-slate-800/70 border-slate-400/60 dark:border-slate-500/40'
                                : turno.tipo === 'diurno'
                                ? 'bg-amber-500/10 border-amber-500/70 dark:bg-amber-950/50'
                                : turno.tipo === 'nocturno'
                                ? 'bg-blue-500/10 border-blue-500/70 dark:bg-blue-950/50'
                                : 'bg-emerald-500/10 border-emerald-500/60 dark:bg-emerald-950/40'
                            }`}
                          >
                            {turno?.horas_extra ? <span title={`${formatearHorasCasillero(turno)} hs total, incluye horas extra aprobadas`}>{obtenerEtiquetaTurno(turno)}</span> : obtenerEtiquetaTurno(turno)}
                          </div>
                        </td>
                      )
                    })}

                    {/* Columna Totales y Meta Sticky */}
                    <td className="p-1.5 text-center bg-white dark:bg-[#0C121E] border-l border-slate-200 dark:border-slate-800 shadow-xs">
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-xs ${
                            totales.estadoMeta === 'verde'
                              ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                              : totales.estadoMeta === 'rojo'
                              ? 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800'
                              : 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                          }`}
                        >
                          {formatearHorasMinutos(totales.horasTotales)} hs
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {totales.horasNocturnas}🌙 • {totales.francos}F
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {/* Fila Total Diario del Servicio */}
              <tr className="bg-slate-100/90 dark:bg-slate-950/90 font-bold border-t-2 border-slate-300 dark:border-slate-700 text-[11px]">
                <td className="p-2 sm:p-2.5 sticky left-0 z-10 bg-slate-100 dark:bg-[#101827] border-r border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                  Total Día
                </td>
                {Array.from({ length: totalDiasMes }, (_, i) => i + 1).map((dia) => {
                  const total = calcularTotalDiario(dia)
                  return (
                    <td
                      key={dia}
                      className="p-1 text-center border-r border-slate-200 dark:border-slate-800/70 text-blue-700 dark:text-blue-400 font-mono bg-slate-50 dark:bg-[#101827]"
                    >
                      {formatearTotalDiario(total)}h
                    </td>
                  )
                })}
                <td className="p-2 text-center bg-slate-100 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                  Total
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Tarjeta>

      {errorGuardado && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{errorGuardado}</div>}

      <Dialogo abierto={modalPrimeraCreacion} alCerrar={() => setModalPrimeraCreacion(false)} titulo="Confirmar creación de grilla" subtitulo={nombreMesSeleccionado} tamano="medio">
        <div className="space-y-4"><p className="text-sm leading-6 text-slate-600 dark:text-slate-300">Esta es la primera vez que se guarda la grilla de este objetivo para este mes. Después de guardar, las fechas que ya pasaron, incluido el día de hoy, quedarán bloqueadas y no podrán editarse. Esta regla no afectará las grillas de otros objetivos ni otros meses.</p><div className="flex justify-end gap-2"><Boton variante="secundario" onClick={() => setModalPrimeraCreacion(false)}>Cancelar</Boton><Boton variante="primario" onClick={() => void guardarCambios()}>Confirmar</Boton></div></div>
      </Dialogo>

      <Dialogo abierto={modalCambiosSinGuardar} alCerrar={() => setModalCambiosSinGuardar(false)} titulo="Hay cambios sin guardar" tamano="medio">
        <div className="space-y-4"><p className="text-sm leading-6 text-slate-600 dark:text-slate-300">Si salís ahora, se perderán los cambios que hiciste en esta grilla.</p><div className="flex justify-end gap-2"><Boton variante="secundario" onClick={() => { setModalCambiosSinGuardar(false); setMesPendiente(null) }}>Seguir editando</Boton><Boton variante="peligro" onClick={() => { setBorradores({}); setModalCambiosSinGuardar(false); if (mesPendiente) setMesSeleccionado(mesPendiente); setMesPendiente(null); }}>Descartar cambios</Boton></div></div>
      </Dialogo>

      {/* Modal Interactivo de Asignación / Edición de Celda de Turno */}
      <Dialogo
        abierto={modalEdicionAbierto}
        alCerrar={() => setModalEdicionAbierto(false)}
        titulo="Asignación Rápida de Turno"
        subtitulo={
          celdaEditando
            ? `${celdaEditando.nombreVigilador} — Día ${celdaEditando.dia} de ${nombreMesSeleccionado}`
            : ''
        }
        icono={<Edit3 className="w-5 h-5 text-blue-500" />}
        tamano="chico"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Seleccioná el código de guardia para esta jornada:
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">Seleccioná un atajo configurado para este objetivo.</p>
              <Boton variante="secundario" tamano="chico" onClick={()=>setModalTiposTurnoAbierto(true)} icono={<Settings2 className="w-3.5 h-3.5"/>}>Gestionar atajos</Boton>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {tiposTurno.filter(t=>(t.id_objetivo===objetivoSeleccionado||t.id_objetivo===null)&&t.activo&&t.tipo!=='mixto'&&t.tipo!=='especial').map(t=>{const icono=t.tipo==='diurno'?'☀️':t.tipo==='nocturno'?'🌙':t.tipo==='franco'?'🛌':'🔹';const nombre=t.tipo==='franco'?'Franco':`${t.horas}Hs ${t.tipo==='diurno'?'Diurno':t.tipo==='nocturno'?'Nocturno':'Diurno'}`;return <button key={t.id} type="button" onClick={()=>aplicarCodigoTurno(t.abreviatura,t.id)} className={`p-3 rounded-xl border hover:scale-102 transition-all text-left cursor-pointer ${t.tipo==='diurno'?'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800':t.tipo==='nocturno'?'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800':t.tipo==='franco'?'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800':'bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-800'}`}><div className={`font-bold ${t.tipo==='diurno'?'text-amber-700 dark:text-amber-400':t.tipo==='nocturno'?'text-blue-600 dark:text-blue-400':t.tipo==='franco'?'text-emerald-700 dark:text-emerald-400':'text-slate-800 dark:text-slate-200'}`}>{icono} {nombre}</div><div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{t.hora_inicio&&t.hora_fin?`${t.hora_inicio} → ${t.hora_fin}`:`${t.horas} hs`}</div></button>})}
              {tiposTurno.filter(t=>(t.id_objetivo===objetivoSeleccionado||t.id_objetivo===null)&&t.activo&&t.tipo!=='mixto'&&t.tipo!=='especial').length===0&&<div className="col-span-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-5 text-center text-xs text-slate-500">No hay atajos configurados. Creá uno para comenzar.</div>}{!tiposTurno.some(t=>(t.id_objetivo===objetivoSeleccionado||t.id_objetivo===null)&&t.activo&&t.abreviatura==='12☀️')&&<button type="button" onClick={()=>aplicarCodigoTurno('12☀️')} className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-left cursor-pointer"><div className="font-bold text-amber-700 dark:text-amber-400">12☀️ — Diurno</div><div className="text-[11px] text-slate-500 mt-1">07:00 → 19:00 • 12 hs</div></button>}{!tiposTurno.some(t=>(t.id_objetivo===objetivoSeleccionado||t.id_objetivo===null)&&t.activo&&t.abreviatura==='12🌙')&&<button type="button" onClick={()=>aplicarCodigoTurno('12🌙')} className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-800 text-left cursor-pointer"><div className="font-bold text-blue-600 dark:text-blue-400">12🌙 — Nocturno</div><div className="text-[11px] text-slate-500 mt-1">19:00 → 07:00 • 12 hs</div></button>}{!tiposTurno.some(t=>(t.id_objetivo===objetivoSeleccionado||t.id_objetivo===null)&&t.activo&&t.abreviatura==='10')&&<button type="button" onClick={()=>aplicarCodigoTurno('10')} className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-left cursor-pointer"><div className="font-bold">10 — Especial</div><div className="text-[11px] text-slate-500 mt-1">08:00 → 18:00 • 10 hs</div></button>}{!tiposTurno.some(t=>(t.id_objetivo===objetivoSeleccionado||t.id_objetivo===null)&&t.activo&&t.abreviatura==='8')&&<button type="button" onClick={()=>aplicarCodigoTurno('8')} className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-left cursor-pointer"><div className="font-bold">8 — Estándar</div><div className="text-[11px] text-slate-500 mt-1">08:00 → 16:00 • 8 hs</div></button>}{!tiposTurno.some(t=>(t.id_objetivo===objetivoSeleccionado||t.id_objetivo===null)&&t.activo&&t.abreviatura==='F')&&<button type="button" onClick={()=>aplicarCodigoTurno('F')} className="p-3 rounded-xl bg-slate-200/70 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-left cursor-pointer"><div className="font-bold">F — Franco</div><div className="text-[11px] text-slate-500 mt-1">0 hs</div></button>}
              <button type="button" onClick={()=>aplicarCodigoTurno('borrar')} className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-left cursor-pointer"><div className="font-bold text-red-600 dark:text-red-400">Borrar Guardia</div><div className="text-[11px] text-slate-500 mt-1">Dejar sin turno asignado</div></button>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Boton
              type="button"
              variante="secundario"
              onClick={() => setModalEdicionAbierto(false)}
            >
              Cancelar
            </Boton>
          </div>
        </div>
      </Dialogo>

      {modalTiposTurnoAbierto && <GestionTiposTurno objetivoId={objetivoSeleccionado} alCerrar={()=>setModalTiposTurnoAbierto(false)} />}


    </div>
  )
}
