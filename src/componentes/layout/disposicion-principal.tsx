import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Encabezado } from './encabezado'
import { PieDePagina } from './pie-de-pagina'
import { VistaAyuda } from '@/vistas/ayuda'
import { VistaTerminos } from '@/vistas/terminos'
import { VistaPrivacidad } from '@/vistas/privacidad'
import { VistaAcercaDe } from '@/vistas/acerca-de'
import { VistaPerfil } from '@/vistas/perfil'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'

interface PropiedadesDisposicionPrincipal {
  children: React.ReactNode
}

export type SubVista = 'ninguna' | 'ayuda' | 'terminos' | 'privacidad' | 'acercaDe' | 'perfil'

export const DisposicionPrincipal: React.FC<PropiedadesDisposicionPrincipal> = ({ children }) => {
  const { usuario } = useAutenticacion()
  const [subVista, setSubVista] = useState<SubVista>('ninguna')
  const historialInternoRef = useRef<SubVista[]>(['ninguna'])
  const subVistaRef = useRef<SubVista>('ninguna')
  const retrocesoEnCursoRef = useRef(false)

  const navegarA = useCallback((destino: SubVista) => {
    if (subVistaRef.current === destino) return
    historialInternoRef.current.push(destino)
    subVistaRef.current = destino
    setSubVista(destino)
    window.history.pushState({ gspVistaInterna: destino }, '')
  }, [])

  const cerrarSubVista = useCallback(() => {
    subVistaRef.current = 'ninguna'
    setSubVista('ninguna')
    historialInternoRef.current = ['ninguna']
  }, [])

  useEffect(() => {
    // Mantiene un estado interno en el historial para interceptar Atrás
    // sin sacar al usuario de la aplicación cuando navega por sus vistas.
    if (!window.history.state?.gspVistaInterna) {
      // Crea una entrada centinela para que el primer Atrás también quede
      // dentro de la aplicación en lugar de abandonar directamente la página.
      window.history.pushState({ gspVistaInterna: 'ninguna' }, '')
    }

    const manejarAtras = () => {
      if (retrocesoEnCursoRef.current) {
        retrocesoEnCursoRef.current = false
        return
      }

      const historial = historialInternoRef.current
      if (historial.length > 1) {
        historial.pop()
        const anterior = historial[historial.length - 1] ?? 'ninguna'
        subVistaRef.current = anterior
        setSubVista(anterior)
        window.history.pushState({ gspVistaInterna: anterior }, '')
        return
      }

      // En el inicio, reponer el estado de la app evita que un toque accidental
      // cierre la PWA o abandone la página inmediatamente.
      window.history.pushState({ gspVistaInterna: 'ninguna' }, '')
    }

    window.addEventListener('popstate', manejarAtras)
    return () => window.removeEventListener('popstate', manejarAtras)
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7FC] dark:bg-[#070B12] text-slate-900 dark:text-slate-100 overflow-x-hidden selection:bg-blue-600 selection:text-white transition-colors duration-200">
      {/* Encabezado Principal */}
      <Encabezado
        alIrAInicio={() => navegarA('ninguna')}
        alAbrirPerfil={() => navegarA('perfil')}
        ubicacionActual={subVista === 'perfil' ? 'perfil' : 'inicio'}
      />

      {/* Contenido Principal con soporte desde 320px */}
      <main className="flex-1 flex flex-col w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        {subVista === 'perfil' ? <><div className="hidden">{children}</div><VistaPerfil /></> : children}
      </main>

      {/* Pie de Página Global */}
      <PieDePagina alNavegar={(vista) => navegarA(vista)} reservarEspacioInferior={Boolean(usuario)} />

      {/* Modales informativos de Ayuda, Términos, Privacidad, Acerca de */}
      <VistaAyuda
        abierto={subVista === 'ayuda'}
        alCerrar={cerrarSubVista}
      />
      <VistaTerminos
        abierto={subVista === 'terminos'}
        alCerrar={cerrarSubVista}
      />
      <VistaPrivacidad
        abierto={subVista === 'privacidad'}
        alCerrar={() => setSubVista('ninguna')}
      />
      <VistaAcercaDe
        abierto={subVista === 'acercaDe'}
        alCerrar={() => setSubVista('ninguna')}
      />
    </div>
  )
}
