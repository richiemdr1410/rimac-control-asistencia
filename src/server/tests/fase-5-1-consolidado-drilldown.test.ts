import assert from "node:assert";
import { getPool } from "../../db/index.js";

const BASE_URL = "http://127.0.0.1:3000";

interface LoginResult {
  cookie: string;
  sid: string;
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
    usuario: body.datos.usuario,
  };
}

async function runFase51Tests() {
  console.log("==========================================================================");
  console.log("=== PRUEBAS DIRIGIDAS FASE 5.1: CONSOLIDADO QUINCENAL Y DRILL-DOWN ======");
  console.log("==========================================================================");

  let passed = 0;
  let failed = 0;

  async function check(num: number, desc: string, fn: () => Promise<void>) {
    try {
      await fn();
      passed++;
      console.log(`[PASS] Verificación ${num}: ${desc}`);
    } catch (e: any) {
      failed++;
      console.error(`[FAIL] Verificación ${num}: ${desc} -> Error: ${e.message}`);
    }
  }

  const pool = getPool();

  // Iniciar sesiones
  const admin = await loginUser("admin", "PassSegura_2026!*");
  const th = await loginUser("talento_humano", "PassSegura_2026!*");
  const supervisor = await loginUser("supervisor_seg", "PassSegura_2026!*");
  const empleado = await loginUser("empleado", "PassSegura_2026!*");

  // 1. Presets de fechas
  await check(1, "Primera quincena 1-15 y Segunda quincena 16-fin real del mes (determinista)", async () => {
    // Octubre 2026 tiene 31 días
    const q1Res = await fetch(`${BASE_URL}/api/reportes/resumen-horas?fecha_desde=2026-10-01&fecha_hasta=2026-10-15`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(q1Res.status, 200);
    const bodyQ1 = await q1Res.json();
    assert.strictEqual(bodyQ1.exito, true);

    const q2Res = await fetch(`${BASE_URL}/api/reportes/resumen-horas?fecha_desde=2026-10-16&fecha_hasta=2026-10-31`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(q2Res.status, 200);
    const bodyQ2 = await q2Res.json();
    assert.strictEqual(bodyQ2.exito, true);
  });

  // 2. Resumen agrupa exactamente una fila por colaborador
  await check(2, "Resumen agrupa exactamente una fila por colaborador con campos consolidados", async () => {
    const res = await fetch(`${BASE_URL}/api/reportes/resumen-horas?fecha_desde=2026-10-01&fecha_hasta=2026-10-31`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.ok(Array.isArray(body.datos.items));
    assert.ok(body.datos.items.length > 0);

    const empIds = new Set();
    for (const item of body.datos.items) {
      assert.ok(!empIds.has(item.empleado_id), "Cada colaborador debe aparecer exactamente una vez");
      empIds.add(item.empleado_id);
      assert.ok("empleado_nombre" in item);
      assert.ok("empleado_cedula" in item);
      assert.ok("departamento_nombre" in item);
      assert.ok("minutos_tiempo_total" in item);
      assert.ok("minutos_efectivos" in item);
      assert.ok("minutos_total_descansos" in item);
      assert.ok("jornadas_detalle" in item);
    }
  });

  // 3. Total de horas coincide con detalle diario
  await check(3, "Total de horas por colaborador coincide con la sumatoria de sus jornadas en detalle_diario", async () => {
    const res = await fetch(`${BASE_URL}/api/reportes/resumen-horas?fecha_desde=2026-10-01&fecha_hasta=2026-10-31`, {
      headers: { Cookie: th.cookie },
    });
    const body = await res.json();
    for (const item of body.datos.items) {
      if (item.jornadas_detalle.length > 0) {
        const sumaDetalleTotal = item.jornadas_detalle.reduce((acc: number, j: any) => acc + j.minutos_tiempo_total, 0);
        assert.strictEqual(
          item.minutos_tiempo_total,
          sumaDetalleTotal,
          `Inconsistencia en tiempo total para ${item.empleado_nombre}: resumen=${item.minutos_tiempo_total}, suma_detalle=${sumaDetalleTotal}`
        );
      }
    }
  });

  // 4. Tiempo efectivo acumulado coincide con jornadas consolidadas
  await check(4, "Tiempo efectivo acumulado por colaborador coincide con la sumatoria de jornadas consolidadas", async () => {
    const res = await fetch(`${BASE_URL}/api/reportes/resumen-horas?fecha_desde=2026-10-01&fecha_hasta=2026-10-31`, {
      headers: { Cookie: th.cookie },
    });
    const body = await res.json();
    for (const item of body.datos.items) {
      if (item.jornadas_detalle.length > 0) {
        const sumaDetalleEfectivo = item.jornadas_detalle.reduce((acc: number, j: any) => acc + j.minutos_efectivos, 0);
        assert.strictEqual(
          item.minutos_efectivos,
          sumaDetalleEfectivo,
          `Inconsistencia en tiempo efectivo para ${item.empleado_nombre}`
        );
      }
    }
  });

  // 5. Filtro por colaborador
  await check(5, "Filtro por colaborador restringe resultado al empleado solicitado", async () => {
    const resEmp1 = await pool.query("SELECT id FROM empleados WHERE estado = 'ACTIVO' LIMIT 1;");
    const targetEmpId = resEmp1.rows[0].id;

    const res = await fetch(`${BASE_URL}/api/reportes/resumen-horas?empleado_id=${targetEmpId}`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.items.length, 1);
    assert.strictEqual(body.datos.items[0].empleado_id, targetEmpId);
  });

  // 6. Filtro por departamento
  await check(6, "Filtro por departamento restringe resultados al departamento solicitado", async () => {
    const resDep = await pool.query("SELECT id, nombre FROM departamentos LIMIT 1;");
    const targetDepId = resDep.rows[0].id;
    const targetDepNombre = resDep.rows[0].nombre;

    const res = await fetch(`${BASE_URL}/api/reportes/resumen-horas?departamento_id=${targetDepId}`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    for (const item of body.datos.items) {
      assert.strictEqual(item.departamento_nombre, targetDepNombre);
    }
  });

  // 7. CSV conserva rango y filtros
  await check(7, "Exportación CSV tipo=resumen-horas conserva rango y genera encabezados correctos", async () => {
    const res = await fetch(`${BASE_URL}/api/reportes/exportar?tipo=resumen-horas&fecha_desde=2026-10-01&fecha_hasta=2026-10-15`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("text/csv"));
    const rawBuf = Buffer.from(await res.arrayBuffer());
    const csvText = rawBuf.toString("utf-8");
    assert.ok(csvText.includes("Colaborador"));
    assert.ok(csvText.includes("Total Pausas"));
    assert.ok(csvText.includes("Tiempo Efectivo Trabajado"));
  });

  // 8. Alcance EMPLEADO estricto
  await check(8, "EMPLEADO recibe únicamente su propio consolidado y no puede consultar a terceros", async () => {
    const res = await fetch(`${BASE_URL}/api/reportes/resumen-horas`, {
      headers: { Cookie: empleado.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);
    assert.strictEqual(body.datos.items.length, 1);
    assert.strictEqual(body.datos.items[0].empleado_id, empleado.usuario.empleado_id);

    // Intento de manipulación de empleado_id
    const resFraude = await fetch(`${BASE_URL}/api/reportes/resumen-horas?empleado_id=00000000-0000-0000-0000-000000000000`, {
      headers: { Cookie: empleado.cookie },
    });
    assert.strictEqual(resFraude.status, 403, "EMPLEADO debe recibir 403 al intentar consultar a terceros");
  });

  // 9. Alcance SUPERVISOR con ABAC
  await check(9, "SUPERVISOR_SEGURIDAD consulta su equipo y es bloqueado con 403 fuera de subordinados", async () => {
    const res = await fetch(`${BASE_URL}/api/reportes/resumen-horas`, {
      headers: { Cookie: supervisor.cookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exito, true);

    const resFuera = await fetch(`${BASE_URL}/api/reportes/resumen-horas?empleado_id=ffffffff-ffff-ffff-ffff-ffffffffffff`, {
      headers: { Cookie: supervisor.cookie },
    });
    assert.strictEqual(resFuera.status, 403, "SUPERVISOR debe recibir 403 para colaboradores no asignados");
  });

  // 10. Alcance TALENTO_HUMANO y ADMINISTRADOR
  await check(10, "TALENTO_HUMANO y ADMINISTRADOR acceden al consolidado institucional completo", async () => {
    const resTH = await fetch(`${BASE_URL}/api/reportes/resumen-horas`, {
      headers: { Cookie: th.cookie },
    });
    assert.strictEqual(resTH.status, 200);

    const resAdmin = await fetch(`${BASE_URL}/api/reportes/resumen-horas`, {
      headers: { Cookie: admin.cookie },
    });
    assert.strictEqual(resAdmin.status, 200);
  });

  // 11. Permisos en Roles y Permisos
  await check(11, "Permisos de reportería presentes y configurados en matriz roles_permisos", async () => {
    const res = await pool.query(`
      SELECT permiso_codigo FROM roles_permisos 
      WHERE permiso_codigo IN ('REPORTES_PERSONALES_VER', 'REPORTES_EQUIPO_VER', 'REPORTES_INSTITUCIONALES_VER', 'REPORTES_EXPORTAR')
      GROUP BY permiso_codigo;
    `);
    assert.strictEqual(res.rows.length, 4, "Los 4 permisos canónicos deben existir en la matriz");
  });

  console.log("==========================================================================");
  console.log(`=== RESULTADO PRUEBAS DIRIGIDAS: ${passed} PASADAS, ${failed} FALLIDAS ===`);
  console.log("==========================================================================");

  await pool.end();

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runFase51Tests().catch((e) => {
  console.error("Error fatal en pruebas Fase 5.1:", e);
  process.exit(1);
});
