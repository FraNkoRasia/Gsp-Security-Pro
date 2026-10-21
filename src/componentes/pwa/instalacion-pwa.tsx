import React, { useState, useEffect, useRef } from 'react'
import { Download, Smartphone } from 'lucide-react'
import { Boton } from '@/componentes/ui/boton'
import { ModalInstalacion } from './modal-instalacion'
import { obtenerEstadoDispositivo, type EstadoInstalacion } from '@/utilidades/deteccion-plataforma'
import { useTraduccion } from '@/i18n'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

// El evento de Chrome es de un solo uso. Se conserva fuera del componente para
// sobrevivir al cambio de pantalla de login a panel sin volver a solicitarlo.
let eventoInstalacionPwa: BeforeInstallPromptEvent | null = null

// Capturar el evento en cuanto se carga el módulo, antes de que React ejecute
// los efectos. Chrome puede emitir beforeinstallprompt antes del useEffect.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (evento: Event) => {
    evento.preventDefault()
    eventoInstalacionPwa = evento as BeforeInstallPromptEvent
    window.dispatchEvent(new Event('gsp:pwa-install-available'))
  })
}

export const InstalacionPwa: React.FC = () => {
  const { t } = useTraduccion()
  const { cargando, estaAutenticado } = useAutenticacion()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [mensajeInstalacion, setMensajeInstalacion] = useState<string | null>(null)
  const promptRef = useRef<BeforeInstallPromptEvent | null>(eventoInstalacionPwa)
  const [estadoDispositivo, setEstadoDispositivo] = useState<EstadoInstalacion>(() =>
    obtenerEstadoDispositivo(eventoInstalacionPwa)
  )

  useEffect(() => {
    const actualizarDisponibilidadInstalacion = () => {
      promptRef.current = eventoInstalacionPwa
      setEstadoDispositivo(obtenerEstadoDispositivo(eventoInstalacionPwa))
    }

    const manejadorAppInstalada = () => {
      eventoInstalacionPwa = null
      promptRef.current = null
      setEstadoDispositivo((prev) => ({ ...prev, estaInstalada: true, puedeInstalarDirecto: false }))
      setModalAbierto(false)
    }

    // Recuperar un evento capturado antes del montaje y escuchar si Chrome
    // habilita la instalación después de que la pantalla ya se haya renderizado.
    actualizarDisponibilidadInstalacion()
    window.addEventListener('gsp:pwa-install-available', actualizarDisponibilidadInstalacion)
    window.addEventListener('appinstalled', manejadorAppInstalada)

    return () => {
      window.removeEventListener('gsp:pwa-install-available', actualizarDisponibilidadInstalacion)
      window.removeEventListener('appinstalled', manejadorAppInstalada)
    }
  }, [])

  if (cargando || estadoDispositivo.estaInstalada) return null

  const manejarClickInstalar = () => {
    setMensajeInstalacion(null)
    setModalAbierto(true)
  }

  const manejarConfirmarInstalacion = () => {
    const evento = promptRef.current
    if (!evento) {
      // No cerrar el modal como si se hubiera instalado: Chrome no ofreció
      // el diálogo nativo. Mantener visible la guía y explicar el siguiente paso.
      setMensajeInstalacion(
        'Chrome no habilitó la instalación automática en esta visita. Abrí el menú ⋮ del navegador y elegí “Instalar aplicación” o “Agregar a pantalla principal”. Si esa opción tampoco aparece, el navegador todavía no reconoce esta página como instalable.'
      )
      return
    }

    setMensajeInstalacion(null)

    // El evento beforeinstallprompt se consume una sola vez.
    promptRef.current = null
    eventoInstalacionPwa = null
    setEstadoDispositivo((prev) => ({ ...prev, puedeInstalarDirecto: false }))
    try {
      const promesaPrompt = evento.prompt()
      setModalAbierto(false)
      void promesaPrompt.then(() => evento.userChoice).then((eleccion) => {
        if (eleccion.outcome === 'accepted') {
          setEstadoDispositivo((prev) => ({ ...prev, estaInstalada: true }))
        }
      }).catch((err) => {
        console.error('Error al invocar instalación PWA:', err)
      })
    } catch (err) {
      console.error('Error al invocar instalación PWA:', err)
      setModalAbierto(true)
    }
  }

  return (
    <>
      {estaAutenticado ? (
        <div className="fixed bottom-4 right-4 z-40">
          <Boton
            type="button"
            variante="primario"
            tamano="medio"
            onClick={manejarClickInstalar}
            className="rounded-full border border-sky-400/40 bg-sky-700 px-4 text-white shadow-xl shadow-black/30 hover:bg-sky-600"
            icono={<Download className="h-4 w-4" />}
          >
            Instalar GSP
          </Boton>
        </div>
      ) : (
        <div className="w-full mt-6 pt-6 border-t border-slate-800/80 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            <Smartphone className="w-4 h-4 text-sky-400" />
            <span>{t.pwa.tituloInstalar}</span>
          </div>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-3.5 px-2">
            {t.pwa.subtituloInstalar}
          </p>
          <Boton
            type="button"
            variante="secundario"
            tamano="medio"
            onClick={manejarClickInstalar}
            className="w-full sm:w-auto px-6 border-slate-700 bg-slate-900/90 hover:bg-slate-800 text-sky-300 hover:text-white"
            icono={<Download className="w-4 h-4 text-sky-400" />}
          >
            {t.pwa.botonInstalar}
          </Boton>
        </div>
      )}

      <ModalInstalacion
        abierto={modalAbierto}
        alCerrar={() => setModalAbierto(false)}
        alConfirmar={manejarConfirmarInstalacion}
        estadoDispositivo={estadoDispositivo}
        mensajeEstado={mensajeInstalacion}
      />
    </>
  )
}
