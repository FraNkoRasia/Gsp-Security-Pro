import React from 'react'
import { Download, Smartphone, Share2, Monitor, CheckCircle, AlertTriangle, ShieldCheck } from 'lucide-react'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Boton } from '@/componentes/ui/boton'
import { useTraduccion } from '@/i18n'
import type { EstadoInstalacion } from '@/utilidades/deteccion-plataforma'

interface PropiedadesModalInstalacion {
  abierto: boolean
  alCerrar: () => void
  alConfirmar: () => void
  estadoDispositivo: EstadoInstalacion
  mensajeEstado?: string | null
}

export const ModalInstalacion: React.FC<PropiedadesModalInstalacion> = ({
  abierto,
  alCerrar,
  alConfirmar,
  estadoDispositivo,
  mensajeEstado
}) => {
  const { t } = useTraduccion()
  const { dispositivo, esSafari, puedeInstalarDirecto } = estadoDispositivo

  return (
    <Dialogo
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Instalá GSP Security Pro"
      subtitulo="Acceso rápido y cómodo a tu plataforma de trabajo"
      icono={<Download className="w-5 h-5 text-sky-300" />}
      tamano="medio"
    >
      <div className="space-y-5">
        {mensajeEstado && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl border border-amber-700/60 bg-amber-950/40 p-4 text-sm leading-relaxed text-amber-100"
          >
            {mensajeEstado}
          </div>
        )}
        {/* Identidad visual oficial de GSP */}
        <div className="relative overflow-hidden rounded-2xl border border-sky-900/60 bg-gradient-to-br from-[#101e32] via-[#0b1422] to-[#080c14] p-4 sm:p-5">
          <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-sky-500/10 blur-2xl" />
          <div className="relative flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-slate-700/70 bg-slate-950/70 p-2 shadow-lg shadow-sky-950/30">
              <img
                src="/logoAPP.png"
                alt="Logo de GSP Security Pro"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-800/70 bg-emerald-950/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                Aplicación oficial
              </div>
              <h4 className="font-['Outfit'] text-lg font-bold leading-tight text-white">
                GSP Security Pro
              </h4>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Gestión profesional de seguridad y vigilancia.
              </p>
            </div>
          </div>
          <div className="relative mt-4 grid grid-cols-2 gap-2 border-t border-slate-700/60 pt-3">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Smartphone className="h-4 w-4 shrink-0 text-sky-300" />
              Acceso desde el inicio
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <CheckCircle className="h-4 w-4 shrink-0 text-sky-300" />
              Sin buscar el enlace
            </div>
          </div>
        </div>

        {/* Guía según dispositivo */}
        {dispositivo === 'ios' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
              <Share2 className="h-4 w-4" />
              <span>Instalación en iPhone / iPad</span>
            </div>

            {!esSafari && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <span>{t.pwa.alertaSafariIos}</span>
              </div>
            )}

            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-xs text-slate-300">
              {[t.pwa.pasoIos1, t.pwa.pasoIos2, t.pwa.pasoIos3, t.pwa.pasoIos4].map((paso, indice) => (
                <div key={indice} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-sky-800/70 bg-sky-950/70 font-bold text-sky-300">
                    {indice + 1}
                  </span>
                  <span className="pt-1 leading-relaxed">{paso}</span>
                </div>
              ))}
            </div>
          </div>
        ) : dispositivo === 'android' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-300">
              <Smartphone className="h-4 w-4" />
              <span>Instalación en Android</span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-sm leading-relaxed text-slate-200">
                {puedeInstalarDirecto
                  ? 'Continuá para abrir la confirmación de instalación de tu navegador y agregar GSP Security Pro al teléfono.'
                  : t.pwa.instruccionesAndroid}
              </p>
              {puedeInstalarDirecto && (
                <p className="mt-3 rounded-lg border border-sky-900/60 bg-sky-950/30 px-3 py-2.5 text-xs leading-relaxed text-sky-200">
                  El último paso lo muestra Android/Chrome. Es una confirmación propia del navegador; GSP no puede cambiar su diseño.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-300">
              <Monitor className="h-4 w-4" />
              <span>Instalación en computadora</span>
            </div>
            <p className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-sm leading-relaxed text-slate-300">
              {t.pwa.instruccionesEscritorio}
            </p>
          </div>
        )}

        {/* Acciones */}
        <div className="flex flex-col-reverse gap-2.5 border-t border-slate-800 pt-4 sm:flex-row sm:justify-end">
          <Boton
            type="button"
            variante="secundario"
            onClick={alCerrar}
            className="w-full sm:w-auto"
          >
            {t.comun.cancelar}
          </Boton>
          <Boton
            type="button"
            variante="primario"
            onClick={alConfirmar}
            className="w-full border border-sky-400/30 bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-lg shadow-blue-950/30 hover:from-sky-500 hover:to-blue-500 sm:w-auto"
            icono={<CheckCircle className="h-4 w-4" />}
          >
            Continuar
          </Boton>
        </div>
      </div>
    </Dialogo>
  )
}
