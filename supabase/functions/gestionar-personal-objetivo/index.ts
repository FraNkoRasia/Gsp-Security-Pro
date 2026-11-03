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
      // Estas tres consultas son independientes: ejecutarlas en paralelo evita
      // sumar sus latencias en cada apertura de Supervisores/Encargados.
      const [perfilesResult, objetivosResult, credResult] = await Promise.all([
        db.from("perfiles")
          .select("id,id_empresa,nombre,apellido,email,telefono,rol,activo,debe_cambiar_contrasena,creado_en")
          .eq("id_empresa", idEmpresa).eq("rol", rol).order("apellido"),
        db.from("objetivos").select("id,nombre,id_supervisor,id_encargado_empresa").eq("id_empresa", idEmpresa),
        db.from("credenciales_personal_objetivo").select("id_usuario,dni").eq("id_empresa", idEmpresa),
      ])
      const error = perfilesResult.error || objetivosResult.error || credResult.error
      if (error) return json({ error: error.message }, 400)
      const perfiles = perfilesResult.data
      const objetivos = objetivosResult.data
      const cred = credResult.data
      const byId = new Map<string, { id: string; nombre: string }[]>()
      for (const objetivo of objetivos || []) {
        const idPersonal = rol === "supervisor" ? objetivo.id_supervisor : objetivo.id_encargado_empresa
        if (!idPersonal) continue
        const lista = byId.get(idPersonal) || []
        lista.push({ id: objetivo.id, nombre: objetivo.nombre })
        byId.set(idPersonal, lista)
      }
      const dniById = new Map((cred || []).map(c => [c.id_usuario, c.dni]))
      return json({ personal: (perfiles || []).map(p => {
        const asignados = byId.get(p.id) || []
        return { ...p, dni: dniById.get(p.id) || "", objetivos: asignados, objetivo: asignados[0] || null }
      }) })
    }

    const id = String(b.id || "")
    if (accion === "crear") {
      const nombre = String(b.nombre || "").trim()
      const apellido = String(b.apellido || "").trim()
      const email = String(b.email || "").trim().toLowerCase()
      const telefono = String(b.telefono || "").trim() || null
      const dni = normDni(b.dni)
      const idsObjetivos = rol === "supervisor"
        ? Array.from(new Set((Array.isArray(b.ids_objetivos) ? b.ids_objetivos : [b.id_objetivo]).map((v: unknown) => String(v)).filter(Boolean)))
        : [String(b.id_objetivo || "")].filter(Boolean)
      if (!nombre || !apellido || !email || idsObjetivos.length === 0 || dni.length < 8)
        return json({ error: "Completá nombre, apellido, correo, DNI y al menos un objetivo. El DNI debe tener al menos 8 dígitos." }, 400)
      const password = dni
      const { data: objetivosSeleccionados, error: objetivosError } = await db.from("objetivos")
        .select("id,id_empresa,id_supervisor,id_encargado_empresa,activo")
        .eq("id_empresa", idEmpresa).eq("activo", true).in("id", idsObjetivos)
      if (objetivosError) return json({ error: objetivosError.message }, 400)
      if (!objetivosSeleccionados || objetivosSeleccionados.length !== idsObjetivos.length)
        return json({ error: "Uno o más objetivos seleccionados no pertenecen a esta empresa." }, 400)
      const idsOcupantes = Array.from(new Set(objetivosSeleccionados.map(o => o[campoObjetivo]).filter((v): v is string => !!v)))
      if (idsOcupantes.length) {
        const { data: ocupantes, error: ocupantesError } = await db.from("perfiles").select("id,activo").in("id", idsOcupantes)
        if (ocupantesError) return json({ error: ocupantesError.message }, 400)
        const activos = new Set((ocupantes || []).filter(p => p.activo).map(p => p.id))
        if (objetivosSeleccionados.some(o => o[campoObjetivo] && activos.has(o[campoObjetivo])))
          return json({ error: "Uno de los objetivos seleccionados ya tiene un supervisor/encargado activo asignado." }, 409)
      }
      const { data: dniExistente } = await db.from("credenciales_personal_objetivo")
        .select("id_usuario").eq("id_empresa", idEmpresa).eq("dni", dni).maybeSingle()
      if (dniExistente) return json({ error: "Ya existe este DNI registrado en la empresa. Verificá el DNI ingresado o buscá la cuenta existente." }, 409)
      const { data: created, error: createErr } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre, apellido } })
      if (createErr || !created.user) return json({ error: createErr?.message || "No se pudo crear la cuenta." }, 400)
      const uid = created.user.id
      const { error: profileErr } = await db.from("perfiles").update({
        id_empresa: idEmpresa, nombre, apellido, email, telefono, rol, activo: true, debe_cambiar_contrasena: true,
      }).eq("id", uid)
      if (profileErr) { await db.auth.admin.deleteUser(uid); return json({ error: profileErr.message }, 400) }
      const { error: credErr } = await db.from("credenciales_personal_objetivo").insert({ id_usuario: uid, id_empresa: idEmpresa, dni })
      if (credErr) {
        await db.auth.admin.deleteUser(uid)
        if (credErr.code === "23505" || credErr.message.includes("credenciales_personal_objetivo_dni_empresa_unique")) {
          return json({ error: "Ya existe este DNI registrado en la empresa." }, 409)
        }
        return json({ error: credErr.message }, 400)
      }
      const asignacionesAplicadas: { id: string; anterior: string | null }[] = []
      for (const objetivo of objetivosSeleccionados) {
        const ocupante = objetivo[campoObjetivo] || null
        let query = db.from("objetivos").update({ [campoObjetivo]: uid }).eq("id", objetivo.id).eq("id_empresa", idEmpresa)
        query = ocupante ? query.eq(campoObjetivo, ocupante) : query.is(campoObjetivo, null)
        const { data: asignado, error: assignErr } = await query.select("id").maybeSingle()
        if (assignErr || !asignado) {
          for (const aplicado of asignacionesAplicadas.reverse()) {
            await db.from("objetivos").update({ [campoObjetivo]: aplicado.anterior }).eq("id", aplicado.id).eq(campoObjetivo, uid)
          }
          await db.auth.admin.deleteUser(uid)
          return json({ error: assignErr?.message || "El objetivo fue asignado a otra persona mientras se guardaba. Actualizá la lista e intentá nuevamente." }, 409)
        }
        asignacionesAplicadas.push({ id: objetivo.id, anterior: ocupante })
      }
      await db.from("auditoria").insert({ id_empresa: idEmpresa, id_usuario: caller.id, accion: "CREAR_PERSONAL_OBJETIVO", entidad: nombreRol, entidad_id: uid, detalle: { texto: rol === "supervisor" ? "Creó cuenta y asignó uno o más objetivos" : "Creó cuenta con DNI como contraseña inicial y objetivo exclusivo" }, fecha_hora: new Date().toISOString() })
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
      const idsObjetivos = rol === "supervisor"
        ? Array.from(new Set((Array.isArray(b.ids_objetivos) ? b.ids_objetivos : []).map((v: unknown) => String(v)).filter(Boolean)))
        : [String(b.id_objetivo || "")].filter(Boolean)
      if (!nombre || !apellido || !email || dni.length < 8 || idsObjetivos.length === 0)
        return json({ error: "Nombre, apellido, correo, DNI y al menos un objetivo son obligatorios." }, 400)
      const { data: objetivosSeleccionados, error: objetivosError } = await db.from("objetivos")
        .select("id,id_empresa,id_supervisor,id_encargado_empresa")
        .eq("id_empresa", idEmpresa).in("id", idsObjetivos)
      if (objetivosError) return json({ error: objetivosError.message }, 400)
      if (!objetivosSeleccionados || objetivosSeleccionados.length !== idsObjetivos.length)
        return json({ error: "Uno o más objetivos seleccionados no pertenecen a esta empresa." }, 400)
      const idsOcupantes = Array.from(new Set(objetivosSeleccionados.map(o => o[campoObjetivo]).filter((v): v is string => !!v && v !== id)))
      if (idsOcupantes.length) {
        const { data: ocupantes, error: ocupantesError } = await db.from("perfiles").select("id,activo").in("id", idsOcupantes)
        if (ocupantesError) return json({ error: ocupantesError.message }, 400)
        const activos = new Set((ocupantes || []).filter(p => p.activo).map(p => p.id))
        if (objetivosSeleccionados.some(o => o[campoObjetivo] && o[campoObjetivo] !== id && activos.has(o[campoObjetivo])))
          return json({ error: "Uno de los objetivos seleccionados ya tiene otra persona activa asignada en este rol." }, 409)
      }
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
      const { error: credUpdate } = await db.from("credenciales_personal_objetivo").upsert({ id_usuario: id, id_empresa: idEmpresa, dni, actualizado_en: new Date().toISOString() }, { onConflict: "id_usuario" })
      if (credUpdate) {
        if (credUpdate.code === "23505" || credUpdate.message.includes("credenciales_personal_objetivo_dni_empresa_unique")) {
          return json({ error: "Ya existe este DNI registrado en la empresa." }, 409)
        }
        return json({ error: credUpdate.message }, 400)
      }
      const { data: actuales, error: actualesError } = await db.from("objetivos").select("id").eq("id_empresa", idEmpresa).eq(campoObjetivo, id).eq("activo", true)
      if (actualesError) return json({ error: actualesError.message }, 400)
      const asignacionesAplicadas: { id: string; anterior: string | null }[] = []
      for (const objetivo of objetivosSeleccionados) {
        if (objetivo[campoObjetivo] === id) continue
        const ocupante = objetivo[campoObjetivo] || null
        let query = db.from("objetivos").update({ [campoObjetivo]: id }).eq("id", objetivo.id).eq("id_empresa", idEmpresa)
        query = ocupante ? query.eq(campoObjetivo, ocupante) : query.is(campoObjetivo, null)
        const { data: asignado, error: assignErr } = await query.select("id").maybeSingle()
        if (assignErr || !asignado) {
          for (const aplicado of asignacionesAplicadas.reverse()) {
            await db.from("objetivos").update({ [campoObjetivo]: aplicado.anterior }).eq("id", aplicado.id).eq(campoObjetivo, id)
          }
          return json({ error: assignErr?.message || "Uno de los objetivos fue asignado a otra persona. Actualizá la lista e intentá nuevamente." }, 409)
        }
        asignacionesAplicadas.push({ id: objetivo.id, anterior: ocupante })
      }
      const seleccionados = new Set(idsObjetivos)
      for (const actual of actuales || []) {
        if (seleccionados.has(actual.id)) continue
        const { error: unassignErr } = await db.from("objetivos").update({ [campoObjetivo]: null }).eq("id", actual.id).eq("id_empresa", idEmpresa).eq(campoObjetivo, id)
        if (unassignErr) {
          for (const aplicado of asignacionesAplicadas.reverse()) {
            await db.from("objetivos").update({ [campoObjetivo]: aplicado.anterior }).eq("id", aplicado.id).eq(campoObjetivo, id)
          }
          return json({ error: unassignErr.message }, 400)
        }
      }
      await db.from("auditoria").insert({ id_empresa: idEmpresa, id_usuario: caller.id, accion: "ASIGNAR_OBJETIVO_PERSONAL", entidad: nombreRol, entidad_id: id, detalle: { texto: "Actualizó los objetivos asignados: " + idsObjetivos.length }, fecha_hora: new Date().toISOString() })
      return json({ ok: true })
    }

    if (accion === "dar_baja" || accion === "reactivar") {
      const activo = accion === "reactivar"
      if (activo) {
        const { count, error: asignacionError } = await db.from("objetivos").select("id", { count: "exact", head: true })
          .eq("id_empresa", idEmpresa).eq(campoObjetivo, id).eq("activo", true)
        if (asignacionError) return json({ error: asignacionError.message }, 400)
        if (!count) return json({ error: "No se puede reactivar la cuenta porque no tiene ningún objetivo activo asignado. Editá la cuenta y asignale al menos un objetivo disponible antes de reactivarla." }, 409)
      }
      const { error } = await db.from("perfiles").update({ activo }).eq("id", id)
      if (error) return json({ error: error.message }, 400)
      // Se conserva la relación con los objetivos al dar de baja para que el perfil
      // siga apareciendo en Inactivos y pueda reactivarse con sus asignaciones.
      // Si otro supervisor ocupa luego ese objetivo, la asignación anterior se reemplaza.
      await db.from("auditoria").insert({ id_empresa: idEmpresa, id_usuario: caller.id, accion: activo ? "REACTIVAR_PERSONAL_OBJETIVO" : "DAR_BAJA_PERSONAL_OBJETIVO", entidad: nombreRol, entidad_id: id, detalle: { texto: activo ? "Reactivó cuenta" : "Dio de baja cuenta" }, fecha_hora: new Date().toISOString() })
      return json({ ok: true })
    }
    return json({ error: "Acción no reconocida." }, 400)
  } catch (error) {
    console.error("gestionar-personal-objetivo", error)
    return json({ error: error instanceof Error ? error.message : "Error interno." }, 500)
  }
})
