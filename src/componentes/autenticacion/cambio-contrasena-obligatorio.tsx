import React, { useState } from 'react'
import { CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Entrada } from '@/componentes/ui/entrada'
import { Boton } from '@/componentes/ui/boton'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'

export const CambioContrasenaObligatorio: React.FC = () => {
  const { cambiarContrasenaObligatoria, confirmarCambioContrasenaObligatorio, cerrarSesion } = useAutenticacion()
  const [nueva, setNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [exito, setExito] = useState(false)

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (nueva.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (nueva !== confirmacion) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setGuardando(true)
    try {
      const resultado = await cambiarContrasenaObligatoria(nueva)
      if (!resultado.exito) {
        setError(resultado.error || 'No se pudo actualizar la contraseña.')
        return
      }
      setNueva('')
      setConfirmacion('')
      setExito(true)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo
      abierto
      alCerrar={() => undefined}
      titulo={exito ? 'Contraseña modificada correctamente' : 'Creá tu contraseña personal'}
      subtitulo={exito ? 'Tu nueva contraseña quedó guardada. Ya podés ingresar a GSP Security Pro.' : 'Por seguridad, debés cambiar la contraseña inicial antes de usar GSP Security Pro.'}
      icono={exito ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <KeyRound className="w-5 h-5 text-emerald-500" />}
      tamano="chico"
    >
      {exito ? (
        <div className="space-y-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <p role="status" className="text-sm font-semibold text-slate-700 dark:text-slate-200">Contraseña modificada correctamente.</p>
          <Boton type="button" className="w-full" onClick={confirmarCambioContrasenaObligatorio}>Continuar a GSP Security Pro</Boton>
        </div>
      ) : (
      <form onSubmit={guardar} className="space-y-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          <ShieldCheck className="mr-1 inline h-4 w-4" />
          Elegí una contraseña personal de al menos 8 caracteres. No uses nuevamente tu DNI.
        </div>
        <div>
          <label htmlFor="contrasena-inicial-nueva" className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Nueva contraseña</label>
          <Entrada id="contrasena-inicial-nueva" type="password" autoComplete="new-password" value={nueva} onChange={e => setNueva(e.target.value)} minLength={8} required disabled={guardando} placeholder="Mínimo 8 caracteres" />
        </div>
        <div>
          <label htmlFor="contrasena-inicial-confirmar" className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Confirmar contraseña</label>
          <Entrada id="contrasena-inicial-confirmar" type="password" autoComplete="new-password" value={confirmacion} onChange={e => setConfirmacion(e.target.value)} minLength={8} required disabled={guardando} placeholder="Repetí la nueva contraseña" />
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
        <Boton type="submit" className="w-full" disabled={guardando} cargando={guardando}>Guardar contraseña y continuar</Boton>
        <button type="button" onClick={() => void cerrarSesion()} className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" disabled={guardando}>Cerrar sesión</button>
      </form>
      )}
    </Dialogo>
  )
}
