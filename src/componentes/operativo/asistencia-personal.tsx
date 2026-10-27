import React from 'react'
import { CalendarDays, ClipboardCheck, UserPlus, Users } from 'lucide-react'

/**
 * Primera pantalla del módulo de asistencia de personal de la empresa.
 * Los registros y permisos se conectarán cuando esté aplicada la migración
 * y exista el flujo seguro de alta de cuentas de encargado_empresa.
 */
export const AsistenciaPersonal: React.FC = () => {
  return (
    <section className="space-y-5 animate-fadeIn">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0C121E] sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            <ClipboardCheck className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-black text-slate-900 dark:text-white sm:text-2xl">Asistencia del personal</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Registro de ingreso y egreso del personal de la empresa asignado al objetivo.</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { title: 'Operarios fijos', icon: Users },
          { title: 'Jornaleros', icon: Users },
          { title: 'Limpieza', icon: ClipboardCheck },
          { title: 'Encargados', icon: UserPlus }
        ].map(({ title, icon: Icon }) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0C121E]">
            <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">{title}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Personal de empresa</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center dark:border-slate-700 dark:bg-slate-900/40 sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
          <CalendarDays className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-white">Preparado para registrar la jornada</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
          La lista de personal, el marcado de ingreso y egreso, las altas pendientes de aprobación y el historial se habilitarán al conectar el almacenamiento seguro y los permisos por objetivo.
        </p>
        <span className="mt-4 inline-flex items-center rounded-full border border-amber-300/70 bg-amber-50/80 px-3 py-1 text-xs font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          Módulo en preparación
        </span>
      </div>
    </section>
  )
}
