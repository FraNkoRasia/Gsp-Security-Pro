import React, { useState, useEffect, useRef } from 'react'
import { Download, CheckCircle, Smartphone } from 'lucide-react'
import { Boton } from '@/componentes/ui/boton'
import { ModalInstalacion } from './modal-instalacion'
import { obtenerEstadoDispositivo, type EstadoInstalacion } from '@/utilidades/deteccion-plataforma'
import { useTraduccion } from '@/i18n'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export const InstalacionPwa: React.FC = () => {
  const { t } = useTraduccion()
  const { cargando, estaAutenticado } = useAutenticacion()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [promptEvento, setPromptEvento] = useState<BeforeInstallPromptEvent | null>(null)
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)
  const [estadoDispositivo, setEstadoDispositivo] = useState<EstadoInstalacion>(() =>
    obtenerEstadoDispositivo(null)
  )

  useEffect(() => {
    // Este componente se monta en la raíz y permanece activo al cambiar de sesión.
    // Chrome emite beforeinstallprompt una sola vez; no se debe perder al entrar al panel.
    const manejadorPrompt = (e: Event) => {
      e.preventDefault()
      const eventoPwa = e as BeforeInstallPromptEvent
      promptRef.current = eventoPwa
      setPromptEvento(eventoPwa)
      setEstadoDispositivo(obtenerEstadoDispositivo(eventoPwa))
    }

    const manejadorAppInstalada = () => {
      promptRef.current = null
      setPromptEvento(null)
      setEstadoDispositivo((prev) => ({ ...prev, estaInstalada: true, puedeInstalarDirecto: false }))
      setModalAbierto(false)
    }

    // También refrescar el estado si el componente se monta en un navegador que ya
    // informa display-mode standalone.
    setEstadoDispositivo(obtenerEstadoDispositivo(promptRef.current))
    window.addEventListener('beforeinstallprompt', manejadorPrompt)
    window.addEventListener('appinstalled', manejadorAppInstalada)

    return () => {
      window.removeEventListener('beforeinstallprompt', manejadorPrompt)
      window.removeEventListener('appinstalled', manejadorAppInstalada)
    }
  }, [])

  if (cargando || estadoDispositivo.estaInstalada) return null

  const manejarClickInstalar = () => setModalAbierto(true)

  const manejarConfirmarInstalacion = () => {
    const evento = promptRef.current
    if (!evento) {
      // Sin evento válido, no cerrar ni fingir que se inició la instalación.
      // El modal ya muestra instrucciones manuales para este navegador.
      setModalAbierto(false)
      return
    }

    // El evento solo se puede usar una vez. Limpiarlo antes de invocar prompt
    // evita que los siguientes toques reutilicen un evento consumido.
    promptRef.current = null
    setPromptEvento(null)
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
        <div className="w-full max-w-md mx-auto mt-5 p-4 rounded-2xl border border-slate-800 bg-[#0C121E]/95 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            <Smartphone className="w-4 h-4 text-sky-400" />
            <span>{t.pwa.tituloInstalar}</span>
          </div>
          <p className="text-xs text-slate-400 mb-3.5 px-2">{t.pwa.subtituloInstalar}</p>
          <Boton
            type="button"
            variante="secundario"
            tamano="medio"
            onClick={manejarClickInstalar}
            className="w-full border-slate-700 bg-slate-900/90 hover:bg-slate-800 text-sky-300 hover:text-white"
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
      />
    </>
  )
}
