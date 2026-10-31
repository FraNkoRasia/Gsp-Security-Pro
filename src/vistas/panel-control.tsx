import { createPortal } from 'react-dom'
import React, { useState } from 'react'
import {
  Users,
  MapPin,
  Building2,
  Calendar,
  BookOpen,
  ArrowRightLeft,
  Bell,
  Clock,
  History,
  ClipboardCheck,
  Tags,
  ArrowLeft,
  Shield,
  Menu,
  LogOut,
  UserRound,
  UserRoundPlus,
  X
} from 'lucide-react'
import { Insignia } from '@/componentes/ui/insignia'
import { Boton } from '@/componentes/ui/boton'
import { GestionEmpresas } from '@/componentes/operativo/gestion-empresas'
import { GestionObjetivos } from '@/componentes/operativo/gestion-objetivos'
import { GestionVigiladores } from '@/componentes/operativo/gestion-vigiladores'
import { GestionPersonalObjetivo } from '@/componentes/operativo/gestion-personal-objetivo'
import { GrillaMensual } from '@/componentes/operativo/grilla-mensual'
import { LibroNovedades } from '@/componentes/operativo/libro-novedades'
import { CambiosTurnos } from '@/componentes/operativo/cambios-turnos'
import { AvisosComunicacion } from '@/componentes/operativo/avisos-comunicacion'
import { MiTurno } from '@/componentes/operativo/mi-turno'
import { MiMes } from '@/componentes/operativo/mi-mes'
import { HistorialLaboral } from '@/componentes/operativo/historial-laboral'
import { AsistenciaPersonal } from '@/componentes/operativo/asistencia-personal'
import { GestionCategoriasPersonal } from '@/componentes/operativo/gestion-categorias-personal'
import { GestionHorasExtra } from '@/componentes/operativo/gestion-horas-extra'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import { useTraduccion } from '@/i18n'
import { useOperativo } from '@/contextos/contexto-operativo'

