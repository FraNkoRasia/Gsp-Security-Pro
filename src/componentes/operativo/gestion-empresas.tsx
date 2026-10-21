import React, { useState } from 'react'
import { Building2, Plus, Edit2, MapPin, UserPlus, ArrowRight, Power, KeyRound, CheckCircle2 } from 'lucide-react'
import { Tarjeta, TarjetaContenido } from '@/componentes/ui/tarjeta'
import { Boton } from '@/componentes/ui/boton'
import { Insignia } from '@/componentes/ui/insignia'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Entrada } from '@/componentes/ui/entrada'
import { Etiqueta } from '@/componentes/ui/etiqueta'
import { useOperativo } from '@/contextos/contexto-operativo'
import { useTraduccion } from '@/i18n'
import { supabase } from '@/servicios/supabase'
import type { Empresa } from '@/tipos'

export const GestionEmpresas: React.FC<{ onSeleccionarEmpresa?: (id: string) => void }> = ({ onSeleccionarEmpresa }) => {
  const { empresas, objetivos, vigiladores, crearEmpresaConAdministrador, editarEmpresa, cambiarEstadoEmpresa, eliminarEmpresa } = useOperativo()
  const { idioma } = useTraduccion()

  const [modalAbierto, setModalAbierto] = useState(false)
  const [empresaEditando, setEmpresaEditando] = useState<Empresa | null>(null)
  const [empresaConfirmacion, setEmpresaConfirmacion] = useState<Empresa | null>(null)
  const [procesandoEmpresa, setProcesandoEmpresa] = useState(false)
  const [empresaRestablecer, setEmpresaRestablecer] = useState<Empresa | null>(null)
  const [empresaRestablecida, setEmpresaRestablecida] = useState<Empresa | null>(null)
  const [procesandoRestablecimiento, setProcesandoRestablecimiento] = useState(false)
  const [errorRestablecimiento, setErrorRestablecimiento] = useState<string | null>(null)
  const [dniInicialAdministrador, setDniInicialAdministrador] = useState('')
  const [requiereRegistrarDni, setRequiereRegistrarDni] = useState(false)
  const [errorOperacion, setErrorOperacion] = useState<string | null>(null)

  const [nombre, setNombre] = useState('')
  const [cuit, setCuit] = useState('')
  const [direccion, setDireccion] = useState('')
  const [adminNombre, setAdminNombre] = useState('')
  const [adminApellido, setAdminApellido] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminDni, setAdminDni] = useState('')
  const [artAseguradora, setArtAseguradora] = useState('')
  const [adminTelefono, setAdminTelefono] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmacionCreacion, setConfirmacionCreacion] = useState(false)
  const [procesandoGuardado, setProcesandoGuardado] = useState(false)

  const abrirCrear = () => {
    setEmpresaEditando(null)
    setNombre('')
    setCuit('')
    setDireccion('')
    setAdminNombre('')
    setAdminApellido('')
    setAdminEmail('')
    setAdminDni('')
    setArtAseguradora('')
    setAdminTelefono('')
    setError(null)
    setModalAbierto(true)
  }

  const abrirEditar = (emp: Empresa) => {
    setEmpresaEditando(emp)
    setNombre(emp.nombre)
    setCuit(emp.cuit || '')
    setDireccion(emp.direccion || '')
    setArtAseguradora(emp.art_aseguradora || '')
    setError(null)
    setModalAbierto(true)
  }

  const confirmarRestablecimiento = async () => {
    if (!supabase || !empresaRestablecer) return
    if (requiereRegistrarDni && !/^\\d{7,8}$/.test(dniInicialAdministrador.replace(/\\D/g, ''))) {
      setErrorRestablecimiento('Ingresá un DNI válido de 7 u 8 números.')
      return
    }

    setProcesandoRestablecimiento(true)
    setErrorRestablecimiento(null)
    try {
      const { data, error: errorFuncion } = await supabase.functions.invoke('editar-empresa', {
        body: {
          accion: 'restablecer_contrasena_administrador',
          empresa_id: empresaRestablecer.id,
          ...(requiereRegistrarDni ? { admin_dni: dniInicialAdministrador } : {}),
        },
      })
      if (errorFuncion || data?.error) {
        const contexto = (errorFuncion as { context?: Response } | null)?.context
        let detalle = data?.error as string | undefined
        if (!detalle && contexto) {
          try { detalle = ((await contexto.clone().json()) as { error?: string }).error } catch {}
        }
        const mensaje = detalle || errorFuncion?.message || 'No se pudo restablecer la contraseña.'
        if (mensaje.includes('no tiene un DNI guardado')) setRequiereRegistrarDni(true)
        setErrorRestablecimiento(mensaje)
        return
      }
      setEmpresaRestablecida(empresaRestablecer)
      setEmpresaRestablecer(null)
      setDniInicialAdministrador('')
      setRequiereRegistrarDni(false)
    } catch (err) {
      setErrorRestablecimiento(err instanceof Error ? err.message : 'No se pudo restablecer la contraseña.')
    } finally {
      setProcesandoRestablecimiento(false)
    }
  }

  const manejarGuardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!nombre.trim()) {
      setError('El nombre de la empresa es obligatorio.')
      return
    }

    if (empresaEditando) {
      setProcesandoGuardado(true)
      const resultado = await editarEmpresa(empresaEditando.id, {
        nombre: nombre.trim(),
        cuit: cuit.trim(),
        direccion: direccion.trim(),
        art_aseguradora: artAseguradora.trim()
      })
      setProcesandoGuardado(false)
      if (resultado) {
        setError(resultado)
        return
      }
      setModalAbierto(false)
      return
    }

    if (!adminNombre.trim() || !adminApellido.trim() || !adminEmail.trim() || !adminDni.trim()) {
      setError('Para crear una empresa también debes indicar los datos de su administrador.')
      return
    }

    if (!/^\d{7,8}$/.test(adminDni.replace(/\D/g, ''))) {
      setError('Ingresá un DNI válido de 7 u 8 números para la contraseña inicial.')
      return
    }

    setConfirmacionCreacion(true)
    return


  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white font-['Outfit']">
            Gestión Global de Empresas
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Administración de compañías clientes y aislamiento multitenant de seguridad.
          </p>
        </div>
        <Boton
          variante="primario"
          onClick={abrirCrear}
          icono={<Plus className="w-4 h-4" />}
        >
          Nueva Empresa
        </Boton>
      </div>

      {/* Grid de Empresas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {empresas.map((emp) => {
          const objetivosEmpresa = objetivos.filter((o) => o.id_empresa === emp.id)
          const cantidadObjetivos = objetivosEmpresa.length
          const cantidadVigiladores = vigiladores.filter(
            (v) => v.id_empresa === emp.id && v.activo
          ).length

          return (
            <Tarjeta key={emp.id} className="relative group hover:border-blue-500/50 transition-all">
              <TarjetaContenido className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-slate-900 dark:text-white">
                        {emp.nombre}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        CUIT: {emp.cuit || 'Sin CUIT'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Insignia variante={emp.activa ? 'verde' : 'gris'}>
                      {emp.activa ? 'Activa' : 'Inactiva'}
                    </Insignia>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorRestablecimiento(null)
                        setDniInicialAdministrador('')
                        setRequiereRegistrarDni(false)
                        setErrorRestablecimiento(null)
                        setEmpresaRestablecer(emp)
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                      title="Restablecer contraseña del administrador"
                      aria-label={`Restablecer contraseña del administrador de ${emp.nombre}`}
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirEditar(emp)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Editar empresa"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {emp.activa ? (
                      <button
                        type="button"
                        onClick={() => {
                          setErrorOperacion(null)
                          setEmpresaConfirmacion(emp)
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        title="Dar de baja empresa"
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          setErrorOperacion(null)
                          setEmpresaConfirmacion(emp)
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
                        title="Dar de alta empresa"
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {emp.art_aseguradora && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">ART: {emp.art_aseguradora}</p>
                )}

                {emp.direccion && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{emp.direccion}</span>
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800/80 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Objetivos:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">{idioma === 'en' ? `${cantidadObjetivos} posts` : `${cantidadObjetivos} puestos`}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Vigiladores:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">{idioma === 'en' ? `${cantidadVigiladores} assigned` : `${cantidadVigiladores} asignados`}</span>
                  </div>
                </div>


                {onSeleccionarEmpresa && (
                  <Boton
                    variante="primario"
                    tamano="chico"
                    className="w-fit mt-3"
                    onClick={() => onSeleccionarEmpresa(emp.id)}
                    icono={<ArrowRight className="w-3.5 h-3.5" />}
                  >
                    Ingresar a la Empresa
                  </Boton>
                )}
              </TarjetaContenido>
            </Tarjeta>
          )
        })}
      </div>

      <Dialogo
        abierto={!!empresaConfirmacion}
        alCerrar={() => !procesandoEmpresa && setEmpresaConfirmacion(null)}
        titulo={empresaConfirmacion?.activa ? "Dar de baja empresa" : "Dar de alta empresa"}
        subtitulo={empresaConfirmacion?.activa ? "La cuenta de sus usuarios quedará suspendida hasta que la empresa vuelva a estar activa." : "La cuenta de sus usuarios podrá volver a ingresar al sistema."}
        icono={<Power className={empresaConfirmacion?.activa ? "w-5 h-5 text-red-500" : "w-5 h-5 text-emerald-500"} />}
        tamano="chico"
      >
        {empresaConfirmacion && (
          <div className="space-y-5">
            <div className={empresaConfirmacion.activa
              ? "rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-4"
              : "rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 p-4"}>
              <p className="text-sm text-slate-600 dark:text-slate-300">¿Estás seguro de dar de {empresaConfirmacion?.activa ? 'baja' : 'alta'} a:</p>
              <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{empresaConfirmacion.nombre}?</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Los usuarios de esta empresa podrán ingresar nuevamente cuando vuelva a estar activa.</p>
            </div>
            {errorOperacion && <p className="text-xs font-medium text-red-600 dark:text-red-400">{errorOperacion}</p>}
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" tamano="chico" disabled={procesandoEmpresa} onClick={() => setEmpresaConfirmacion(null)}>Cancelar</Boton>
              <Boton variante={empresaConfirmacion?.activa ? "peligro" : "primario"} tamano="chico" disabled={procesandoEmpresa} onClick={async () => {
                if (!empresaConfirmacion) return
                setProcesandoEmpresa(true)
                const resultado = empresaConfirmacion.activa
                  ? await eliminarEmpresa(empresaConfirmacion.id)
                  : await cambiarEstadoEmpresa(empresaConfirmacion.id, true)
                setProcesandoEmpresa(false)
                if (resultado) {
                  setErrorOperacion(resultado)
                  return
                }
                setEmpresaConfirmacion(null)
              }}>
                {procesandoEmpresa ? 'Procesando...' : (empresaConfirmacion?.activa ? 'Confirmar baja' : 'Confirmar alta')}
              </Boton>
            </div>
          </div>
        )}
      </Dialogo>

      <Dialogo
        abierto={Boolean(empresaRestablecer)}
        alCerrar={() => !procesandoRestablecimiento && setEmpresaRestablecer(null)}
        titulo="Restablecer contraseña del administrador"
        subtitulo="La contraseña actual dejará de funcionar y deberá crear una nueva al iniciar sesión."
        icono={<KeyRound className="w-5 h-5 text-amber-500" />}
        tamano="chico"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">Empresa seleccionada:</p>
            <p className="mt-1 font-bold text-slate-900 dark:text-white">{empresaRestablecer?.nombre}</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Se utilizará el DNI registrado como contraseña inicial, igual que con los vigiladores. El administrador deberá cambiarla al ingresar.</p>
          </div>
          {requiereRegistrarDni && (
            <div className="space-y-2">
              <Etiqueta htmlFor="dni-inicial-administrador">DNI del administrador</Etiqueta>
              <Entrada
                id="dni-inicial-administrador"
                value={dniInicialAdministrador}
                onChange={(e) => setDniInicialAdministrador(e.target.value.replace(/\\D/g, '').slice(0, 8))}
                inputMode="numeric"
                placeholder="Ingresá el DNI de 7 u 8 números"
                autoComplete="off"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">Se guardará para futuros restablecimientos. Verificá que sea el DNI correcto.</p>
            </div>
          )}
          {errorRestablecimiento && <p className="text-xs font-medium text-red-600 dark:text-red-400">{errorRestablecimiento}</p>}
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" tamano="chico" disabled={procesandoRestablecimiento} onClick={() => setEmpresaRestablecer(null)}>Cancelar</Boton>
            <Boton variante="primario" tamano="chico" disabled={procesandoRestablecimiento} onClick={() => void confirmarRestablecimiento()} icono={<KeyRound className="w-3.5 h-3.5" />}>
              {procesandoRestablecimiento ? 'Procesando…' : requiereRegistrarDni ? 'Guardar DNI y restablecer' : 'Confirmar restablecimiento'}
            </Boton>
          </div>
        </div>
      </Dialogo>

      <Dialogo
        abierto={Boolean(empresaRestablecida)}
        alCerrar={() => setEmpresaRestablecida(null)}
        titulo="Contraseña restablecida"
        subtitulo="El restablecimiento se completó correctamente."
        icono={<CheckCircle2 className="w-5 h-5 text-emerald-500" />}
        tamano="chico"
      >
        <div className="space-y-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            La contraseña del administrador de <strong className="text-slate-900 dark:text-white">{empresaRestablecida?.nombre}</strong> fue restablecida correctamente.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Deberá ingresar con su DNI y crear una contraseña personal.</p>
          <div className="flex justify-end">
            <Boton variante="primario" tamano="chico" onClick={() => setEmpresaRestablecida(null)}>Aceptar</Boton>
          </div>
        </div>
      </Dialogo>

      {/* Modal Crear / Editar Empresa */}
      <Dialogo
        abierto={modalAbierto}
        alCerrar={() => {
          if (procesandoGuardado) return
          setConfirmacionCreacion(false)
          setModalAbierto(false)
        }}
        titulo={empresaEditando ? 'Editar Empresa' : confirmacionCreacion ? 'Confirmar alta de empresa' : 'Nueva Empresa'}
        subtitulo={empresaEditando ? 'Gestión de organizaciones para aislamiento de grillas y personal.' : confirmacionCreacion ? 'Se creará la empresa y la cuenta de su administrador.' : 'Gestión de organizaciones para aislamiento de grillas y personal.'}
        icono={<Building2 className="w-5 h-5 text-blue-500" />}
      >
        {confirmacionCreacion ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/20 p-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">¿Deseas crear la empresa:</p>
              <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{nombre}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">También se creará la cuenta del administrador con los datos ingresados.</p>
            </div>
            {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" tamano="chico" disabled={procesandoGuardado} onClick={() => setConfirmacionCreacion(false)}>Cancelar</Boton>
              <Boton variante="primario" tamano="chico" disabled={procesandoGuardado} onClick={async () => {
                setProcesandoGuardado(true)
                const resultado = await crearEmpresaConAdministrador({
                  nombre: nombre.trim(),
                  cuit: cuit.trim(),
                  direccion: direccion.trim(),
                  art_aseguradora: artAseguradora.trim(),
                  admin_dni: adminDni.replace(/\D/g, ''),
                  admin_nombre: adminNombre.trim(),
                  admin_apellido: adminApellido.trim(),
                  admin_email: adminEmail.trim().toLowerCase(),
                  admin_telefono: adminTelefono.trim()
                })
                setProcesandoGuardado(false)
                if (resultado) {
                  setError(resultado)
                  return
                }
                setConfirmacionCreacion(false)
                setModalAbierto(false)
              }}>
                {procesandoGuardado ? 'Creando...' : 'Confirmar alta'}
              </Boton>
            </div>
          </div>
        ) : (
          <form onSubmit={manejarGuardar} className="space-y-4">
            <div>
              <Etiqueta requerido>Nombre de la Empresa</Etiqueta>
              <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Wall Security" autoFocus />
            </div>
            <div>
              <Etiqueta>CUIT / Identificación Tributaria</Etiqueta>
              <Entrada value={cuit} onChange={(e) => setCuit(e.target.value)} placeholder="30-71458921-9" />
            </div>
            <div>
              <Etiqueta>Dirección / Sede Central</Etiqueta>
              <Entrada value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Av. Marcelo T. de Alvear 1040, Río Cuarto" />
            </div>
            <div>
              <Etiqueta>Aseguradora de Riesgos del Trabajo (ART)</Etiqueta>
              <Entrada value={artAseguradora} onChange={(e) => setArtAseguradora(e.target.value)} placeholder="Ej: Provincia ART (opcional)" />
            </div>

            {!empresaEditando && (
              <div className="space-y-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 p-4">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Cuenta del Administrador</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Será la cuenta con la que el responsable de la empresa iniciará sesión.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Etiqueta requerido>Nombre</Etiqueta><Entrada value={adminNombre} onChange={(e) => setAdminNombre(e.target.value)} placeholder="Juan" /></div>
                  <div><Etiqueta requerido>Apellido</Etiqueta><Entrada value={adminApellido} onChange={(e) => setAdminApellido(e.target.value)} placeholder="Pérez" /></div>
                </div>
                <div><Etiqueta requerido>Email de acceso</Etiqueta><Entrada type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@empresa.com" /></div>
                <div><Etiqueta requerido>DNI del administrador</Etiqueta><Entrada inputMode="numeric" value={adminDni} onChange={(e) => setAdminDni(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="Ej: 30123456" /></div>
                <p className="-mt-2 text-[11px] text-slate-500 dark:text-slate-400">El DNI será la contraseña inicial. Al ingresar por primera vez, deberá crear una contraseña personal.</p>
                <div><Etiqueta>Teléfono</Etiqueta><Entrada type="tel" value={adminTelefono} onChange={(e) => setAdminTelefono(e.target.value)} placeholder="351..." /></div>
              </div>
            )}

            {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <Boton type="button" variante="secundario" onClick={() => !procesandoGuardado && setModalAbierto(false)}>Cancelar</Boton>
              <Boton type="submit" variante="primario">
                {empresaEditando ? (procesandoGuardado ? 'Guardando...' : 'Guardar Cambios') : 'Crear Empresa y Administrador'}
              </Boton>
            </div>
          </form>
        )}
      </Dialogo>
    </div>
  )
}