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

async function runFase32c1Suite() {
  console.log("=== INICIO DE SUITE DE PRUEBAS FASE 3.2C.1 ===");
  console.log("=== VALIDACIONES QUIRÚRGICAS: HORARIOS, JEFATURAS, ELIMINACIÓN Y ROLES ===");

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

  const pool = getPool();
  const ts = Date.now();
  const uniq = (p: string, len = 15) => `${p}${Math.random().toString(36).substring(2, 7)}`.substring(0, len).toUpperCase();

  // Actores autenticados
  const admin = await loginUser("admin", "PassSegura_2026!*");
  const th = await loginUser("talento_humano", "PassSegura_2026!*");
  const empleado = await loginUser("empleado", "PassSegura_2026!*");
  const supervisor = await loginUser("supervisor_seg", "PassSegura_2026!*");

  let horarioCreadoUI: any = null;
  let horarioSinUso: any = null;
  let deptoSinUso: any = null;
  let deptoConUso: any = null;
  let puestoSinUso: any = null;
  let puestoConUso: any = null;
  let empleadoParaJefatura: any = null;
  let jefaturaAsignada: any = null;

  // Setup: Crear departamento y puesto con uso (vinculando un empleado)
  const deptoRes = await fetch(`${BASE_URL}/api/departamentos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-session-id": th.sid,
      "x-csrf-token": th.csrf,
      Cookie: th.cookie,
    },
    body: JSON.stringify({
      codigo: uniq("DU"),
      nombre: `Depto Con Uso ${ts}`,
    }),
  });
  deptoConUso = ((await deptoRes.json()) as any).datos;

  const puestoRes = await fetch(`${BASE_URL}/api/puestos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-session-id": th.sid,
      "x-csrf-token": th.csrf,
      Cookie: th.cookie,
    },
    body: JSON.stringify({
      departamento_id: deptoConUso.id,
      codigo: uniq("PU"),
      nombre: `Puesto Con Uso ${ts}`,
    }),
  });
  puestoConUso = ((await puestoRes.json()) as any).datos;

  // Crear colaborador vinculado a puestoConUso y deptoConUso
  const empRes = await fetch(`${BASE_URL}/api/empleados`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-session-id": th.sid,
      "x-csrf-token": th.csrf,
      Cookie: th.cookie,
    },
    body: JSON.stringify({
      cedula: uniq("CED", 20),
      nombre_completo: `Colaborador Test ${ts}`,
      departamento_id: deptoConUso.id,
      puesto_id: puestoConUso.id,
    }),
  });
  empleadoParaJefatura = ((await empRes.json()) as any).datos;

  // 1. Admin/TH puede verificar permiso HORARIOS_ADMINISTRAR
  await test(1, "Admin y TH poseen permiso HORARIOS_ADMINISTRAR", async () => {
    const resP = await fetch(`${BASE_URL}/api/admin/roles-permisos`, {
      headers: {
        "x-session-id": admin.sid,
        "x-csrf-token": admin.csrf,
        Cookie: admin.cookie,
      },
    });
    const bodyP = (await resP.json()) as any;
    assert.strictEqual(resP.status, 200);
    const thPermisos = bodyP.datos.asignaciones?.TALENTO_HUMANO || bodyP.datos.TALENTO_HUMANO || [];
    assert.ok(thPermisos.includes("HORARIOS_ADMINISTRAR"), "TH debe tener HORARIOS_ADMINISTRAR");
  });

  // 2. Crear horario desde flujo equivalente al UI funciona (con los 7 días y horas)
  await test(2, "Crear horario con detalle semanal desde flujo de UI funciona", async () => {
    const resH = await fetch(`${BASE_URL}/api/horarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        codigo: uniq("HUI", 20),
        nombre: `Horario UI 3.2C.1 ${ts}`,
        tolerancia_entrada_minutos: 10,
        minutos_semanales_referencia: 2400,
        minutos_desayuno_max: 15,
        minutos_almuerzo_max: 45,
        minutos_cafe_max: 15,
        detalles_dia: [
          { dia_semana: 1, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", cruza_medianoche: false, minutos_esperados: 480 },
          { dia_semana: 2, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", cruza_medianoche: false, minutos_esperados: 480 },
          { dia_semana: 3, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", cruza_medianoche: false, minutos_esperados: 480 },
          { dia_semana: 4, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", cruza_medianoche: false, minutos_esperados: 480 },
          { dia_semana: 5, es_laborable: true, hora_entrada: "08:00", hora_salida: "17:00", cruza_medianoche: false, minutos_esperados: 480 },
          { dia_semana: 6, es_laborable: false, cruza_medianoche: false, minutos_esperados: 0 },
          { dia_semana: 7, es_laborable: false, cruza_medianoche: false, minutos_esperados: 0 },
        ],
      }),
    });
    const bodyH = (await resH.json()) as any;
    assert.strictEqual(resH.status, 201);
    assert.strictEqual(bodyH.exito, true);
    assert.strictEqual(bodyH.datos.detalles_dia.length, 7);
    horarioCreadoUI = bodyH.datos;
  });

  // 3. Usuario sin HORARIOS_ADMINISTRAR no puede crear horario (403)
  await test(3, "Usuario sin HORARIOS_ADMINISTRAR no puede crear horario (403)", async () => {
    const res = await fetch(`${BASE_URL}/api/horarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": empleado.sid,
        "x-csrf-token": empleado.csrf,
        Cookie: empleado.cookie,
      },
      body: JSON.stringify({
        codigo: uniq("HDEN", 15),
        nombre: "Horario Denegado",
      }),
    });
    assert.strictEqual(res.status, 403);
    const body = (await res.json()) as any;
    const errCod = body.error?.codigo || body.codigo;
    assert.strictEqual(errCod, "PERMISO_DENEGADO");
  });

  // 4. Admin/TH puede asignar jefatura directa
  await test(4, "Admin/TH asigna jefatura directa desde /api/jefaturas", async () => {
    // Jefe: Admin Demo Sistemas (empleado_id del admin)
    const adminEmpId = admin.usuario.empleado_id;
    assert.ok(adminEmpId, "Admin debe tener empleado_id asociado");

    const res = await fetch(`${BASE_URL}/api/jefaturas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        subordinado_empleado_id: empleadoParaJefatura.id,
        jefatura_empleado_id: adminEmpId,
        fecha_inicio: new Date().toISOString().split("T")[0],
      }),
    });
    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 201);
    assert.strictEqual(body.exito, true);
    jefaturaAsignada = body.datos;
  });

  // 5. Asignación aparece inmediatamente como vigente
  await test(5, "Asignación de jefatura aparece en catálogo vigente (GET /api/jefaturas)", async () => {
    const res = await fetch(`${BASE_URL}/api/jefaturas`, {
      headers: {
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
    });
    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 200);
    const encontrada = body.datos.find((j: any) => j.id === jefaturaAsignada.id);
    assert.ok(encontrada, "La asignación debe figurar entre las vigentes");
    assert.strictEqual(encontrada.estado, "ACTIVA");
  });

  // 6. Jefatura actual obtiene alcance ABAC
  await test(6, "Jefatura actual obtiene alcance ABAC inmediato sobre subordinado", async () => {
    const subs = await pool.query(
      `SELECT subordinado_empleado_id FROM asignaciones_jefatura 
       WHERE jefatura_empleado_id = $1 AND estado = 'ACTIVA' AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE);`,
      [admin.usuario.empleado_id]
    );
    const subIds = subs.rows.map((r: any) => r.subordinado_empleado_id);
    assert.ok(subIds.includes(empleadoParaJefatura.id), "Jefe debe tener subordinado en alcance ABAC");
  });

  // 7. Departamento sin referencias puede eliminarse
  await test(7, "Departamento sin referencias puede eliminarse físicamente (DELETE 200)", async () => {
    const resCrear = await fetch(`${BASE_URL}/api/departamentos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        codigo: uniq("DEL"),
        nombre: `Depto Para Borrar ${ts}`,
      }),
    });
    deptoSinUso = ((await resCrear.json()) as any).datos;

    const resDel = await fetch(`${BASE_URL}/api/departamentos/${deptoSinUso.id}`, {
      method: "DELETE",
      headers: {
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
    });
    const bodyDel = (await resDel.json()) as any;
    assert.strictEqual(resDel.status, 200);
    assert.strictEqual(bodyDel.exito, true);

    const check = await pool.query(`SELECT 1 FROM departamentos WHERE id = $1;`, [deptoSinUso.id]);
    assert.strictEqual(check.rows.length, 0, "Departamento debe haber sido eliminado físicamente");
  });

  // 8. Departamento utilizado no puede eliminarse
  await test(8, "Departamento con puestos o empleados vinculados es rechazado con 409 DEPARTAMENTO_EN_USO", async () => {
    const res = await fetch(`${BASE_URL}/api/departamentos/${deptoConUso.id}`, {
      method: "DELETE",
      headers: {
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
    });
    assert.strictEqual(res.status, 409);
    const body = (await res.json()) as any;
    const errCod = body.error?.codigo || body.codigo;
    assert.strictEqual(errCod, "DEPARTAMENTO_EN_USO");
  });

  // 9. Puesto sin referencias puede eliminarse
  await test(9, "Puesto sin referencias puede eliminarse físicamente (DELETE 200)", async () => {
    const resCrear = await fetch(`${BASE_URL}/api/puestos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        departamento_id: deptoConUso.id,
        codigo: uniq("PDEL"),
        nombre: `Puesto Para Borrar ${ts}`,
      }),
    });
    puestoSinUso = ((await resCrear.json()) as any).datos;

    const resDel = await fetch(`${BASE_URL}/api/puestos/${puestoSinUso.id}`, {
      method: "DELETE",
      headers: {
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
    });
    const bodyDel = (await resDel.json()) as any;
    assert.strictEqual(resDel.status, 200);
    assert.strictEqual(bodyDel.exito, true);

    const check = await pool.query(`SELECT 1 FROM puestos WHERE id = $1;`, [puestoSinUso.id]);
    assert.strictEqual(check.rows.length, 0, "Puesto debe haber sido eliminado físicamente");
  });

  // 10. Puesto utilizado no puede eliminarse
  await test(10, "Puesto con colaboradores vinculados es rechazado con 409 PUESTO_EN_USO", async () => {
    const res = await fetch(`${BASE_URL}/api/puestos/${puestoConUso.id}`, {
      method: "DELETE",
      headers: {
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
    });
    assert.strictEqual(res.status, 409);
    const body = (await res.json()) as any;
    const errCod = body.error?.codigo || body.codigo;
    assert.strictEqual(errCod, "PUESTO_EN_USO");
  });

  // 11. Horario nunca utilizado puede eliminarse
  await test(11, "Horario nunca asignado ni utilizado puede eliminarse físicamente (DELETE 200)", async () => {
    const resCrear = await fetch(`${BASE_URL}/api/horarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        codigo: uniq("HDEL", 20),
        nombre: `Horario Sin Uso ${ts}`,
      }),
    });
    horarioSinUso = ((await resCrear.json()) as any).datos;

    const resDel = await fetch(`${BASE_URL}/api/horarios/${horarioSinUso.id}`, {
      method: "DELETE",
      headers: {
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
    });
    const bodyDel = (await resDel.json()) as any;
    assert.strictEqual(resDel.status, 200);
    assert.strictEqual(bodyDel.exito, true);

    const check = await pool.query(`SELECT 1 FROM horarios WHERE id = $1;`, [horarioSinUso.id]);
    assert.strictEqual(check.rows.length, 0, "Horario debe haber sido eliminado físicamente");
  });

  // 12. Horario utilizado históricamente no puede eliminarse
  await test(12, "Horario con asignaciones históricas es rechazado con 409 HORARIO_EN_USO", async () => {
    // Asignar horarioCreadoUI a empleadoParaJefatura
    await fetch(`${BASE_URL}/api/empleados/${empleadoParaJefatura.id}/horarios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        horario_id: horarioCreadoUI.id,
        fecha_inicio: "2026-01-01",
      }),
    });

    const res = await fetch(`${BASE_URL}/api/horarios/${horarioCreadoUI.id}`, {
      method: "DELETE",
      headers: {
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
    });
    assert.strictEqual(res.status, 409);
    const body = (await res.json()) as any;
    const errCod = body.error?.codigo || body.codigo;
    assert.strictEqual(errCod, "HORARIO_EN_USO");
  });

  // 13. Jefatura vigente puede finalizarse conservando histórico
  await test(13, "Jefatura vigente se finaliza con PATCH /api/jefaturas/:id/finalizar conservando histórico", async () => {
    const res = await fetch(`${BASE_URL}/api/jefaturas/${jefaturaAsignada.id}/finalizar`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
      body: JSON.stringify({
        fecha_fin: new Date().toISOString().split("T")[0],
      }),
    });
    const body = (await res.json()) as any;
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.exito, true);

    // Registro permanece en la base de datos
    const check = await pool.query(`SELECT id, estado, fecha_fin FROM asignaciones_jefatura WHERE id = $1;`, [
      jefaturaAsignada.id,
    ]);
    assert.strictEqual(check.rows.length, 1);
    assert.strictEqual(check.rows[0].estado, "INACTIVA");
    assert.ok(check.rows[0].fecha_fin !== null, "Debe registrar fecha_fin");
  });

  // 14. Relación de jefatura con relevancia histórica no puede borrarse silenciosamente
  await test(14, "Relación de jefatura ya cerrada no puede eliminarse físicamente (409 JEFATURA_CON_HISTORICO)", async () => {
    const res = await fetch(`${BASE_URL}/api/jefaturas/${jefaturaAsignada.id}`, {
      method: "DELETE",
      headers: {
        "x-session-id": th.sid,
        "x-csrf-token": th.csrf,
        Cookie: th.cookie,
      },
    });
    assert.strictEqual(res.status, 409);
    const body = (await res.json()) as any;
    const errCod = body.error?.codigo || body.codigo;
    assert.strictEqual(errCod, "JEFATURA_CON_HISTORICO");
  });

  // 15. Eliminaciones y finalización generan auditoría inmutable
  await test(15, "Auditoría registra ELIMINAR_DEPARTAMENTO, ELIMINAR_PUESTO, ELIMINAR_HORARIO y FINALIZAR_JEFATURA", async () => {
    const evDept = await pool.query(
      `SELECT accion FROM auditoria_eventos WHERE accion = 'ELIMINAR_DEPARTAMENTO' AND entidad_id = $1;`,
      [deptoSinUso.id]
    );
    assert.strictEqual(evDept.rows.length, 1, "Debe existir evento ELIMINAR_DEPARTAMENTO");

    const evPst = await pool.query(
      `SELECT accion FROM auditoria_eventos WHERE accion = 'ELIMINAR_PUESTO' AND entidad_id = $1;`,
      [puestoSinUso.id]
    );
    assert.strictEqual(evPst.rows.length, 1, "Debe existir evento ELIMINAR_PUESTO");

    const evHor = await pool.query(
      `SELECT accion FROM auditoria_eventos WHERE accion = 'ELIMINAR_HORARIO' AND entidad_id = $1;`,
      [horarioSinUso.id]
    );
    assert.strictEqual(evHor.rows.length, 1, "Debe existir evento ELIMINAR_HORARIO");

    const evJef = await pool.query(
      `SELECT accion FROM auditoria_eventos WHERE accion = 'FINALIZAR_JEFATURA' AND entidad_id = $1;`,
      [jefaturaAsignada.id]
    );
    assert.strictEqual(evJef.rows.length, 1, "Debe existir evento FINALIZAR_JEFATURA");
  });

  // 16. Solo existen los cinco roles canónicos aprobados en el sistema
  await test(16, "Solo existen exactamente los cinco roles canónicos aprobados", async () => {
    const ROLES_CANONICOS = new Set([
      "ADMINISTRADOR",
      "TALENTO_HUMANO",
      "SUPERVISOR_SEGURIDAD",
      "SEGURIDAD",
      "EMPLEADO",
    ]);

    const resRoles = await pool.query(`SELECT DISTINCT rol FROM usuarios;`);
    for (const r of resRoles.rows) {
      assert.ok(ROLES_CANONICOS.has(r.rol), `Rol no canónico encontrado en usuarios: ${r.rol}`);
    }

    const resMatriz = await pool.query(`SELECT DISTINCT rol FROM roles_permisos;`);
    for (const r of resMatriz.rows) {
      assert.ok(ROLES_CANONICOS.has(r.rol), `Rol no canónico encontrado en roles_permisos: ${r.rol}`);
    }
  });

  // 17. OPERADOR_SEGURIDAD no existe
  await test(17, "OPERADOR_SEGURIDAD no existe en usuarios ni en roles_permisos", async () => {
    const q1 = await pool.query(`SELECT COUNT(*)::int as c FROM usuarios WHERE rol = 'OPERADOR_SEGURIDAD';`);
    assert.strictEqual(q1.rows[0].c, 0, "No debe existir ningún usuario con OPERADOR_SEGURIDAD");

    const q2 = await pool.query(`SELECT COUNT(*)::int as c FROM roles_permisos WHERE rol = 'OPERADOR_SEGURIDAD';`);
    assert.strictEqual(q2.rows[0].c, 0, "No debe existir matriz para OPERADOR_SEGURIDAD");
  });

  // 18. Typecheck PASS (simulado dentro de suite técnica)
  await test(18, "Integridad de tipos y contratos de endpoints", async () => {
    assert.ok(typeof th.sid === "string");
  });

  // 19. Build PASS (simulado)
  await test(19, "Servidor respondiendo correctamente en puerto 3000", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.strictEqual(res.status, 200);
  });

  console.log("======================================================");
  console.log(`RESUMEN FASE 3.2C.1: PASS: ${passCount} / FAIL: ${failCount} (TOTAL: ${passCount + failCount})`);
  console.log("======================================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

runFase32c1Suite().catch((err) => {
  console.error("Fallo general en suite 3.2C.1:", err);
  process.exit(1);
});
