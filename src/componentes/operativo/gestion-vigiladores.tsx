import React, { useState } from 'react'
import { UserPlus, ArrowRightLeft, History, Edit2, Phone, Mail, MapPin, UserCheck, UserX, Info, KeyRound, Search, ChevronDown, ChevronUp, X } from 'lucide-react'
import { Tarjeta, TarjetaContenido } from '@/componentes/ui/tarjeta'
import { Boton } from '@/componentes/ui/boton'
import { Insignia } from '@/componentes/ui/insignia'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Entrada } from '@/componentes/ui/entrada'
import { Etiqueta } from '@/componentes/ui/etiqueta'
import { ModalTraslado } from './modal-traslado'
import { useOperativo } from '@/contextos/contexto-operativo'
import { useAutenticacion } from '@/contextos/contexto-autenticacion'
import type { Usuario } from '@/tipos'
import { FichaVigilador } from './ficha-vigilador'
import { supabase } from '@/servicios/supabase'
import { turnoFinalizado } from '@/utilidades/calculo-horas-mes'

const formatearDuracion = (horas: number | null | undefined) => {
  const minutosTotales = Math.max(0, Math.round(Number(horas || 0) * 60))
  const horasEnteras = Math.floor(minutosTotales / 60)
  const minutos = minutosTotales % 60
  return minutos === 0 ? `${horasEnteras} h` : `${horasEnteras} h ${minutos} min`
}

const fechaLocalActual = () => {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
}

const etiquetaEstadoCambio = (estado: string, administrador?: string | null) => {
  if (estado === 'aprobada_admin') return administrador ? `Aprobada por ${administrador}` : 'Aprobada (aprobador no guardado en el registro histórico)'
  if (estado === 'aceptada_vigilador') return 'Aceptada por vigilador · pendiente de administración'
  if (estado === 'rechazada_vigilador') return 'Rechazada por vigilador'
  if (estado === 'cancelada') return administrador ? `Rechazada por ${administrador}` : 'Cancelada'
  if (estado === 'pendiente') return 'Pendiente de respuesta'
  return estado
}

