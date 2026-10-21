import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type Body = {
  empresa_id: string
  nombre: string
  cuit?: string
  direccion?: string
  art_aseguradora?: string
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

  if (!body.empresa_id || !body.nombre?.trim()) {
    return json({ error: "empresa_id y nombre son obligatorios." }, 400)
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