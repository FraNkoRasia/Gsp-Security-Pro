import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } })

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405)
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "")
    if (!token) return json({ error: "No autenticado." }, 401)
    const url = Deno.env.get("SUPABASE_URL")
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!url || !key) return json({ error: "Configuración del servidor incompleta." }, 500)
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: auth, error: authError } = await admin.auth.getUser(token)
    if (authError || !auth.user) return json({ error: "Sesión no válida." }, 401)
    const { data: caller, error: callerError } = await admin.from("perfiles").select("id,id_empresa,rol,activo").eq("id", auth.user.id).single()
    if (callerError || !caller?.activo || !["administrador", "super_administrador"].includes(caller.rol))
      return json({ error: "Solo un administrador activo puede gestionar encargados." }, 403)
    const body = await req.json()
    const accion = body.accion === "editar" ? "editar" : "crear"
    const nombre = String(body.nombre || "").trim()
    const apellido = String(body.apellido || "").trim()
    const email = String(body.email || "").trim().toLowerCase()
    const telefono = String(body.telefono || "").trim() || null
    const idEmpresa = caller.rol === "super_administrador" ? String(body.id_empresa || "") : caller.id_empresa
    if (!nombre || !apellido || !email || !idEmpresa) return json({ error: "Nombre, apellido, correo y empresa son obligatorios." }, 400)
    if (caller.rol === "administrador" && body.id_empresa && body.id_empresa !== caller.id_empresa)
      return json({ error: "No puede gestionar cuentas de otra empresa." }, 403)

    if (accion === "editar") {
      const id = String(body.id || "")
      if (!id) return json({ error: "Falta el encargado que se desea editar." }, 400)
      const { data: perfil, error: perfilError } = await admin.from("perfiles").select("id,id_empresa,rol").eq("id", id).single()
      if (perfilError || !perfil || perfil.rol !== "encargado_empresa" || perfil.id_empresa !== idEmpresa)
        return json({ error: "El encargado no pertenece a esta empresa o no existe." }, 404)
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(id, { email })
      if (authUpdateError) return json({ error: authUpdateError.message }, 400)
      const { data, error } = await admin.from("perfiles").update({ nombre, apellido, email, telefono }).eq("id", id).select("id,nombre,apellido,email,telefono,rol,id_empresa,activo").single()
      if (error) return json({ error: error.message }, 400)
      return json({ encargado: data })
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: crypto.randomUUID() + "Aa1!",
      email_confirm: true,
    })
    if (createError || !created.user) return json({ error: createError?.message || "No se pudo crear la cuenta." }, 400)
    const id = created.user.id
    const { data, error } = await admin.from("perfiles").insert({
      id, id_empresa: idEmpresa, nombre, apellido, email, telefono,
      rol: "encargado_empresa", activo: true, debe_cambiar_contrasena: true,
    }).select("id,nombre,apellido,email,telefono,rol,id_empresa,activo").single()
    if (error) {
      await admin.auth.admin.deleteUser(id)
      return json({ error: error.message }, 400)
    }
    return json({ encargado: data, debe_cambiar_contrasena: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Error interno." }, 500)
  }
})
