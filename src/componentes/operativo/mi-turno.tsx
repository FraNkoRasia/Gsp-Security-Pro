import React, { useEffect, useState } from 'react'
import { Clock, MapPin, Calendar } from 'lucide-react'
import { Tarjeta, TarjetaContenido, TarjetaEncabezado, TarjetaTitulo } from '@/componentes/ui/tarjeta'
import { Insignia } from '@/componentes/ui/insignia'
import { useOperativo } from '@/contextos/contexto-operativo'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import { SolicitarHorasExtra } from '@/componentes/operativo/solicitar-horas-extra'
import { useTraduccion } from '@/i18n'

export const MiTurno: React.FC = () => {
  const { turnos, objetivos, asignaciones, supervisores, tiposTurno, solicitudesHorasExtra } = useOperativo()
  const { usuario } = useAutenticacion()
  const { idioma } = useTraduccion()

  const idVig = usuario?.id || 'usr-vig-01'
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const intervalo = window.setInterval(() => setAhora(new Date()), 1_000)
    return () => window.clearInterval(intervalo)
  }, [])
  const hoy = ahora
  const formatearFecha = (fecha: string) => {
    const [anio, mes, dia] = fecha.split('-')
    return idioma === 'en' ? `${dia}/${mes}/${anio}` : `${dia}-${mes}-${anio}`
  }
  const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const formatearExtra = (horas: number) => { const minutos = Math.round(horas * 60); return `${Math.floor(minutos / 60)} h${minutos % 60 ? ` ${minutos % 60} min` : ''}` }

  // Buscar el turno de hoy y comprobar si la guardia nocturna de ayer sigue activa.
  const turnoHoy = turnos.find((t) => t.id_vigilador === idVig && t.fecha === hoyStr)
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1)
  const ayerStr = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, '0')}-${String(ayer.getDate()).padStart(2, '0')}`
  const turnoAyer = turnos.find((t) => t.id_vigilador === idVig && t.fecha === ayerStr)
  const minutosHora = (hora: string) => {
    const [horas, minutos] = hora.split(':').map(Number)
    return horas * 60 + (minutos || 0)
  }
  const minutosActuales = hoy.getHours() * 60 + hoy.getMinutes()
  const minutosExactosActuales = minutosActuales + hoy.getSeconds() / 60
  const turnoAyerEnCurso = !!turnoAyer
    && turnoAyer.tipo !== 'franco'
    && turnoAyer.horas_totales > 0
    && minutosHora(turnoAyer.hora_inicio) > minutosHora(turnoAyer.hora_fin)
    && minutosExactosActuales < minutosHora(turnoAyer.hora_fin)
  // Una asignación no implica que la guardia ya haya comenzado: validar el horario real.
  const turnoVisible = (!turnoHoy || turnoHoy.tipo === 'franco') && turnoAyerEnCurso ? turnoAyer : turnoHoy
  const turnoVisibleEsDeAyer = turnoVisible === turnoAyer && turnoAyerEnCurso
  const inicioTurno = turnoVisible ? minutosHora(turnoVisible.hora_inicio) : 0
  const finTurno = turnoVisible ? minutosHora(turnoVisible.hora_fin) : 0
  const esNocturno = !!turnoVisible && inicioTurno > finTurno
  const turnoYaComenzo = !!turnoVisible && (turnoVisibleEsDeAyer
    ? minutosExactosActuales < finTurno
    : (esNocturno
      ? minutosExactosActuales >= inicioTurno || minutosExactosActuales < finTurno
      : minutosExactosActuales >= inicioTurno && minutosExactosActuales < finTurno))
  const enServicio = !!turnoVisible && turnoVisible.tipo !== 'franco' && turnoVisible.horas_totales > 0 && turnoYaComenzo
  const minutosHastaInicio = turnoVisible && !turnoVisibleEsDeAyer && turnoVisible.tipo !== 'franco' && turnoVisible.horas_totales > 0 && minutosExactosActuales < inicioTurno
    ? Math.max(0, Math.ceil((inicioTurno - minutosExactosActuales) * 60))
    : null
  const tiempoRestanteIngreso = minutosHastaInicio === null ? null : `${String(Math.floor(minutosHastaInicio / 3600)).padStart(2, '0')}:${String(Math.floor((minutosHastaInicio % 3600) / 60)).padStart(2, '0')}:${String(minutosHastaInicio % 60).padStart(2, '0')}`
  // Antes de las 07:00, si sigue activa la guardia nocturna de ayer, el día operativo
  // actual todavía no terminó. Incluirlo en próximos turnos y avanzar al día siguiente
  // recién cuando finalice la guardia.
  const inicioProximosDias = turnoAyerEnCurso ? 0 : 1
  const proximosTurnos = Array.from({ length: 5 }, (_, i) => {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i + inicioProximosDias)
    const fechaStr = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
    return {
      fecha: fechaStr,
      turno: turnos.find((t) => t.id_vigilador === idVig && t.fecha === fechaStr),
    }
  })

  // Asignación activa
  const asignacionActiva = asignaciones.find((a) => a.id_vigilador === idVig && a.activa)
  const objetivoActivo = objetivos.find((o) => o.id === asignacionActiva?.id_objetivo)
  const supervisorActivo = supervisores.find((s) => s.id === objetivoActivo?.id_supervisor)
  const supervisorNombre = objetivoActivo?.supervisor_nombre?.trim() || (supervisorActivo ? `${supervisorActivo.nombre} ${supervisorActivo.apellido}`.trim() : '')

  // Última novedad registrada
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-black text-slate-900 dark:text-white font-['Outfit']">
          Mi Turno Operativo
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Información de tu puesto, horario, supervisor y elementos asignados.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Tarjeta de Guardia Actual */}
        <Tarjeta className="border-blue-500/40 bg-gradient-to-br from-white via-blue-50/20 to-white dark:from-[#0C121E] dark:via-blue-950/20 dark:to-[#0C121E]">
          <TarjetaEncabezado>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <TarjetaTitulo className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-500" />
                Guardia de Hoy {formatearFecha(hoyStr)}
              </TarjetaTitulo>
              {enServicio ? (
                <Insignia variante="verde" className="animate-pulse w-fit self-start sm:self-auto">{idioma === 'en' ? 'On Duty' : 'En Servicio'}</Insignia>
              ) : tiempoRestanteIngreso !== null ? (
                <Insignia variante="azul" className="w-fit self-start sm:self-auto">{idioma === 'en' ? 'Starts in' : 'Ingresás en'} {tiempoRestanteIngreso}</Insignia>
              ) : (
                <Insignia variante="gris" className="w-fit self-start sm:self-auto">{idioma === 'en' ? 'Off Duty' : 'Franco de Servicio'}</Insignia>
              )}
            </div>
          </TarjetaEncabezado>

          <TarjetaContenido className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5 font-bold uppercase tracking-wider">
                Objetivo Asignado:
              </span>
              <h4 className="text-lg font-black text-slate-900 dark:text-white">
                {objetivoActivo?.nombre || 'MercadoLibre Río Cuarto'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>{objetivoActivo?.direccion || 'Parque Industrial'}</span>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold">
                  Horario del Turno:
                </span>
                <span className="font-extrabold text-slate-900 dark:text-white text-base break-words">
                  {turnoVisible ? `${String(turnoVisible.hora_inicio).slice(0, 5)} → ${String(turnoVisible.hora_fin).slice(0, 5)}` : (idioma === 'en' ? 'No shift today' : 'Sin turno hoy')}
                </span>
                <span className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold block mt-0.5">
                  {turnoVisible ? (turnoVisible.tipo === 'nocturno' ? (idioma === 'en' ? (tiposTurno.find(t => t.id === turnoVisible.id_tipo_turno)?.nombre?.replace(/nocturno/gi, 'Night Shift') || 'Night Shift') : tiposTurno.find(t => t.id === turnoVisible.id_tipo_turno)?.nombre || 'Turno nocturno') : turnoVisible.tipo === 'diurno' ? (idioma === 'en' ? (tiposTurno.find(t => t.id === turnoVisible.id_tipo_turno)?.nombre?.replace(/diurno/gi, 'Day Shift') || 'Day Shift') : tiposTurno.find(t => t.id === turnoVisible.id_tipo_turno)?.nombre || 'Turno diurno') : (idioma === 'en' ? 'Day Off' : 'Franco')) : (idioma === 'en' ? 'No shift scheduled' : 'Sin guardia programada')}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold">
                  Supervisor a Cargo:
                </span>
                <span className="font-bold text-slate-900 dark:text-white text-sm break-words">
                  {supervisorNombre || (idioma === 'en' ? 'No supervisor assigned' : 'Sin supervisor asignado')}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-xs">
              <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-bold uppercase mb-1">
                Elementos a Cargo del Puesto:
              </span>
              <p className="text-slate-800 dark:text-slate-200 break-words whitespace-pre-line leading-5">
                {objetivoActivo?.elementos_a_cargo || 'No hay elementos registrados para este objetivo.'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-xs">
              <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-bold uppercase mb-1">Descripción y Puntos de Cobertura:</span>
              <p className="text-slate-800 dark:text-slate-200 break-words whitespace-pre-line leading-5">{objetivoActivo?.descripcion || 'No hay descripción ni puntos de cobertura registrados para este objetivo.'}</p>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              {turnoVisible && turnoVisible.tipo !== 'franco' && turnoVisible.horas_extra > 0 && <p className="text-xs font-semibold text-emerald-500">Horas extra confirmadas: +{formatearExtra(turnoVisible.horas_extra)}</p>}
              <SolicitarHorasExtra turnos={turnos.filter(t => t.id_vigilador === idVig && t.tipo !== 'franco' && t.horas_totales > 0 && t.fecha <= hoyStr).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 30)} solicitudes={solicitudesHorasExtra.filter(s => s.id_vigilador === idVig)}/>
            </div>
          </TarjetaContenido>
        </Tarjeta>

        {/* Próximos Turnos Programados */}
        <Tarjeta>
          <TarjetaEncabezado>
            <TarjetaTitulo className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-500" />
              Próximos Turnos Programados
            </TarjetaTitulo>
          </TarjetaEncabezado>
          <TarjetaContenido>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {proximosTurnos.map(({ fecha, turno }) => {
                const esFranco = !turno || turno.tipo === 'franco' || turno.horas_totales === 0
                const nombreConfigurado = turno ? tiposTurno.find(t => t.id === turno.id_tipo_turno)?.nombre : undefined
                const horasTurno = turno ? Number.isInteger(turno.horas_totales) ? turno.horas_totales : Number(turno.horas_totales.toFixed(2)) : 0
                const nombreTurno = turno
                  ? turno.tipo === 'nocturno' ? (idioma === 'en' ? `🌙 ${horasTurno}Hs Night Shift` : `🌙 ${horasTurno}Hs Nocturno`) : turno.tipo === 'diurno' ? (idioma === 'en' ? `☀️ ${horasTurno}Hs Day Shift` : `☀️ ${horasTurno}Hs Diurno`) : turno.tipo === 'franco' ? (idioma === 'en' ? '🛌 Day Off' : '🛌 Franco') : nombreConfigurado || turno.tipo
                  : (idioma === 'en' ? '🛌 Day Off' : '🛌 Franco')
                return (
                  <div key={fecha} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">{new Intl.DateTimeFormat(idioma === 'en' ? 'en-GB' : 'es-AR', { weekday: 'long' }).format(new Date(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10)))).replace(/^./, (letra) => letra.toLocaleUpperCase('es-AR'))} {fecha.slice(8, 10)}/{fecha.slice(5, 7)}/{fecha.slice(0, 4)}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {esFranco ? (idioma === 'en' ? 'Day Off' : 'Día de franco') : `${String(turno.hora_inicio).slice(0, 5)} a ${String(turno.hora_fin).slice(0, 5)} (${turno.horas_totales} hs)`}
                      </div>
                    </div>
                    <div>
                      <Insignia variante={esFranco ? 'gris' : turno.tipo === 'nocturno' ? 'azul' : 'dorado'}>
                        {esFranco ? (idioma === 'en' ? '🛌 Day Off' : '🛌 Franco') : nombreTurno}
                      </Insignia>
                    </div>
                  </div>
                )
              })}
            </div>
          </TarjetaContenido>
        </Tarjeta>
      </div>
    </div>
  )
}
