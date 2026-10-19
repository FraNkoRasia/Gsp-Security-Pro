import React from 'react'
import { Tarjeta, TarjetaContenido } from '@/componentes/ui/tarjeta'
import { FormularioLogin } from '@/componentes/autenticacion/formulario-login'

export const VistaInicioSesion: React.FC = () => {
  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center py-4 sm:py-8 px-2 sm:px-4">
      <div className="w-full max-w-md mx-auto space-y-6">
        <div className="text-center pt-2 pb-1">
          <div className="relative inline-block mx-auto">
            <img
              src="/logoAPP.png"
              alt="GSP Security Pro — Gestión de Seguridad Profesional"
              className="w-56 sm:w-64 md:w-72 max-w-full h-auto mx-auto object-contain filter drop-shadow-[0_12px_28px_rgba(0,112,243,0.35)] transition-transform duration-300 hover:scale-[1.02]"
            />
          </div>
        </div>

        <Tarjeta className="border-slate-700/60 dark:border-slate-800 bg-white/95 dark:bg-[#0C121E]/95 shadow-2xl backdrop-blur-xl">
          <TarjetaContenido className="p-5 sm:p-7">
            <FormularioLogin />
          </TarjetaContenido>
        </Tarjeta>

        <div className="text-center text-xs text-slate-500 dark:text-slate-400">
          <p>
            ¿Problemas para acceder a tu puesto? Contactá a tu supervisor o al centro de operaciones de tu empresa.
          </p>
        </div>
      </div>
    </div>
  )
}
