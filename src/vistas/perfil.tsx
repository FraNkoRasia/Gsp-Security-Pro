import React, { useEffect, useState } from 'react'
import { Eye, EyeOff, Lock, Mail, Phone, Shield, UserRound } from 'lucide-react'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Boton } from '@/componentes/ui/boton'
import { Insignia } from '@/componentes/ui/insignia'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import { useTraduccion } from '@/i18n'
import { supabase } from '@/servicios/supabase'

interface PropiedadesPerfil {
  alAbrirCambioContrasena?: boolean
  alCerrarCambioContrasena?: () => void
}

const CampoContrasena = ({
    etiqueta,
    valor,
    onChange,
    mostrar,
    cambiarMostrar,
    placeholder,
    obligatorio = false
  }: {
    etiqueta: string
    valor: string
    onChange: (valor: string) => void
    mostrar: boolean
    cambiarMostrar: () => void
    placeholder: string
    obligatorio?: boolean
  }) => (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-2">
        {etiqueta} {obligatorio && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type={mostrar ? 'text' : 'password'}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
          className="w-full h-12 rounded-xl bg-white dark:bg-[#0A0F1A] border border-slate-300 dark:border-slate-700/80 pl-10 pr-11 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
        />
        <button
          type="button"
          onClick={cambiarMostrar}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          aria-label={mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          {mostrar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )

export const VistaPerfil: React.FC<PropiedadesPerfil> = ({
  alAbrirCambioContrasena = false,
  alCerrarCambioContrasena
}) => {
  const { usuario, cambiarContrasena } = useAutenticacion()
  const { t } = useTraduccion()

  const [modalAbierto, setModalAbierto] = useState(alAbrirCambioContrasena)
  const [contrasenaActual, setContrasenaActual] = useState('')
  const [nuevaContrasena, setNuevaContrasena] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [mostrarActual, setMostrarActual] = useState(false)
  const [mostrarNueva, setMostrarNueva] = useState(false)
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [fichaTecnica, setFichaTecnica] = useState<Record<string, string>>({})
  const [cargandoFicha, setCargandoFicha] = useState(false)

  useEffect(() => {
    if (!usuario || !supabase) return
    const db = supabase
    let cancelado = false

    const cargarFichaTecnica = async () => {
      setCargandoFicha(true)
      setFichaTecnica({})
      try {
        const { data: vigilador, error: errorVigilador } = await db
          .from('vigiladores')
          .select('id')
          .eq('id_usuario', usuario.id)
          .maybeSingle()

        if (errorVigilador) throw errorVigilador
        if (!vigilador || cancelado) return

        const { data: ficha, error: errorFicha } = await db
          .from('fichas_vigiladores')
          .select('dni,fecha_nacimiento,domicilio,contacto_emergencia_nombre,contacto_emergencia_telefono,fecha_ingreso,categoria,tipo_contrato,fecha_fin_contrato,notas_administrativas')
          .eq('id_vigilador', vigilador.id)
          .maybeSingle()

        if (errorFicha) throw errorFicha
        if (ficha && !cancelado) {
          setFichaTecnica(Object.fromEntries(
            Object.entries(ficha).filter(([, valor]) => valor !== null && valor !== undefined && String(valor).trim() !== '').map(([clave, valor]) => [clave, String(valor)])
          ))
        }
      } catch (error) {
        console.error('No se pudo cargar la ficha técnica del perfil:', error)
      } finally {
        if (!cancelado) setCargandoFicha(false)
      }
    }

    void cargarFichaTecnica()
    return () => { cancelado = true }
  }, [usuario?.id])

  if (!usuario) return null

  const abrirModal = () => {
    setError('')
    setExito('')
    setModalAbierto(true)
  }

  const cerrarModal = () => {
    if (guardando) return
    setModalAbierto(false)
    setContrasenaActual('')
    setNuevaContrasena('')
    setConfirmacion('')
    setError('')
    setExito('')
    alCerrarCambioContrasena?.()
  }

  const obtenerEtiquetaRol = () => {
    switch (usuario.rol) {
      case 'super_administrador':
        return { texto: t.roles.superAdmin, variante: 'dorado' as const }
      case 'administrador':
        return { texto: t.roles.admin, variante: 'azul' as const }
      case 'supervisor':
        return { texto: t.roles.supervisor, variante: 'morado' as const }
      case 'encargado_empresa':
        return { texto: 'Encargado de Empresa', variante: 'verde' as const }
      default:
        return { texto: t.roles.vigilador, variante: 'verde' as const }
    }
  }

  const validarYGuardar = async () => {
    setError('')
    setExito('')

    if (!contrasenaActual) {
      setError('Ingresá tu contraseña actual.')
      return
    }

    if (!(/^[0-9]{6,}$/.test(nuevaContrasena) || /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/.test(nuevaContrasena))) {
      setError('Usá al menos 6 números, o 8 caracteres alfanuméricos que incluyan una letra y un número.')
      return
    }

    if (nuevaContrasena !== confirmacion) {
      setError('Las nuevas contraseñas no coinciden.')
      return
    }

    setGuardando(true)
    const resultado = await cambiarContrasena(contrasenaActual, nuevaContrasena)
    setGuardando(false)

    if (!resultado.exito) {
      setError(resultado.error || 'No se pudo actualizar la contraseña.')
      return
    }

    setExito('Contraseña actualizada correctamente.')
    setContrasenaActual('')
    setNuevaContrasena('')
    setConfirmacion('')
    window.setTimeout(() => cerrarModal(), 900)
  }

  const rol = obtenerEtiquetaRol()
  const camposPersonales: readonly (readonly [string, string])[] = [
    ['DNI', 'dni'], ['Fecha de nacimiento', 'fecha_nacimiento'], ['Domicilio', 'domicilio'],
    ['Nombre del contacto de emergencia', 'contacto_emergencia_nombre'], ['Teléfono del contacto de emergencia', 'contacto_emergencia_telefono']
  ]
  const camposLaborales: readonly (readonly [string, string])[] = [
    ['Fecha de ingreso', 'fecha_ingreso'], ['Categoría laboral', 'categoria'], ['Tipo de contrato', 'tipo_contrato'],
    ['Fin de contrato', 'fecha_fin_contrato'], ['Notas administrativas', 'notas_administrativas']
  ]
  const hayDatosPersonales = camposPersonales.some(([, clave]) => Boolean(fichaTecnica[clave]))
  const hayDatosLaborales = camposLaborales.some(([, clave]) => Boolean(fichaTecnica[clave]))

  return (
    <div className="space-y-5 animate-fadeIn">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-['Outfit']">
          Mi Perfil
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Consultá tus datos personales y de acceso a GSP Security Pro.
        </p>
      </div>

      {(cargandoFicha || hayDatosPersonales || hayDatosLaborales) && (
        <section className="rounded-2xl bg-white dark:bg-[#0C121E] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Datos de la ficha técnica</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Información personal y laboral registrada en el sistema.</p>
          </div>
          {cargandoFicha ? (
            <p className="p-5 text-sm text-slate-500">Cargando datos de la ficha técnica…</p>
          ) : (
            <div className="p-5 sm:p-6 space-y-5">
              {hayDatosPersonales && (
                <div>
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Datos personales</h4>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {camposPersonales.filter(([, clave]) => fichaTecnica[clave]).map(([etiqueta, clave]) => (
                      <div key={clave} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{etiqueta}</p>
                        <p className="mt-2 break-words text-sm font-semibold text-slate-800 dark:text-slate-200">{clave.includes('fecha') ? new Date(`${fichaTecnica[clave]}T00:00:00`).toLocaleDateString('es-AR') : fichaTecnica[clave]}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {hayDatosLaborales && (
                <div>
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Datos laborales</h4>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {camposLaborales.filter(([, clave]) => fichaTecnica[clave]).map(([etiqueta, clave]) => (
                      <div key={clave} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{etiqueta}</p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold text-slate-800 dark:text-slate-200">{clave.includes('fecha') ? new Date(`${fichaTecnica[clave]}T00:00:00`).toLocaleDateString('es-AR') : fichaTecnica[clave]}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-2xl bg-white dark:bg-[#0C121E] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/50 flex items-center justify-center shrink-0">
              <UserRound className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {usuario.nombre} {usuario.apellido}
              </h3>
              <div className="mt-1">
                <Insignia variante={rol.variante}>{rol.texto}</Insignia>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6 grid gap-4 sm:grid-cols-2">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                <Mail className="w-4 h-4" />
                Correo electrónico
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200 break-all">{usuario.email}</p>
            </div>

            {usuario.telefono && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <Phone className="w-4 h-4" />
                  Teléfono
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">{usuario.telefono}</p>
              </div>
            )}

            {usuario.empresa_nombre && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <Shield className="w-4 h-4" />
                  Empresa
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">{usuario.empresa_nombre}</p>
              </div>
            )}

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                <UserRound className="w-4 h-4" />
                Estado de cuenta
              </div>
              <p className="mt-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {usuario.activo ? 'Cuenta activa' : 'Cuenta inactiva'}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-white dark:bg-[#0C121E] border border-slate-200 dark:border-slate-800 shadow-sm p-5 sm:p-6 h-fit">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/50 flex items-center justify-center mb-4">
            <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Seguridad y acceso</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Mantené segura tu cuenta actualizando tu contraseña periódicamente.
          </p>
          <Boton
            type="button"
            variante="primario"
            tamano="medio"
            className="w-full mt-5"
            onClick={abrirModal}
            icono={<Lock className="w-4 h-4" />}
          >
            Cambiar contraseña
          </Boton>
        </section>
      </div>

      <Dialogo
        abierto={modalAbierto}
        alCerrar={cerrarModal}
        titulo="Seguridad y Clave de Acceso"
        subtitulo="Actualizá tu contraseña de acceso a GSP Security Pro"
        icono={<Lock className="w-5 h-5 text-blue-500" />}
        tamano="chico"
      >
        <div className="space-y-4">
          <CampoContrasena
            etiqueta="Contraseña actual"
            valor={contrasenaActual}
            onChange={setContrasenaActual}
            mostrar={mostrarActual}
            cambiarMostrar={() => setMostrarActual((v) => !v)}
            placeholder="••••••••"
          />

          <div>
            <CampoContrasena
              etiqueta="Nueva contraseña"
              valor={nuevaContrasena}
              onChange={setNuevaContrasena}
              mostrar={mostrarNueva}
              cambiarMostrar={() => setMostrarNueva((v) => !v)}
              placeholder="6 o más números, o una clave alfanumérica"
              obligatorio
            />
            <div className="mt-2 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              <p>• Podés usar una clave numérica de al menos 6 dígitos</p>
              <p>• O una clave alfanumérica de al menos 8 caracteres, con letras y números</p>
            </div>
          </div>

          <CampoContrasena
            etiqueta="Confirmar nueva contraseña"
            valor={confirmacion}
            onChange={setConfirmacion}
            mostrar={mostrarConfirmacion}
            cambiarMostrar={() => setMostrarConfirmacion((v) => !v)}
            placeholder="Repetí la nueva contraseña"
            obligatorio
          />

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs font-medium text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {exito && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {exito}
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
            <Boton type="button" variante="secundario" onClick={cerrarModal} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="button" variante="primario" onClick={validarYGuardar} disabled={guardando}>
              {guardando ? 'Actualizando...' : 'Actualizar Clave'}
            </Boton>
          </div>
        </div>
      </Dialogo>
    </div>
  )
}
