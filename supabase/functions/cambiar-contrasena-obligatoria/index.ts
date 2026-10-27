import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", ...corsHeaders },
})

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405)

  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "")
    if (!token) return json({ error: "No autenticado." }, 401)

    const url = Deno.env.get("SUPABASE_URL")!
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData.user) return json({ error: "Sesión no válida." }, 401)

    let body: { nueva_contrasena?: string }
    try { body = await req.json() } catch { return json({ error: "Datos inválidos." }, 400) }
    const nueva = body.nueva_contrasena || ""
    if (nueva.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres." }, 400)

    const { data: perfil, error: perfilError } = await admin.from("perfiles")
      .select("id,rol,debe_cambiar_contrasena,activo").eq("id", authData.user.id).single()
    if (perfilError || !perfil?.activo) return json({ error: "No se encontró un perfil activo." }, 403)
    if (!["vigilador", "administrador", "encargado_empresa"].includes(perfil.rol)) {
      return json({ error: "El cambio obligatorio no está habilitado para este tipo de cuenta." }, 403)
    }
    if (perfil.debe_cambiar_contrasena !== true) {
      return json({ error: "No hay un cambio obligatorio de contraseña pendiente." }, 409)
    }

    // Los vigiladores tienen una ficha con DNI; los administradores de empresa no.
    if (perfil.rol === "vigilador") {
      const { data: vigilador, error: vigiladorError } = await admin.from("vigiladores")
        .select("id").eq("id_usuario", authData.user.id).single()
      if (vigiladorError || !vigilador) {
        return json({ error: "No se encontró el registro operativo del vigilador." }, 409)
      }
      const { data: ficha, error: fichaError } = await admin.from("fichas_vigiladores")
        .select("dni").eq("id_vigilador", vigilador.id).maybeSingle()
      if (fichaError) return json({ error: "No se pudo validar la contraseña inicial." }, 500)
      const dniNormalizado = String(ficha?.dni || "").replace(/\D/g, "")
      if (dniNormalizado.length < 8) {
        return json({ error: "La ficha del vigilador no tiene un DNI válido. Contactá al administrador para corregirla." }, 409)
      }
      if (nueva === dniNormalizado) {
        return json({ error: "La nueva contraseña no puede ser el DNI. Elegí una contraseña personal." }, 400)
      }
    }

    const { error: updateAuthError } = await admin.auth.admin.updateUserById(authData.user.id, { password: nueva })
    if (updateAuthError) return json({ error: updateAuthError.message }, 400)

    const { error: updatePerfilError } = await admin.from("perfiles")
      .update({ debe_cambiar_contrasena: false }).eq("id", authData.user.id)
    if (updatePerfilError) {
      return json({ error: "La contraseña se actualizó, pero no se pudo cerrar el cambio obligatorio. Cerrá sesión y contactá al administrador para completar la recuperación de tu cuenta." }, 500)
    }

    return json({ ok: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Error interno." }, 500)
  }
})
