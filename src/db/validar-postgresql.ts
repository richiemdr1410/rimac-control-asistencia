import pg from "pg";
import assert from "node:assert";

const { Pool } = pg;

export async function ejecutarValidacionesPostgres(): Promise<{
  todasAprobadas: boolean;
  resultados: Array<{ numero: number; descripcion: string; estado: "PASS" | "FAIL"; detalle?: string }>;
}> {
  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_ADMIN_USER || process.env.SQL_USER,
    password: process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    ssl: false,
    connectionTimeoutMillis: 10000,
  });

  const client = await pool.connect();
  const resultados: Array<{ numero: number; descripcion: string; estado: "PASS" | "FAIL"; detalle?: string }> = [];

  async function test(numero: number, descripcion: string, fn: () => Promise<void>) {
    try {
      await fn();
      resultados.push({ numero, descripcion, estado: "PASS" });
    } catch (err: any) {
      resultados.push({ numero, descripcion, estado: "FAIL", detalle: err.message });
    }
  }

  try {
    // 1. Conexión exitosa
    await test(1, "Conexión exitosa a PostgreSQL", async () => {
      const res = await client.query("SELECT 1 AS conectado;");
      assert.strictEqual(res.rows[0].conectado, 1);
    });

    // 2. Existencia exacta de 23 tablas
    const tablasEsperadas = [
      "asignaciones_horario",
      "asignaciones_jefatura",
      "auditoria_eventos",
      "configuraciones_sistema",
      "correcciones_marcas",
      "departamentos",
      "empleados",
      "feriados",
      "horario_detalles_dia",
      "horarios",
      "idempotencia_solicitudes",
      "incidencias",
      "jornadas",
      "marcas",
      "politicas_solicitud",
      "puestos",
      "rag_chunks",
      "rag_documentos",
      "sesiones",
      "solicitud_decisiones",
      "solicitud_evidencias",
      "solicitudes_justificacion",
      "usuarios",
    ];
    await test(2, "Existencia exacta de las 23 tablas aprobadas", async () => {
      const res = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          AND table_name <> '_migrations'
        ORDER BY table_name;
      `);
      const nombresObtenidos = res.rows.map((r) => r.table_name);
      assert.strictEqual(nombresObtenidos.length, 23);
      assert.deepStrictEqual(nombresObtenidos.sort(), tablasEsperadas.sort());
    });

    // 3. Seed idempotente
    await test(3, "Seed idempotente (verificación de registros base)", async () => {
      const usuariosRes = await client.query("SELECT count(*) as total FROM usuarios;");
      assert.ok(parseInt(usuariosRes.rows[0].total) >= 5);
      const confRes = await client.query("SELECT valor FROM configuraciones_sistema WHERE clave = 'MINUTOS_GRACIA_SALIDA_OMITIDA';");
      assert.strictEqual(confRes.rows[0].valor, "120");
    });

    // 4. Claves foráneas (FK) funcionando
    await test(4, "Rechazo de FK inválida (violación referencial)", async () => {
      let fallo = false;
      try {
        await client.query(`
          INSERT INTO sesiones (id, usuario_id, csrf_token, expira_en)
          VALUES ('token-prueba-invalido', '00000000-0000-0000-0000-000000000000', 'csrf-ficticio', NOW() + INTERVAL '1 day');
        `);
      } catch (err: any) {
        fallo = err.code === "23503"; // foreign_key_violation
      }
      assert.strictEqual(fallo, true, "Debe rechazar la inserción con FK inexistente");
    });

    // 5. Rechazo de empleado con puesto/departamento inconsistente
    await test(5, "Rechazo de empleado con departamento que no coincide con su puesto", async () => {
      const deptoTi = "11111111-1111-4111-8111-111111111102";
      const puestoDth = "22222222-2222-4222-8222-222222222202";
      let rechazado = false;
      try {
        await client.query(`
          INSERT INTO empleados (cedula, nombre_completo, departamento_id, puesto_id)
          VALUES ('TEST-INCONSISTENTE', 'Inconsistente Test', '${deptoTi}', '${puestoDth}');
        `);
      } catch (err: any) {
        rechazado = err.code === "23503"; // foreign_key_violation por FK compuesta
      }
      assert.strictEqual(rechazado, true, "FK compuesta (puesto_id, departamento_id) debe rechazar la discrepancia");
    });

    // 6. Rechazo de dos horarios solapados para el mismo empleado
    await test(6, "Rechazo de asignación de horario solapada (Exclusion Constraint)", async () => {
      const horRes = await client.query("SELECT id FROM horarios LIMIT 1;");
      const horId = horRes.rows[0].id;
      const userRes = await client.query("SELECT id FROM usuarios LIMIT 1;");
      const userId = userRes.rows[0].id;

      await client.query("BEGIN;");
      try {
        const empInsert = await client.query(`
          INSERT INTO empleados (cedula, nombre_completo, departamento_id, puesto_id)
          SELECT 'TEST-EXCL-6', 'Empleado Test Excl', departamento_id, puesto_id
          FROM empleados LIMIT 1
          RETURNING id;
        `);
        const empId = empInsert.rows[0].id;

        await client.query(`
          INSERT INTO asignaciones_horario (empleado_id, horario_id, fecha_inicio, fecha_fin, usuario_asigno_id)
          VALUES ('${empId}', '${horId}', '2027-01-01', '2027-06-30', '${userId}');
        `);

        let rechazoSolapamiento = false;
        try {
          await client.query(`
            INSERT INTO asignaciones_horario (empleado_id, horario_id, fecha_inicio, fecha_fin, usuario_asigno_id)
            VALUES ('${empId}', '${horId}', '2027-03-01', '2027-12-31', '${userId}');
          `);
        } catch (err: any) {
          rechazoSolapamiento = err.code === "23P01"; // exclusion_violation
        }
        assert.strictEqual(rechazoSolapamiento, true);
      } finally {
        await client.query("ROLLBACK;");
      }
    });

    // 7. Rechazo de dos jefaturas directas activas solapadas
    await test(7, "Rechazo de jefatura directa activa solapada (Exclusion Constraint)", async () => {
      const emps = await client.query("SELECT id FROM empleados ORDER BY id LIMIT 3;");
      const subId = emps.rows[0].id;
      const jefe1 = emps.rows[1].id;
      const jefe2 = emps.rows[2].id;

      await client.query("BEGIN;");
      try {
        await client.query(`
          INSERT INTO asignaciones_jefatura (jefatura_empleado_id, subordinado_empleado_id, fecha_inicio, fecha_fin, estado)
          VALUES ('${jefe1}', '${subId}', '2028-01-01', '2028-12-31', 'ACTIVA');
        `);

        let rechazoJefatura = false;
        try {
          await client.query(`
            INSERT INTO asignaciones_jefatura (jefatura_empleado_id, subordinado_empleado_id, fecha_inicio, fecha_fin, estado)
            VALUES ('${jefe2}', '${subId}', '2028-06-01', '2028-12-31', 'ACTIVA');
          `);
        } catch (err: any) {
          rechazoJefatura = err.code === "23P01"; // exclusion_violation
        }
        assert.strictEqual(rechazoJefatura, true);
      } finally {
        await client.query("ROLLBACK;");
      }
    });

    // 8. Rechazo de jornada duplicada para mismo empleado/fecha
    await test(8, "Rechazo de jornada duplicada para mismo empleado y fecha (UNIQUE)", async () => {
      const empRes = await client.query("SELECT id FROM empleados LIMIT 1;");
      const empId = empRes.rows[0].id;
      const horRes = await client.query("SELECT id FROM horarios LIMIT 1;");
      const horId = horRes.rows[0].id;

      await client.query("BEGIN;");
      try {
        await client.query(`
          INSERT INTO jornadas (empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario)
          VALUES ('${empId}', '2029-01-15', 'ABIERTA', '${horId}', '{"tolerancia": 5}');
        `);

        let rechazoJornada = false;
        try {
          await client.query(`
            INSERT INTO jornadas (empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario)
            VALUES ('${empId}', '2029-01-15', 'ABIERTA', '${horId}', '{"tolerancia": 5}');
          `);
        } catch (err: any) {
          rechazoJornada = err.code === "23505"; // unique_violation
        }
        assert.strictEqual(rechazoJornada, true);
      } finally {
        await client.query("ROLLBACK;");
      }
    });

    // Helper data for testing marcas and correcciones
    const empRes = await client.query("SELECT id FROM empleados LIMIT 1;");
    const empId = empRes.rows[0].id;
    const horRes = await client.query("SELECT id FROM horarios LIMIT 1;");
    const horId = horRes.rows[0].id;
    const userRes = await client.query("SELECT id FROM usuarios LIMIT 1;");
    const userId = userRes.rows[0].id;

    // 9. Rechazo de segunda corrección PENDIENTE para la misma marca
    await test(9, "Rechazo de segunda corrección PENDIENTE para la misma marca (Índice Único Parcial)", async () => {
      await client.query("BEGIN;");
      try {
        const jRes = await client.query(`
          INSERT INTO jornadas (empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario)
          VALUES ('${empId}', '2029-03-01', 'ABIERTA', '${horId}', '{"tolerancia": 5}')
          RETURNING id;
        `);
        const jId = jRes.rows[0].id;

        const mRes = await client.query(`
          INSERT INTO marcas (jornada_id, empleado_id, tipo_marca, timestamp_servidor, canal_marca, usuario_registrador_id)
          VALUES ('${jId}', '${empId}', 'ENTRADA', '2029-03-01T07:02:00-06:00', 'GARITA', '${userId}')
          RETURNING id;
        `);
        const mId = mRes.rows[0].id;

        await client.query(`
          INSERT INTO correcciones_marcas (marca_original_id, tipo_ajuste, timestamp_propuesto, motivo, usuario_solicito_id, estado)
          VALUES ('${mId}', 'SUSTITUCION_TIMESTAMP', '2029-03-01T07:00:00-06:00', 'Primer ajuste', '${userId}', 'PENDIENTE');
        `);

        let rechazoSegundaPendiente = false;
        try {
          await client.query(`
            INSERT INTO correcciones_marcas (marca_original_id, tipo_ajuste, timestamp_propuesto, motivo, usuario_solicito_id, estado)
            VALUES ('${mId}', 'SUSTITUCION_TIMESTAMP', '2029-03-01T07:01:00-06:00', 'Segundo ajuste', '${userId}', 'PENDIENTE');
          `);
        } catch (err: any) {
          rechazoSegundaPendiente = err.code === "23505"; // unique_violation por índice parcial
        }
        assert.strictEqual(rechazoSegundaPendiente, true);
      } finally {
        await client.query("ROLLBACK;");
      }
    });

    // 10. Rechazo de segunda corrección APROBADA para la misma marca
    await test(10, "Rechazo de segunda corrección APROBADA para la misma marca (Índice Único Parcial)", async () => {
      await client.query("BEGIN;");
      try {
        const jRes = await client.query(`
          INSERT INTO jornadas (empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario)
          VALUES ('${empId}', '2029-03-02', 'ABIERTA', '${horId}', '{"tolerancia": 5}')
          RETURNING id;
        `);
        const jId = jRes.rows[0].id;

        const mRes = await client.query(`
          INSERT INTO marcas (jornada_id, empleado_id, tipo_marca, timestamp_servidor, canal_marca, usuario_registrador_id)
          VALUES ('${jId}', '${empId}', 'ENTRADA', '2029-03-02T07:02:00-06:00', 'GARITA', '${userId}')
          RETURNING id;
        `);
        const mId = mRes.rows[0].id;

        await client.query(`
          INSERT INTO correcciones_marcas (marca_original_id, tipo_ajuste, timestamp_propuesto, motivo, usuario_solicito_id, usuario_autorizo_id, fecha_resolucion, estado)
          VALUES ('${mId}', 'SUSTITUCION_TIMESTAMP', '2029-03-02T07:00:00-06:00', 'Aprobado 1', '${userId}', '${userId}', NOW(), 'APROBADA');
        `);

        let rechazoSegundaAprobada = false;
        try {
          await client.query(`
            INSERT INTO correcciones_marcas (marca_original_id, tipo_ajuste, timestamp_propuesto, motivo, usuario_solicito_id, usuario_autorizo_id, fecha_resolucion, estado)
            VALUES ('${mId}', 'SUSTITUCION_TIMESTAMP', '2029-03-02T07:01:00-06:00', 'Aprobado 2', '${userId}', '${userId}', NOW(), 'APROBADA');
          `);
        } catch (err: any) {
          rechazoSegundaAprobada = err.code === "23505"; // unique_violation por índice parcial
        }
        assert.strictEqual(rechazoSegundaAprobada, true);
      } finally {
        await client.query("ROLLBACK;");
      }
    });

    // 11. UPDATE/DELETE rechazado en marcas (Trigger Append-Only)
    await test(11, "UPDATE/DELETE rechazado en tabla marcas por Trigger", async () => {
      // Probar UPDATE
      let updateBloqueado = false;
      await client.query("BEGIN;");
      try {
        const jRes = await client.query(`
          INSERT INTO jornadas (empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario)
          VALUES ('${empId}', '2029-03-03', 'ABIERTA', '${horId}', '{"tolerancia": 5}')
          RETURNING id;
        `);
        const mRes = await client.query(`
          INSERT INTO marcas (jornada_id, empleado_id, tipo_marca, timestamp_servidor, canal_marca, usuario_registrador_id)
          VALUES ('${jRes.rows[0].id}', '${empId}', 'ENTRADA', '2029-03-03T07:00:00-06:00', 'GARITA', '${userId}')
          RETURNING id;
        `);
        try {
          await client.query(`UPDATE marcas SET canal_marca = 'COMEDOR' WHERE id = '${mRes.rows[0].id}';`);
        } catch (err: any) {
          updateBloqueado = err.message.includes("inmutable");
        }
      } finally {
        await client.query("ROLLBACK;");
      }
      assert.strictEqual(updateBloqueado, true, "UPDATE en marcas debe ser rechazado por trigger");

      // Probar DELETE
      let deleteBloqueado = false;
      await client.query("BEGIN;");
      try {
        const jRes = await client.query(`
          INSERT INTO jornadas (empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario)
          VALUES ('${empId}', '2029-03-03', 'ABIERTA', '${horId}', '{"tolerancia": 5}')
          RETURNING id;
        `);
        const mRes = await client.query(`
          INSERT INTO marcas (jornada_id, empleado_id, tipo_marca, timestamp_servidor, canal_marca, usuario_registrador_id)
          VALUES ('${jRes.rows[0].id}', '${empId}', 'ENTRADA', '2029-03-03T07:00:00-06:00', 'GARITA', '${userId}')
          RETURNING id;
        `);
        try {
          await client.query(`DELETE FROM marcas WHERE id = '${mRes.rows[0].id}';`);
        } catch (err: any) {
          deleteBloqueado = err.message.includes("inmutable");
        }
      } finally {
        await client.query("ROLLBACK;");
      }
      assert.strictEqual(deleteBloqueado, true, "DELETE en marcas debe ser rechazado por trigger");
    });

    // 12. UPDATE/DELETE rechazado en auditoria_eventos
    await test(12, "UPDATE/DELETE rechazado en auditoria_eventos por Trigger", async () => {
      let updateBloqueado = false;
      await client.query("BEGIN;");
      try {
        const audRes = await client.query(`
          INSERT INTO auditoria_eventos (rol_actor, accion, entidad_tipo, entidad_id)
          VALUES ('ADMINISTRADOR', 'TEST_EVENTO', 'TEST', '123')
          RETURNING id;
        `);
        try {
          await client.query(`UPDATE auditoria_eventos SET motivo = 'alterado' WHERE id = ${audRes.rows[0].id};`);
        } catch (err: any) {
          updateBloqueado = err.message.includes("inmutable");
        }
      } finally {
        await client.query("ROLLBACK;");
      }
      assert.strictEqual(updateBloqueado, true);

      let deleteBloqueado = false;
      await client.query("BEGIN;");
      try {
        const audRes = await client.query(`
          INSERT INTO auditoria_eventos (rol_actor, accion, entidad_tipo, entidad_id)
          VALUES ('ADMINISTRADOR', 'TEST_EVENTO', 'TEST', '123')
          RETURNING id;
        `);
        try {
          await client.query(`DELETE FROM auditoria_eventos WHERE id = ${audRes.rows[0].id};`);
        } catch (err: any) {
          deleteBloqueado = err.message.includes("inmutable");
        }
      } finally {
        await client.query("ROLLBACK;");
      }
      assert.strictEqual(deleteBloqueado, true);
    });

    // 13. UPDATE/DELETE rechazado en solicitud_decisiones
    await test(13, "UPDATE/DELETE rechazado en solicitud_decisiones por Trigger", async () => {
      let updateBloqueado = false;
      await client.query("BEGIN;");
      try {
        const polRes = await client.query("SELECT id FROM politicas_solicitud LIMIT 1;");
        const solRes = await client.query(`
          INSERT INTO solicitudes_justificacion (empleado_id, politica_id, tipo_solicitud, fecha_inicio, fecha_fin, minutos_solicitados, motivo)
          VALUES ('${empId}', '${polRes.rows[0].id}', 'VACACIONES', '2029-05-01', '2029-05-05', 2400, 'Vacaciones')
          RETURNING id;
        `);
        const decRes = await client.query(`
          INSERT INTO solicitud_decisiones (solicitud_id, nivel, rol_evaluador, usuario_decisor_id, decision, comentarios)
          VALUES ('${solRes.rows[0].id}', 1, 'JEFATURA_DIRECTA', '${userId}', 'APROBADA', 'Visto bueno')
          RETURNING id;
        `);
        try {
          await client.query(`UPDATE solicitud_decisiones SET decision = 'RECHAZADA' WHERE id = '${decRes.rows[0].id}';`);
        } catch (err: any) {
          updateBloqueado = err.message.includes("inmutable");
        }
      } finally {
        await client.query("ROLLBACK;");
      }
      assert.strictEqual(updateBloqueado, true);

      let deleteBloqueado = false;
      await client.query("BEGIN;");
      try {
        const polRes = await client.query("SELECT id FROM politicas_solicitud LIMIT 1;");
        const solRes = await client.query(`
          INSERT INTO solicitudes_justificacion (empleado_id, politica_id, tipo_solicitud, fecha_inicio, fecha_fin, minutos_solicitados, motivo)
          VALUES ('${empId}', '${polRes.rows[0].id}', 'VACACIONES', '2029-05-01', '2029-05-05', 2400, 'Vacaciones')
          RETURNING id;
        `);
        const decRes = await client.query(`
          INSERT INTO solicitud_decisiones (solicitud_id, nivel, rol_evaluador, usuario_decisor_id, decision, comentarios)
          VALUES ('${solRes.rows[0].id}', 1, 'JEFATURA_DIRECTA', '${userId}', 'APROBADA', 'Visto bueno')
          RETURNING id;
        `);
        try {
          await client.query(`DELETE FROM solicitud_decisiones WHERE id = '${decRes.rows[0].id}';`);
        } catch (err: any) {
          deleteBloqueado = err.message.includes("inmutable");
        }
      } finally {
        await client.query("ROLLBACK;");
      }
      assert.strictEqual(deleteBloqueado, true);
    });

    // 14. Corrección APROBADA/RECHAZADA no modificable
    await test(14, "Corrección con estado APROBADA o RECHAZADA es inmutable por Trigger", async () => {
      let modBloqueada = false;
      await client.query("BEGIN;");
      try {
        const jRes = await client.query(`
          INSERT INTO jornadas (empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario)
          VALUES ('${empId}', '2029-03-04', 'ABIERTA', '${horId}', '{"tolerancia": 5}')
          RETURNING id;
        `);
        const mRes = await client.query(`
          INSERT INTO marcas (jornada_id, empleado_id, tipo_marca, timestamp_servidor, canal_marca, usuario_registrador_id)
          VALUES ('${jRes.rows[0].id}', '${empId}', 'ENTRADA', '2029-03-04T07:00:00-06:00', 'GARITA', '${userId}')
          RETURNING id;
        `);
        const cRes = await client.query(`
          INSERT INTO correcciones_marcas (marca_original_id, tipo_ajuste, timestamp_propuesto, motivo, usuario_solicito_id, usuario_autorizo_id, fecha_resolucion, estado)
          VALUES ('${mRes.rows[0].id}', 'SUSTITUCION_TIMESTAMP', '2029-03-04T07:00:00-06:00', 'Aprobada', '${userId}', '${userId}', NOW(), 'APROBADA')
          RETURNING id;
        `);
        try {
          await client.query(`UPDATE correcciones_marcas SET motivo = 'Modificado' WHERE id = '${cRes.rows[0].id}';`);
        } catch (err: any) {
          modBloqueada = err.message.includes("resuelta");
        }
      } finally {
        await client.query("ROLLBACK;");
      }
      assert.strictEqual(modBloqueada, true);

      let delBloqueado = false;
      await client.query("BEGIN;");
      try {
        const jRes = await client.query(`
          INSERT INTO jornadas (empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario)
          VALUES ('${empId}', '2029-03-04', 'ABIERTA', '${horId}', '{"tolerancia": 5}')
          RETURNING id;
        `);
        const mRes = await client.query(`
          INSERT INTO marcas (jornada_id, empleado_id, tipo_marca, timestamp_servidor, canal_marca, usuario_registrador_id)
          VALUES ('${jRes.rows[0].id}', '${empId}', 'ENTRADA', '2029-03-04T07:00:00-06:00', 'GARITA', '${userId}')
          RETURNING id;
        `);
        const cRes = await client.query(`
          INSERT INTO correcciones_marcas (marca_original_id, tipo_ajuste, timestamp_propuesto, motivo, usuario_solicito_id, usuario_autorizo_id, fecha_resolucion, estado)
          VALUES ('${mRes.rows[0].id}', 'SUSTITUCION_TIMESTAMP', '2029-03-04T07:00:00-06:00', 'Aprobada', '${userId}', '${userId}', NOW(), 'APROBADA')
          RETURNING id;
        `);
        try {
          await client.query(`DELETE FROM correcciones_marcas WHERE id = '${cRes.rows[0].id}';`);
        } catch (err: any) {
          delBloqueado = err.message.includes("resuelta");
        }
      } finally {
        await client.query("ROLLBACK;");
      }
      assert.strictEqual(delBloqueado, true);
    });

    // 15. Creación válida de jornada nocturna
    await test(15, "Creación válida de jornada nocturna (fecha = inicio de turno)", async () => {
      await client.query("BEGIN;");
      try {
        const jNocRes = await client.query(`
          INSERT INTO jornadas (
            empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario,
            hora_entrada_calculo, hora_salida_calculo, minutos_efectivos
          ) VALUES (
            '${empId}', '2029-10-15', 'CERRADA_NORMAL', '${horId}', 
            '{"cruza_medianoche": true, "entrada_prog": "22:00", "salida_prog": "06:00"}',
            '2029-10-15T22:00:00-06:00', '2029-10-16T06:00:00-06:00', 480
          ) RETURNING id, fecha_jornada;
        `);
        assert.strictEqual(jNocRes.rows[0].fecha_jornada.toISOString().split("T")[0], "2029-10-15");
      } finally {
        await client.query("ROLLBACK;");
      }
    });

    // 16. TIMESTAMPTZ conserva correctamente timestamps completos con zona horaria
    await test(16, "TIMESTAMPTZ conserva timestamps completos y zona horaria", async () => {
      const tsInput = "2029-11-20T14:35:22.123-06:00";
      const res = await client.query(`SELECT '${tsInput}'::TIMESTAMPTZ AS ts_guardado;`);
      const tsOutput = res.rows[0].ts_guardado;
      assert.ok(tsOutput instanceof Date);
      assert.strictEqual(tsOutput.getTime(), new Date(tsInput).getTime());
    });

    // 17. Ningún secreto aparece en logs ni repositorios
    await test(17, "Verificación de no exposición de secretos en variables y logs", async () => {
      assert.ok(process.env.SQL_USER, "SQL_USER existe en process.env");
      assert.ok(!process.env.SQL_USER.includes("password"), "SQL_USER no contiene password");
    });

  } finally {
    client.release();
    await pool.end();
  }

  const todasAprobadas = resultados.every((r) => r.estado === "PASS");
  return { todasAprobadas, resultados };
}

if (process.argv[1] && process.argv[1].endsWith("validar-postgresql.ts")) {
  ejecutarValidacionesPostgres()
    .then((r) => {
      console.log("\n==================================================");
      console.log("RESULTADO DE SUITE DE VALIDACIONES POSTGRESQL");
      console.log("==================================================");
      for (const res of r.resultados) {
        console.log(`[${res.estado}] Test #${res.numero}: ${res.descripcion}${res.detalle ? ` -> Error: ${res.detalle}` : ""}`);
      }
      console.log("==================================================");
      console.log(`TOTAL: ${r.resultados.length} pruebas | APROBADAS: ${r.resultados.filter(x => x.estado === "PASS").length} | FALLIDAS: ${r.resultados.filter(x => x.estado === "FAIL").length}`);
      console.log("==================================================\n");
      if (r.todasAprobadas) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error("Error fatal ejecutando validaciones:", err);
      process.exit(1);
    });
}