export const VistaPanelControl: React.FC = () => {
  const { usuario, cerrarSesion } = useAutenticacion()
  const { idioma } = useTraduccion()

  const [pestanaActiva, setPestanaActiva] = useState<string>('objetivos')
  const [objetivoGrillaId, setObjetivoGrillaId] = useState<string | null>(null)
  const [vistaObjetivo, setVistaObjetivo] = useState<'detalle' | 'vigiladores' | 'encargados' | 'supervisores' | 'grilla'>('detalle')
  const [volverDetallePendiente, setVolverDetallePendiente] = useState(false)
  const [empresaSeleccionadaId, setEmpresaSeleccionadaId] = useState<string | null>(null)
  const [objetivoSeleccionadoId, setObjetivoSeleccionadoId] = useState<string | null>(null)
  const [grillaConCambios, setGrillaConCambios] = useState(false)
  const [modalSalidaGrilla, setModalSalidaGrilla] = useState(false)
  const [pestanaPendiente, setPestanaPendiente] = useState<string | null>(null)
  const [masAbierto, setMasAbierto] = useState(false)

  if (!usuario) return null

  const esSuperAdmin = usuario.rol === 'super_administrador'
  const esAdmin = usuario.rol === 'administrador'
  const esVigilador = usuario.rol === 'vigilador'
  const esEncargado = usuario.rol === 'encargado_empresa'
  const { asignaciones, objetivos, solicitudesHorasExtra, solicitudesCambio, avisos, novedades, novedadesLeidas } = useOperativo()
  const asignacionActiva = asignaciones.find((a) => a.id_vigilador === usuario.id && a.activa)
  const objetivoVigiladorId = asignacionActiva?.id_objetivo || null
  const objetivoEncargado = esEncargado ? objetivos.find((objetivo) => objetivo.id_encargado_empresa === usuario.id && objetivo.activo) : undefined
  const objetivoSupervisor = usuario.rol === 'supervisor' ? objetivos.find((objetivo) => objetivo.id_supervisor === usuario.id && objetivo.activo) : undefined
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
    ? [
        { id: 'asistenciaPersonal', label: 'Asistencia', icono: <ClipboardCheck className="w-4 h-4" /> },
        { id: 'personal', label: 'Personal', icono: <UserRoundPlus className="w-4 h-4" /> },
        { id: 'categorias', label: 'Categorías', icono: <Tags className="w-4 h-4" /> }
      ]
    : esAdmin
    ? [
        { id: 'objetivos', label: 'Objetivos', icono: <MapPin className="w-4 h-4" /> },
        { id: 'vigiladores', label: 'Vigiladores', icono: <Users className="w-4 h-4" /> },
        { id: 'encargados', label: 'Encargados', icono: <Users className="w-4 h-4" /> },
        { id: 'supervisores', label: 'Supervisores', icono: <Shield className="w-4 h-4" /> },
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

  // El título principal se muestra únicamente en la vista inicial de cada rol.
  const mostrarTituloPrincipal = esSuperAdmin
    ? !empresaSeleccionadaId
    : esAdmin
    ? pestanaRenderizada === 'objetivos' && !objetivoGrillaId
    : esVigilador
    ? pestanaRenderizada === 'miTurno'
    : esEncargado
    ? pestanaRenderizada === 'asistenciaPersonal'
    : usuario.rol === 'supervisor'

  const tituloPrincipal = esSuperAdmin
    ? { titulo: 'Panel de Administración Global', subtitulo: 'Gestión de empresas y plataforma GSP Security Pro' }
    : esAdmin
    ? { titulo: 'Panel Administrativo', subtitulo: usuario.empresa_nombre || 'Gestión de la empresa de seguridad' }
    : usuario.rol === 'supervisor'
    ? { titulo: 'Panel de Supervisión Operativa', subtitulo: `${usuario.empresa_nombre || 'Empresa de seguridad'} · ${objetivoSupervisor?.nombre || 'Objetivo sin asignar'}` }
    : esEncargado
    ? { titulo: 'Gestión Operativa del Personal', subtitulo: objetivoEncargado?.nombre || 'Objetivo sin asignar' }
    : { titulo: 'Panel del Vigilador', subtitulo: 'Mi servicio · Mis turnos · Mi asistencia' }

  return (
    <div className="space-y-6 animate-fadeIn pb-24 md:pb-0">
      {mostrarTituloPrincipal && (
        <section className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-[#0C121E] sm:px-5 sm:py-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900/70 dark:bg-blue-950/50 dark:text-blue-400 sm:h-12 sm:w-12">
            <Shield className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black leading-tight tracking-tight text-slate-900 dark:text-white sm:text-2xl">{tituloPrincipal.titulo}</h1>
            <p className="mt-1 break-words text-sm font-medium text-slate-500 dark:text-slate-400 sm:text-base">{tituloPrincipal.subtitulo}</p>
          </div>
        </section>
      )}
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
          {!esEncargado && <div className={(esVigilador || esAdmin ? "hidden md:grid" : "grid") + " grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pb-2 border-b border-slate-200 dark:border-slate-800/80"}>
            {pestanas.map((p) => {
              const estaActiva = pestanaRenderizada === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { 
                    if (esAdmin && pestanaRenderizada === 'grillaObjetivo' && grillaConCambios && p.id !== pestanaRenderizada) { setPestanaPendiente(p.id); setModalSalidaGrilla(true) } else setPestanaActiva(p.id) }}
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
          </div>}
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
                  <GestionVigiladores idEmpresaSeleccionada={objetivo.id_empresa} idObjetivoSeleccionado={objetivo.id} ocultarAlta />
                </div>
              )
              if (vistaObjetivo === 'encargados' || vistaObjetivo === 'supervisores') return (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Boton variante="secundario" tamano="chico" onClick={() => setVistaObjetivo('detalle')} icono={<ArrowLeft className="w-4 h-4" />}>Volver al objetivo</Boton>
                    <Insignia variante="azul">{vistaObjetivo === 'encargados' ? 'Encargados del objetivo' : 'Supervisores del objetivo'}</Insignia>
                  </div>
                  <GestionPersonalObjetivo rol={vistaObjetivo === 'encargados' ? 'encargado_empresa' : 'supervisor'} idEmpresaSeleccionada={objetivo.id_empresa} idObjetivoSeleccionado={objetivo.id} modoConsulta />
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
                      <Boton variante="secundario" className="w-full sm:flex-1" onClick={() => setVistaObjetivo('encargados')} icono={<Users className="h-4 w-4" />}>Encargados</Boton>
                      <Boton variante="secundario" className="w-full sm:flex-1" onClick={() => setVistaObjetivo('supervisores')} icono={<Shield className="h-4 w-4" />}>Supervisores</Boton>
                      <Boton variante="primario" className="w-full sm:flex-1" onClick={() => { setGrillaConCambios(false); setVistaObjetivo('grilla') }} icono={<Calendar className="h-4 w-4" />}>Grilla de Vigiladores</Boton>
                    </div>
                  </section>
                </div>
              )
            })()}
            {pestanaRenderizada === 'vigiladores' && esAdmin && <GestionVigiladores />}
            {pestanaRenderizada === 'encargados' && esAdmin && <GestionPersonalObjetivo rol="encargado_empresa" />}
            {pestanaRenderizada === 'supervisores' && esAdmin && <GestionPersonalObjetivo rol="supervisor" />}
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
            {pestanaRenderizada === 'personal' && esEncargado && <AsistenciaPersonal modoGestion />}
            {pestanaRenderizada === 'categorias' && esEncargado && <GestionCategoriasPersonal />}
          </div>
        </>
      )}
      {createPortal((
        <>
          <nav className="md:hidden fixed inset-x-0 bottom-0 z-[60] border-t border-slate-200 bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-[#080D17]/95 dark:shadow-none pb-[env(safe-area-inset-bottom)]" aria-label="Navegación principal">
            <div className="flex w-full h-14 items-center justify-between gap-0 px-0.5 pt-0 pb-0">
              {esSuperAdmin && (
                <>
                  <button type="button" onClick={() => { setEmpresaSeleccionadaId(null); setObjetivoSeleccionadoId(null); setMasAbierto(false) }}
                    className={'flex min-w-0 flex-1 h-full flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[10px] font-bold transition-colors ' + (!empresaSeleccionadaId ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white')}>
                    <Building2 className="h-5 w-5" />
                    <span>Empresas</span>
                  </button>
                  <button type="button" disabled={!empresaSeleccionadaId} onClick={() => { setObjetivoSeleccionadoId(null); setMasAbierto(false) }}
                    className={'flex min-w-0 flex-1 h-full flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[10px] font-bold transition-colors ' + (empresaSeleccionadaId ? 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white' : 'text-slate-300 dark:text-slate-600')}>
                    <MapPin className="h-5 w-5" />
                    <span>Objetivos</span>
                  </button>
                </>
              )}
              {(esVigilador
                ? pestanas.filter((p) => ['miTurno', 'grilla', 'miMes'].includes(p.id))
                : esAdmin
                ? pestanas.filter((p) => ['objetivos', 'vigiladores', 'novedades'].includes(p.id))
                : esEncargado
                ? pestanas.filter((p) => ['asistenciaPersonal', 'personal', 'categorias'].includes(p.id))
                : pestanas.slice(0, 1)
              ).map((p) => {
                const activa = pestanaRenderizada === p.id
                return (
                  <button key={p.id} type="button" onClick={() => {
                    window.dispatchEvent(new Event('gsp:mostrar-inicio-operativo'))
                    
                    if (esAdmin && pestanaRenderizada === 'grillaObjetivo' && grillaConCambios && p.id !== pestanaRenderizada) {
                      setPestanaPendiente(p.id)
                      setModalSalidaGrilla(true)
                    } else {
                      setPestanaActiva(p.id)
                      setMasAbierto(false)
                    }
                  }} aria-current={activa ? 'page' : undefined}
                    className={'flex min-w-0 flex-1 h-full flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[10px] font-bold transition-colors ' + (activa ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white')}>
                    {React.cloneElement(p.icono, { className: 'h-5 w-5' })}
                    <span className="max-w-full truncate">{p.label}</span>
                  </button>
                )
              })}
              <button type="button" onClick={() => setMasAbierto((abierto) => !abierto)} aria-expanded={masAbierto} aria-label="Más opciones"
                className={'flex min-w-0 flex-1 h-full flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[10px] font-bold transition-colors ' + (masAbierto || !(esVigilador ? ['miTurno', 'grilla', 'miMes'] : esAdmin ? ['objetivos', 'vigiladores', 'novedades'] : ['asistenciaPersonal', 'personal', 'categorias']).includes(pestanaRenderizada) ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white')}>
                {masAbierto ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                <span>Más</span>
              </button>
            </div>
          </nav>
          {masAbierto && (
            <div className="md:hidden fixed inset-0 z-50 flex items-end justify-center bg-slate-900/20 px-3 pt-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] backdrop-blur-md dark:bg-black/40" onClick={() => setMasAbierto(false)}>
              <section className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white/98 p-2.5 shadow-[0_24px_80px_rgba(15,23,42,0.18)] dark:border-slate-600/60 dark:bg-[#11151D]/95 dark:shadow-2xl" role="dialog" aria-modal="true" aria-label="Más opciones de navegación" onClick={(e) => e.stopPropagation()}>
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(148,163,184,0.12),transparent_48%),radial-gradient(ellipse_at_bottom_right,rgba(59,130,246,0.12),transparent_38%),radial-gradient(ellipse_at_bottom_left,rgba(239,68,68,0.05),transparent_32%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(100,116,139,0.18),transparent_48%),radial-gradient(ellipse_at_bottom_right,rgba(37,99,235,0.34),transparent_38%),radial-gradient(ellipse_at_bottom_left,rgba(127,29,29,0.12),transparent_32%)]" />
                <div className="relative">
                  <div className="mb-2 flex items-center justify-between px-2">
                    <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Más secciones</h2>
                    <button type="button" onClick={() => setMasAbierto(false)} className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white" aria-label="Cerrar opciones"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {pestanas.filter((p) => !(esVigilador
                      ? ['miTurno', 'grilla', 'miMes'].includes(p.id)
                      : esAdmin
                      ? ['objetivos', 'vigiladores', 'novedades'].includes(p.id)
                      : ['asistenciaPersonal', 'personal', 'categorias'].includes(p.id)
                    )).map((p) => {
                      const activa = pestanaRenderizada === p.id
                      return (
                        <button key={p.id} type="button" onClick={() => {
                          window.dispatchEvent(new Event('gsp:mostrar-inicio-operativo'))
                          
                          if (esAdmin && pestanaRenderizada === 'grillaObjetivo' && grillaConCambios && p.id !== pestanaRenderizada) {
                            setPestanaPendiente(p.id)
                            setModalSalidaGrilla(true)
                          } else {
                            setPestanaActiva(p.id)
                            setMasAbierto(false)
                          }
                        }}
                          className={'flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-xs font-semibold transition-colors ' + (activa ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-400/50 dark:bg-blue-500/20 dark:text-blue-300' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-white/[0.035] dark:bg-white/[0.045] dark:text-slate-300 dark:hover:bg-white/[0.08]')}>
                          <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{p.icono}</span><span className="min-w-0 flex-1 truncate">{p.label}</span>
                          {p.contador ? <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black text-white">{p.contador}</span> : null}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-2 border-t border-white/10 pt-2" />
                  <button type="button" onClick={() => { window.dispatchEvent(new Event('gsp:abrir-perfil')); setMasAbierto(false) }} className="mb-1 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10">
                    <UserRound className="h-4 w-4" />
                    <span>Perfil</span>
                  </button>
                  <button type="button" onClick={async () => { setMasAbierto(false); await cerrarSesion() }} className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold text-red-400 transition hover:bg-red-500/10 active:bg-red-500/15">
                    <LogOut className="h-4 w-4" />
                    <span>Cerrar sesión</span>
                  </button>
                </div>
              </section>
            </div>
          )}
        </>
      ), document.body)}
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
