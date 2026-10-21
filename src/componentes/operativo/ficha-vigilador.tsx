import React, { useEffect, useState } from 'react'
import { Info, UserRound, LoaderCircle } from 'lucide-react'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Boton } from '@/componentes/ui/boton'
import type { Usuario, Asignacion, Objetivo, Turno, NovedadLibro, SolicitudHorasExtra, SolicitudCambio } from '@/tipos'
import { supabase } from '@/servicios/supabase'
import { useTraduccion } from '@/i18n'

type CabeceraVigilador = { nombre: string; apellido: string; email: string; telefono: string; legajo: string }

type Ficha = {
  dni: string
  fecha_nacimiento: string
  domicilio: string
  contacto_emergencia_nombre: string
  contacto_emergencia_telefono: string
  fecha_ingreso: string
  categoria: string
  tipo_contrato: string
  fecha_fin_contrato: string
  notas_administrativas: string
}

const vacia: Ficha = {
  dni: '', fecha_nacimiento: '', domicilio: '',
  contacto_emergencia_nombre: '', contacto_emergencia_telefono: '',
  fecha_ingreso: '', categoria: '', tipo_contrato: '',
  fecha_fin_contrato: '', notas_administrativas: ''
}

const campos: { key: keyof Ficha; label: string; type?: string }[] = [
  { key: 'dni', label: 'DNI' },
  { key: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date' },
  { key: 'domicilio', label: 'Domicilio' },
  { key: 'contacto_emergencia_nombre', label: 'Nombre del contacto de emergencia' },
  { key: 'contacto_emergencia_telefono', label: 'Teléfono del contacto de emergencia', type: 'tel' },
  { key: 'fecha_ingreso', label: 'Fecha de ingreso', type: 'date' },
  { key: 'categoria', label: 'Categoría laboral' },
  { key: 'tipo_contrato', label: 'Tipo de contrato' },
  { key: 'fecha_fin_contrato', label: 'Fin de contrato', type: 'date' },
]

export const FichaVigilador: React.FC<{
  abierto: boolean
  vigilador: Usuario | null
  alCerrar: () => void
  asignaciones: Asignacion[]
  objetivos: Objetivo[]
  turnos: Turno[]
  novedades: NovedadLibro[]
  horasExtra: SolicitudHorasExtra[]
  cambios: SolicitudCambio[]
}> = ({ abierto, vigilador, alCerrar, asignaciones, objetivos, turnos, novedades, horasExtra, cambios }) => {
  const { idioma } = useTraduccion()
  const [ficha, setFicha] = useState<Ficha>(vacia)
  const [cabecera, setCabecera] = useState<CabeceraVigilador>({ nombre: '', apellido: '', email: '', telefono: '', legajo: '' })
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [pestana, setPestana] = useState<'personal' | 'laboral' | 'objetivos' | 'actividad' | 'documentacion'>('personal')

  useEffect(() => {
    if (!abierto || !vigilador || !supabase) return
    const db = supabase
    let cancelado = false
    const cargar = async () => {
      setCargando(true)
      setError('')
      setFicha(vacia)
      setCabecera({ nombre: vigilador.nombre || '', apellido: vigilador.apellido || '', email: vigilador.email || '', telefono: vigilador.telefono || '', legajo: vigilador.legajo || '' })
      const consultaRegistro = db.from('vigiladores').select('id,id_empresa,id_usuario,legajo,nombre,apellido,telefono')
      const { data: registro, error: errorRegistro } = vigilador.id_usuario
        ? await consultaRegistro.eq('id_usuario', vigilador.id_usuario).maybeSingle()
        : await consultaRegistro.eq('id', vigilador.id).maybeSingle()
      if (errorRegistro || !registro) {
        if (!cancelado) setError(errorRegistro?.message || 'No se encontró el registro operativo del vigilador.')
        if (!cancelado) setCargando(false)
        return
      }
      const [resultadoFicha, resultadoPerfil] = await Promise.all([
        db.from('fichas_vigiladores').select('*').eq('id_vigilador', registro.id).maybeSingle(),
        registro.id_usuario
          ? db.from('perfiles').select('email,nombre,apellido,telefono').eq('id', registro.id_usuario).maybeSingle()
          : Promise.resolve({ data: null, error: null })
      ])
      if (cancelado) return
      const perfil = resultadoPerfil.data
      setCabecera({
        nombre: registro.nombre || perfil?.nombre || vigilador.nombre || '',
        apellido: registro.apellido || perfil?.apellido || vigilador.apellido || '',
        email: perfil?.email || vigilador.email || '',
        telefono: registro.telefono || perfil?.telefono || vigilador.telefono || '',
        legajo: registro.legajo || vigilador.legajo || ''
      })
      const data = resultadoFicha.data
      const errorFicha = resultadoFicha.error
      if (errorFicha) setError(errorFicha.message)
      else if (data) setFicha({
        dni: data.dni || '',
        fecha_nacimiento: data.fecha_nacimiento || '',
        domicilio: data.domicilio || '',
        contacto_emergencia_nombre: data.contacto_emergencia_nombre || '',
        contacto_emergencia_telefono: data.contacto_emergencia_telefono || '',
        fecha_ingreso: data.fecha_ingreso || '',
        categoria: data.categoria || '',
        tipo_contrato: data.tipo_contrato || '',
        fecha_fin_contrato: data.fecha_fin_contrato || '',
        notas_administrativas: data.notas_administrativas || ''
      })
      setCargando(false)
    }
    void cargar()
    return () => { cancelado = true }
  }, [abierto, vigilador?.id, vigilador?.id_usuario])

  const asignacionesVigilador = asignaciones.filter(a => a.id_vigilador === vigilador?.id).sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio))
  const turnosVigilador = turnos.filter(t => t.id_vigilador === vigilador?.id).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 20)
  const novedadesVigilador = novedades.filter(n => n.id_vigilador === vigilador?.id).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10)
  const extrasVigilador = horasExtra.filter(h => h.id_vigilador === vigilador?.id).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10)
  const cambiosVigilador = cambios.filter(c => c.id_solicitante === vigilador?.id || c.id_destinatario === vigilador?.id).sort((a, b) => b.fecha_turno.localeCompare(a.fecha_turno)).slice(0, 10)
  const etiquetaInput = 'mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300'

  return (
    <Dialogo
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={`Ficha del vigilador: ${cabecera.nombre} ${cabecera.apellido}`}
      subtitulo="Datos personales y laborales. Acceso reservado a administración."
      icono={<Info className="h-5 w-5 text-blue-500" />}
      tamano="grande"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            <UserRound className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-900 dark:text-white">{cabecera.nombre} {cabecera.apellido}</p>
            <p className="break-all text-xs text-slate-500">{cabecera.email || 'Sin correo de acceso'} · Legajo: {cabecera.legajo || 'Sin legajo cargado'}</p>
            <p className="text-xs text-slate-500">{cabecera.telefono ? `${idioma === 'en' ? 'Phone:' : 'Tel:'} ${cabecera.telefono}` : (idioma === 'en' ? 'No phone registered' : 'Sin teléfono registrado')}</p>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
          {([
            ['personal', idioma === 'en' ? 'Personal' : 'Personal'],
            ['laboral', idioma === 'en' ? 'Employment' : 'Laboral'],
            ['objetivos', idioma === 'en' ? 'Sites' : 'Objetivos'],
            ['actividad', idioma === 'en' ? 'Activity' : 'Actividad'],
            ['documentacion', idioma === 'en' ? 'Documentation' : 'Documentación']
          ] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setPestana(key)} className={`shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${pestana === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>{label}</button>)}
        </div>

        {cargando ? <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Cargando ficha…</div> : (
          <div className="space-y-4">
            {pestana === 'personal' ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {campos.slice(0, 5).map(c => <div key={c.key}><span className={etiquetaInput}>{c.label}</span><p className="min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100">{ficha[c.key] || 'Sin datos registrados'}</p></div>)}
              </div>
            ) : pestana === 'laboral' ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {campos.slice(5).map(c => <div key={c.key}><span className={etiquetaInput}>{c.label}</span><p className="min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100">{ficha[c.key] || 'Sin datos registrados'}</p></div>)}
                <div className="sm:col-span-2"><span className={etiquetaInput}>Notas administrativas</span><p className="min-h-[64px] whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100">{ficha.notas_administrativas || 'Sin notas administrativas'}</p></div>
              </div>
            ) : pestana === 'objetivos' ? (
              <div className="space-y-2">
                {asignacionesVigilador.length ? asignacionesVigilador.map(a => <div key={a.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{a.objetivo_nombre || objetivos.find(o => o.id === a.id_objetivo)?.nombre || 'Objetivo'}</strong><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${a.activa ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{a.activa ? 'Activa' : 'Finalizada'}</span></div>
                  <p className="mt-1 text-xs text-slate-500">Desde {a.fecha_inicio} · {a.fecha_fin ? `Hasta ${a.fecha_fin}` : 'Sin fecha de fin'}</p>
                  {a.motivo_traslado && <p className="mt-1 text-xs text-slate-500">Motivo: {a.motivo_traslado}</p>}
                </div>) : <p className="text-sm text-slate-500">No hay asignaciones registradas.</p>}
              </div>
            ) : pestana === 'actividad' ? (
              <div className="space-y-4">
                <section><h4 className="mb-2 text-sm font-bold">Turnos recientes</h4>{turnosVigilador.length ? <div className="space-y-2">{turnosVigilador.map(t => <div key={t.id} className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"><div className="flex flex-wrap justify-between gap-2"><strong>{t.fecha} · {t.tipo}</strong><span>{t.estado}</span></div><p className="mt-1 text-slate-500">{objetivos.find(o => o.id === t.id_objetivo)?.nombre || 'Objetivo'} · {t.hora_inicio.slice(0,5)}–{t.hora_fin.slice(0,5)} · {t.horas_totales} h</p></div>)}</div> : <p className="text-xs text-slate-500">Sin turnos.</p>}</section>
                <section><h4 className="mb-2 text-sm font-bold">Novedades recientes</h4>{novedadesVigilador.length ? <div className="space-y-2">{novedadesVigilador.map(n => <div key={n.id} className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"><strong>{n.fecha} {n.hora} · {objetivos.find(o => o.id === n.id_objetivo)?.nombre || 'Objetivo'}</strong><p className="mt-1 whitespace-pre-line text-slate-600 dark:text-slate-300">{n.informe_novedades}</p></div>)}</div> : <p className="text-xs text-slate-500">Sin novedades.</p>}</section>
                <section><h4 className="mb-2 text-sm font-bold">Horas extra</h4>{extrasVigilador.length ? <div className="space-y-2">{extrasVigilador.map(h => <div key={h.id} className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"><strong>{h.fecha} · {h.estado}</strong><p className="mt-1 text-slate-500">{h.minutos_aprobados ?? h.minutos_solicitados} minutos · {h.motivo}</p></div>)}</div> : <p className="text-xs text-slate-500">Sin solicitudes de horas extra.</p>}</section>
                <section><h4 className="mb-2 text-sm font-bold">Cambios de turno</h4>{cambiosVigilador.length ? <div className="space-y-2">{cambiosVigilador.map(c => <div key={c.id} className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"><strong>{c.fecha_turno} · {c.estado}</strong><p className="mt-1 text-slate-500">{c.motivo || 'Sin motivo indicado'}</p></div>)}</div> : <p className="text-xs text-slate-500">Sin cambios de turno.</p>}</section>
                <p className="text-[11px] text-slate-500">Los turnos representan registros de grilla; no equivalen a un fichaje real de entrada y salida.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                <h4 className="font-bold">Documentación y vencimientos</h4>
                <p className="mt-2">El sistema todavía no tiene un módulo de documentos ni un repositorio de archivos para vigiladores. No se mostrarán documentos ficticios. La estructura de esta pestaña queda preparada para implementarlo con permisos y vencimientos.</p>
              </div>
            )}
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
            <div className="flex justify-end border-t border-slate-200 pt-3 dark:border-slate-800">
              <Boton type="button" variante="secundario" onClick={alCerrar}>Cerrar</Boton>
            </div>
          </div>
        )}
      </div>
    </Dialogo>
  )
}
