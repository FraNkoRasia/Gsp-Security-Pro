import React, { useState } from 'react'
import {
  Users,
  MapPin,
  Calendar,
  BookOpen,
  ArrowRightLeft,
  Bell,
  Clock,
  History,
  ClipboardCheck,
  ArrowLeft,
  Shield
} from 'lucide-react'
import { Insignia } from '@/componentes/ui/insignia'
import { Boton } from '@/componentes/ui/boton'
import { GestionEmpresas } from '@/componentes/operativo/gestion-empresas'
import { GestionObjetivos } from '@/componentes/operativo/gestion-objetivos'
import { GestionVigiladores } from '@/componentes/operativo/gestion-vigiladores'
import { GrillaMensual } from '@/componentes/operativo/grilla-mensual'
import { LibroNovedades } from '@/componentes/operativo/libro-novedades'
import { CambiosTurnos } from '@/componentes/operativo/cambios-turnos'
import { AvisosComunicacion } from '@/componentes/operativo/avisos-comunicacion'
import { MiTurno } from '@/componentes/operativo/mi-turno'
import { MiMes } from '@/componentes/operativo/mi-mes'
import { HistorialLaboral } from '@/componentes/operativo/historial-laboral'
import { AsistenciaPersonal } from '@/componentes/operativo/asistencia-personal'
import { GestionHorasExtra } from '@/componentes/operativo/gestion-horas-extra'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import { useTraduccion } from '@/i18n'
import { useOperativo } from '@/contextos/contexto-operativo'