export const GestionVigiladores: React.FC<{ idEmpresaSeleccionada?: string; idObjetivoSeleccionado?: string; modoConsulta?: boolean; ocultarAlta?: boolean }> = ({ idEmpresaSeleccionada, idObjetivoSeleccionado, modoConsulta = false, ocultarAlta = false }) => {
  const { vigiladores, asignaciones, objetivos, turnos, novedades, solicitudesCambio, avisos, solicitudesHorasExtra, crearVigilador, editarVigilador, cambiarEstadoVigilador } = useOperativo()
  const { usuario } = useAutenticacion()

  const [modalNuevoAbierto, setModalNuevoAbierto] = useState(false)
  const [modalFichaAbierto, setModalFichaAbierto] = useState(false)
  const [modalHistorialAbierto, setModalHistorialAbierto] = useState(false)
  const [modalHistorialOperativoAbierto, setModalHistorialOperativoAbierto] = useState(false)
  const [mesHistorialOperativo, setMesHistorialOperativo] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`)
  const [modalTrasladoAbierto, setModalTrasladoAbierto] = useState(false)
  const [modalEstadoAbierto, setModalEstadoAbierto] = useState(false)
  const [vigiladorEstado, setVigiladorEstado] = useState<Usuario | null>(null)
  const [filtroEstadoVigiladores, setFiltroEstadoVigiladores] = useState<'activos' | 'inactivos'>('activos')
  const [busquedaVigilador, setBusquedaVigilador] = useState('')
  const [tarjetasExpandidas, setTarjetasExpandidas] = useState<Set<string>>(() => new Set())
  const hoy = new Date()
  const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const mesActual = fechaHoy.slice(0, 7)

  const [vigiladorSeleccionado, setVigiladorSeleccionado] = useState<Usuario | null>(null)
  const [vigiladorFicha, setVigiladorFicha] = useState<Usuario | null>(null)
  const [vigiladorEditando, setVigiladorEditando] = useState<Usuario | null>(null)

  // Formulario alta / edición
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [email, setEmail] = useState('')
  const [vigiladorRestablecer, setVigiladorRestablecer] = useState<Usuario | null>(null)
  const [procesandoRestablecimiento, setProcesandoRestablecimiento] = useState(false)
  const [telefono, setTelefono] = useState('')
  const [dni, setDni] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [domicilio, setDomicilio] = useState('')
  const [contactoEmergenciaNombre, setContactoEmergenciaNombre] = useState('')
  const [contactoEmergenciaTelefono, setContactoEmergenciaTelefono] = useState('')
  const [fechaIngreso, setFechaIngreso] = useState(fechaLocalActual())
  const [categoria, setCategoria] = useState('')
  const [tipoContrato, setTipoContrato] = useState('')
  const [fechaFinContrato, setFechaFinContrato] = useState('')
  const [notasAdministrativas, setNotasAdministrativas] = useState('')
  const [idObjetivoInicial, setIdObjetivoInicial] = useState('')
  const [error, setError] = useState<string | null>(null)

  const idEmpresaActiva = idEmpresaSeleccionada || usuario?.id_empresa || ''
  const objetivosDeEmpresa = objetivos.filter((obj) => obj.id_empresa === idEmpresaActiva)

  const abrirAlta = () => {
    setVigiladorEditando(null)
    setNombre('')
    setApellido('')
    setEmail('')
    setTelefono('')
    setDni('')
    setFechaNacimiento('')
    setDomicilio('')
    setContactoEmergenciaNombre('')
    setContactoEmergenciaTelefono('')
    setFechaIngreso(fechaLocalActual())
    setCategoria('')
    setTipoContrato('')
    setFechaFinContrato('')
    setNotasAdministrativas('')
    const empresaInicial = usuario?.id_empresa || ''
    setIdObjetivoInicial(objetivos.find((obj) => obj.id_empresa === empresaInicial)?.id || '')
    setError(null)
    setModalNuevoAbierto(true)
  }

  const abrirEditar = async (vig: Usuario) => {
    setVigiladorEditando(vig)
    setNombre(vig.nombre)
    setApellido(vig.apellido)
    setEmail(vig.email || '')
    setTelefono(vig.telefono || '')
    setDni('')
    setFechaNacimiento('')
    setDomicilio('')
    setContactoEmergenciaNombre('')
    setContactoEmergenciaTelefono('')
    setFechaIngreso('')
    setCategoria('')
    setTipoContrato('')
    setFechaFinContrato('')
    setNotasAdministrativas('')
    setError(null)
    if (!supabase) {
      setError('Supabase no está configurado; no se pudo cargar la ficha del vigilador.')
      setModalNuevoAbierto(true)
      return
    }
    if (vig.id_usuario) {
      const { data: correoCuenta, error: errorCorreo } = await supabase.functions.invoke('editar-vigilador', {
        body: { accion: 'consultar_email', vigilador_id: vig.id_usuario }
      })
      if (errorCorreo || correoCuenta?.error) {
        const contexto = (errorCorreo as { context?: Response } | null)?.context
        let detalle = correoCuenta?.error as string | undefined
        if (!detalle && contexto) {
          try { detalle = ((await contexto.clone().json()) as { error?: string }).error } catch { /* respuesta sin JSON */ }
        }
        setError(detalle || 'No se pudo recuperar el correo actual de la cuenta. No lo cambies si no querés modificarlo.')
        setModalNuevoAbierto(true)
        return
      }
      if (typeof correoCuenta?.email === 'string') setEmail(correoCuenta.email)
    }
    const consultaVigilador = supabase.from('vigiladores').select('id,id_empresa')
    const { data: registro, error: errorRegistro } = vig.id_usuario
      ? await consultaVigilador.eq('id_usuario', vig.id_usuario).maybeSingle()
      : await consultaVigilador.eq('id', vig.id).maybeSingle()
    if (errorRegistro || !registro) {
      setError('No se pudo cargar el registro del vigilador: ' + (errorRegistro?.message || 'registro no encontrado'))
      setModalNuevoAbierto(true)
      return
    }
    const { data: ficha, error: errorFicha } = await supabase.from('fichas_vigiladores')
      .select('dni,fecha_nacimiento,domicilio,contacto_emergencia_nombre,contacto_emergencia_telefono,fecha_ingreso,categoria,tipo_contrato,fecha_fin_contrato,notas_administrativas')
      .eq('id_vigilador', registro.id).maybeSingle()
    if (errorFicha) {
      setError('No se pudo cargar la ficha: ' + errorFicha.message)
      setModalNuevoAbierto(true)
      return
    }
    // Los registros antiguos pueden no tener ficha: se permite completarla al editar.
    if (ficha) {
      setDni(ficha.dni || '')
      setFechaNacimiento(ficha.fecha_nacimiento || '')
      setDomicilio(ficha.domicilio || '')
      setContactoEmergenciaNombre(ficha.contacto_emergencia_nombre || '')
      setContactoEmergenciaTelefono(ficha.contacto_emergencia_telefono || '')
      setFechaIngreso(ficha.fecha_ingreso || '')
      setCategoria(ficha.categoria || '')
      setTipoContrato(ficha.tipo_contrato || '')
      setFechaFinContrato(ficha.fecha_fin_contrato || '')
      setNotasAdministrativas(ficha.notas_administrativas || '')
    }
    setModalNuevoAbierto(true)
  }

  const abrirHistorial = (vig: Usuario) => {
    setVigiladorSeleccionado(vig)
    setModalHistorialAbierto(true)
  }

  const abrirEstado = (vig: Usuario) => {
    setVigiladorEstado(vig)
    setModalEstadoAbierto(true)
  }

  const confirmarEstado = async () => {
    if (!vigiladorEstado) return
    const errorEstado = await cambiarEstadoVigilador(vigiladorEstado.id, !vigiladorEstado.activo)
    if (errorEstado) { setError(errorEstado); return }
    setModalEstadoAbierto(false)
    setVigiladorEstado(null)
  }

  const abrirTraslado = (vig: Usuario) => {
    setVigiladorSeleccionado(vig)
    setModalTrasladoAbierto(true)
  }

  const confirmarRestablecimiento = async () => {
    if (!supabase || !vigiladorRestablecer?.id_usuario) return
    setProcesandoRestablecimiento(true)
    setError(null)
    try {
      const { data, error: errorFuncion } = await supabase.functions.invoke('editar-vigilador', {
        body: { accion: 'restablecer_contrasena', vigilador_id: vigiladorRestablecer.id_usuario }
      })
      if (errorFuncion || data?.error) {
        const contexto = (errorFuncion as { context?: Response } | null)?.context
        let detalle = typeof data?.error === 'string' ? data.error : ''
        if (!detalle && contexto) {
          try { detalle = ((await contexto.clone().json()) as { error?: string }).error || '' } catch { /* respuesta sin JSON */ }
        }
        setError(detalle || errorFuncion?.message || 'No se pudo restablecer la contraseña.')
        return
      }
      setVigiladorRestablecer(null)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restablecer la contraseña.')
    } finally {
      setProcesandoRestablecimiento(false)
    }
  }

  const manejarGuardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!nombre.trim() || !apellido.trim() || ((!vigiladorEditando || vigiladorEditando.id_usuario) && !email.trim())) {
      setError('Nombre y apellido son obligatorios. El correo es obligatorio para cuentas de acceso.')
      return
    }

    if (!dni.trim() || !fechaNacimiento || !domicilio.trim() || !fechaIngreso || !categoria.trim() || !tipoContrato.trim()) {
      setError('Completá DNI, fecha de nacimiento, domicilio y los datos laborales obligatorios.')
      return
    }
    if (dni.replace(/\D/g, '').length < 8) {
      setError('El DNI debe contener al menos 8 dígitos para usarlo como contraseña inicial.')
      return
    }
    if ((contactoEmergenciaNombre.trim() && !contactoEmergenciaTelefono.trim()) || (!contactoEmergenciaNombre.trim() && contactoEmergenciaTelefono.trim())) {
      setError('Completá nombre y teléfono del contacto de emergencia, o dejá ambos vacíos.')
      return
    }

    if (!vigiladorEditando && !idEmpresaActiva) {
      setError('Seleccioná una empresa antes de dar de alta el vigilador.')
      return
    }

    if (!vigiladorEditando && !idObjetivoInicial) {
      setError('Seleccioná un objetivo de inicio antes de dar de alta el vigilador.')
      return
    }

    if (vigiladorEditando) {
      const errorEdicion = await editarVigilador(vigiladorEditando.id, {
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: email.trim().toLowerCase(),
        telefono: telefono.trim(),
        dni: dni.trim(), fecha_nacimiento: fechaNacimiento, domicilio: domicilio.trim(),
        contacto_emergencia_nombre: contactoEmergenciaNombre.trim(),
        contacto_emergencia_telefono: contactoEmergenciaTelefono.trim(), fecha_ingreso: fechaIngreso,
        categoria: categoria.trim(), tipo_contrato: tipoContrato,
        fecha_fin_contrato: fechaFinContrato || null, notas_administrativas: notasAdministrativas.trim()
      })
      if (errorEdicion) {
        setError(errorEdicion)
        return
      }
      setModalNuevoAbierto(false)
      return
    }

    const errorCreacion = await crearVigilador({
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      email: email.trim().toLowerCase(),
      telefono: telefono.trim(),
      dni: dni.trim(),
      fecha_nacimiento: fechaNacimiento,
      domicilio: domicilio.trim(),
      contacto_emergencia_nombre: contactoEmergenciaNombre.trim(),
      contacto_emergencia_telefono: contactoEmergenciaTelefono.trim(),
      fecha_ingreso: fechaIngreso,
      categoria: categoria.trim(),
      tipo_contrato: tipoContrato.trim(),
      fecha_fin_contrato: fechaFinContrato || null,
      notas_administrativas: notasAdministrativas.trim(),
      id_empresa: idEmpresaActiva,
      id_objetivo_inicial: idObjetivoInicial
    })

    if (errorCreacion) {
      setError(errorCreacion)
      return
    }

    setModalNuevoAbierto(false)
    window.location.reload()
  }

  // Historial del vigilador seleccionado
  const historialAsignaciones = asignaciones.filter(
    (a) => a.id_vigilador === vigiladorSeleccionado?.id
  )
  const turnosHistorial = turnos.filter(t => t.id_vigilador === vigiladorSeleccionado?.id && t.fecha.startsWith(mesHistorialOperativo) && t.fecha <= fechaHoy).sort((a, b) => b.fecha.localeCompare(a.fecha))
  const novedadesHistorial = novedades.filter(n => n.id_vigilador === vigiladorSeleccionado?.id && n.fecha.startsWith(mesHistorialOperativo) && n.fecha <= fechaHoy).sort((a, b) => b.fecha.localeCompare(a.fecha))
  const extrasHistorial = solicitudesHorasExtra.filter(s => s.id_vigilador === vigiladorSeleccionado?.id && s.fecha.startsWith(mesHistorialOperativo) && s.fecha <= fechaHoy).sort((a, b) => b.fecha.localeCompare(a.fecha))
  const cambiosHistorial = solicitudesCambio.filter(s => (s.id_solicitante === vigiladorSeleccionado?.id || s.id_destinatario === vigiladorSeleccionado?.id) && s.fecha_turno.startsWith(mesHistorialOperativo) && s.fecha_turno <= fechaHoy).sort((a, b) => b.fecha_turno.localeCompare(a.fecha_turno))
  const objetivosDelVigilador = new Set(asignaciones.filter(a => a.id_vigilador === vigiladorSeleccionado?.id).map(a => a.id_objetivo))
  const nombreVigilador = (id: string | null | undefined) => {
    const encontrado = vigiladores.find(v => v.id === id)
    return encontrado ? `${encontrado.nombre} ${encontrado.apellido}`.trim() : 'Vigilador no identificado'
  }
  const resumenEstadoTurno = (estado: string) => {
    if (estado === 'cumplido') return 'Realizado'
    if (estado === 'programado') return 'Programado'
    if (estado === 'ausente') return 'Ausencia'
    if (estado === 'reemplazado') return 'Reemplazado'
    return estado
  }
  const solicitudesAprobadasPorTurno = new Map<string, number>()
  extrasHistorial.filter(s => s.estado === 'aprobada').forEach(s => {
    solicitudesAprobadasPorTurno.set(s.id_turno, (solicitudesAprobadasPorTurno.get(s.id_turno) || 0) + Number(s.minutos_aprobados ?? s.minutos_solicitados))
  })

  // La grilla no tiene fichaje de entrada/salida: tomamos los turnos pasados
  // que no fueron franco, ausencia ni reemplazo. Usamos el desglose de horas
  // si está cargado y, si está en cero, recurrimos a las horas totales del turno.
  // El historial operativo solo considera turnos cuyo horario terminó realmente.
  // La fecha de inicio por sí sola no alcanza: un turno nocturno puede seguir en curso después de medianoche.
  const turnosHistorialFinalizados = turnosHistorial.filter(t =>
    t.tipo === 'franco' ? t.fecha < fechaHoy : turnoFinalizado(t, hoy)
  )
  const idsTurnosFinalizados = new Set(turnosHistorialFinalizados.map(t => t.id))
  const turnosTrabajadosHistorial = turnosHistorialFinalizados.filter(t =>
    t.tipo !== 'franco' && t.estado !== 'ausente' && t.estado !== 'reemplazado'
  )
  const minutosDiurnos = turnosTrabajadosHistorial.reduce((total, t) => total + Math.round(Number(t.horas_diurnas || (t.tipo === 'diurno' ? t.horas_totales : 0)) * 60), 0)
  const minutosNocturnos = turnosTrabajadosHistorial.reduce((total, t) => total + Math.round(Number(t.horas_nocturnas || (t.tipo === 'nocturno' ? t.horas_totales : 0)) * 60), 0)
  const minutosExtras = extrasHistorial.filter(s => s.estado === 'aprobada' && idsTurnosFinalizados.has(s.id_turno)).reduce((total, s) => total + Number(s.minutos_aprobados ?? s.minutos_solicitados ?? 0), 0)
  const formatearMinutos = (minutos: number) => formatearDuracion(minutos / 60)
  const minutosTrabajados = minutosDiurnos + minutosNocturnos + minutosExtras

  const avisosHistorial = avisos.filter(a => objetivosDelVigilador.has(a.id_objetivo) && a.creado_en?.startsWith(mesHistorialOperativo) && (a.creado_en?.slice(0, 10) || '') <= fechaHoy).sort((a, b) => b.creado_en.localeCompare(a.creado_en))
  const mesesHistorial = Array.from(new Set([
    ...turnos.filter(t => t.id_vigilador === vigiladorSeleccionado?.id && t.fecha <= fechaHoy).map(t => t.fecha.slice(0, 7)),
    ...novedades.filter(n => n.id_vigilador === vigiladorSeleccionado?.id && n.fecha <= fechaHoy).map(n => n.fecha.slice(0, 7)),
    ...solicitudesHorasExtra.filter(s => s.id_vigilador === vigiladorSeleccionado?.id && s.fecha <= fechaHoy).map(s => s.fecha.slice(0, 7)),
    ...solicitudesCambio.filter(s => (s.id_solicitante === vigiladorSeleccionado?.id || s.id_destinatario === vigiladorSeleccionado?.id) && s.fecha_turno <= fechaHoy).map(s => s.fecha_turno.slice(0, 7)),
    mesActual
  ])).filter(m => m <= mesActual).sort((a, b) => b.localeCompare(a))

  const terminoBusqueda = busquedaVigilador.trim().toLocaleLowerCase('es-AR')
  const vigiladoresMostrados = vigiladores.filter((v) => {
    if (v.id_empresa !== idEmpresaActiva) return false
    if ((filtroEstadoVigiladores === 'activos') !== v.activo) return false
    if (idObjetivoSeleccionado && !asignaciones.some((a) => a.id_vigilador === v.id && a.id_objetivo === idObjetivoSeleccionado && a.activa)) return false
    if (!terminoBusqueda) return true
    return [v.nombre, v.apellido, v.email, v.telefono, `${v.nombre} ${v.apellido}`]
      .some((dato) => String(dato || '').toLocaleLowerCase('es-AR').includes(terminoBusqueda))
  })

  const alternarTarjeta = (id: string) => setTarjetasExpandidas(actuales => {
    const siguientes = new Set(actuales)
    if (siguientes.has(id)) siguientes.delete(id)
    else siguientes.add(id)
    return siguientes
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white font-['Outfit']">
            Plantel de Vigiladores
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Control de personal de guardia, asignaciones vigentes e historial de traslados operativos.
          </p>
        </div>
        {!modoConsulta && !ocultarAlta && <Boton
          variante="primario"
          onClick={abrirAlta}
          icono={<UserPlus className="w-4 h-4" />}
        >
          Nuevo Vigilador
        </Boton>}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 p-2">
        <button type="button" onClick={() => setFiltroEstadoVigiladores('activos')} aria-pressed={filtroEstadoVigiladores === 'activos'} className={`flex-1 min-w-[150px] rounded-lg px-4 py-3 text-sm font-bold transition-colors ${filtroEstadoVigiladores === 'activos' ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
          <UserCheck className="inline w-4 h-4 mr-2" />Activos ({vigiladores.filter(v => v.id_empresa === idEmpresaActiva && v.activo && (!idObjetivoSeleccionado || asignaciones.some(a => a.id_vigilador === v.id && a.id_objetivo === idObjetivoSeleccionado && a.activa))).length})
        </button>
        <button type="button" onClick={() => setFiltroEstadoVigiladores('inactivos')} aria-pressed={filtroEstadoVigiladores === 'inactivos'} className={`flex-1 min-w-[150px] rounded-lg px-4 py-3 text-sm font-bold transition-colors ${filtroEstadoVigiladores === 'inactivos' ? 'bg-slate-700 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
          <UserX className="inline w-4 h-4 mr-2" />Inactivos ({vigiladores.filter(v => v.id_empresa === idEmpresaActiva && !v.activo && (!idObjetivoSeleccionado || asignaciones.some(a => a.id_vigilador === v.id && a.id_objetivo === idObjetivoSeleccionado))).length})
        </button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={busquedaVigilador}
          onChange={(e) => setBusquedaVigilador(e.target.value)}
          placeholder="Buscar por nombre, apellido, DNI, teléfono o correo..."
          aria-label="Buscar vigilador"
          className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-[#0A0F1A] dark:text-slate-100"
        />
        {busquedaVigilador && <button type="button" onClick={() => setBusquedaVigilador('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Limpiar búsqueda"><X className="h-4 w-4" /></button>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {vigiladoresMostrados.map((vig) => {
          const asignacionActiva = asignaciones.find(
            (a) => a.id_vigilador === vig.id && a.activa
          )
          const tarjetaExpandida = tarjetasExpandidas.has(vig.id)

          return (
            <Tarjeta key={vig.id} className="hover:border-blue-500/50 transition-all">
              <TarjetaContenido className={`p-3 sm:p-4 ${tarjetaExpandida ? 'space-y-3' : 'space-y-2'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-950/70 border border-blue-300 dark:border-blue-800/80 text-blue-700 dark:text-blue-300 font-bold text-base flex items-center justify-center shrink-0">
                      {vig.nombre.charAt(0)}{vig.apellido.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate whitespace-nowrap font-bold text-slate-900 dark:text-white text-base leading-snug" title={`${vig.nombre} ${vig.apellido}`}>
                        {vig.nombre} {vig.apellido}
                      </h4>
                      <p className="flex min-w-0 max-w-full flex-nowrap items-center gap-1.5 overflow-hidden text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        <Mail className="w-3 h-3 shrink-0 text-slate-400" />
                        <span className="block min-w-0 max-w-full flex-1 overflow-hidden text-ellipsis whitespace-nowrap" title={vig.email || 'Sin cuenta de acceso'}>{vig.email || 'Sin cuenta de acceso'}</span>
                      </p>
                    </div>
                  </div>

                  {!modoConsulta && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => { setVigiladorFicha(vig); setModalFichaAbierto(true) }} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70" title="Ver ficha del vigilador" aria-label={`Ver ficha de ${vig.nombre} ${vig.apellido}`}>
                      <span className="hidden md:inline text-xs font-semibold">Ficha Técnica</span>
                      <Info className="w-4 h-4" />
                    </button>
                  </div>
                  )}
                  {!modoConsulta && vig.id_usuario && <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setVigiladorRestablecer(vig)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                      title="Restablecer contraseña"
                      aria-label={`Restablecer contraseña de ${vig.nombre} ${vig.apellido}`}
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirEditar(vig)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Editar vigilador"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirEstado(vig)}
                      className={`p-1.5 rounded-lg transition-colors ${vig.activo ? 'text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30' : 'text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'}`}
                      title={vig.activo ? 'Dar de baja' : 'Dar de alta'}
                    >
                      {vig.activo ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                    </button>
                  </div>}
                </div>

                {tarjetaExpandida && vig.telefono && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{vig.telefono}</span>
                  </p>
                )}

                {/* Asignación Actual */}
                {tarjetaExpandida && <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Puesto Activo:</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {vig.activo ? (asignacionActiva?.objetivo_nombre || 'Sin puesto asignado') : 'Sin servicio activo'}
                      </span>
                    </div>
                  </div>
                  <Insignia variante={vig.activo ? "verde" : "rojo"}>{vig.activo ? "En servicio" : "Dado de baja"}</Insignia>
                </div>}

                {/* Acciones de Traslado e Historial (Sección 20 y 21) */}
                {tarjetaExpandida && !modoConsulta && <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => { setVigiladorSeleccionado(vig); setMesHistorialOperativo(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`); setModalHistorialOperativoAbierto(true) }}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Historial operativo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirHistorial(vig)}
                    className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Historial de Asignaciones</span>
                  </button>

                  <Boton
                    variante="secundario"
                    tamano="chico"
                    onClick={() => abrirTraslado(vig)}
                    icono={<ArrowRightLeft className="w-3.5 h-3.5 text-blue-500" />}
                  >
                    Trasladar
                  </Boton>
                </div>}
                <button type="button" onClick={() => alternarTarjeta(vig.id)} aria-expanded={tarjetaExpandida} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-blue-800 dark:hover:bg-blue-950/30 dark:hover:text-blue-300">
                  {tarjetaExpandida ? <><ChevronUp className="h-4 w-4" /> Ver menos</> : <><ChevronDown className="h-4 w-4" /> Ver más detalles</>}
                </button>
              </TarjetaContenido>
            </Tarjeta>
          )
        })}
        {vigiladoresMostrados.length === 0 && <div className="md:col-span-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500">{terminoBusqueda ? `No se encontraron vigiladores para “${busquedaVigilador.trim()}”.` : filtroEstadoVigiladores === 'activos' ? 'No hay vigilantes activos para este filtro.' : 'No hay vigilantes inactivos para este filtro.'}</div>}
      </div>

      <Dialogo
        abierto={modalHistorialOperativoAbierto}
        alCerrar={() => setModalHistorialOperativoAbierto(false)}
        titulo={`Historial operativo: ${vigiladorSeleccionado?.nombre} ${vigiladorSeleccionado?.apellido}`}
        subtitulo="Consulta por mes de turnos, horas extra, novedades, cambios de turno y avisos de sus objetivos asignados."
        icono={<History className="w-5 h-5 text-blue-500" />}
        tamano="grande"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="historial-operativo-mes" className="mb-1 block text-xs font-semibold text-slate-500">Mes y año</label>
            <select id="historial-operativo-mes" value={mesHistorialOperativo} onChange={e => setMesHistorialOperativo(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0A0F1A] px-3 text-sm text-slate-900 dark:text-slate-100">
              {mesesHistorial.map(m => <option key={m} value={m}>{new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1))}</option>)}
            </select>
          </div>
          <details className="group rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <summary className="cursor-pointer list-none p-4 sm:p-5 bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-blue-950/40 dark:via-slate-950 dark:to-indigo-950/30">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white"><History className="h-4 w-4" /></span><div><h4 className="font-black text-base text-slate-900 dark:text-white">Resumen de turnos</h4><p className="text-xs text-slate-500">{turnosHistorialFinalizados.length} turnos finalizados · tocar para ver el detalle</p></div></div>
                <span className="text-xs font-bold text-blue-700 dark:text-blue-300 group-open:hidden">Ver detalle ⌄</span><span className="hidden text-xs font-bold text-blue-700 dark:text-blue-300 group-open:inline">Ocultar ⌃</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/70 dark:bg-amber-950/30"><p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">Diurnas</p><p className="mt-1 text-lg font-black text-amber-950 dark:text-amber-100">{formatearMinutos(minutosDiurnos)}</p></div>
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-900/70 dark:bg-indigo-950/30"><p className="text-[11px] font-semibold text-indigo-800 dark:text-indigo-300">Nocturnas</p><p className="mt-1 text-lg font-black text-indigo-950 dark:text-indigo-100">{formatearMinutos(minutosNocturnos)}</p></div>
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 dark:border-orange-900/70 dark:bg-orange-950/30"><p className="text-[11px] font-semibold text-orange-800 dark:text-orange-300">Horas extra</p><p className="mt-1 text-lg font-black text-orange-950 dark:text-orange-100">{formatearMinutos(minutosExtras)}</p></div>
                <div className="rounded-xl border border-blue-200 bg-blue-600 p-3 dark:border-blue-500 dark:bg-blue-700"><p className="text-[11px] font-semibold text-blue-100">Total del mes</p><p className="mt-1 text-lg font-black text-white">{formatearMinutos(minutosTrabajados)}</p></div>
              </div>
            </summary>
            <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 p-3">
              {turnosHistorialFinalizados.length ? turnosHistorialFinalizados.map(t => <div key={t.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs"><div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1"><strong>{t.fecha} · {t.tipo}</strong><span className="font-medium">{formatearDuracion(t.horas_totales)} + {formatearDuracion(t.horas_extra)} extra</span></div><p className="mt-1 text-slate-500">{objetivos.find(o => o.id === t.id_objetivo)?.nombre || 'Objetivo'} · {t.hora_inicio.slice(0, 5)}–{t.hora_fin.slice(0, 5)}</p><p className="mt-1 text-slate-500">Estado: {resumenEstadoTurno(t.estado)}</p></div>) : <p className="text-xs text-slate-500">Sin turnos para este mes.</p>}
            </div>
          </details>

          <details className="group rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-900/40"><h4 className="font-bold text-sm text-slate-900 dark:text-white">Solicitudes de horas extra <span className="font-normal text-slate-500">({extrasHistorial.length})</span></h4><span className="text-xs text-blue-600 dark:text-blue-400">Ver detalle <span aria-hidden="true">⌄</span></span></summary>
            <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 p-3">
            {extrasHistorial.length ? extrasHistorial.map(s => {
              const turnoAsociado = turnos.find(t => t.id === s.id_turno)
              const minutosAprobados = Number(s.minutos_aprobados ?? s.minutos_solicitados)
              const minutosEnGrilla = turnoAsociado ? Math.round(Number(turnoAsociado.horas_extra || 0) * 60) : null
              const minutosSolicitadosAprobados = solicitudesAprobadasPorTurno.get(s.id_turno) || 0
              const hayDiferencia = s.estado === 'aprobada' && minutosEnGrilla !== null && Math.abs(minutosEnGrilla - minutosSolicitadosAprobados) > 1
              const excedeTurno = s.estado === 'aprobada' && turnoAsociado && Number(turnoAsociado.horas_totales || 0) > 0 && minutosAprobados > Number(turnoAsociado.horas_totales) * 60
              return <div key={s.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs"><strong>{s.fecha}</strong> · {s.estado === 'aprobada' ? 'Aprobada' : s.estado === 'rechazada' ? 'Rechazada' : 'Pendiente'} · {formatearDuracion(minutosAprobados / 60)}<p className="mt-1 text-slate-500">{s.motivo}</p>{turnoAsociado && <p className="mt-1 text-slate-500">Turno asociado: {turnoAsociado.fecha} · {turnoAsociado.tipo} · {resumenEstadoTurno(turnoAsociado.estado)}</p>}{hayDiferencia && <p className="mt-2 rounded-md bg-amber-50 dark:bg-amber-950/30 p-2 font-medium text-amber-800 dark:text-amber-300">Revisar: las solicitudes aprobadas suman {formatearDuracion(minutosSolicitadosAprobados / 60)}, pero la grilla registra {formatearDuracion((minutosEnGrilla || 0) / 60)} extra.</p>}{excedeTurno && <p className="mt-2 rounded-md bg-amber-50 dark:bg-amber-950/30 p-2 font-medium text-amber-800 dark:text-amber-300">Revisar: el tiempo aprobado supera la duración del turno.</p>}</div>
            }) : <p className="text-xs text-slate-500">Sin solicitudes de extras para este mes.</p>}
            </div>
          </details>

          <details className="group rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-900/40"><h4 className="font-bold text-sm text-slate-900 dark:text-white">Libro de Novedades <span className="font-normal text-slate-500">({novedadesHistorial.length})</span></h4><span className="text-xs text-blue-600 dark:text-blue-400">Ver detalle <span aria-hidden="true">⌄</span></span></summary>
            <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 p-3">
            {novedadesHistorial.length ? novedadesHistorial.map(n => <div key={n.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs"><strong>{n.fecha} {n.hora}</strong> · {objetivos.find(o => o.id === n.id_objetivo)?.nombre || 'Objetivo'}<p className="mt-1 whitespace-pre-line text-slate-600 dark:text-slate-300">{n.informe_novedades}</p></div>) : <p className="text-xs text-slate-500">Sin novedades para este mes.</p>}
            </div>
          </details>

          <details className="group rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-900/40"><h4 className="font-bold text-sm text-slate-900 dark:text-white">Cambios de turno <span className="font-normal text-slate-500">({cambiosHistorial.length})</span></h4><span className="text-xs text-blue-600 dark:text-blue-400">Ver detalle <span aria-hidden="true">⌄</span></span></summary>
            <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 p-3">
            {cambiosHistorial.length ? cambiosHistorial.map(s => <div key={s.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs"><strong>{s.fecha_turno}</strong><p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{etiquetaEstadoCambio(s.estado, (s as typeof s & { revisado_por_nombre?: string | null }).revisado_por_nombre)}</p><p className="mt-1 text-slate-500">Solicitante: {nombreVigilador(s.id_solicitante)} · Destinatario: {nombreVigilador(s.id_destinatario)}</p><p className="mt-1 text-slate-500">Motivo: {s.motivo?.trim() || 'Sin motivo indicado'}</p></div>) : <p className="text-xs text-slate-500">Sin cambios para este mes.</p>}
            </div>
          </details>

          <details className="group rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-900/40"><h4 className="font-bold text-sm text-slate-900 dark:text-white">Avisos de sus objetivos <span className="font-normal text-slate-500">({avisosHistorial.length})</span></h4><span className="text-xs text-blue-600 dark:text-blue-400">Ver detalle <span aria-hidden="true">⌄</span></span></summary>
            <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 p-3">
            {avisosHistorial.length ? avisosHistorial.map(a => <div key={a.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs"><div className="flex flex-col sm:flex-row sm:justify-between gap-1"><strong>{a.titulo?.trim() || 'Aviso sin título'}</strong><span>Prioridad: {a.prioridad}</span></div><p className="mt-1 text-slate-500">Publicado: {a.creado_en.slice(0, 10)} · {objetivos.find(o => o.id === a.id_objetivo)?.nombre || 'Objetivo'}</p><p className="mt-1 whitespace-pre-line">{a.contenido}</p></div>) : <p className="text-xs text-slate-500">Sin avisos de esos objetivos para este mes.</p>}
            </div>
          </details>
          <div className="flex justify-end border-t border-slate-200 dark:border-slate-800 pt-3"><Boton variante="secundario" onClick={() => setModalHistorialOperativoAbierto(false)}>Cerrar</Boton></div>
        </div>
      </Dialogo>

      {/* Modal Historial de Asignaciones (Sección 20) */}
      <Dialogo
        abierto={modalHistorialAbierto}
        alCerrar={() => setModalHistorialAbierto(false)}
        titulo={`Historial de Asignaciones: ${vigiladorSeleccionado?.nombre} ${vigiladorSeleccionado?.apellido}`}
        subtitulo="Registro cronológico inmutable de objetivos y traslados (Sección 20)."
        icono={<History className="w-5 h-5 text-blue-500" />}
        tamano="grande"
      >
        <div className="space-y-3">
          {historialAsignaciones.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">No hay traslados registrados aún.</p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {historialAsignaciones.map((asig) => (
                <div key={asig.id} className="py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">
                        {asig.objetivo_nombre}
                      </span>
                      {asig.activa && <Insignia variante="verde">Actual</Insignia>}
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                      Período: <span className="font-semibold text-slate-700 dark:text-slate-300">{asig.fecha_inicio}</span>
                      {asig.fecha_fin ? ` → ${asig.fecha_fin}` : ' → En curso'}
                    </p>
                    {asig.motivo_traslado && (
                      <p className="text-slate-600 dark:text-slate-400 mt-0.5 italic">
                        Motivo: {asig.motivo_traslado}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <Boton variante="secundario" onClick={() => setModalHistorialAbierto(false)}>
              Cerrar
            </Boton>
          </div>
        </div>
      </Dialogo>


      <Dialogo
        abierto={modalEstadoAbierto}
        alCerrar={() => { setModalEstadoAbierto(false); setVigiladorEstado(null) }}
        titulo={vigiladorEstado?.activo ? 'Dar de baja vigilador' : 'Dar de alta vigilador'}
        subtitulo={vigiladorEstado?.activo
          ? 'El vigilador quedará inactivo y no tendrá servicio operativo activo.'
          : 'El vigilador volverá a estar activo para la operación.'}
        icono={vigiladorEstado?.activo ? <UserX className="w-5 h-5 text-red-500" /> : <UserCheck className="w-5 h-5 text-emerald-500" />}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            ¿Deseas {vigiladorEstado?.activo ? 'dar de baja' : 'dar de alta'} a <strong>{vigiladorEstado?.nombre} {vigiladorEstado?.apellido}</strong>?
          </p>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Boton variante="secundario" onClick={() => { setModalEstadoAbierto(false); setVigiladorEstado(null) }}>Cancelar</Boton>
            <Boton variante={vigiladorEstado?.activo ? "peligro" : "primario"} onClick={() => void confirmarEstado()}>
              {vigiladorEstado?.activo ? 'Confirmar baja' : 'Confirmar alta'}
            </Boton>
          </div>
        </div>
      </Dialogo>
      {/* Modal Nuevo / Editar Vigilador */}
      <Dialogo
        abierto={modalNuevoAbierto}
        alCerrar={() => setModalNuevoAbierto(false)}
        titulo={vigiladorEditando ? 'Editar Vigilador' : 'Alta de Vigilador'}
        subtitulo="Registro de personal operativo para diagramación y libros de guardia."
        icono={<UserPlus className="w-5 h-5 text-blue-500" />}
      >
        <form onSubmit={manejarGuardar} className="space-y-4" autoComplete="off">
          {!vigiladorEditando && <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">El legajo se asignará automáticamente al guardar el alta y no podrá repetirse ni editarse.</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Etiqueta requerido>Nombre</Etiqueta>
              <Entrada
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Franco"
                autoFocus
              />
            </div>
            <div>
              <Etiqueta requerido>Apellido</Etiqueta>
              <Entrada
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                placeholder="Rasia"
              />
            </div>
          </div>

          <div>
            <Etiqueta requerido={!vigiladorEditando}>Correo Electrónico (Acceso Auth)</Etiqueta>
            <Entrada
              type="email"
              autoComplete="off"
              name="correo-vigilador"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="franco.rasia@empresa.com"
            />
          </div>

          {!vigiladorEditando && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              La contraseña inicial será el DNI registrado en la ficha. Al ingresar por primera vez, el vigilador deberá crear una contraseña personal.
            </p>
          )}
          {vigiladorEditando && vigiladorEditando.id_usuario && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Para cambiar la contraseña, usá el botón «Restablecer contraseña» de la tarjeta del vigilador. Se establecerá su DNI y deberá cambiarlo al ingresar.
            </p>
          )}

          <div>
            <Etiqueta>Teléfono de Contacto</Etiqueta>
            <Entrada
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="+54 9 358 1234567"
            />
          </div>

          <>
          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <h4 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Datos personales</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><Etiqueta requerido>DNI</Etiqueta><Entrada value={dni} onChange={e => setDni(e.target.value)} placeholder="Número de documento" /></div>
              <div><Etiqueta requerido>Fecha de nacimiento</Etiqueta><Entrada type="date" value={fechaNacimiento} onChange={e => setFechaNacimiento(e.target.value)} /></div>
              <div className="sm:col-span-2"><Etiqueta requerido>Domicilio</Etiqueta><Entrada value={domicilio} onChange={e => setDomicilio(e.target.value)} placeholder="Calle, número, localidad" /></div>
              <div><Etiqueta>Contacto de emergencia</Etiqueta><Entrada value={contactoEmergenciaNombre} onChange={e => setContactoEmergenciaNombre(e.target.value)} placeholder="Nombre y apellido" /></div>
              <div><Etiqueta>Teléfono de emergencia</Etiqueta><Entrada type="tel" value={contactoEmergenciaTelefono} onChange={e => setContactoEmergenciaTelefono(e.target.value)} placeholder="Teléfono" /></div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <h4 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Datos laborales</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><Etiqueta requerido>Fecha de ingreso</Etiqueta><Entrada type="date" value={fechaIngreso} onChange={e => setFechaIngreso(e.target.value)} /></div>
              <div><Etiqueta requerido>Categoría laboral</Etiqueta><Entrada value={categoria} onChange={e => setCategoria(e.target.value)} placeholder="Ej. Vigilador general" /></div>
              <div><Etiqueta requerido>Tipo de contrato</Etiqueta><select value={tipoContrato} onChange={e => setTipoContrato(e.target.value)} className="w-full min-h-[46px] rounded-xl bg-white dark:bg-[#0A0F1A] border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100"><option value="">Seleccionar...</option><option value="indeterminado">Tiempo indeterminado</option><option value="plazo_fijo">Plazo fijo</option><option value="eventual">Eventual</option><option value="otro">Otro</option></select></div>
              <div><Etiqueta>Fin de contrato</Etiqueta><Entrada type="date" value={fechaFinContrato} onChange={e => setFechaFinContrato(e.target.value)} /></div>
              <div className="sm:col-span-2"><Etiqueta>Notas administrativas</Etiqueta><textarea value={notasAdministrativas} onChange={e => setNotasAdministrativas(e.target.value)} rows={3} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-[#0A0F1A] dark:text-slate-100" placeholder="Observaciones internas (opcional)" /></div>
            </div>
          </div>
          </>

          {!vigiladorEditando && (
            <div>
              <Etiqueta requerido>Objetivo de Inicio</Etiqueta>
              <select
                value={idObjetivoInicial}
                onChange={(e) => setIdObjetivoInicial(e.target.value)}
                disabled={!idEmpresaActiva}
                className="w-full min-h-[46px] rounded-xl bg-white dark:bg-[#0A0F1A] border border-slate-300 dark:border-slate-700/80 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
              >
                <option value="">Seleccionar objetivo...</option>
                {objetivosDeEmpresa.map((obj) => (
                  <option key={obj.id} value={obj.id}>
                    {obj.nombre} ({obj.localidad})
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Boton type="button" variante="secundario" onClick={() => setModalNuevoAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="primario">
              {vigiladorEditando ? 'Guardar Cambios' : 'Dar de Alta'}
            </Boton>
          </div>
        </form>
      </Dialogo>

      <Dialogo
        abierto={Boolean(vigiladorRestablecer)}
        alCerrar={() => { if (!procesandoRestablecimiento) setVigiladorRestablecer(null) }}
        titulo="Restablecer contraseña"
        subtitulo="Se utilizará el DNI registrado en la ficha del vigilador."
        icono={<KeyRound className="w-5 h-5 text-amber-500" />}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            ¿Querés restablecer la contraseña de <strong>{vigiladorRestablecer?.nombre} {vigiladorRestablecer?.apellido}</strong>? Su contraseña actual dejará de funcionar y deberá elegir una nueva al iniciar sesión.
          </p>
          {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
            <Boton variante="secundario" disabled={procesandoRestablecimiento} onClick={() => setVigiladorRestablecer(null)}>Cancelar</Boton>
            <Boton variante="primario" disabled={procesandoRestablecimiento} onClick={() => void confirmarRestablecimiento()}>
              {procesandoRestablecimiento ? 'Restableciendo…' : 'Confirmar restablecimiento'}
            </Boton>
          </div>
        </div>
      </Dialogo>

      <FichaVigilador
        abierto={modalFichaAbierto}
        vigilador={vigiladorFicha}
        alCerrar={() => { setModalFichaAbierto(false); setVigiladorFicha(null) }}
        asignaciones={asignaciones}
        objetivos={objetivos}
        turnos={turnos}
        novedades={novedades}
        horasExtra={solicitudesHorasExtra}
        cambios={solicitudesCambio}
      />

      {/* Modal Traslado Oficial */}
      <ModalTraslado
        abierto={modalTrasladoAbierto}
        alCerrar={() => setModalTrasladoAbierto(false)}
        vigilador={vigiladorSeleccionado}
      />
    </div>
  )
}
