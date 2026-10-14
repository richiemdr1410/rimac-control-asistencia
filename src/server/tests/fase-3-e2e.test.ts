import assert from "node:assert";
import crypto from "node:crypto";
import { calcularJornadaDeterminista } from "../services/calculo-jornada.js";
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

async function runFase3Suite() {
  console.log("=== INICIO DE SUITE DE PRUEBAS E2E FASE 3 ===");
  console.log("=== FERIADOS, PERMISOS, JUSTIFICACIONES Y APROBACIONES (ABAC/POSTGRESQL) ===");

  let passCount = 0;
  let failCount = 0;

  async function test(num: number, desc: string, fn: () => Promise<void>) {
    try {
      await fn();
      passCount++;
      console.log(`[PASS] Test ${num}: ${desc}`);
    } catch (err: any) {
      failCount++;
      console.error(`[FAIL] Test ${num}: ${desc} ->`, err.message);
    }
  }

  // Autenticación de los perfiles necesarios
  const empLogin = await loginUser("empleado", "PassSegura_2026!*");
  const thLogin = await loginUser("talento_humano", "PassSegura_2026!*");
  const adminLogin = await loginUser("admin", "PassSegura_2026!*");
  const supLogin = await loginUser("supervisor_seg", "PassSegura_2026!*");
  const segLogin = await loginUser("seguridad", "PassSegura_2026!*");

  let feriadoCreadoId: string = "";

  // 1. Catálogo de Feriados - Listado
  await test(1, "Cualquier usuario autenticado puede listar feriados (GET /api/feriados)", async () => {
    const res = await fetch(`${BASE_URL}/api/feriados`, {
      headers: {
        Cookie: empLogin.cookie,
        "x-csrf-token": empLogin.csrf,
      },
    });
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.ok(Array.isArray(body.datos));
  });

  // 2. Catálogo de Feriados - RBAC: Empleado no puede crear feriados
  await test(2, "RBAC: EMPLEADO no puede crear feriados (403 Forbidden)", async () => {
    const res = await fetch(`${BASE_URL}/api/feriados`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: empLogin.cookie,
        "x-csrf-token": empLogin.csrf,
      },
      body: JSON.stringify({
        fecha: "2026-12-25",
        descripcion: "Navidad",
      }),
    });
    assert.strictEqual(res.status, 403);
  });

  // 3. Catálogo de Feriados - Creación por TALENTO_HUMANO
  const fechaFeriadoTest = `2026-11-${String(Math.floor(Math.random() * 18) + 11).padStart(2, "0")}`;
  await test(3, "TALENTO_HUMANO puede crear un nuevo feriado oficial", async () => {
    const pool = getPool();
    await pool.query("DELETE FROM feriados WHERE fecha = $1", [fechaFeriadoTest]);
    const res = await fetch(`${BASE_URL}/api/feriados`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: thLogin.cookie,
        "x-csrf-token": thLogin.csrf,
      },
      body: JSON.stringify({
        fecha: fechaFeriadoTest,
        descripcion: "Día Institucional RIMAC",
        tipo_feriado: "PAGO_OBLIGATORIO",
        activo: true,
      }),
    });
    assert.strictEqual(res.status, 201);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.fecha, fechaFeriadoTest);
    assert.strictEqual(body.datos.descripcion, "Día Institucional RIMAC");
    assert.strictEqual(body.datos.activo, true);
    feriadoCreadoId = body.datos.id;
  });

  // 4. Catálogo de Feriados - Edición por ADMINISTRADOR
  await test(4, "ADMINISTRADOR puede editar descripción y tipo de feriado existente", async () => {
    assert.ok(feriadoCreadoId);
    const res = await fetch(`${BASE_URL}/api/feriados/${feriadoCreadoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminLogin.cookie,
        "x-csrf-token": adminLogin.csrf,
      },
      body: JSON.stringify({
        descripcion: "Día Institucional RIMAC S.A. Modificado",
        tipo_feriado: "INSTITUCIONAL",
      }),
    });
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.descripcion, "Día Institucional RIMAC S.A. Modificado");
    assert.strictEqual(body.datos.tipo_feriado, "INSTITUCIONAL");
  });

  // 5. Catálogo de Feriados - Desactivar y Activar feriado
  await test(5, "TALENTO_HUMANO puede desactivar y reactivar feriado (PATCH /estado)", async () => {
    assert.ok(feriadoCreadoId);
    // Desactivar
    const resOff = await fetch(`${BASE_URL}/api/feriados/${feriadoCreadoId}/estado`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: thLogin.cookie,
        "x-csrf-token": thLogin.csrf,
      },
      body: JSON.stringify({ activo: false }),
    });
    assert.strictEqual(resOff.status, 200);
    const bodyOff = (await resOff.json()) as any;
    assert.strictEqual(bodyOff.datos.activo, false);

    // Reactivar
    const resOn = await fetch(`${BASE_URL}/api/feriados/${feriadoCreadoId}/estado`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: thLogin.cookie,
        "x-csrf-token": thLogin.csrf,
      },
      body: JSON.stringify({ activo: true }),
    });
    assert.strictEqual(resOn.status, 200);
    const bodyOn = (await resOn.json()) as any;
    assert.strictEqual(bodyOn.datos.activo, true);
  });

  // 6. Solicitudes del Colaborador - Seguridad: Empleado no puede crear solicitud a nombre de otro
  await test(6, "Seguridad: Empleado no puede falsificar empleado_id en payload (400 Bad Request)", async () => {
    const res = await fetch(`${BASE_URL}/api/solicitudes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: empLogin.cookie,
        "x-csrf-token": empLogin.csrf,
      },
      body: JSON.stringify({
        empleado_id: "33333333-3333-4333-8333-333333333301", // Otro empleado
        tipo_solicitud: "PERMISO",
        fecha_inicio: "2026-10-15",
        fecha_fin: "2026-10-15",
        motivo: "Intento de suplantación",
      }),
    });
    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    const codigo = body.error?.codigo || body.codigo;
    assert.strictEqual(codigo, "PARAMETRO_NO_PERMITIDO");
  });

  // 7. Solicitud 1: PERMISO parcial con horas y evidencia opcional de metadatos
  let solicitudPermisoId: string = "";
  await test(7, "Empleado crea solicitud de PERMISO parcial con horas y metadatos de evidencia", async () => {
    const res = await fetch(`${BASE_URL}/api/solicitudes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: empLogin.cookie,
        "x-csrf-token": empLogin.csrf,
      },
      body: JSON.stringify({
        tipo_solicitud: "PERMISO",
        fecha_inicio: "2026-10-16",
        fecha_fin: "2026-10-16",
        fecha_hora_inicio: "2026-10-16T08:00:00-06:00",
        fecha_hora_fin: "2026-10-16T12:00:00-06:00",
        motivo: "Cita médica programada en CCSS",
        evidencia: {
          nombre_archivo: "comprobante_ccss.pdf",
          tipo_mime: "application/pdf",
        },
      }),
    });
    assert.strictEqual(res.status, 201);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.tipo_solicitud, "PERMISO");
    assert.strictEqual(body.datos.minutos_solicitados, 240); // 4 horas
    assert.strictEqual(body.datos.estado, "PENDIENTE");
    solicitudPermisoId = body.datos.id;
  });

  // 8. Solicitud 2: VACACIONES (Días completos, 2 niveles de aprobación requeridos)
  let solicitudVacacionesId: string = "";
  await test(8, "Empleado crea solicitud de VACACIONES (flujo 2 niveles: Jefatura -> TH)", async () => {
    const res = await fetch(`${BASE_URL}/api/solicitudes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: empLogin.cookie,
        "x-csrf-token": empLogin.csrf,
      },
      body: JSON.stringify({
        tipo_solicitud: "VACACIONES",
        fecha_inicio: "2026-11-02",
        fecha_fin: "2026-11-04",
        motivo: "Descanso anual solicitado",
      }),
    });
    assert.strictEqual(res.status, 201);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.tipo_solicitud, "VACACIONES");
    assert.strictEqual(body.datos.estado, "PENDIENTE");
    solicitudVacacionesId = body.datos.id;
  });

  // 9. Solicitud 3: JUSTIFICACION_AUSENCIA
  await test(9, "Empleado crea solicitud de JUSTIFICACION_AUSENCIA", async () => {
    const res = await fetch(`${BASE_URL}/api/solicitudes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: empLogin.cookie,
        "x-csrf-token": empLogin.csrf,
      },
      body: JSON.stringify({
        tipo_solicitud: "JUSTIFICACION_AUSENCIA",
        fecha_inicio: "2026-10-12",
        fecha_fin: "2026-10-12",
        motivo: "Imposibilidad de tránsito por inundación de vía",
      }),
    });
    assert.strictEqual(res.status, 201);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.tipo_solicitud, "JUSTIFICACION_AUSENCIA");
  });

  // 10. Solicitud 4: JUSTIFICACION_TARDIA
  await test(10, "Empleado crea solicitud de JUSTIFICACION_TARDIA", async () => {
    const res = await fetch(`${BASE_URL}/api/solicitudes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: empLogin.cookie,
        "x-csrf-token": empLogin.csrf,
      },
      body: JSON.stringify({
        tipo_solicitud: "JUSTIFICACION_TARDIA",
        fecha_inicio: "2026-10-14",
        fecha_fin: "2026-10-14",
        fecha_hora_inicio: "2026-10-14T08:00:00-06:00",
        fecha_hora_fin: "2026-10-14T08:25:00-06:00",
        motivo: "Colapso vial en puente ruta 1",
      }),
    });
    assert.strictEqual(res.status, 201);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.tipo_solicitud, "JUSTIFICACION_TARDIA");
  });

  // 11. Solicitud 5: JUSTIFICACION_MARCA_OMITIDA
  let solicitudMarcaOmitidaId: string = "";
  await test(11, "Empleado crea solicitud de JUSTIFICACION_MARCA_OMITIDA", async () => {
    const res = await fetch(`${BASE_URL}/api/solicitudes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: empLogin.cookie,
        "x-csrf-token": empLogin.csrf,
      },
      body: JSON.stringify({
        tipo_solicitud: "JUSTIFICACION_MARCA_OMITIDA",
        fecha_inicio: "2026-10-13",
        fecha_fin: "2026-10-13",
        motivo: "Falla de conectividad local en terminal de salida",
      }),
    });
    assert.strictEqual(res.status, 201);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.tipo_solicitud, "JUSTIFICACION_MARCA_OMITIDA");
    solicitudMarcaOmitidaId = body.datos.id;
  });

  // 12. Consulta de Mis Solicitudes
  await test(12, "Empleado lista únicamente sus propias solicitudes (GET /mis-solicitudes)", async () => {
    const res = await fetch(`${BASE_URL}/api/solicitudes/mis-solicitudes`, {
      headers: {
        Cookie: empLogin.cookie,
        "x-csrf-token": empLogin.csrf,
      },
    });
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.ok(body.datos.length >= 5);
    // Verificar que todas las solicitudes pertenecen al empleado autenticado
    for (const sol of body.datos) {
      assert.strictEqual(sol.empleado_id, empLogin.usuario.empleado_id);
    }
  });

  // 13. Bandeja de Aprobaciones: EMPLEADO y SEGURIDAD no tienen acceso
  await test(13, "RBAC: EMPLEADO y SEGURIDAD tienen denegado el acceso a la bandeja pendiente (403)", async () => {
    const resEmp = await fetch(`${BASE_URL}/api/solicitudes/pendientes`, {
      headers: {
        Cookie: empLogin.cookie,
        "x-csrf-token": empLogin.csrf,
      },
    });
    assert.strictEqual(resEmp.status, 403);

    const resSeg = await fetch(`${BASE_URL}/api/solicitudes/pendientes`, {
      headers: {
        Cookie: segLogin.cookie,
        "x-csrf-token": segLogin.csrf,
      },
    });
    assert.strictEqual(resSeg.status, 403);
  });

  // 14. ABAC de Jefatura: Supervisor sin relación de jefatura con el colaborador no puede aprobar
  await test(14, "ABAC: Supervisor de Seguridad sin subordinación sobre el empleado no puede aprobar (403)", async () => {
    assert.ok(solicitudPermisoId);
    const res = await fetch(`${BASE_URL}/api/solicitudes/${solicitudPermisoId}/aprobar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: supLogin.cookie,
        "x-csrf-token": supLogin.csrf,
      },
      body: JSON.stringify({ comentarios: "Intento no autorizado" }),
    });
    assert.strictEqual(res.status, 403);
    const body = (await res.json()) as any;
    const codigo = body.error?.codigo || body.codigo;
    assert.strictEqual(codigo, "ACCESO_NO_AUTORIZADO");
  });

  // 15. Aprobación exitosa por Jefatura Directa autorizada
  await test(15, "Jefatura directa válida (talento_humano) aprueba solicitud de PERMISO (1 nivel)", async () => {
    assert.ok(solicitudPermisoId);
    const res = await fetch(`${BASE_URL}/api/solicitudes/${solicitudPermisoId}/aprobar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: thLogin.cookie,
        "x-csrf-token": thLogin.csrf,
      },
      body: JSON.stringify({ comentarios: "Permiso de salud concedido." }),
    });
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.nuevo_estado, "APROBADA");
    assert.strictEqual(body.datos.decision.decision, "APROBADA");
  });

  // 16. Rechazo de solicitud con comentario obligatorio
  await test(16, "Rechazo de solicitud requiere comentario obligatorio (400 Bad Request si vacío)", async () => {
    assert.ok(solicitudMarcaOmitidaId);
    // Intento con comentario vacío
    const resVacio = await fetch(`${BASE_URL}/api/solicitudes/${solicitudMarcaOmitidaId}/rechazar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: thLogin.cookie,
        "x-csrf-token": thLogin.csrf,
      },
      body: JSON.stringify({ comentarios: "   " }),
    });
    assert.strictEqual(resVacio.status, 400);

    // Rechazo con motivo fundamentado
    const resValido = await fetch(`${BASE_URL}/api/solicitudes/${solicitudMarcaOmitidaId}/rechazar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: thLogin.cookie,
        "x-csrf-token": thLogin.csrf,
      },
      body: JSON.stringify({ comentarios: "No se evidenció reporte de falla de red en la fecha." }),
    });
    assert.strictEqual(resValido.status, 200);
    const bodyValido = (await resValido.json()) as any;
    assert.strictEqual(bodyValido.datos.nuevo_estado, "RECHAZADA");
  });

  // 17. Flujo multinivel: Solicitud de VACACIONES (Nivel 1 -> EN_REVISION, Nivel 2 -> APROBADA)
  await test(17, "Flujo de aprobación multinivel para VACACIONES (Nivel 1 -> EN_REVISION, Nivel 2 -> APROBADA)", async () => {
    assert.ok(solicitudVacacionesId);

    // Nivel 1: Jefatura directa aprueba
    const resNivel1 = await fetch(`${BASE_URL}/api/solicitudes/${solicitudVacacionesId}/aprobar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: thLogin.cookie,
        "x-csrf-token": thLogin.csrf,
      },
      body: JSON.stringify({ comentarios: "Visto bueno de jefatura directa." }),
    });
    assert.strictEqual(resNivel1.status, 200);
    const bodyNivel1 = (await resNivel1.json()) as any;
    assert.strictEqual(bodyNivel1.datos.nuevo_estado, "EN_REVISION");

    // Nivel 2: TALENTO_HUMANO / ADMINISTRADOR confirma resolución
    const resNivel2 = await fetch(`${BASE_URL}/api/solicitudes/${solicitudVacacionesId}/aprobar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminLogin.cookie,
        "x-csrf-token": adminLogin.csrf,
      },
      body: JSON.stringify({ comentarios: "Aprobación final de Talento Humano para control de asistencia." }),
    });
    assert.strictEqual(resNivel2.status, 200);
    const bodyNivel2 = (await resNivel2.json()) as any;
    assert.strictEqual(bodyNivel2.datos.nuevo_estado, "APROBADA");

    // Verificar historial de decisiones append-only
    const resDetalle = await fetch(`${BASE_URL}/api/solicitudes/${solicitudVacacionesId}`, {
      headers: {
        Cookie: empLogin.cookie,
        "x-csrf-token": empLogin.csrf,
      },
    });
    assert.strictEqual(resDetalle.status, 200);
    const bodyDetalle = (await resDetalle.json()) as any;
    assert.strictEqual(bodyDetalle.datos.estado, "APROBADA");
    assert.strictEqual(bodyDetalle.datos.decisiones.length, 2);
    assert.strictEqual(bodyDetalle.datos.decisiones[0].nivel, 1);
    assert.strictEqual(bodyDetalle.datos.decisiones[1].nivel, 2);
  });

  // 18. Motor de cálculo determinista: Permiso parcial cubre tardanza
  await test(18, "Motor determinista: Entrada tardía cubierta por permiso aprobado NO genera tardanza injustificada", async () => {
    // Escenario de prueba determinista:
    // Jornada programada: 08:00 - 17:00 (540 min brutos, tolerancia 5 min)
    // Permiso aprobado: 08:00 - 12:00 (240 min)
    // Marca real de entrada: 12:00
    // Marca real de salida: 17:00
    const snapshot = {
      hora_entrada_programada: "08:00",
      hora_salida_programada: "17:00",
      tolerancia_minutos: 5,
      minutos_esperados: 480, // 8 horas efectivas
      cruza_medianoche: false,
    };

    const marcas = [
      {
        id: "marca-entrada",
        jornada_id: "j-1",
        empleado_id: "e-1",
        tipo_marca: "ENTRADA" as const,
        timestamp_servidor: "2026-10-16T12:00:00-06:00",
        origen_marca: "AUTOSERVICIO" as const,
        estado_marca: "ACTIVA" as const,
        usuario_registrador_id: "u-1",
        creado_en: "2026-10-16T12:00:00-06:00",
      },
      {
        id: "marca-salida",
        jornada_id: "j-1",
        empleado_id: "e-1",
        tipo_marca: "SALIDA" as const,
        timestamp_servidor: "2026-10-16T17:00:00-06:00",
        origen_marca: "AUTOSERVICIO" as const,
        estado_marca: "ACTIVA" as const,
        usuario_registrador_id: "u-1",
        creado_en: "2026-10-16T17:00:00-06:00",
      },
    ];

    const solicitudesAprobadas = [
      {
        tipo_solicitud: "PERMISO",
        fecha_inicio: "2026-10-16",
        fecha_fin: "2026-10-16",
        fecha_hora_inicio: "2026-10-16T08:00:00-06:00",
        fecha_hora_fin: "2026-10-16T12:00:00-06:00",
        minutos_solicitados: 240,
      },
    ];

    const calculo = calcularJornadaDeterminista(marcas, snapshot, {
      solicitudesAprobadas,
      esFeriado: false,
    });

    // Validaciones del Principio de Alcance y Requisito 3
    assert.strictEqual(calculo.minutos_tardanza, 0, "No debe registrar tardanza injustificada");
    assert.strictEqual(calculo.clasificacion_tardanza, "SIN_TARDANZA");
    assert.strictEqual(calculo.minutos_justificados_comp, 240, "Debe reconocer 240 minutos justificados por el permiso");
    assert.strictEqual(calculo.minutos_efectivos, 300, "5 horas trabajadas = 300 minutos");
    // 300 min trabajados + 240 min justificados = 540 min reconocidos >= 480 min esperados
    assert.strictEqual(calculo.minutos_no_justificados, 0, "No debe haber tiempo injustificado");
  });

  // 19. Motor de cálculo determinista: Trabajo en día feriado conserva marcas y no auto-calcula extras
  await test(19, "Motor determinista: Trabajo en Feriado conserva marcas y tiempo sin inventar categorías salariales", async () => {
    const snapshot = {
      hora_entrada_programada: "08:00",
      hora_salida_programada: "17:00",
      tolerancia_minutos: 5,
      minutos_esperados: 480,
      cruza_medianoche: false,
    };

    const marcas = [
      {
        id: "marca-entrada-feriado",
        jornada_id: "j-feriado",
        empleado_id: "e-1",
        tipo_marca: "ENTRADA" as const,
        timestamp_servidor: "2026-11-20T08:00:00-06:00",
        origen_marca: "AUTOSERVICIO" as const,
        estado_marca: "ACTIVA" as const,
        usuario_registrador_id: "u-1",
        creado_en: "2026-11-20T08:00:00-06:00",
      },
      {
        id: "marca-salida-feriado",
        jornada_id: "j-feriado",
        empleado_id: "e-1",
        tipo_marca: "SALIDA" as const,
        timestamp_servidor: "2026-11-20T17:00:00-06:00",
        origen_marca: "AUTOSERVICIO" as const,
        estado_marca: "ACTIVA" as const,
        usuario_registrador_id: "u-1",
        creado_en: "2026-11-20T17:00:00-06:00",
      },
    ];

    const calculo = calcularJornadaDeterminista(marcas, snapshot, {
      esFeriado: true,
    });

    assert.strictEqual(calculo.es_feriado, true);
    assert.strictEqual(calculo.minutos_efectivos, 540);
    assert.strictEqual(calculo.minutos_tardanza, 0);
  });

  console.log(`\n======================================================`);
  console.log(`RESUMEN SUITE FASE 3: PASS: ${passCount} / FAIL: ${failCount} (TOTAL: ${passCount + failCount})`);
  console.log(`======================================================\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runFase3Suite().catch((err) => {
  console.error("Error fatal en suite Fase 3:", err);
  process.exit(1);
});
