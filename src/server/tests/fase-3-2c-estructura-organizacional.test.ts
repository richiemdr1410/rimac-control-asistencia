import assert from "node:assert";
import { getPool } from "../../db/index.js";

const BASE_URL = "http://127.0.0.1:3000";

interface LoginResult {
  cookie: string;
  sid: string;
  csrf: string;
  usuario: any;
}

async function loginUser(username: string, pass: string): Promise<LoginResult> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identificador: username, password: pass }),
  });

  const body = (await res.json()) as any;
  assert.strictEqual(res.status, 200, `Login fallido para ${username}: ${JSON.stringify(body)}`);
  assert.strictEqual(body.exito, true);

  const rawCookie = res.headers.get("set-cookie") || "";
  const match = rawCookie.match(/sid=([^;]+)/);
  const sid = match ? match[1] : body.datos.sesion_id;

  return {
    cookie: rawCookie,
    sid,
    csrf: body.datos.token_csrf || body.datos.csrf_token,
    usuario: body.datos.usuario,
  };
}

async function runFase32cSuite() {
  console.log("=== INICIO DE SUITE DE PRUEBAS FASE 3.2C ===");
  console.log("=== ADMINISTRACIÓN DE ESTRUCTURA ORGANIZACIONAL, EMPLEADOS, HORARIOS Y JEFATURAS ===");

  let passCount = 0;
  let failCount = 0;

  async function test(num: number, desc: string, fn: () => Promise<void>) {
    try {
      await fn();
      passCount++;
      console.log(`[PASS] Test ${num}: ${desc}`);
    } catch (err: any) {
      failCount++;
      console.error(`[FAIL] Test ${num}: ${desc} -> Error: ${err.message}`);
    }
  }

  // 0. Autenticación de actores
  const admin = await loginUser("admin", "PassSegura_2026!*");
  const th = await loginUser("talento_humano", "PassSegura_2026!*");
  const empleado = await loginUser("empleado", "PassSegura_2026!*");
  const supervisor = await loginUser("supervisor_seg", "PassSegura_2026!*");

  const pool = getPool();
  const timestampUnico = Date.now();

  let deptoCreado: any = null;
  let depto2Creado: any = null;
  let puestoCreado: any = null;
  let puesto2Creado: any = null;
  let empleadoCreado: any = null;
  let horarioCreado: any = null;

  // 1. TH crea departamento
  await test(1, "TH crea departamento (POST /api/departamentos)", async () => {
    const res = await fetch(`${BASE_URL}/api/departamentos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        codigo: `DEP_${timestampUnico}`.slice(0, 15),
        nombre: `Depto QA ${timestampUnico}`,
        activo: true,
      }),
    });
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.ok(body.datos.id);
    deptoCreado = body.datos;
  });

  // 2. TH crea puesto
  await test(2, "TH crea puesto perteneciente a departamento (POST /api/puestos)", async () => {
    const res = await fetch(`${BASE_URL}/api/puestos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        departamento_id: deptoCreado.id,
        codigo: `PST_${timestampUnico}`.slice(0, 15),
        nombre: `Especialista QA ${timestampUnico}`,
        activo: true,
      }),
    });
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.ok(body.datos.id);
    puestoCreado = body.datos;
  });

  // 3. No permite puesto/departamento inconsistente
  await test(3, "No permite asociar empleado a puesto perteneciente a otro departamento", async () => {
    // Creamos segundo departamento y segundo puesto
    const resDepto2 = await fetch(`${BASE_URL}/api/departamentos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        codigo: `DEP2_${timestampUnico}`.slice(0, 15),
        nombre: `Depto Ventas ${timestampUnico}`,
        activo: true,
      }),
    });
    const bodyDepto2 = await resDepto2.json();
    depto2Creado = bodyDepto2.datos;

    // Intentar crear empleado con depto2Creado pero puestoCreado (que pertenece a deptoCreado)
    const resInconsistente = await fetch(`${BASE_URL}/api/empleados`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        cedula: `CED_INC_${timestampUnico}`.slice(0, 20),
        nombre_completo: "Inconsistente QA",
        departamento_id: depto2Creado.id,
        puesto_id: puestoCreado.id, // Perteneciente al depto 1
      }),
    });

    assert.strictEqual(resInconsistente.status, 400);
    const bodyInc = await resInconsistente.json();
    assert.strictEqual(bodyInc.exito, false);
    assert.strictEqual(bodyInc.error.codigo, "PUESTO_DEPARTAMENTO_INCONSISTENTE");
  });

  // 4. TH crea empleado
  await test(4, "TH crea empleado correctamente con sus datos organizacionales", async () => {
    const res = await fetch(`${BASE_URL}/api/empleados`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        cedula: `CED_${timestampUnico}`.slice(0, 20),
        nombre_completo: `Juan Perez QA ${timestampUnico}`,
        correo_laboral: `juan.perez.${timestampUnico}@rimac.cr`,
        telefono: "+506 8888-0000",
        departamento_id: deptoCreado.id,
        puesto_id: puestoCreado.id,
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.ok(body.datos.id);
    assert.strictEqual(body.datos.estado, "ACTIVO");
    empleadoCreado = body.datos;
  });

  // 5. Empleado puede existir sin usuario
  await test(5, "Empleado puede existir sin usuario ('Sin acceso al sistema')", async () => {
    const res = await fetch(`${BASE_URL}/api/empleados/${empleadoCreado.id}`, {
      headers: {
        "x-session-id": th.sid,
        Cookie: th.cookie,
      },
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.tiene_usuario, false);
    assert.strictEqual(body.datos.usuario, null);
  });

  // 6. TH asigna horario
  await test(6, "TH asigna horario vigente a colaborador", async () => {
    // Horario regular del seed
    const resHorarios = await fetch(`${BASE_URL}/api/horarios`, {
      headers: {
        "x-session-id": th.sid,
        Cookie: th.cookie,
      },
    });
    const bodyH = await resHorarios.json();
    const horarioBase = bodyH.datos[0];

    const res = await fetch(`${BASE_URL}/api/empleados/${empleadoCreado.id}/horarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        horario_id: horarioBase.id,
        fecha_inicio: "2026-01-01",
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.ok(body.datos.id);
  });

  // 7. Historial de horario se conserva
  await test(7, "Cambio de horario conserva historial y cierra vigencia anterior", async () => {
    // Crear un segundo horario
    const resCrearH = await fetch(`${BASE_URL}/api/horarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        codigo: `H_${timestampUnico}`.slice(0, 15),
        nombre: `Horario Especial ${timestampUnico}`,
        tolerancia_entrada_minutos: 10,
        minutos_semanales_referencia: 2400,
        minutos_desayuno_max: 15,
        minutos_almuerzo_max: 45,
        minutos_cafe_max: 15,
        detalles_dia: [
          { dia_semana: 1, es_laborable: true, hora_entrada: "07:00", hora_salida: "16:00", cruza_medianoche: false, minutos_esperados: 480 },
          { dia_semana: 2, es_laborable: true, hora_entrada: "07:00", hora_salida: "16:00", cruza_medianoche: false, minutos_esperados: 480 },
          { dia_semana: 3, es_laborable: true, hora_entrada: "07:00", hora_salida: "16:00", cruza_medianoche: false, minutos_esperados: 480 },
          { dia_semana: 4, es_laborable: true, hora_entrada: "07:00", hora_salida: "16:00", cruza_medianoche: false, minutos_esperados: 480 },
          { dia_semana: 5, es_laborable: true, hora_entrada: "07:00", hora_salida: "16:00", cruza_medianoche: false, minutos_esperados: 480 },
          { dia_semana: 6, es_laborable: false, minutos_esperados: 0, cruza_medianoche: false },
          { dia_semana: 7, es_laborable: false, minutos_esperados: 0, cruza_medianoche: false },
        ],
      }),
    });
    const bodyH2 = await resCrearH.json();
    horarioCreado = bodyH2.datos;

    // Asignar el nuevo horario desde el 2026-06-01
    const resAsig2 = await fetch(`${BASE_URL}/api/empleados/${empleadoCreado.id}/horarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        horario_id: horarioCreado.id,
        fecha_inicio: "2026-06-01",
      }),
    });
    assert.strictEqual(resAsig2.status, 201);

    // Consultar historial
    const resHist = await fetch(`${BASE_URL}/api/empleados/${empleadoCreado.id}/horarios`, {
      headers: {
        "x-session-id": th.sid,
        Cookie: th.cookie,
      },
    });
    assert.strictEqual(resHist.status, 200);
    const bodyHist = await resHist.json();
    assert.strictEqual(bodyHist.exito, true);
    assert.strictEqual(bodyHist.datos.length, 2);

    const asignacionAntigua = bodyHist.datos.find((a: any) => a.fecha_inicio === "2026-01-01");
    const asignacionNueva = bodyHist.datos.find((a: any) => a.fecha_inicio === "2026-06-01");

    assert.ok(asignacionAntigua);
    assert.strictEqual(asignacionAntigua.fecha_fin, "2026-05-31", "La vigencia anterior debe haberse cerrado al día anterior");
    assert.ok(asignacionNueva);
    assert.ok(!asignacionNueva.fecha_fin, "La nueva vigencia no debe tener fecha_fin");
  });

  // 8. No permite horarios solapados
  await test(8, "No permite asignación de horarios solapados con fecha previa a una existente futura", async () => {
    // Intentar asignar un horario con fecha_inicio 2026-05-01 (cuando ya existe una asignación desde 2026-06-01)
    const resSolape = await fetch(`${BASE_URL}/api/empleados/${empleadoCreado.id}/horarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        horario_id: horarioCreado.id,
        fecha_inicio: "2026-05-01",
      }),
    });

    assert.strictEqual(resSolape.status, 409);
    const bodySolape = await resSolape.json();
    assert.strictEqual(bodySolape.exito, false);
    assert.strictEqual(bodySolape.error.codigo, "SOLAPAMIENTO_HORARIO");
  });

  // 9. TH asigna jefatura
  await test(9, "TH asigna jefatura directa a colaborador", async () => {
    // Asignar Andrea (talento_humano empleado_id) como jefatura de empleadoCreado
    const andreaId = th.usuario.empleado_id;

    const res = await fetch(`${BASE_URL}/api/empleados/${empleadoCreado.id}/jefatura`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        jefatura_empleado_id: andreaId,
        fecha_inicio: "2026-01-01",
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.jefatura_empleado_id, andreaId);
  });

  // 10. No permite autojefatura
  await test(10, "No permite autojefatura (empleado === jefatura)", async () => {
    const res = await fetch(`${BASE_URL}/api/empleados/${empleadoCreado.id}/jefatura`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        jefatura_empleado_id: empleadoCreado.id,
        fecha_inicio: "2026-01-01",
      }),
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.exito, false);
    assert.strictEqual(body.error.codigo, "AUTOJEFATURA_NO_PERMITIDA");
  });

  // 11. No permite A→B→A
  await test(11, "No permite relación circular de jefatura A→B→A", async () => {
    // Actualmente Andrea es jefa de empleadoCreado.
    // Si intentamos hacer que empleadoCreado sea jefe de Andrea:
    const andreaId = th.usuario.empleado_id;

    const res = await fetch(`${BASE_URL}/api/empleados/${andreaId}/jefatura`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        jefatura_empleado_id: empleadoCreado.id,
        fecha_inicio: "2026-01-01",
      }),
    });

    assert.strictEqual(res.status, 409);
    const body = await res.json();
    assert.strictEqual(body.exito, false);
    assert.strictEqual(body.error.codigo, "CICLO_JERARQUICO_DETECTADO");
  });

  // 12. No permite dos jefaturas simultáneas (cierre automático de anterior)
  await test(12, "No permite dos jefaturas simultáneas (cierre de vigencia previa)", async () => {
    const robertoId = supervisor.usuario.empleado_id;

    // Cambiar jefatura de empleadoCreado hacia Roberto desde 2026-07-01
    const res = await fetch(`${BASE_URL}/api/empleados/${empleadoCreado.id}/jefatura`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        jefatura_empleado_id: robertoId,
        fecha_inicio: "2026-07-01",
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.jefatura_empleado_id, robertoId);
  });

  // 13. Cambio de jefatura conserva historia
  await test(13, "Cambio de jefatura conserva historial íntegro", async () => {
    const res = await fetch(`${BASE_URL}/api/empleados/${empleadoCreado.id}/jefatura`, {
      headers: {
        "x-session-id": th.sid,
        Cookie: th.cookie,
      },
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.historial.length, 2);

    const asigAntigua = body.datos.historial.find((h: any) => h.fecha_inicio === "2026-01-01");
    assert.ok(asigAntigua);
    assert.strictEqual(asigAntigua.fecha_fin, "2026-06-30");

    const asigNueva = body.datos.historial.find((h: any) => h.fecha_inicio === "2026-07-01");
    assert.ok(asigNueva);
    assert.strictEqual(asigNueva.fecha_fin, null);
  });

  // 14 y 15. Integración Inmediata con ABAC: Roberto obtiene alcance y Andrea pierde jefatura directa
  await test(14, "Nueva jefatura obtiene alcance ABAC inmediato sobre solicitudes del colaborador", async () => {
    // 14.1 Asignar jefatura de Carlos (usuario 'empleado') a Roberto (supervisor) desde hoy
    const fechaHoy = new Date().toISOString().split("T")[0];
    const robertoId = supervisor.usuario.empleado_id;
    const carlosId = empleado.usuario.empleado_id;

    const resCambioJefe = await fetch(`${BASE_URL}/api/empleados/${carlosId}/jefatura`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        jefatura_empleado_id: robertoId,
        fecha_inicio: fechaHoy,
      }),
    });
    assert.strictEqual(resCambioJefe.status, 201);

    // 14.2 Carlos crea una nueva solicitud personal
    const resSol = await fetch(`${BASE_URL}/api/solicitudes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": empleado.sid,
        "x-csrf-token": empleado.csrf,
        Cookie: empleado.cookie,
      },
      body: JSON.stringify({
        tipo_solicitud: "PERMISO_CON_GOCE",
        fecha_inicio: fechaHoy,
        fecha_fin: fechaHoy,
        motivo: `Solicitud ABAC Test ${timestampUnico}`,
      }),
    });
    assert.strictEqual(resSol.status, 201);
    const bodySol = await resSol.json();
    const solicitudId = bodySol.datos.id;

    // 14.3 Roberto consulta su bandeja de pendientes y ve la solicitud de Carlos
    const resBandejaRoberto = await fetch(`${BASE_URL}/api/solicitudes/pendientes`, {
      headers: {
        "x-session-id": supervisor.sid,
        Cookie: supervisor.cookie,
      },
    });
    assert.strictEqual(resBandejaRoberto.status, 200);
    const bodyBandejaRoberto = await resBandejaRoberto.json();
    const encontrada = bodyBandejaRoberto.datos.some((s: any) => s.id === solicitudId);
    assert.ok(encontrada, "Roberto debe ver la solicitud de Carlos como su nuevo jefe directo");
  });

  await test(15, "Jefatura anterior pierde alcance ABAC de jefatura directa conforme a vigencia", async () => {
    // Andrea intentando aprobar la solicitud de Carlos como JEFATURA_DIRECTA es rechazada porque ya no es su jefatura directa
    const fechaHoy = new Date().toISOString().split("T")[0];
    const andreaId = th.usuario.empleado_id;
    const carlosId = empleado.usuario.empleado_id;

    // Comprobar con la función esJefaturaValidaEnFecha de la BD
    const resEsJefe = await pool.query(
      `SELECT 1 FROM asignaciones_jefatura
       WHERE jefatura_empleado_id = $1
         AND subordinado_empleado_id = $2
         AND estado = 'ACTIVA'
         AND fecha_inicio <= $3
         AND (fecha_fin IS NULL OR fecha_fin >= $3);`,
      [andreaId, carlosId, fechaHoy]
    );

    assert.strictEqual(resEsJefe.rows.length, 0, "Andrea ya no debe ser la jefatura vigente de Carlos");
  });

  // 16. Desactivar empleado no elimina historia
  await test(16, "Desactivar empleado (baja lógica) conserva marcas, horarios e historial", async () => {
    const resBaja = await fetch(`${BASE_URL}/api/empleados/${empleadoCreado.id}/estado`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({ estado: "INACTIVO" }),
    });

    assert.strictEqual(resBaja.status, 200);
    const bodyBaja = await resBaja.json();
    assert.strictEqual(bodyBaja.exito, true);
    assert.strictEqual(bodyBaja.datos.estado, "INACTIVO");

    // Verificar en BD que los horarios y jefaturas continúan intactos
    const resH = await pool.query(`SELECT count(*) as c FROM asignaciones_horario WHERE empleado_id = $1`, [empleadoCreado.id]);
    assert.ok(parseInt(resH.rows[0].c, 10) >= 2);

    const resJ = await pool.query(`SELECT count(*) as c FROM asignaciones_jefatura WHERE subordinado_empleado_id = $1`, [empleadoCreado.id]);
    assert.ok(parseInt(resJ.rows[0].c, 10) >= 2);
  });

  // 17. EMPLEADO no puede administrar empleados
  await test(17, "Usuario con rol EMPLEADO no puede administrar colaboradores (403)", async () => {
    const res = await fetch(`${BASE_URL}/api/empleados`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": empleado.sid,
        "x-csrf-token": empleado.csrf,
        Cookie: empleado.cookie,
      },
      body: JSON.stringify({
        cedula: "CED_FORBIDDEN",
        nombre_completo: "No Autorizado",
        departamento_id: deptoCreado.id,
        puesto_id: puestoCreado.id,
      }),
    });

    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.strictEqual(body.exito, false);
    assert.strictEqual(body.error.codigo, "PERMISO_DENEGADO");
  });

  // 18. SUPERVISOR_SEGURIDAD con HORARIOS_VER puede consultar pero no modificar
  await test(18, "SUPERVISOR_SEGURIDAD con HORARIOS_VER puede consultar pero no crear horarios", async () => {
    // Consultar horarios (HORARIOS_VER)
    const resGet = await fetch(`${BASE_URL}/api/horarios`, {
      headers: {
        "x-session-id": supervisor.sid,
        Cookie: supervisor.cookie,
      },
    });
    assert.strictEqual(resGet.status, 200);

    // Intentar crear horario (requiere HORARIOS_ADMINISTRAR)
    const resPost = await fetch(`${BASE_URL}/api/horarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": supervisor.sid,
        "x-csrf-token": supervisor.csrf,
        Cookie: supervisor.cookie,
      },
      body: JSON.stringify({
        codigo: "H_SUP_FORB",
        nombre: "Horario Supervisor Prohibido",
      }),
    });
    assert.strictEqual(resPost.status, 403);
    const bodyPost = await resPost.json();
    assert.strictEqual(bodyPost.error.codigo, "PERMISO_DENEGADO");
  });

  // 19. Retirar HORARIOS_ADMINISTRAR a TH bloquea mutaciones
  await test(19, "Revocar HORARIOS_ADMINISTRAR a TALENTO_HUMANO bloquea mutaciones (403)", async () => {
    // 1. Obtener lista actual de permisos de TALENTO_HUMANO
    const resMatriz = await fetch(`${BASE_URL}/api/admin/roles-permisos`, {
      headers: { "x-session-id": admin.sid, Cookie: admin.cookie },
    });
    const matriz = await resMatriz.json();
    const permisosTHOriginales: string[] = matriz.datos.asignaciones.TALENTO_HUMANO;

    // 2. Revocar HORARIOS_ADMINISTRAR
    const permisosSinHorariosAdmin = permisosTHOriginales.filter((p) => p !== "HORARIOS_ADMINISTRAR");
    const resPut = await fetch(`${BASE_URL}/api/admin/roles-permisos/TALENTO_HUMANO`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({ permisos_activos: permisosSinHorariosAdmin }),
    });
    assert.strictEqual(resPut.status, 200);

    // 3. TH intenta crear horario -> debe recibir 403
    const resPost = await fetch(`${BASE_URL}/api/horarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        codigo: "H_TH_REVOCADO",
        nombre: "Horario TH Revocado",
      }),
    });
    assert.strictEqual(resPost.status, 403);
    const body = await resPost.json();
    assert.strictEqual(body.error.codigo, "PERMISO_DENEGADO");
  });

  // 20. Restaurarlo recupera acceso sin reiniciar servidor
  await test(20, "Reactivar HORARIOS_ADMINISTRAR a TALENTO_HUMANO restaura acceso sin reinicio", async () => {
    // Obtener permisos actuales y volver a agregar HORARIOS_ADMINISTRAR
    const resMatriz = await fetch(`${BASE_URL}/api/admin/roles-permisos`, {
      headers: { "x-session-id": admin.sid, Cookie: admin.cookie },
    });
    const matriz = await resMatriz.json();
    const permisosTH: string[] = matriz.datos.asignaciones.TALENTO_HUMANO;
    if (!permisosTH.includes("HORARIOS_ADMINISTRAR")) {
      permisosTH.push("HORARIOS_ADMINISTRAR");
    }

    const resPut = await fetch(`${BASE_URL}/api/admin/roles-permisos/TALENTO_HUMANO`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
      body: JSON.stringify({ permisos_activos: permisosTH }),
    });
    assert.strictEqual(resPut.status, 200);

    // TH intenta crear horario de nuevo -> debe responder 201
    const resPost = await fetch(`${BASE_URL}/api/horarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        codigo: `H_REST_${timestampUnico}`.slice(0, 15),
        nombre: `Horario Restaurado ${timestampUnico}`,
      }),
    });
    assert.strictEqual(resPost.status, 201);
    const body = await resPost.json();
    assert.strictEqual(body.exito, true);
  });

  // 21. Auditoría registra alta de empleado
  await test(21, "Auditoría registra evento inmutable CREAR_EMPLEADO", async () => {
    const resAudit = await pool.query(
      `SELECT accion, entidad_tipo, entidad_id, actor_usuario_id 
       FROM auditoria_eventos 
       WHERE accion = 'CREAR_EMPLEADO' AND entidad_id = $1;`,
      [empleadoCreado.id]
    );
    assert.ok(resAudit.rows.length >= 1);
    assert.strictEqual(resAudit.rows[0].actor_usuario_id, th.usuario.id);
  });

  // 22. Auditoría registra cambio de horario
  await test(22, "Auditoría registra evento inmutable ASIGNAR_HORARIO", async () => {
    const resAudit = await pool.query(
      `SELECT accion, entidad_tipo, actor_usuario_id 
       FROM auditoria_eventos 
       WHERE accion = 'ASIGNAR_HORARIO' 
       ORDER BY timestamp_evento DESC LIMIT 1;`
    );
    assert.ok(resAudit.rows.length >= 1);
    assert.strictEqual(resAudit.rows[0].accion, "ASIGNAR_HORARIO");
    assert.strictEqual(resAudit.rows[0].entidad_tipo, "asignaciones_horario");
  });

  // 23. Auditoría registra cambio de jefatura
  await test(23, "Auditoría registra evento inmutable ASIGNAR_JEFATURA", async () => {
    const resAudit = await pool.query(
      `SELECT accion, entidad_tipo, actor_usuario_id 
       FROM auditoria_eventos 
       WHERE accion = 'ASIGNAR_JEFATURA' 
       ORDER BY timestamp_evento DESC LIMIT 1;`
    );
    assert.ok(resAudit.rows.length >= 1);
    assert.strictEqual(resAudit.rows[0].accion, "ASIGNAR_JEFATURA");
    assert.strictEqual(resAudit.rows[0].entidad_tipo, "asignaciones_jefatura");
  });

  // 24. Alta compuesta hace rollback ante fallo
  await test(24, "Alta compuesta de empleado hace ROLLBACK completo ante fallo en datos complementarios", async () => {
    const cedulaRollback = `CED_RB_${timestampUnico}`.slice(0, 20);

    // Enviar alta compuesta con horario_id inexistente
    const resComp = await fetch(`${BASE_URL}/api/empleados`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        cedula: cedulaRollback,
        nombre_completo: "Colaborador Que Falla",
        departamento_id: deptoCreado.id,
        puesto_id: puestoCreado.id,
        horario_id: "00000000-0000-0000-0000-000000000000", // Inexistente
      }),
    });

    assert.strictEqual(resComp.status, 400);

    // Verificar en la BD que el empleado NO fue creado
    const resCheck = await pool.query(
      `SELECT id FROM empleados WHERE cedula = $1;`,
      [cedulaRollback]
    );
    assert.strictEqual(resCheck.rows.length, 0, "No debe quedar registro en la base de datos tras ROLLBACK");
  });

  // 25. No se crea ningún nuevo rol
  await test(25, "No se ha creado ningún rol no canónico (ej. 'JEFATURA') en el sistema", async () => {
    const resRoles = await pool.query(`
      SELECT DISTINCT rol FROM usuarios
      UNION
      SELECT DISTINCT rol FROM roles_permisos;
    `);

    const rolesValidos = ["ADMINISTRADOR", "TALENTO_HUMANO", "SUPERVISOR_SEGURIDAD", "SEGURIDAD", "EMPLEADO"];
    for (const row of resRoles.rows) {
      assert.ok(
        rolesValidos.includes(row.rol),
        `Rol no canónico encontrado: '${row.rol}'`
      );
    }
    assert.ok(!resRoles.rows.some((r: any) => r.rol.toLowerCase().includes("jefatura")));
  });

  console.log("======================================================");
  console.log(`RESUMEN FASE 3.2C: PASS: ${passCount} / FAIL: ${failCount} (TOTAL: 25)`);
  console.log("======================================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

runFase32cSuite().catch((err) => {
  console.error("Error fatal en suite Fase 3.2C:", err);
  process.exit(1);
});
