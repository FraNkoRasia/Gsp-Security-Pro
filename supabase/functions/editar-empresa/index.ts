import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type Body = {
  empresa_id: string
  nombre: string
  cuit?: string
  direccion?: string
  art_aseguradora?: string
  accion?: string
  admin_dni?: string
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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const admin = createClient(supabaseUrl, serviceRoleKey, {
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
    return json({ error: "Solo el Super Administrador puede editar empresas." }, 403)
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: "Datos inválidos." }, 400)
  }

  if (!body.empresa_id) return json({ error: "empresa_id es obligatorio." }, 400)

  if (body.accion === "registrar_dni_administrador") {
    const dni = String(body.admin_dni || "").replace(/\D/g, "")
    if (!/^\d{7,8}$/.test(dni)) return json({ error: "El DNI debe tener 7 u 8 números." }, 400)

    const { data: perfilAdmin, error: perfilError } = await admin
      .from("perfiles").select("id,id_empresa,rol")
      .eq("id_empresa", body.empresa_id).eq("rol", "administrador").maybeSingle()
    if (perfilError || !perfilAdmin) return json({ error: "No se encontró el administrador de esta empresa." }, 404)

    const { error: guardarError } = await admin.from("credenciales_administradores").upsert({
      id_usuario: perfilAdmin.id,
      id_empresa: body.empresa_id,
      dni,
      actualizado_en: new Date().toISOString(),
    }, { onConflict: "id_usuario" })
    if (guardarError) return json({ error: "No se pudo guardar el DNI de forma segura." }, 500)

    await admin.from("auditoria").insert({
      id_empresa: body.empresa_id,
      id_usuario: authData.user.id,
      accion: "REGISTRAR_DNI_ADMINISTRADOR",
      entidad: "Empresa",
      entidad_id: body.empresa_id,
      detalle: { texto: "Registró el DNI inicial del administrador para futuros restablecimientos" },
    })
    return json({ ok: true })
  }

  if (body.accion === "restablecer_contrasena_administrador") {
    const { data: empresaObjetivo, error: empresaObjetivoError } = await admin
      .from("empresas").select("id,nombre").eq("id", body.empresa_id).maybeSingle()
    if (empresaObjetivoError || !empresaObjetivo) return json({ error: "No se encontró la empresa." }, 404)

    const { data: perfilAdmin, error: perfilAdminError } = await admin
      .from("perfiles").select("id,id_empresa,rol,debe_cambiar_contrasena")
      .eq("id_empresa", body.empresa_id).eq("rol", "administrador").maybeSingle()
    if (perfilAdminError || !perfilAdmin) {
      return json({ error: "No se encontró una cuenta de administrador asociada a esta empresa." }, 404)
    }

    const { data: credencial, error: credencialError } = await admin
      .from("credenciales_administradores")
      .select("dni")
      .eq("id_usuario", perfilAdmin.id)
      .eq("id_empresa", body.empresa_id)
      .maybeSingle()

    if (credencialError || !credencial?.dni || !/^\d{7,8}$/.test(credencial.dni)) {
      return json({ error: "No hay un DNI guardado para este administrador. Esta cuenta necesita registrar su DNI una sola vez antes de poder restablecer la contraseña." }, 409)
    }
    const dni = credencial.dni

    const { error: activarCambioError } = await admin.from("perfiles")
      .update({ debe_cambiar_contrasena: true }).eq("id", perfilAdmin.id)
    if (activarCambioError) return json({ error: "No se pudo activar el cambio obligatorio; la contraseña no fue modificada." }, 500)

    const { error: passwordError } = await admin.auth.admin.updateUserById(perfilAdmin.id, { password: dni })
    if (passwordError) {
      const { error: rollbackError } = await admin.from("perfiles")
        .update({ debe_cambiar_contrasena: perfilAdmin.debe_cambiar_contrasena === true }).eq("id", perfilAdmin.id)
      if (rollbackError) console.error("No se pudo revertir la marca de cambio obligatorio:", rollbackError.message)
      return json({ error: "Supabase no aceptó el DNI como contraseña inicial. Revisá la política de contraseñas de Auth." }, 400)
    }

    await admin.from("auditoria").insert({
      id_empresa: body.empresa_id,
      id_usuario: authData.user.id,
      accion: "RESTABLECER_CONTRASENA_ADMINISTRADOR",
      entidad: "Empresa",
      entidad_id: body.empresa_id,
      detalle: { texto: "Restableció la contraseña del administrador de " + empresaObjetivo.nombre + " al DNI; cambio obligatorio al próximo ingreso" },
    })
    return json({ ok: true })
  }

  if (!body.nombre?.trim()) {
    return json({ error: "El nombre de la empresa es obligatorio." }, 400)
  }

  const { data: empresa, error: empresaError } = await admin
    .from("empresas")
    .update({
      nombre: body.nombre.trim(),
      cuit: body.cuit?.trim() || null,
      direccion: body.direccion?.trim() || null,
      art_aseguradora: body.art_aseguradora?.trim() || null,
    })
    .eq("id", body.empresa_id)
    .select("*")
    .maybeSingle()

  if (empresaError) {
    console.error("Error editando empresa:", empresaError)
    return json({ error: empresaError.message || "No se pudo actualizar la empresa." }, 400)
  }

  if (!empresa) return json({ error: "La empresa no existe." }, 404)

  await admin.from("auditoria").insert({
    id_empresa: empresa.id,
    id_usuario: authData.user.id,
    accion: "EDITAR_EMPRESA",
    entidad: "Empresa",
    entidad_id: empresa.id,
    detalle: { texto: "Modificó empresa " + empresa.nombre },
  })

  return json({ empresa })
})