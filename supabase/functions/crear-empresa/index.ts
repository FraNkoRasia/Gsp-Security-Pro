import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type Body = {
  nombre: string
  cuit?: string
  direccion?: string
  art_aseguradora?: string
  admin_dni: string
  admin_nombre: string
  admin_apellido: string
  admin_email: string
  admin_telefono?: string
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  })

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405)

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return json({ error: "No autenticado." }, 401)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: authData, error: authError } = await admin.auth.getUser(token)
  if (authError || !authData.user) return json({ error: "Sesión no válida." }, 401)

  const { data: caller, error: callerError } = await admin
    .from("perfiles")
    .select("id,rol,activo")
    .eq("id", authData.user.id)
    .single()

  if (callerError || caller?.rol !== "super_administrador" || !caller.activo) {
    return json({ error: "Solo el Super Administrador puede crear empresas y administradores." }, 403)
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: "Datos inválidos." }, 400)
  }

  const nombre = body.nombre?.trim()
  const adminNombre = body.admin_nombre?.trim()
  const adminApellido = body.admin_apellido?.trim()
  const email = body.admin_email?.trim().toLowerCase()
  const dni = body.admin_dni?.replace(/\D/g, "") || ""

  if (!nombre || !adminNombre || !adminApellido || !email || !dni) {
    return json({ error: "Empresa, nombre, apellido, email y DNI son obligatorios." }, 400)
  }

  if (!/^\d{7,8}$/.test(dni)) {
    return json({ error: "El DNI debe tener 7 u 8 números." }, 400)
  }

  const { data: empresa, error: empresaError } = await admin
    .from("empresas")
    .insert({
      nombre,
      cuit: body.cuit?.trim() || null,
      direccion: body.direccion?.trim() || null,
      art_aseguradora: body.art_aseguradora?.trim() || null,
      activa: true,
    })
    .select("*")
    .single()

  if (empresaError || !empresa) {
    return json({ error: empresaError?.message || "No se pudo crear la empresa." }, 400)
  }

  const { data: nuevoUsuario, error: usuarioError } = await admin.auth.admin.createUser({
    email,
    password: dni,
    email_confirm: true,
  })

  if (usuarioError || !nuevoUsuario.user) {
    await admin.from("empresas").delete().eq("id", empresa.id)
    return json({ error: usuarioError?.message || "No se pudo crear la cuenta administradora." }, 400)
  }

  const { error: perfilError } = await admin
    .from("perfiles")
    .upsert({
      id: nuevoUsuario.user.id,
      id_empresa: empresa.id,
      nombre: adminNombre,
      apellido: adminApellido,
      telefono: body.admin_telefono?.trim() || null,
      rol: "administrador",
      activo: true,
      debe_cambiar_contrasena: true,
    }, { onConflict: "id" })

  if (perfilError) {
    await admin.auth.admin.deleteUser(nuevoUsuario.user.id)
    await admin.from("empresas").delete().eq("id", empresa.id)
    return json({ error: perfilError.message }, 400)
  }

  await admin.from("auditoria").insert({
    id_empresa: empresa.id,
    id_usuario: authData.user.id,
    accion: "CREAR_EMPRESA",
    entidad: "Empresa",
    entidad_id: empresa.id,
    detalle: { texto: "Creó empresa y cuenta administradora " + email },
  })

  return json({
    empresa,
    administrador: {
      id: nuevoUsuario.user.id,
      email,
      nombre: adminNombre,
      apellido: adminApellido,
    },
  })
})