export const VistaPanelControl: React.FC = () => {
  const { usuario } = useAutenticacion()
  const { t, idioma } = useTraduccion()

  const [pestanaActiva, setPestanaActiva] = useState<string>('objetivos')
  const [objetivoGrillaId, setObjetivoGrillaId] = useState<string | null>(null)
  const [vistaObjetivo, setVistaObjetivo] = useState<'detalle' | 'vigiladores' | 'grilla'>('detalle')
  const [volverDetallePendiente, setVolverDetallePendiente] = useState(false)
  const [empresaSeleccionadaId, setEmpresaSeleccionadaId] = useState<string | null>(null)
  const [objetivoSeleccionadoId, setObjetivoSeleccionadoId] = useState<string | null>(null)
  const [grillaConCambios, setGrillaConCambios] = useState(false)
  const [modalSalidaGrilla, setModalSalidaGrilla] = useState(false)
  const [pestanaPendiente, setPestanaPendiente] = useState<string | null>(null)

  if (!usuario) return null

  const esSuperAdmin = usuario.rol === 'super_administrador'
  const esAdmin = usuario.rol === 'administrador'
  const esVigilador = usuario.rol === 'vigilador'
  const esEncargado = usuario.rol === 'encargado_empresa'
  const { asignaciones, objetivos, solicitudesHorasExtra, solicitudesCambio, avisos, novedades, novedadesLeidas } = useOperativo()
  const asignacionActiva = asignaciones.find((a) => a.id_vigilador === usuario.id && a.activa)
  const objetivoVigiladorId = asignacionActiva?.id_objetivo || null
  const avisosNoLeidos = avisos.filter((a) => !a.leido).length
  const novedadesNoLeidas = novedades.filter((n) => n.id_vigilador !== usuario?.id && !novedadesLeidas.includes(n.id)).length
  const solicitudesCambioNoLeidas = solicitudesCambio.filter((s) =>
    esVigilador
      ? s.id_destinatario === usuario.id && s.estado === 'pendiente'
      : esAdmin && s.estado === 'aceptada_vigilador'
  ).length

  // Lista de pestañas según rol
  const pestanas = esVigilador
    ? [
        { id: 'miTurno', label: 'Mi Turno', icono: <Clock className="w-4 h-4" /> },
        { id: 'grilla', label: 'Grilla', icono: <Calendar className="w-4 h-4" /> },
        { id: 'miMes', label: 'Mi Mes', icono: <Calendar className="w-4 h-4" /> },
        { id: 'historialLaboral', label: 'Historial laboral', icono: <History className="w-4 h-4" /> },
        { id: 'asistenciaPersonal', label: 'Asistencia del personal', icono: <ClipboardCheck className="w-4 h-4" /> },
        { id: 'novedades', label: 'Libro de Novedades', contador: novedadesNoLeidas, icono: <BookOpen className="w-4 h-4" /> },
        { id: 'cambios', label: 'Cambios de Turno', contador: solicitudesCambioNoLeidas, icono: <ArrowRightLeft className="w-4 h-4" /> },
        { id: 'avisos', label: 'Avisos', contador: avisosNoLeidos, icono: <Bell className="w-4 h-4" /> }
      ]
    : esSuperAdmin
    ? []
    : esEncargado
    ? [{ id: 'asistenciaPersonal', label: 'Asistencia del personal', icono: <ClipboardCheck className="w-4 h-4" /> }]
    : esAdmin
    ? [
        { id: 'objetivos', label: 'Objetivos', icono: <MapPin className="w-4 h-4" /> },
        { id: 'vigiladores', label: 'Vigiladores', icono: <Users className="w-4 h-4" /> },
        { id: 'novedades', label: 'Libro de Novedades', contador: novedadesNoLeidas, icono: <BookOpen className="w-4 h-4" /> },
        { id: 'cambios', label: 'Cambios y Reemplazos', contador: solicitudesCambioNoLeidas, icono: <ArrowRightLeft className="w-4 h-4" /> },
        { id: 'avisos', label: 'Avisos', contador: avisosNoLeidos, icono: <Bell className="w-4 h-4" /> },
        { id: 'horasExtra', label: 'Horas Extra', contador: solicitudesHorasExtra.filter(s => s.estado === 'pendiente').length, icono: <Clock className="w-4 h-4" /> }
      ]
    : []

  const pestanaRenderizada = pestanaActiva === 'grillaObjetivo' && esAdmin
    ? 'grillaObjetivo'
    : pestanas.some((p) => p.id === pestanaActiva)
    ? pestanaActiva
    : pestanas[0]?.id || ''

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Navegación y contenido operativo */}
      {esSuperAdmin ? (
        <div className="pt-1">
          {!empresaSeleccionadaId ? (
            <GestionEmpresas onSeleccionarEmpresa={setEmpresaSeleccionadaId} />
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <Boton
                  variante="secundario"
                  tamano="chico"
                  onClick={() => {
                    if (objetivoSeleccionadoId) {
                      setObjetivoSeleccionadoId(null)
                    } else {
                      setEmpresaSeleccionadaId(null)
                    }
                  }}
                >
                  ← {objetivoSeleccionadoId
                    ? (idioma === 'en' ? 'Back to Sites' : 'Volver a Objetivos')
                    : (idioma === 'en' ? 'Back to Companies' : 'Volver a Empresas')}
                </Boton>
                <Insignia variante="azul">Vista de Empresa</Insignia>
              </div>
              {!objetivoSeleccionadoId ? (
                <GestionObjetivos
                  idEmpresaSeleccionada={empresaSeleccionadaId}
                  modoConsulta
                  onSeleccionarObjetivo={setObjetivoSeleccionadoId}
                />
              ) : (
                <GestionVigiladores
                  idEmpresaSeleccionada={empresaSeleccionadaId}
                  idObjetivoSeleccionado={objetivoSeleccionadoId}
                  modoConsulta
                />
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pb-2 border-b border-slate-200 dark:border-slate-800/80">
            {pestanas.map((p) => {
              const estaActiva = pestanaRenderizada === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { if (esAdmin && pestanaRenderizada === 'grillaObjetivo' && grillaConCambios && p.id !== pestanaRenderizada) { setPestanaPendiente(p.id); setModalSalidaGrilla(true) } else setPestanaActiva(p.id) }}
                  className={`flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2.5 rounded-xl font-bold text-[11px] sm:text-xs text-center transition-all cursor-pointer select-none min-w-0 ${
                    estaActiva
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                      : 'bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800/80'
                  }`}
                >
                  {p.icono}
                  <span className="truncate">{p.label}</span>{p.contador ? <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-black leading-5 text-center shadow-sm">{p.contador}</span> : null}
                </button>
              )
            })}
          </div>
          <div className="pt-1">
            {pestanaRenderizada === 'objetivos' && esAdmin && <GestionObjetivos onSeleccionarObjetivo={(id) => { setObjetivoGrillaId(id); setVistaObjetivo('detalle'); setPestanaActiva('grillaObjetivo') }} />}
            {pestanaRenderizada === 'grillaObjetivo' && esAdmin && objetivoGrillaId && (() => {
              const objetivo = objetivos.find((item) => item.id === objetivoGrillaId)
              const volverAlDetalle = () => {
                if (vistaObjetivo === 'grilla' && grillaConCambios) {
                  setVolverDetallePendiente(true)
                  setModalSalidaGrilla(true)
                  return
                }
                setGrillaConCambios(false)
                setVistaObjetivo('detalle')
              }
              if (!objetivo) return <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500">No se encontró el objetivo seleccionado.</div>
              if (vistaObjetivo === 'vigiladores') return (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Boton variante="secundario" tamano="chico" onClick={() => setVistaObjetivo('detalle')} icono={<ArrowLeft className="w-4 h-4" />}>{idioma === 'en' ? 'Back to Site' : 'Volver al objetivo'}</Boton>
                    <Insignia variante="azul">Vigiladores del objetivo</Insignia>
                  </div>
                  <GestionVigiladores idEmpresaSeleccionada={objetivo.id_empresa} idObjetivoSeleccionado={objetivo.id} modoConsulta />
                </div>
              )
              if (vistaObjetivo === 'grilla') return (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Boton variante="secundario" tamano="chico" onClick={volverAlDetalle} icono={<ArrowLeft className="w-4 h-4" />}>Volver al objetivo</Boton>
                    <Insignia variante="azul">Grilla de Vigiladores · {objetivo.nombre}</Insignia>
                  </div>
                  <GrillaMensual objetivoInicial={objetivoGrillaId} onCambiosPendientesChange={setGrillaConCambios} />
                </div>
              )
              return (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Boton variante="secundario" tamano="chico" onClick={() => setPestanaActiva('objetivos')} icono={<ArrowLeft className="w-4 h-4" />}>Volver a Objetivos</Boton>
                    <Insignia variante={objetivo.activo ? 'verde' : 'gris'}>{objetivo.activo ? 'Operativo' : 'Inactivo'}</Insignia>
                  </div>
                  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0C121E]">
                    <div className="flex items-start gap-3 border-b border-slate-200 p-5 dark:border-slate-800 sm:p-6">
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-600 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-400"><Shield className="h-6 w-6" /></div>
                      <div className="min-w-0">
                        <h3 className="text-xl font-black text-slate-900 dark:text-white">{objetivo.nombre}</h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{objetivo.localidad}, {objetivo.provincia}</p>
                        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{objetivo.direccion}</p>
                      </div>
                    </div>
                    <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Supervisor a cargo</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{objetivo.supervisor_nombre || 'No informado'}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Elementos a cargo</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{objetivo.elementos_a_cargo || 'No informados'}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40 sm:col-span-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Descripción / puntos de cobertura</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{objetivo.descripcion || 'Sin descripción'}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 border-t border-slate-200 p-5 dark:border-slate-800 sm:flex-row sm:p-6">
                      <Boton variante="secundario" className="w-full sm:flex-1" onClick={() => setVistaObjetivo('vigiladores')} icono={<Users className="h-4 w-4" />}>Vigiladores</Boton>
                      <Boton variante="primario" className="w-full sm:flex-1" onClick={() => { setGrillaConCambios(false); setVistaObjetivo('grilla') }} icono={<Calendar className="h-4 w-4" />}>Grilla de Vigiladores</Boton>
                    </div>
                  </section>
                </div>
              )
            })()}
            {pestanaRenderizada === 'vigiladores' && esAdmin && <GestionVigiladores />}
            {pestanaRenderizada === 'novedades' && (esAdmin || esVigilador) && <LibroNovedades />}
            {pestanaRenderizada === 'cambios' && (esAdmin || esVigilador) && <CambiosTurnos />}
            {pestanaRenderizada === 'avisos' && (esAdmin || esVigilador) && <AvisosComunicacion />}
            {pestanaRenderizada === 'horasExtra' && esAdmin && <GestionHorasExtra />}
            {pestanaRenderizada === 'miTurno' && esVigilador && <MiTurno />}
            {pestanaRenderizada === 'grilla' && esVigilador && objetivoVigiladorId && <GrillaMensual objetivoInicial={objetivoVigiladorId} soloLectura />}
            {pestanaRenderizada === 'grilla' && esVigilador && !objetivoVigiladorId && <div className="rounded-2xl border border-slate-800 bg-[#0C121E] p-6 text-center text-sm text-slate-400">No tenés un objetivo activo asignado actualmente.</div>}
            {pestanaRenderizada === 'miMes' && esVigilador && <MiMes />}
            {pestanaRenderizada === 'historialLaboral' && esVigilador && <HistorialLaboral />}
            {pestanaRenderizada === 'asistenciaPersonal' && (esVigilador || esEncargado) && <AsistenciaPersonal />}
          </div>
        </>
      )}
      {modalSalidaGrilla && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="salida-grilla-titulo">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 id="salida-grilla-titulo" className="text-lg font-bold text-white">Hay cambios sin guardar</h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">Si salís de la grilla ahora, se perderán los cambios que todavía no guardaste.</p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Boton variante="secundario" onClick={() => { setModalSalidaGrilla(false); setPestanaPendiente(null); setVolverDetallePendiente(false) }}>Seguir editando</Boton>
              <Boton variante="peligro" onClick={() => { setGrillaConCambios(false); setModalSalidaGrilla(false); if (volverDetallePendiente) { setVistaObjetivo('detalle'); setVolverDetallePendiente(false) } else if (pestanaPendiente) setPestanaActiva(pestanaPendiente); setPestanaPendiente(null) }}>Descartar y salir</Boton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
