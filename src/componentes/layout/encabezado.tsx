import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { LogOut, Menu, X, Globe, Sun, Moon, UserRound, Download } from 'lucide-react'
import { ModalInstalacion } from '@/componentes/pwa/modal-instalacion'
import { obtenerEstadoDispositivo, type EstadoInstalacion } from '@/utilidades/deteccion-plataforma'
import { Insignia } from '@/componentes/ui/insignia'
import { Boton } from '@/componentes/ui/boton'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import { useTema } from '@/contextos/contexto-tema'
import { useTraduccion } from '@/i18n'

interface EventoInstalacionPWA extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface PropiedadesEncabezado {
  alIrAInicio?: () => void
  alAbrirPerfil?: () => void
  ubicacionActual?: 'inicio' | 'perfil'
}

export const Encabezado: React.FC<PropiedadesEncabezado> = ({ alIrAInicio, alAbrirPerfil, ubicacionActual = 'inicio' }) => {
  const { usuario, estaAutenticado, cerrarSesion } = useAutenticacion()
  const { t, idioma, cambiarIdioma } = useTraduccion()
  const { temaActual, cambiarTema } = useTema()

  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false)
  const [eventoInstalacion, setEventoInstalacion] = useState<EventoInstalacionPWA | null>(null)
  const [appInstalada, setAppInstalada] = useState(false)
  const [modalInstalacionAbierto, setModalInstalacionAbierto] = useState(false)
  const [mensajeInstalacion, setMensajeInstalacion] = useState<string | null>(null)
  const [estadoDispositivo, setEstadoDispositivo] = useState<EstadoInstalacion>(() => obtenerEstadoDispositivo(null))

  useEffect(() => {
    const verificarInstalacion = () => {
      const instalada = window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
      setAppInstalada(instalada)
    }

    const manejarBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      const eventoPwa = event as EventoInstalacionPWA
      setEventoInstalacion(eventoPwa)
      setEstadoDispositivo(obtenerEstadoDispositivo(eventoPwa))
    }

    const manejarAppInstalled = () => {
      setEventoInstalacion(null)
      setAppInstalada(true)
      setModalInstalacionAbierto(false)
    }

    verificarInstalacion()
    setEstadoDispositivo(obtenerEstadoDispositivo(null))
    window.addEventListener('beforeinstallprompt', manejarBeforeInstallPrompt)
    window.addEventListener('appinstalled', manejarAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', manejarBeforeInstallPrompt)
      window.removeEventListener('appinstalled', manejarAppInstalled)
    }
  }, [])

  const instalarAplicacion = async () => {
    if (!eventoInstalacion) {
      setMensajeInstalacion(
        'Chrome no habilitó la instalación automática. En el menú ⋮ del navegador, buscá “Instalar aplicación” o “Agregar a pantalla principal”. Si no aparece ninguna opción, Chrome todavía no reconoce esta página como instalable.'
      )
      setModalInstalacionAbierto(true)
      return
    }

    setMensajeInstalacion(null)

    await eventoInstalacion.prompt()
    const resultado = await eventoInstalacion.userChoice

    // El evento de instalación solo puede utilizarse una vez.
    // Si el usuario cancela, también debemos descartarlo para esperar
    // un nuevo beforeinstallprompt en lugar de reutilizar un evento agotado.
    setEventoInstalacion(null)
    setEstadoDispositivo(obtenerEstadoDispositivo(null))

    if (resultado.outcome === 'accepted') {
      setAppInstalada(true)
    }
    setModalInstalacionAbierto(false)
  }

  const obtenerEtiquetaRol = (rol: string) => {
    switch (rol) {
      case 'super_administrador':
        return { texto: t.roles.superAdmin, variante: 'dorado' as const }
      case 'administrador':
        return { texto: t.roles.admin, variante: 'azul' as const }
      case 'supervisor':
        return { texto: t.roles.supervisor, variante: 'morado' as const }
      case 'vigilador':
      default:
        return { texto: t.roles.vigilador, variante: 'verde' as const }
    }
  }

  return (
    <>
      <header className="w-full border-b border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-[#070B12]/90 backdrop-blur-md sticky top-0 z-40 px-3 sm:px-6 py-3 select-none transition-colors">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Identidad de la Marca con Escudo Oficial */}
          <button
            type="button"
            onClick={alIrAInicio}
            className="flex items-center gap-2.5 text-left group cursor-pointer"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700/60 p-0.5 flex items-center justify-center shadow-xs group-hover:border-blue-500 transition-all">
              <img src="/Escudo.png" alt="GSP Escudo" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white font-['Outfit'] group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
                  GSP Security Pro
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide hidden xs:block">
                {t.comun.lemaApp}
              </p>
            </div>
          </button>

          {/* Menú desplegable para todos los tamaños */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setMenuMovilAbierto(true)}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-blue-500 transition-all cursor-pointer shadow-xs"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </button>
          </div>
        </div>
      </header>

      {/* Drawer / Menú Desplegable Lateral */}
      {menuMovilAbierto && createPortal(
        <div className="fixed inset-0 z-50 flex justify-end animate-fadeIn">
          {/* Backdrop oscuro */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMenuMovilAbierto(false)}
            aria-hidden="true"
          />

          {/* Panel Lateral Drawer */}
          <div className="relative w-4/5 max-w-xs bg-white dark:bg-[#0C121E] border-l border-slate-200 dark:border-slate-800 h-full p-5 shadow-2xl flex flex-col justify-between z-10 overflow-y-auto">
            <div className="space-y-5">
              {/* Encabezado del menú móvil */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700/60 p-0.5">
                    <img src="/Escudo.png" alt="GSP Logo" className="w-full h-full object-contain" />
                  </div>
                  <span className="font-black text-slate-900 dark:text-white font-['Outfit'] text-base">
                    GSP Security
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuMovilAbierto(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white"
                  aria-label="Cerrar menú"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Información del usuario si está autenticado */}
              {estaAutenticado && usuario ? (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">
                      {usuario.nombre} {usuario.apellido}
                    </span>
                    <Insignia variante={obtenerEtiquetaRol(usuario.rol).variante}>
                      {obtenerEtiquetaRol(usuario.rol).texto}
                    </Insignia>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {usuario.email}
                  </p>
                  <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                    {usuario.empresa_nombre || 'GSP Plataforma Global'}
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 text-xs text-blue-700 dark:text-blue-300">
                  Gestión de Seguridad Profesional
                </div>
              )}

              {/* Volver al inicio */}
              {alIrAInicio && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuMovilAbierto(false)
                      alIrAInicio()
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer shadow-sm ${ubicacionActual === 'inicio'
                      ? 'bg-slate-500/10 dark:bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-400/70 dark:border-slate-600 hover:bg-slate-500/20 hover:border-slate-500'
                      : 'bg-blue-500/10 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/70 hover:bg-blue-500/20 hover:border-blue-400'}`}
                  >
                    <span className="w-9 h-9 rounded-lg bg-slate-500/10 flex items-center justify-center shrink-0">
                      <span className="text-base leading-none">⌂</span>
                    </span>
                    <span className="text-sm font-bold">Volver al inicio</span>
                  </button>
                </div>
              )}

              {/* Acceso al perfil */}
              {estaAutenticado && usuario && alAbrirPerfil && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuMovilAbierto(false)
                      alAbrirPerfil()
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer shadow-sm ${ubicacionActual === 'perfil'
                      ? 'bg-slate-500/10 dark:bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-400/70 dark:border-slate-600 hover:bg-slate-500/20 hover:border-slate-500'
                      : 'bg-blue-500/10 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/70 hover:bg-blue-500/20 hover:border-blue-400'}`}
                  >
                    <span className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                      <UserRound className="w-4 h-4" />
                    </span>
                    <span className="text-sm font-bold">Perfil</span>
                  </button>
                </div>
              )}

              {/* Instalación de la PWA */}
              {!appInstalada && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuMovilAbierto(false)
                      void instalarAplicacion()
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-blue-500/10 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/70 hover:bg-blue-500/20 hover:border-blue-400 transition-colors cursor-pointer shadow-sm"
                    title="Instalar GSP Security Pro"
                  >
                    <span className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                      <Download className="w-4 h-4" />
                    </span>
                    <span className="text-sm font-bold">Instalar aplicación</span>
                  </button>
                </div>
              )}

              {/* Preferencias de Idioma y Tema en Menú Móvil */}
              <div className="space-y-3 pt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                  Preferencias
                </span>

                {/* Selector de Tema Móvil */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    {temaActual === 'dark' ? <Moon className="w-4 h-4 text-blue-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                    <span>Modo visual:</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => cambiarTema('light')}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                        temaActual === 'light'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      Claro
                    </button>
                    <button
                      type="button"
                      onClick={() => cambiarTema('dark')}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                        temaActual === 'dark'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-500 dark:text-slate-400 hover:text-white'
                      }`}
                    >
                      Oscuro
                    </button>
                  </div>
                </div>

                {/* Selector de Idioma Móvil */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-500" />
                    <span>Idioma:</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => cambiarIdioma('es')}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                        idioma === 'es'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Español
                    </button>
                    <button
                      type="button"
                      onClick={() => cambiarIdioma('en')}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                        idioma === 'en'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      English
                    </button>
                  </div>
                </div>
              </div>

            </div>

            {/* Pie del menú móvil con Cierre de Sesión */}
            {estaAutenticado && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <Boton
                  variante="fantasma"
                  tamano="medio"
                  className="w-full bg-red-500/10 dark:bg-red-500/10 border border-red-500/80 dark:border-red-500/80 text-red-500 dark:text-red-400 hover:bg-red-500/20 dark:hover:bg-red-500/20 hover:border-red-400 transition-colors"
                  onClick={() => {
                    setMenuMovilAbierto(false)
                    cerrarSesion()
                  }}
                  icono={<LogOut className="w-4 h-4" />}
                >
                  Cerrar Sesión
                </Boton>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
      <ModalInstalacion
        abierto={modalInstalacionAbierto}
        alCerrar={() => setModalInstalacionAbierto(false)}
        alConfirmar={() => {
          if (!eventoInstalacion) {
            setMensajeInstalacion(
              'No hay un diálogo de instalación disponible en Chrome. Usá el menú ⋮ del navegador y elegí “Instalar aplicación” o “Agregar a pantalla principal”. Si no aparece, hay que revisar los requisitos de instalación de la PWA.'
            )
            return
          }
          void instalarAplicacion()
        }}
        estadoDispositivo={estadoDispositivo}
        mensajeEstado={mensajeInstalacion}
      />
    </>
  )
}
