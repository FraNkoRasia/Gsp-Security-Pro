import React, { useState } from 'react'
import { HelpCircle, Key, Smartphone, Clock, BookOpen, ChevronDown, ChevronUp } from 'lucide-react'
import { Dialogo } from '@/componentes/ui/dialogo'

interface PropiedadesVistaAyuda {
  abierto: boolean
  alCerrar: () => void
}

export const VistaAyuda: React.FC<PropiedadesVistaAyuda> = ({ abierto, alCerrar }) => {
  const [seccionAbierta, setSeccionAbierta] = useState<string | null>('inicio-sesion')

  const alternar = (id: string) => {
    setSeccionAbierta(seccionAbierta === id ? null : id)
  }

  const preguntasFrecuentes = [
    {
      id: 'inicio-sesion',
      icono: <Key className="w-4 h-4 text-blue-400" />,
      titulo: '¿Cómo inicio sesión en el sistema?',
      contenido:
        'Tu cuenta es creada por el administrador o supervisor de tu empresa. Ingresá el correo electrónico corporativo o personal registrado y la contraseña que te fue provista. Si es tu primer ingreso, el sistema te solicitará establecer una contraseña definitiva.'
    },
    {
      id: 'recuperacion',
      icono: <Key className="w-4 h-4 text-amber-400" />,
      titulo: '¿Cómo recupero mi contraseña?',
      contenido:
        'Si no podés ingresar, comunicate con el administrador o supervisor de tu empresa para que restablezca tu contraseña. La aplicación no cuenta con un botón de recuperación automática en la pantalla de inicio.'
    },
    {
      id: 'instalacion',
      icono: <Smartphone className="w-4 h-4 text-emerald-400" />,
      titulo: '¿Cómo instalo la PWA en mi teléfono?',
      contenido:
        'Debajo del formulario de ingreso presioná "Instalar app". En Android podés confirmar la instalación directamente o desde el menú de Chrome seleccionando "Agregar a la pantalla principal". En iPhone/iPad abrí la web en Safari, tocá Compartir y elegí "Agregar a pantalla de inicio".'
    },
    {
      id: 'turnos',
      icono: <Clock className="w-4 h-4 text-purple-400" />,
      titulo: '¿Cómo se registran los turnos y el cálculo de horas?',
      contenido:
        'Los turnos son diagramados por la administración en la grilla mensual. El sistema calcula de forma automática la nocturnidad, cruces de medianoche, domingos, feriados nacionales/provinciales y horas extra con una única fuente de verdad matemática.'
    },
    {
      id: 'novedades',
      icono: <BookOpen className="w-4 h-4 text-sky-400" />,
      titulo: '¿Qué es el Libro Digital de Novedades?',
      contenido:
        'Es el registro operativo inmutable de cada guardia. El vigilador registra elementos a cargo, hora, objetivo, novedades y novedades extraordinarias. Las correcciones importantes conservan trazabilidad y auditoría de usuario y fecha.'
    }
  ]

  return (
    <Dialogo
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Centro de Ayuda y Soporte"
      subtitulo="Guía operativa para administradores, supervisores y vigiladores de GSP Security Pro."
      icono={<HelpCircle className="w-5 h-5 text-blue-400" />}
      tamano="grande"
    >
      <div className="space-y-3">
        {preguntasFrecuentes.map((item) => {
          const estaAbierto = seccionAbierta === item.id
          return (
            <div
              key={item.id}
              className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden transition-all"
            >
              <button
                type="button"
                onClick={() => alternar(item.id)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-900/50 transition-colors cursor-pointer select-none"
              >
                <div className="flex items-center gap-3 pr-2">
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 shrink-0">
                    {item.icono}
                  </div>
                  <span className="text-sm font-semibold text-white">{item.titulo}</span>
                </div>
                {estaAbierto ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>

              {estaAbierto && (
                <div className="px-4 pb-4 pt-1 text-xs text-slate-300 leading-relaxed border-t border-slate-900/80">
                  {item.contenido}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Dialogo>
  )
}
