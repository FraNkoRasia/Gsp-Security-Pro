import React, { createContext, useContext, useState, useEffect } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import type { Usuario, RolUsuario } from '@/tipos'
import { supabase, hayConexionSupabase } from '@/servicios/supabase'

interface ContextoAutenticacionTipo {
  usuario: Usuario | null
  estaAutenticado: boolean
  cargando: boolean
  errorAuth: string | null
  iniciarSesion: (email: string, contrasena: string, recordarme: boolean) => Promise<{ exito: boolean; error?: string }>
  cerrarSesion: () => Promise<void>
  solicitarRecuperacion: (email: string) => Promise<{ exito: boolean; error?: string }>
  cambiarContrasena: (contrasenaActual: string, nuevaContrasena: string) => Promise<{ exito: boolean; error?: string }>
  cambiarContrasenaObligatoria: (nuevaContrasena: string) => Promise<{ exito: boolean; error?: string }>
  confirmarCambioContrasenaObligatorio: () => void
}

const ContextoAutenticacion = createContext<ContextoAutenticacionTipo | undefined>(undefined)

export const ProveedorAutenticacion: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [cargando, setCargando] = useState<boolean>(true)
  const [errorAuth, setErrorAuth] = useState<string | null>(null)

  const cargarPerfil = async (authUser: SupabaseUser) => {
    if (!supabase) return null

    const email = authUser.email || ''

    const { data: perfil, error: errorPerfil } = await supabase
      .from('perfiles')
      .select('id, id_empresa, nombre, apellido, telefono, rol, activo, debe_cambiar_contrasena, creado_en')
      .eq('id', authUser.id)
      .maybeSingle()

    if (errorPerfil) throw errorPerfil

    if (!perfil) {
      throw new Error('Tu usuario está autenticado, pero todavía no tiene un perfil habilitado en GSP Security Pro.')
    }

    if (!perfil.activo) {
      throw new Error('Tu usuario está desactivado. Contactá a la administración.')
    }

    let empresaNombre: string | null = null

    if (perfil.id_empresa) {
      const { data: empresa, error: errorEmpresa } = await supabase
        .from('empresas')
        .select('nombre, activa')
        .eq('id', perfil.id_empresa)
        .maybeSingle()

      if (errorEmpresa) throw errorEmpresa
      if (!empresa) {
        throw new Error('Cuenta suspendida. La empresa asociada no está disponible.')
      }

      if (!empresa.activa) {
        throw new Error('Cuenta suspendida. La empresa asociada está dada de baja.')
      }

      empresaNombre = empresa.nombre || null
    }

    return {
      id: perfil.id,
      email,
      nombre: perfil.nombre,
      apellido: perfil.apellido,
      rol: perfil.rol as RolUsuario,
      id_empresa: perfil.id_empresa,
      empresa_nombre: empresaNombre,
      telefono: perfil.telefono,
      activo: perfil.activo,
      debe_cambiar_contrasena: perfil.debe_cambiar_contrasena,
      creado_en: perfil.creado_en
    } satisfies Usuario
  }

  useEffect(() => {
    if (!hayConexionSupabase || !supabase) {
      setErrorAuth('Supabase no está configurado. Configurá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para iniciar sesión.')
      setCargando(false)
      return
    }

    let activo = true
    const clienteSupabase = supabase

    const inicializarSesion = async () => {
      try {
        const { data, error } = await clienteSupabase.auth.getSession()
        if (error) throw error

        if (data.session?.user && activo) {
          const perfil = await cargarPerfil(data.session.user)
          if (activo) setUsuario(perfil)
        }
      } catch (err) {
        console.error('Error al inicializar sesión:', err)
        if (activo) {
          setUsuario(null)
          setErrorAuth(err instanceof Error ? err.message : 'No se pudo cargar el perfil.')
        }
      } finally {
        if (activo) setCargando(false)
      }
    }

    inicializarSesion()

    const { data: listener } = clienteSupabase.auth.onAuthStateChange((evento, session) => {
      if (!activo) return

      // La sesión inicial ya se procesa mediante getSession() y el inicio
      // de sesión carga su perfil explícitamente. Consultarlo también ante
      // INITIAL_SESSION / SIGNED_IN duplicaba la lectura del perfil.
      // Los cambios del perfil se revalidan al volver a la app y periódicamente.
      if (evento === 'SIGNED_OUT') setUsuario(null)
    })

    // Revalidar el perfil al volver a la pestaña y periódicamente. Esto permite
    // reflejar un restablecimiento de contraseña hecho por administración sin
    // depender de que el vigilador cierre sesión manualmente.
    let revalidacionEnCurso = false
    const refrescarPerfilActual = async () => {
      if (revalidacionEnCurso) return
      revalidacionEnCurso = true
      try {
        // La revalidación periódica debe usar la sesión persistida localmente.
        // getUser() fuerza una consulta remota y puede devolver "Auth session missing"
        // durante una renovación; eso no significa que el usuario haya cerrado sesión.
        const { data, error } = await clienteSupabase.auth.getSession()
        if (error) throw error
        const authUser = data.session?.user
        if (!authUser) {
          // No borrar el usuario por una lectura momentánea sin sesión.
          // El cierre explícito se gestiona desde cerrarSesion / SIGNED_OUT.
          return
        }
        const perfil = await cargarPerfil(authUser)
        if (activo) {
          // No reemplazar el objeto del usuario si el perfil sigue igual:
          // hacerlo cada 30 segundos fuerza renders y recargas innecesarias
          // en todos los componentes que consumen el contexto.
          setUsuario(actual => {
            if (
              actual &&
              perfil &&
              actual.id === perfil.id &&
              actual.email === perfil.email &&
              actual.nombre === perfil.nombre &&
              actual.apellido === perfil.apellido &&
              actual.rol === perfil.rol &&
              actual.id_empresa === perfil.id_empresa &&
              actual.empresa_nombre === perfil.empresa_nombre &&
              actual.telefono === perfil.telefono &&
              actual.activo === perfil.activo &&
              actual.debe_cambiar_contrasena === perfil.debe_cambiar_contrasena &&
              actual.creado_en === perfil.creado_en
            ) return actual
            return perfil
          })
          setErrorAuth(null)
        }
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : 'No se pudo validar el perfil.'
        // getUser puede devolver Auth session missing durante una renovación o
        // una carrera temporal. No equivale a que el usuario haya cerrado sesión.
        const sesionTemporalmenteNoDisponible =
          /auth session missing|session missing|session_not_found|AuthSessionMissingError/i.test(mensaje)

        if (sesionTemporalmenteNoDisponible) {
          console.warn('Revalidación temporal sin sesión disponible; se conserva el acceso actual:', mensaje)
          return
        }

        console.error('Error al revalidar el perfil:', err)
        if (activo) {
          // No expulsar al usuario por fallos transitorios de consulta del perfil.
          // El cierre real se procesa mediante el evento SIGNED_OUT.
          setErrorAuth(mensaje)
        }
      } finally {
        revalidacionEnCurso = false
      }
    }

    const alVolverAFoco = () => { void refrescarPerfilActual() }
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') void refrescarPerfilActual()
    }
    const intervaloRevalidacion = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refrescarPerfilActual()
    }, 30_000)

    window.addEventListener('focus', alVolverAFoco)
    document.addEventListener('visibilitychange', alCambiarVisibilidad)

    return () => {
      activo = false
      window.clearInterval(intervaloRevalidacion)
      window.removeEventListener('focus', alVolverAFoco)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      listener.subscription.unsubscribe()
    }
  }, [])

  const iniciarSesion = async (email: string, contrasena: string, recordarme: boolean) => {
    setCargando(true)
    setErrorAuth(null)
    void recordarme

    try {
      const emailLimpio = email.trim().toLowerCase()

      if (hayConexionSupabase && supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailLimpio,
          password: contrasena
        })

        if (error) {
          setErrorAuth(error.message)
          return { exito: false, error: error.message }
        }

        if (!data.user) {
          const err = 'No se pudo obtener el usuario autenticado.'
          setErrorAuth(err)
          return { exito: false, error: err }
        }

        const usuarioAutenticado = await cargarPerfil(data.user)
        setUsuario(usuarioAutenticado)

        return { exito: true }
      }

      const err = 'Supabase no está configurado.'
      setErrorAuth(err)
      return { exito: false, error: err }
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : 'Error inesperado al conectar con el servicio'
      setErrorAuth(mensaje)
      return { exito: false, error: mensaje }
    } finally {
      setCargando(false)
    }
  }

  const cambiarContrasena = async (contrasenaActual: string, nuevaContrasena: string) => {
    try {
      if (!hayConexionSupabase || !supabase || !usuario) {
        return { exito: false, error: 'No hay una sesión activa.' }
      }

      const { error: errorReautenticacion } = await supabase.auth.signInWithPassword({
        email: usuario.email,
        password: contrasenaActual
      })

      if (errorReautenticacion) {
        return { exito: false, error: 'La contraseña actual no es correcta.' }
      }

      const { error } = await supabase.auth.updateUser({
        password: nuevaContrasena
      })

      if (error) {
        return { exito: false, error: error.message }
      }

      return { exito: true }
    } catch (err: unknown) {
      return {
        exito: false,
        error: err instanceof Error ? err.message : 'No se pudo actualizar la contraseña.'
      }
    }
  }

  const cambiarContrasenaObligatoria = async (nuevaContrasena: string) => {
    if (!hayConexionSupabase || !supabase || !usuario) {
      return { exito: false, error: 'No hay una sesión activa.' }
    }
    if (nuevaContrasena.length < 8) {
      return { exito: false, error: 'La nueva contraseña debe tener al menos 8 caracteres.' }
    }
    try {
      const { data, error } = await supabase.functions.invoke('cambiar-contrasena-obligatoria', {
        body: { nueva_contrasena: nuevaContrasena }
      })
      if (error || data?.error) {
        const contexto = (error as { context?: Response } | null)?.context
        let detalle = typeof data?.error === 'string' ? data.error : ''
        if (!detalle && contexto) {
          try { detalle = ((await contexto.clone().json()) as { error?: string }).error || '' } catch { /* respuesta sin JSON */ }
        }
        return { exito: false, error: detalle || error?.message || 'No se pudo actualizar la contraseña.' }
      }
      return { exito: true }
    } catch (err) {
      return { exito: false, error: err instanceof Error ? err.message : 'No se pudo actualizar la contraseña.' }
    }
  }

  const confirmarCambioContrasenaObligatorio = () => {
    setUsuario((actual) => actual ? { ...actual, debe_cambiar_contrasena: false } : actual)
  }

  const cerrarSesion = async () => {
    setCargando(true)
    try {
      if (hayConexionSupabase && supabase) {
        await supabase.auth.signOut()
      }
      setUsuario(null)
    } catch (err) {
      console.error('Error cerrando sesión:', err)
    } finally {
      setCargando(false)
    }
  }

  const solicitarRecuperacion = async (email: string) => {
    try {
      const emailLimpio = email.trim().toLowerCase()
      if (hayConexionSupabase && supabase) {
        const { error } = await supabase.auth.resetPasswordForEmail(emailLimpio, {
          redirectTo: window.location.origin + '/cambiar-contrasena'
        })
        if (error) return { exito: false, error: error.message }
      } else {
        const err = 'Supabase no está configurado.'
        return { exito: false, error: err }
      }
      return { exito: true }
    } catch (err: unknown) {
      return { exito: false, error: err instanceof Error ? err.message : 'Error al enviar recuperación' }
    }
  }

  return (
    <ContextoAutenticacion.Provider
      value={{
        usuario,
        estaAutenticado: Boolean(usuario),
        cargando,
        errorAuth,
        iniciarSesion,
        cerrarSesion,
        solicitarRecuperacion,
        cambiarContrasena,
        cambiarContrasenaObligatoria,
        confirmarCambioContrasenaObligatorio
      }}
    >
      {children}
    </ContextoAutenticacion.Provider>
  )
}

export function useAutenticacion(): ContextoAutenticacionTipo {
  const context = useContext(ContextoAutenticacion)
  if (!context) {
    throw new Error('useAutenticacion debe usarse dentro de un ProveedorAutenticacion')
  }
  return context
}
