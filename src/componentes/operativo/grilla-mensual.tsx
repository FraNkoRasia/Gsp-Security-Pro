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
import { useAutenticacion } from '@/contextos/contexto-autenticacion'

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
  const { usuario } = useAutenticacion()
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
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    const [anio, numeroMes] = mesSeleccionado.split('-').map(Number)
    const fechaMes = new Date(anio, numeroMes - 1, 1)
    const nombreMes = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(fechaMes)
    const quincenas = [
      { titulo: 'Primera quincena', inicio: 1, fin: 15 },
      { titulo: 'Segunda quincena', inicio: 16, fin: totalDiasMes }
    ]
    const paginas = quincenas.map((quincena) => {
      const dias = Array.from({ length: quincena.fin - quincena.inicio + 1 }, (_, indice) => quincena.inicio + indice)
      const encabezados = dias.map((dia) => {
        const fecha = new Date(anio, numeroMes - 1, dia)
        const diaSemana = new Intl.DateTimeFormat('es-AR', { weekday: 'short' }).format(fecha)
        const finDeSemana = fecha.getDay() === 0 || fecha.getDay() === 6
        const feriado = nombreFeriadoEnFecha(fechaClave(fecha))
        const clases = [finDeSemana ? 'fin-de-semana' : '', feriado ? 'feriado' : ''].filter(Boolean).join(' ')
        return `<th class="${clases}"${feriado ? ` title="${escaparHtml(feriado)}"` : ''}><span>${escaparHtml(diaSemana.replace('.', ''))}</span><strong>${dia}</strong></th>`
      }).join('')
      const filas = vigiladoresMostrados.map((vigilador) => {
        const celdas = dias.map((dia) => {
          const fecha = `${mesSeleccionado}-${String(dia).padStart(2, '0')}`
          const turno = turnosVisibles.find((item) => item.id_vigilador === vigilador.id && item.id_objetivo === objetivoSeleccionado && item.fecha === fecha)
          if (!turno) return '<td class="sin-turno">O</td>'
          const codigo = turno.tipo === 'franco' ? 'F' : turno.horas_extra > 0 ? formatearHorasCasillero(turno) : `${turno.horas_totales}h`
          const iconoTurno = turno.tipo === 'diurno' ? '☀' : turno.tipo === 'nocturno' ? '☾' : turno.tipo === 'franco' ? '' : '◆'
          const claseTurno = turno.tipo === 'diurno' ? 'turno-diurno' : turno.tipo === 'nocturno' ? 'turno-nocturno' : turno.tipo === 'franco' ? 'turno-franco' : 'turno-especial'
          const icono = iconoTurno ? `<span class="icono-turno">${iconoTurno}</span>` : ''
          const estiloExtra = turno.horas_extra > 0 ? ' turno-con-extra' : ''
          return `<td><span class="turno-casillero ${claseTurno}${estiloExtra}"><strong>${escaparHtml(codigo)}</strong>${icono}</span></td>`
        }).join('')
        const horasQuincena = turnosVisibles.filter((turno) => {
          const dia = Number(turno.fecha.slice(8, 10))
          return turno.id_vigilador === vigilador.id && turno.id_objetivo === objetivoSeleccionado &&
            turno.fecha.startsWith(mesSeleccionado) && dia >= quincena.inicio && dia <= quincena.fin
        }).reduce((total, turno) => total + turno.horas_totales + turno.horas_extra, 0)
        const totalesMes = calcularTotalesVigilador(vigilador.id)
        return `<tr><th scope="row"><span class="avatar">●</span><span class="nombre-vigilador">${escaparHtml(`${vigilador.apellido}, ${vigilador.nombre}`)}</span></th>${celdas}<td class="total"><strong>${formatearHorasMinutos(totalesMes.horasTotales)} hs</strong><span class="francos">Francos: ${totalesMes.francos}</span><span class="nocturnas">Nocturnas: ${formatearHorasMinutos(totalesMes.horasNocturnas)} hs</span></td></tr>`
      }).join('')
      const filasVacias = vigiladoresMostrados.length === 0
        ? `<tr><td colspan="${dias.length + 2}" class="vacio">No hay vigiladores asignados a este objetivo.</td></tr>`
        : filas
      return `<section class="quincena"><header class="encabezado-quincena"><h2>${quincena.titulo}</h2><p>${quincena.inicio} al ${quincena.fin} de ${escaparHtml(nombreMes)}</p></header><table><thead><tr><th class="col-vigilador">Vigilador</th>${encabezados}<th class="col-total">◷ Totales</th></tr></thead><tbody>${filasVacias}</tbody></table></section>`
    }).join('')
    const resumenMensual = vigiladoresMostrados.map((vigilador) => {
      const totales = calcularTotalesVigilador(vigilador.id)
      return `<article class="tarjeta-resumen"><h3>${escaparHtml(`${vigilador.apellido}, ${vigilador.nombre}`)}</h3><div class="metricas"><div><strong class="horas">${formatearHorasMinutos(totales.horasTotales)} hs</strong><span>Horas totales</span></div><div><strong class="francos">${totales.francos}</strong><span>Francos</span></div><div><strong class="nocturnas">${formatearHorasMinutos(totales.horasNocturnas)} hs</strong><span>Nocturnas</span></div></div></article>`
    }).join('')
    const horasGlobales = vigiladoresMostrados.reduce((total, vigilador) => total + calcularTotalesVigilador(vigilador.id).horasTotales, 0)
    ventana.opener = null
    ventana.document.open()
    ventana.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Grilla ${escaparHtml(objetivoActual?.nombre || 'objetivo')} - ${escaparHtml(nombreMes)}</title><style>
