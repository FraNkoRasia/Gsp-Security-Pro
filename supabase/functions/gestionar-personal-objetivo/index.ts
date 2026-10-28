import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } })
type Role = "encargado_empresa" | "supervisor"
const validRole = (v: unknown): v is Role => v === "encargado_empresa" || v === "supervisor"
const normDni = (v: unknown) => String(v ?? "").replace(/\D/g, "")

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405)
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "")
    if (!token) return json({ error: "No autenticado." }, 401)
    const url = Deno.env.get("SUPABASE_URL")
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!url || !key) return json({ error: "Configuración del servidor incompleta." }, 500)
    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: auth, error: authErr } = await db.auth.getUser(token)
    if (authErr || !auth.user) return json({ error: "Sesión no válida." }, 401)
    const { data: caller } = await db.from("perfiles").select("id,id_empresa,rol,activo").eq("id", auth.user.id).single()
    if (!caller?.activo || !["administrador", "super_administrador"].includes(caller.rol))
      return json({ error: "Solo administración puede gestionar encargados y supervisores." }, 403)

    const b = await req.json()
    const accion = String(b.accion || "listar")
    const rol: Role = validRole(b.rol) ? b.rol : "encargado_empresa"
    const idEmpresa = caller.rol === "super_administrador" ? String(b.id_empresa || "") : String(caller.id_empresa || "")
    if (caller.rol === "administrador" && b.id_empresa && b.id_empresa !== caller.id_empresa)
      return json({ error: "No puede gestionar personal de otra empresa." }, 403)
    if (!idEmpresa) return json({ error: "Falta la empresa." }, 400)
    const campoObjetivo = rol === "supervisor" ? "id_supervisor" : "id_encargado_empresa"
    const nombreRol = rol === "supervisor" ? "supervisor" : "encargado"

    if (accion === "listar") {
      const { data: perfiles, error } = await db.from("perfiles")
        .select("id,id_empresa,nombre,apellido,email,telefono,rol,activo,debe_cambiar_contrasena,creado_en")
        .eq("id_empresa", idEmpresa).eq("rol", rol).order("apellido")
      if (error) return json({ error: error.message }, 400)
      const { data: objetivos } = await db.from("objetivos").select("id,nombre,id_supervisor,id_encargado_empresa").eq("id_empresa", idEmpresa)
      const { data: cred } = await db.from("credenciales_personal_objetivo").select("id_usuario,dni").eq("id_empresa", idEmpresa)
      const byId = new Map((objetivos || []).map(o => [rol === "supervisor" ? o.id_supervisor : o.id_encargado_empresa, { id: o.id, nombre: o.nombre }]))
      const dniById = new Map((cred || []).map(c => [c.id_usuario, c.dni]))
      return json({ personal: (perfiles || []).map(p => ({ ...p, dni: dniById.get(p.id) || "", objetivo: byId.get(p.id) || null })) })
    }

    const id = String(b.id || "")
    if (accion === "crear") {
      const nombre = String(b.nombre || "").trim()
      const apellido = String(b.apellido || "").trim()
      const email = String(b.email || "").trim().toLowerCase()
      const telefono = String(b.telefono || "").trim() || null
      const dni = normDni(b.dni)
      const idObjetivo = String(b.id_objetivo || "")
      if (!nombre || !apellido || !email || !idObjetivo || dni.length < 8)
        return json({ error: "Completá nombre, apellido, correo, DNI y objetivo. El DNI debe tener al menos 8 dígitos." }, 400)
      const password = dni
      const { data: objetivo } = await db.from("objetivos").select("id,id_empresa,id_supervisor,id_encargado_empresa").eq("id", idObjetivo).eq("id_empresa", idEmpresa).single()
      if (!objetivo) return json({ error: "El objetivo seleccionado no pertenece a esta empresa." }, 400)
      if (objetivo[campoObjetivo] && objetivo[campoObjetivo] !== "") return json({ error: "Ese objetivo ya tiene una persona asignada en este rol." }, 409)
      const { data: created, error: createErr } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre, apellido } })
      if (createErr || !created.user) return json({ error: createErr?.message || "No se pudo crear la cuenta." }, 400)
      const uid = created.user.id
      const { error: profileErr } = await db.from("perfiles").update({
        id_empresa: idEmpresa, nombre, apellido, email, telefono, rol, activo: true, debe_cambiar_contrasena: true,
      }).eq("id", uid)
      if (profileErr) { await db.auth.admin.deleteUser(uid); return json({ error: profileErr.message }, 400) }
      const { error: credErr } = await db.from("credenciales_personal_objetivo").insert({ id_usuario: uid, id_empresa: idEmpresa, dni })
      if (credErr) { await db.auth.admin.deleteUser(uid); return json({ error: credErr.message }, 400) }
      const { error: assignErr } = await db.from("objetivos").update({ [campoObjetivo]: uid }).eq("id", idObjetivo).eq("id_empresa", idEmpresa)
      if (assignErr) { await db.auth.admin.deleteUser(uid); return json({ error: assignErr.message }, 400) }
      await db.from("auditoria").insert({ id_empresa: idEmpresa, id_usuario: caller.id, accion: "CREAR_PERSONAL_OBJETIVO", entidad: nombreRol, entidad_id: uid, detalle: { texto: "Creó cuenta con DNI como contraseña inicial y objetivo exclusivo" }, fecha_hora: new Date().toISOString() })
      return json({ ok: true, id: uid, debe_cambiar_contrasena: true })
    }

    if (!id) return json({ error: "Falta el identificador de la cuenta." }, 400)
    if (accion === "historial") {
      const { data: target } = await db.from("perfiles").select("id,id_empresa,rol").eq("id", id).eq("id_empresa", idEmpresa).single()
      if (!target || target.rol !== rol) return json({ error: "La cuenta no pertenece a esta empresa o no coincide con el rol." }, 404)
      const { data, error } = await db.from("auditoria").select("id,accion,entidad,detalle,fecha_hora").eq("id_empresa", idEmpresa).eq("entidad_id", id).order("fecha_hora", { ascending: false }).limit(100)
      if (error) return json({ error: error.message }, 400)
      return json({ historial: data || [] })
    }
    const { data: target } = await db.from("perfiles").select("id,id_empresa,rol,activo,debe_cambiar_contrasena").eq("id", id).eq("id_empresa", idEmpresa).single()
    if (!target || target.rol !== rol) return json({ error: "La cuenta no pertenece a esta empresa o no coincide con el rol." }, 404)

    if (accion === "restablecer_contrasena") {
      const { data: cred } = await db.from("credenciales_personal_objetivo").select("dni").eq("id_usuario", id).eq("id_empresa", idEmpresa).single()
      const dni = normDni(cred?.dni)
      if (dni.length < 8) return json({ error: "No hay un DNI válido de al menos 8 dígitos guardado para esta cuenta." }, 409)
      const { error: flagErr } = await db.from("perfiles").update({ debe_cambiar_contrasena: true }).eq("id", id)
      if (flagErr) return json({ error: flagErr.message }, 500)
      const { error: passErr } = await db.auth.admin.updateUserById(id, { password: dni })
      if (passErr) return json({ error: passErr.message }, 400)
      await db.from("auditoria").insert({ id_empresa: idEmpresa, id_usuario: caller.id, accion: "RESTABLECER_CONTRASENA_PERSONAL", entidad: nombreRol, entidad_id: id, detalle: { texto: "Restableció la contraseña al DNI; cambio obligatorio al próximo ingreso" }, fecha_hora: new Date().toISOString() })
      return json({ ok: true })
    }

    if (accion === "editar") {
      const nombre = String(b.nombre || "").trim(), apellido = String(b.apellido || "").trim()
      const email = String(b.email || "").trim().toLowerCase(), telefono = String(b.telefono || "").trim() || null
      const dni = normDni(b.dni)
      const idObjetivo = String(b.id_objetivo || "")
      if (!nombre || !apellido || !email || dni.length < 8 || !idObjetivo) return json({ error: "Nombre, apellido, correo, DNI y objetivo son obligatorios." }, 400)
      const { data: objetivo } = await db.from("objetivos").select("id,id_empresa,id_supervisor,id_encargado_empresa").eq("id", idObjetivo).eq("id_empresa", idEmpresa).single()
      if (!objetivo) return json({ error: "El objetivo seleccionado no pertenece a esta empresa." }, 400)
      if (objetivo[campoObjetivo] && objetivo[campoObjetivo] !== id) return json({ error: "Ese objetivo ya tiene una persona asignada en este rol." }, 409)
      const { data: credActual } = await db.from("credenciales_personal_objetivo").select("dni").eq("id_usuario", id).eq("id_empresa", idEmpresa).single()
      const dniAnterior = normDni(credActual?.dni)
      const cambiaDni = dni !== dniAnterior
      const authChanges: { email: string; email_confirm: boolean; password?: string } = { email, email_confirm: true }
      if (cambiaDni) authChanges.password = dni
      const { error: authUpdate } = await db.auth.admin.updateUserById(id, authChanges)
      if (authUpdate) return json({ error: authUpdate.message }, 400)
      const profileChanges: { nombre:string; apellido:string; email:string; telefono:string|null; debe_cambiar_contrasena?:boolean } = { nombre, apellido, email, telefono }
      if (cambiaDni) profileChanges.debe_cambiar_contrasena = true
      const { error: profileUpdate } = await db.from("perfiles").update(profileChanges).eq("id", id)
      if (profileUpdate) return json({ error: profileUpdate.message }, 400)
      const { error: credUpdate } = await db.from("credenciales_personal_objetivo").update({ dni, actualizado_en: new Date().toISOString() }).eq("id_usuario", id)
      if (credUpdate) return json({ error: credUpdate.message }, 400)
      const { error: unassignErr } = await db.from("objetivos").update({ [campoObjetivo]: null }).eq("id_empresa", idEmpresa).eq(campoObjetivo, id)
      if (unassignErr) return json({ error: unassignErr.message }, 400)
      const { error: assignErr } = await db.from("objetivos").update({ [campoObjetivo]: id }).eq("id", idObjetivo).eq("id_empresa", idEmpresa)
      if (assignErr) return json({ error: assignErr.message }, 400)
      return json({ ok: true })
    }

    if (accion === "dar_baja" || accion === "reactivar") {
      const activo = accion === "reactivar"
      const { error } = await db.from("perfiles").update({ activo }).eq("id", id)
      if (error) return json({ error: error.message }, 400)
      if (!activo) await db.from("objetivos").update({ [campoObjetivo]: null }).eq("id_empresa", idEmpresa).eq(campoObjetivo, id)
      await db.from("auditoria").insert({ id_empresa: idEmpresa, id_usuario: caller.id, accion: activo ? "REACTIVAR_PERSONAL_OBJETIVO" : "DAR_BAJA_PERSONAL_OBJETIVO", entidad: nombreRol, entidad_id: id, detalle: { texto: activo ? "Reactivó cuenta" : "Dio de baja cuenta" }, fecha_hora: new Date().toISOString() })
      return json({ ok: true })
    }
    return json({ error: "Acción no reconocida." }, 400)
  } catch (error) {
    console.error("gestionar-personal-objetivo", error)
    return json({ error: error instanceof Error ? error.message : "Error interno." }, 500)
  }
})
