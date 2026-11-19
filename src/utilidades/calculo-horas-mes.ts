import type { Turno } from '@/tipos'

export interface ResumenHorasMes {
  horasTurno: number
  horasDiurnas: number
  horasNocturnas: number
  horasExtra: number
  turnosFinalizados: Turno[]
}

export const obtenerIntervaloTurno = (turno: Pick<Turno, 'fecha' | 'hora_inicio' | 'hora_fin'>) => {
  const [anio, mes, dia] = turno.fecha.split('-').map(Number)
  const [horaInicio, minutoInicio] = turno.hora_inicio.slice(0, 5).split(':').map(Number)
  const [horaFin, minutoFin] = turno.hora_fin.slice(0, 5).split(':').map(Number)
  const inicio = new Date(anio, mes - 1, dia, horaInicio || 0, minutoInicio || 0, 0, 0)
  let fin = new Date(anio, mes - 1, dia, horaFin || 0, minutoFin || 0, 0, 0)
  if (fin.getTime() <= inicio.getTime()) fin = new Date(fin.getTime() + 24 * 60 * 60 * 1000)
  return { inicio, fin }
}

export const eliminarTurnosDuplicados = (turnos: Turno[]) => {
  const ids = new Set<string>()
  const clavesHorario = new Set<string>()
  // Si hay un duplicado reemplazado y otro vigente, conservar el vigente.
  const ordenados = [...turnos].sort((a, b) => Number(a.estado === 'reemplazado' || a.estado === 'ausente') - Number(b.estado === 'reemplazado' || b.estado === 'ausente'))
  return ordenados.filter(turno => {
    if (ids.has(turno.id)) return false
    ids.add(turno.id)
    const clave = [turno.id_empresa, turno.id_vigilador, turno.id_objetivo, turno.fecha, turno.hora_inicio.slice(0, 5), turno.hora_fin.slice(0, 5)].join('|')
    if (clavesHorario.has(clave)) return false
    clavesHorario.add(clave)
    return true
  })
}

export const turnoFinalizado = (turno: Pick<Turno, 'fecha' | 'hora_inicio' | 'hora_fin'>, ahora = new Date()) =>
  obtenerIntervaloTurno(turno).fin.getTime() <= ahora.getTime()


export const turnoSeSuperponeConMes = (
  turno: Pick<Turno, 'fecha' | 'hora_inicio' | 'hora_fin' | 'tipo'>,
  mes: string
) => {
  if (turno.tipo === 'franco') return turno.fecha.startsWith(mes)
  // Cada turno pertenece al mes de su fecha de inicio, aunque termine al mes siguiente.
  return turno.fecha.startsWith(mes)
}

export const obtenerHorasProgramadasEnMes = (turno: Turno, mes: string) => {
  if (turno.tipo === 'franco' || turno.horas_totales <= 0 || turno.estado === 'reemplazado') return 0
  if (!turno.fecha.startsWith(mes)) return 0
  const { inicio, fin } = obtenerIntervaloTurno(turno)
  // Se imputa el turno completo al mes en que comienza, sin cortarlo a medianoche.
  return Math.max(0, fin.getTime() - inicio.getTime()) / 3600000
}

export const obtenerResumenHorasMes = (turnos: Turno[], mes: string, ahora = new Date()): ResumenHorasMes => {
  const resumen: ResumenHorasMes = { horasTurno: 0, horasDiurnas: 0, horasNocturnas: 0, horasExtra: 0, turnosFinalizados: [] }

  for (const turno of eliminarTurnosDuplicados(turnos)) {
    if (turno.tipo === 'franco' || turno.estado === 'reemplazado' || turno.estado === 'ausente' || turno.horas_totales <= 0) continue

    // El mes se determina por la fecha de inicio del turno, no por cada tramo horario.
    if (!turno.fecha.startsWith(mes)) continue
    const { inicio, fin } = obtenerIntervaloTurno(turno)
    // No se contabilizan turnos futuros ni turnos que todavía están en curso.
    if (fin.getTime() > ahora.getTime()) continue

    let minutosDiurnos = 0
    let minutosNocturnos = 0
    for (let cursor = inicio.getTime(); cursor < fin.getTime(); cursor += 60000) {
      const hora = new Date(cursor).getHours()
      if (hora >= 21 || hora < 6) minutosNocturnos++
      else minutosDiurnos++
    }

    resumen.horasDiurnas += minutosDiurnos / 60
    resumen.horasNocturnas += minutosNocturnos / 60
    resumen.horasTurno += (minutosDiurnos + minutosNocturnos) / 60
    resumen.turnosFinalizados.push(turno)

    // Las horas extra aprobadas se atribuyen al mes de inicio del turno.
    resumen.horasExtra += Number(turno.horas_extra || 0)
  }
  return resumen
}

