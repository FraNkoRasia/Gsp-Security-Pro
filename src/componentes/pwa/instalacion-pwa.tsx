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

export const InstalacionPwa: React.FC = () => {
  const { t } = useTraduccion()
  const { cargando, estaAutenticado } = useAutenticacion()
  const [modalAbierto, setModalAbierto] = useState(false)
  const promptRef = useRef<BeforeInstallPromptEvent | null>(eventoInstalacionPwa)
  const [estadoDispositivo, setEstadoDispositivo] = useState<EstadoInstalacion>(() =>
    obtenerEstadoDispositivo(eventoInstalacionPwa)
  )

  useEffect(() => {
    const manejadorPrompt = (e: Event) => {
      e.preventDefault()
      const eventoPwa = e as BeforeInstallPromptEvent
      eventoInstalacionPwa = eventoPwa
      promptRef.current = eventoPwa
      setEstadoDispositivo(obtenerEstadoDispositivo(eventoPwa))
    }

    const manejadorAppInstalada = () => {
      eventoInstalacionPwa = null
      promptRef.current = null
      setEstadoDispositivo((prev) => ({ ...prev, estaInstalada: true, puedeInstalarDirecto: false }))
      setModalAbierto(false)
    }

    // Si el componente se monta tras iniciar sesión, recuperar el evento capturado en login.
    promptRef.current = eventoInstalacionPwa
    setEstadoDispositivo(obtenerEstadoDispositivo(eventoInstalacionPwa))
    window.addEventListener('beforeinstallprompt', manejadorPrompt)
    window.addEventListener('appinstalled', manejadorAppInstalada)

    return () => {
      window.removeEventListener('beforeinstallprompt', manejadorPrompt)
      window.removeEventListener('appinstalled', manejadorAppInstalada)
    }
  }, [])

  if (cargando || estadoDispositivo.estaInstalada || estaAutenticado) return null

  const manejarClickInstalar = () => setModalAbierto(true)

  const manejarConfirmarInstalacion = () => {
    const evento = promptRef.current
    if (!evento) {
      // Sin evento nativo, dejar visible la guía para instalar desde el menú del navegador.
      setModalAbierto(false)
      return
    }

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
      />
    </>
  )
}