@page{size:297mm 210mm;margin:4mm}
*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
html,body{width:100%;height:100%;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;color:#082f63;background:#fff}
.documento{width:289mm;height:202mm;max-width:none;margin:0 auto;padding:0;display:flex;flex-direction:column;gap:2mm;overflow:hidden;background:#fff}
.titulo{height:20mm;flex:none;display:grid;grid-template-columns:1.08fr 1.35fr .9fr;align-items:center;padding:1.5mm 5mm;border:.35mm solid #174a7d;border-radius:2.5mm;background:linear-gradient(105deg,#0b315f 0%,#164b7c 55%,#0b315f 100%);box-shadow:0 1mm 2mm rgba(3,35,73,.2),inset 0 .35mm .6mm rgba(255,255,255,.2);color:#fff}
.identidad{height:100%;display:flex;align-items:center;gap:3mm}
.escudo{width:14mm;height:15mm;flex:none;display:flex;align-items:center;justify-content:center;color:#f4faff;font-size:27px;font-weight:900;line-height:1;text-shadow:0 1px 2px #071f3c}
.marca{display:block;color:#fff;font-size:19px;line-height:1.05;font-weight:900;letter-spacing:.2px;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.2)}
.titulo h1{margin:1mm 0 0;color:#c8e5ff;font-size:13px;line-height:1.1;font-weight:700}
.objetivo{height:14mm;display:flex;align-items:center;justify-content:center;gap:3mm;padding:0 4mm;border-left:.45mm solid #c3def8;border-right:.45mm solid #c3def8;color:#fff;font-size:17px;font-weight:900;white-space:nowrap;text-align:center}
.mes{display:flex;align-items:center;justify-content:flex-end;gap:3mm;color:#fff;font-size:17px;font-weight:900;text-align:right;white-space:nowrap}
.mes small{display:block;margin-top:1mm;color:#d8eaff;font-size:10px;line-height:1.45;font-weight:600}
.icono-encabezado{font-size:27px;line-height:1}
.leyenda{height:17mm;flex:none;display:flex;align-items:center;justify-content:space-between;gap:2mm;padding:1.2mm 4mm;border:.35mm solid #8fc6f5;border-radius:2.5mm;background:linear-gradient(110deg,#f8fcff,#eaf5ff 55%,#f7fbff);box-shadow:0 .5mm 1.3mm rgba(30,90,145,.1),inset 0 .3mm .5mm #fff}
.leyenda-item{height:12mm;flex:1;display:flex;align-items:center;justify-content:center;gap:2.5mm;border-right:.3mm solid #a9d2f2;color:#082f63;font-size:10px;font-weight:800;white-space:nowrap}
.leyenda-item:last-of-type{border:0}
.muestra{width:13mm;height:11mm;flex:none;display:grid;place-items:center;border-radius:2mm;font-size:19px;font-weight:900;box-shadow:0 .6mm 1mm rgba(8,47,99,.14),inset 0 .4mm .5mm rgba(255,255,255,.35)}
.muestra.diurno{background:linear-gradient(145deg,#ffe77a,#ffc928);color:#082f63}
.muestra.nocturno{background:linear-gradient(145deg,#6b5be9,#4335bd);color:#fff}
.muestra.feriado{background:linear-gradient(145deg,#ff5576,#e92c53);color:#fff}
.muestra.franco{background:linear-gradient(145deg,#55a977,#318354);color:#fff}
.horas-globales{min-width:48mm;padding:2mm 3mm;border:.3mm solid #c3e1fa;border-radius:2mm;background:linear-gradient(145deg,#dff1ff,#c5e4fc);color:#082f63;font-size:12px;font-weight:900;text-align:center;white-space:nowrap;box-shadow:inset 0 .3mm .5mm #fff}
.quincena{flex:1 1 0;min-height:0;display:flex;flex-direction:column;overflow:hidden;border:.35mm solid #83b9e8;border-radius:2.3mm;background:#fff;box-shadow:0 .5mm 1.2mm rgba(15,65,110,.1)}
.encabezado-quincena{height:8mm;flex:none;display:flex;justify-content:space-between;align-items:center;padding:1mm 3mm;background:linear-gradient(100deg,#0b3564,#164b7e 58%,#0d3767)}
h2{margin:0;color:#fff;font-size:13px;font-weight:900;text-shadow:0 .3mm .5mm rgba(0,0,0,.18)}
.encabezado-quincena p{margin:0;color:#fff;font-size:10px;font-weight:800}
table{width:100%;height:100%;border-collapse:separate;border-spacing:.65mm;table-layout:fixed;font-size:8px}
th,td{padding:.4mm;text-align:center;vertical-align:middle;line-height:1.05}
thead th{height:10mm;border:.2mm solid #a9cbea;background:linear-gradient(180deg,#1a578c,#0b3c70);color:#fff;font-weight:900;text-shadow:0 .2mm .4mm rgba(0,0,0,.18)}
thead th span,thead th strong{display:block}
thead th span{font-size:8px;font-weight:700;text-transform:capitalize}
thead th strong{margin-top:.5mm;font-size:11px}
thead th.col-vigilador{width:18%;text-align:left;padding-left:3mm;background:linear-gradient(120deg,#eff8ff,#dceefa);color:#082f63;text-shadow:none;font-size:11px}
thead th.col-total{width:9%;background:linear-gradient(180deg,#1a578c,#0b3c70);font-size:10px}
thead th.fin-de-semana{background:linear-gradient(180deg,#205c91,#124575)}
thead th.feriado,thead th.feriado.fin-de-semana{background:linear-gradient(145deg,#ff5274,#e92852);color:#fff;border-color:#ff9db0}
tbody tr{height:9mm}
tbody th{padding-left:2mm;border-bottom:.2mm solid #c5e2f8;background:linear-gradient(100deg,#f8fcff,#eaf5fd);color:#082f63;text-align:left;font-size:10px;font-weight:900;white-space:nowrap}
.avatar{width:8mm;height:8mm;display:inline-grid;place-items:center;margin-right:1.5mm;border:.4mm solid #d5eaff;border-radius:50%;background:linear-gradient(145deg,#1a568c,#082f63);color:#fff;font-size:13px;vertical-align:middle;box-shadow:0 .4mm .8mm rgba(8,47,99,.2)}
.nombre-vigilador{display:inline-block;max-width:80%;overflow:hidden;vertical-align:middle;white-space:nowrap;text-overflow:ellipsis}
tbody td{border-bottom:.2mm solid #c5e2f8;background:#fff}
.turno-casillero{min-height:8mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.5mm;border:.3mm solid transparent;border-radius:1.6mm;font-size:9px;line-height:1;box-shadow:0 .45mm .8mm rgba(8,47,99,.13),inset 0 .35mm .4mm rgba(255,255,255,.45)}
.turno-casillero strong{font-size:10px;font-weight:900}
.icono-turno{font-size:13px;line-height:1}
.turno-casillero.turno-diurno{border-color:#f4c52e;background:linear-gradient(145deg,#ffe77a,#ffd13e);color:#082f63}
.turno-casillero.turno-nocturno{border-color:#5146d8;background:linear-gradient(145deg,#6b5be9,#4537c2);color:#fff}
.turno-casillero.turno-franco{border-color:#65bf8e;background:linear-gradient(145deg,#a4e5c1,#7acb9e);color:#075b3e}
.turno-casillero.turno-especial{border-color:#8b79eb;background:linear-gradient(145deg,#f0edff,#dcd6ff);color:#4338a8}
.turno-casillero.turno-con-extra strong{color:#087b55}
td.sin-turno{border-radius:1.5mm;background:linear-gradient(145deg,#a4e5c1,#7acb9e);color:#075b3e;font-size:12px;font-weight:900}
td.total{border-left:.3mm solid #9cc9ee;background:linear-gradient(145deg,#f3faff,#e4f2fc);color:#082f63;font-size:9px;font-weight:900;white-space:nowrap;text-align:left;padding-left:1.5mm}
.total strong,.total span{display:block}
.total strong{font-size:10px}
.total span{margin-top:.4mm;font-size:8px;font-weight:600}
.total .francos{color:#16865c}.total .nocturnas{color:#5b50d5}
.vacio{padding:3mm;color:#475569}
.resumen-mensual{height:18mm;flex:none;display:grid;grid-template-columns:.9fr repeat(\${Math.max(vigiladoresMostrados.length,1)},minmax(0,1fr));gap:1.7mm}
.titulo-resumen{display:flex;flex-direction:column;justify-content:center;align-items:center;padding:1mm;border:.3mm solid #8fc6f5;border-radius:2.2mm;background:linear-gradient(145deg,#f1f9ff,#dceefa);text-align:center;box-shadow:0 .5mm 1mm rgba(30,90,145,.1),inset 0 .3mm .5mm #fff}
.titulo-resumen strong{color:#082f63;font-size:11px;font-weight:900}
.titulo-resumen span{margin-top:1mm;color:#315d88;font-size:8px;font-weight:700}
.tarjeta-resumen{min-width:0;display:flex;flex-direction:column;justify-content:center;padding:1mm 1.5mm;border:.3mm solid #8fc6f5;border-radius:2.2mm;background:linear-gradient(145deg,#f7fcff,#e8f4fd);box-shadow:0 .5mm 1mm rgba(30,90,145,.12),inset 0 .3mm .5mm #fff}
.tarjeta-resumen h3{margin:0 0 1mm;overflow:hidden;color:#082f63;font-size:9px;font-weight:900;text-align:center;text-overflow:ellipsis;white-space:nowrap}
.metricas{display:grid;grid-template-columns:1.15fr .8fr 1.15fr;align-items:center}
.metricas div{min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 .5mm}
.metricas div+div{border-left:.2mm solid #b8d8f3}
.metricas strong{font-size:12px;line-height:1.1;font-weight:900;white-space:nowrap}
.metricas span{margin-top:.5mm;color:#315d88;font-size:7px;font-weight:700;white-space:nowrap}
.metricas .horas{color:#0872c5}.metricas .francos{color:#16865c}.metricas .nocturnas{color:#5b50d5}
@media screen{body{background:#e9eef5;padding:10px}.documento{box-shadow:0 12px 32px rgba(15,45,80,.2)}}
@media print{html,body{width:289mm;height:202mm;margin:0;padding:0}.documento{width:289mm;height:202mm;margin:0;page-break-inside:avoid;break-inside:avoid}.quincena,.resumen-mensual,.titulo,.leyenda{break-inside:avoid;page-break-inside:avoid}tr{break-inside:avoid}}
</style></head><body><main class="documento"><header class="titulo"><div class="identidad"><div class="escudo">⬡</div><div><span class="marca">GPS SECURITY PRO</span><h1>Grilla de turnos</h1></div></div><div class="objetivo"><span class="icono-encabezado">📍</span>${escaparHtml(objetivoActual?.nombre || 'Objetivo')}</div><div class="mes"><span class="icono-encabezado">▦</span><span>${escaparHtml(nombreMes)}<small>Primera y segunda quincena<br>1 al ${totalDiasMes} de ${escaparHtml(nombreMes)}</small></span></div></header><section class="leyenda"><div class="leyenda-item"><span class="muestra diurno">☀</span><span>Turno diurno<br>8h / 10h / 12h</span></div><div class="leyenda-item"><span class="muestra nocturno">☾</span><span>Turno nocturno<br>12h</span></div><div class="leyenda-item"><span class="muestra feriado">F</span><span>Feriado<br>Solo encabezado</span></div><div class="leyenda-item"><span class="muestra franco">O</span><span>Sin turno<br>Franco u otro</span></div><div class="horas-globales">◷ Horas totales · ${formatearHorasMinutos(horasGlobales)} hs</div></section>${paginas}<section class="resumen-mensual"><div class="titulo-resumen"><strong>▦ Total del mes</strong><span>Ambas quincenas</span></div>${resumenMensual || '<div class="tarjeta-resumen">No hay vigiladores asignados a este objetivo.</div>'}</section></main></body></html>`)
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
            {usuario?.rol === 'vigilador' ? 'Consultá los turnos del mes completo.' : usuario?.rol === 'administrador' || usuario?.rol === 'supervisor' ? 'Visualizá y administrá los turnos del mes completo.' : 'Visualizá los turnos del mes completo.'}
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
                      style={claveFecha === fechaHoyClave ? { backgroundColor: 'rgb(220, 252, 231)', border: '2px solid rgb(4, 120, 87)', color: 'rgb(6, 78, 59)' } : undefined}
                      className={`p-1.5 text-center border-r border-slate-200 dark:border-slate-800/80 font-semibold ${
                        'min-w-[42px] max-w-[42px]'
                      } ${claveFecha === fechaHoyClave ? 'relative z-[1] animate-pulse' : ''} ${
                        claveFecha === fechaHoyClave
                          ? 'border rounded-md'
                          : esFeriado
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
                          className={`p-1 text-center border-r border-slate-200 dark:border-slate-800/70 transition-colors select-none group ${fechaCelda === fechaHoyClave ? 'relative z-[1] animate-pulse bg-blue-50 dark:bg-blue-950/35' : feriadoCelda ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-white dark:bg-[#0C121E]'} ${celdaBloqueada ? '' : 'cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-800/80'}`}
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
                      className={`p-1 text-center border-r border-slate-200 dark:border-slate-800/70 text-blue-700 dark:text-blue-400 font-mono ${'bg-slate-50 dark:bg-[#101827]'}`}
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
              {tiposTurno.filter(t=>(t.id_objetivo===objetivoSeleccionado||t.id_objetivo===null)&&t.activo&&t.tipo!=='mixto'&&t.tipo!=='especial').length===0&&<div className="col-span-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-5 text-center text-xs text-slate-500">No hay atajos configurados. Creá uno para comenzar.</div>}              <button type="button" onClick={()=>aplicarCodigoTurno('borrar')} className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-left cursor-pointer"><div className="font-bold text-red-600 dark:text-red-400">Borrar Guardia</div><div className="text-[11px] text-slate-500 mt-1">Dejar sin turno asignado</div></button>
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