export const obtenerMesesDeTurnos = (turnos: Turno[]) => {
  const meses = new Set<string>()
  for (const turno of turnos) {
    // Un turno, incluso si cruza medianoche o de mes, solo pertenece al mes de inicio.
    const [anio, numeroMes] = turno.fecha.split('-').map(Number)
    meses.add(`${anio}-${String(numeroMes).padStart(2, '0')}`)
  }
  return Array.from(meses).sort((a, b) => b.localeCompare(a))
}


export interface ResumenHorasDetalladoMes {
  horasTurno: number
  horasDiurnas: number
  horasNocturnas: number
  horasExtra: number
  horasExtraDiurnas: number
  horasExtraNocturnas: number
  horasFeriadoDiurno: number
  horasFeriadoNocturno: number
  turnosFinalizados: Turno[]
  horasExtraPorTurno: Record<string, { diurnas: number; nocturnas: number; total: number }>
  horasFeriadoPorTurno: Record<string, { diurnas: number; nocturnas: number; total: number }>
}

/**
 * Consolida horas reales del mes, distribuyendo las extras a partir de la
 * hora 200 y clasificando cada minuto por franja horaria y fecha feriada.
 */
export const obtenerResumenDetalladoHorasMes = (
  turnos: Turno[],
  mes: string,
  feriadosPorObjetivo: Record<string, Record<string, string>>,
  ahora = new Date()
): ResumenHorasDetalladoMes => {
  const resumen: ResumenHorasDetalladoMes = {
    horasTurno: 0,
    horasDiurnas: 0,
    horasNocturnas: 0,
    horasExtra: 0,
    horasExtraDiurnas: 0,
    horasExtraNocturnas: 0,
    horasFeriadoDiurno: 0,
    horasFeriadoNocturno: 0,
    turnosFinalizados: [],
    horasExtraPorTurno: {},
    horasFeriadoPorTurno: {},
  }
  let minutosAcumulados = 0
  const turnosOrdenados = eliminarTurnosDuplicados(turnos)
    .filter(turno =>
      turno.tipo !== 'franco' &&
      turno.estado !== 'reemplazado' &&
      turno.estado !== 'ausente' &&
      turno.horas_totales > 0 &&
      turno.fecha.startsWith(mes) &&
      turnoFinalizado(turno, ahora)
    )
    .sort((a, b) => {
      const ia = obtenerIntervaloTurno(a).inicio.getTime()
      const ib = obtenerIntervaloTurno(b).inicio.getTime()
      return ia - ib
    })

  for (const turno of turnosOrdenados) {
    const { inicio, fin } = obtenerIntervaloTurno(turno)
    const extrasTurno = { diurnas: 0, nocturnas: 0, total: 0 }
    const feriadosTurno = { diurnas: 0, nocturnas: 0, total: 0 }
    for (let cursor = inicio.getTime(); cursor < fin.getTime(); cursor += 60000) {
      const fecha = new Date(cursor)
      const esNocturna = fecha.getHours() >= 21 || fecha.getHours() < 6
      const fechaClave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
      const esFeriado = Boolean(feriadosPorObjetivo[turno.id_objetivo]?.[fechaClave])
      const esExtra = minutosAcumulados >= 200 * 60
      minutosAcumulados++

      if (esNocturna) {
        resumen.horasNocturnas += 1 / 60
        if (esExtra) {
          resumen.horasExtraNocturnas += 1 / 60
          extrasTurno.nocturnas += 1 / 60
        }
        if (esFeriado) {
          resumen.horasFeriadoNocturno += 1 / 60
          feriadosTurno.nocturnas += 1 / 60
        }
      } else {
        resumen.horasDiurnas += 1 / 60
        if (esExtra) {
          resumen.horasExtraDiurnas += 1 / 60
          extrasTurno.diurnas += 1 / 60
        }
        if (esFeriado) {
          resumen.horasFeriadoDiurno += 1 / 60
          feriadosTurno.diurnas += 1 / 60
        }
      }
    }
    const horasTurno = (fin.getTime() - inicio.getTime()) / 3600000
    resumen.horasTurno += horasTurno
    extrasTurno.total = extrasTurno.diurnas + extrasTurno.nocturnas
    feriadosTurno.total = feriadosTurno.diurnas + feriadosTurno.nocturnas
    resumen.horasExtraPorTurno[turno.id] = extrasTurno
    resumen.horasFeriadoPorTurno[turno.id] = feriadosTurno
    resumen.turnosFinalizados.push(turno)
  }

  resumen.horasExtra = resumen.horasExtraDiurnas + resumen.horasExtraNocturnas
  return resumen
}
