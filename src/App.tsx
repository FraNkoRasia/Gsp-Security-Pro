import React from 'react'
import { ProveedorIdioma } from '@/i18n'
import { ProveedorTema } from '@/contextos/contexto-tema'
import { ProveedorAutenticacion, useAutenticacion } from '@/contextos/contexto-autenticacion'
import { ProveedorOperativo } from '@/contextos/contexto-operativo'
import { DisposicionPrincipal } from '@/componentes/layout/disposicion-principal'
import { VistaInicioSesion } from '@/vistas/inicio-sesion'
import { VistaPanelControl } from '@/vistas/panel-control'
import { CambioContrasenaObligatorio } from '@/componentes/autenticacion/cambio-contrasena-obligatorio'
import './App.css'

const ContenidoAplicacion: React.FC = () => {
  const { estaAutenticado, cargando, usuario } = useAutenticacion()

  if (cargando) {
    return (
      <div
        className="min-h-screen flex flex-1 flex-col items-center justify-center gap-4 bg-[#080C14] text-slate-200"
        role="status"
        aria-live="polite"
        aria-label="Iniciando GSP Security Pro"
      >
        <span
          className="h-10 w-10 animate-spin rounded-full border-4 border-slate-600 border-t-sky-400"
          aria-hidden="true"
        />
        <p className="text-sm text-slate-300">Ingresando a GSP Security Pro…</p>
      </div>
    )
  }

  // El cambio obligatorio por DNI es exclusivo de los vigiladores.
  return (
    <DisposicionPrincipal>
      {estaAutenticado
        ? usuario?.rol === 'vigilador' && usuario.debe_cambiar_contrasena
          ? <CambioContrasenaObligatorio />
          : <VistaPanelControl />
        : <VistaInicioSesion />}
    </DisposicionPrincipal>
  )
}

const AplicacionConDatosOperativos: React.FC = () => {
  const { estaAutenticado, usuario } = useAutenticacion()

  // No cargar datos operativos mientras un vigilador tenga pendiente el cambio obligatorio.
  const cambioPendienteDeVigilador =
    usuario?.rol === 'vigilador' && usuario.debe_cambiar_contrasena

  if (estaAutenticado && usuario && !cambioPendienteDeVigilador) {
    return (
      <ProveedorOperativo>
        <ContenidoAplicacion />
      </ProveedorOperativo>
    )
  }

  return <ContenidoAplicacion />
}

export function App() {
  return (
    <ProveedorTema>
      <ProveedorIdioma>
        <ProveedorAutenticacion>
          <AplicacionConDatosOperativos />
        </ProveedorAutenticacion>
      </ProveedorIdioma>
    </ProveedorTema>
  )
}

export default App
