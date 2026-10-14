import type {
  HorarioEntity,
  HorarioDetalleDia,
  AsignacionHorarioEntity,
  AsignacionHorarioDetallada,
  IHorariosRepository,
} from "../interfaces/horarios.js";
import { getPool } from "../../../db/index.js";
import { randomUUID } from "node:crypto";
import type pg from "pg";

export class PostgresHorariosRepository implements IHorariosRepository {
  private pool: pg.Pool;

  constructor(customPool?: pg.Pool) {
    this.pool = customPool || getPool();
  }

  async listar(soloActivos: boolean = false): Promise<HorarioEntity[]> {
    const where = soloActivos ? "WHERE estado = 'ACTIVO'" : "";
    const hRes = await this.pool.query(
      `SELECT * FROM horarios ${where} ORDER BY nombre ASC;`
    );

    const resultado: HorarioEntity[] = [];
    for (const hRow of hRes.rows) {
      const dRes = await this.pool.query(
        `SELECT * FROM horario_detalles_dia WHERE horario_id = $1 ORDER BY dia_semana ASC;`,
        [hRow.id]
      );
      const detalles_dia: HorarioDetalleDia[] = dRes.rows.map((d: any) => ({
        dia_semana: d.dia_semana,
        es_laborable: Boolean(d.es_laborable),
        hora_entrada: d.hora_entrada ? String(d.hora_entrada).substring(0, 5) : undefined,
        hora_salida: d.hora_salida ? String(d.hora_salida).substring(0, 5) : undefined,
        cruza_medianoche: Boolean(d.cruza_medianoche),
        minutos_esperados: d.minutos_esperados,
      }));

      resultado.push({
        id: hRow.id,
        codigo: hRow.codigo,
        nombre: hRow.nombre,
        tolerancia_entrada_minutos: hRow.tolerancia_entrada_minutos,
        minutos_semanales_referencia: hRow.minutos_semanales_referencia,
        minutos_desayuno_max: hRow.minutos_desayuno_max,
        minutos_almuerzo_max: hRow.minutos_almuerzo_max,
        minutos_cafe_max: hRow.minutos_cafe_max,
        estado: hRow.estado as "ACTIVO" | "INACTIVO",
        creado_en: hRow.creado_en instanceof Date ? hRow.creado_en.toISOString() : String(hRow.creado_en),
        detalles_dia,
      });
    }

    return resultado;
  }

  async obtenerHorarioPorId(id: string): Promise<HorarioEntity | null> {
    const hRes = await this.pool.query(
      `SELECT * FROM horarios WHERE id = $1 LIMIT 1;`,
      [id]
    );
    if (hRes.rows.length === 0) return null;
    const hRow = hRes.rows[0];

    const dRes = await this.pool.query(
      `SELECT * FROM horario_detalles_dia WHERE horario_id = $1 ORDER BY dia_semana ASC;`,
      [id]
    );

    const detalles_dia: HorarioDetalleDia[] = dRes.rows.map((d: any) => ({
      dia_semana: d.dia_semana,
      es_laborable: Boolean(d.es_laborable),
      hora_entrada: d.hora_entrada ? String(d.hora_entrada).substring(0, 5) : undefined,
      hora_salida: d.hora_salida ? String(d.hora_salida).substring(0, 5) : undefined,
      cruza_medianoche: Boolean(d.cruza_medianoche),
      minutos_esperados: d.minutos_esperados,
    }));

    return {
      id: hRow.id,
      codigo: hRow.codigo,
      nombre: hRow.nombre,
      tolerancia_entrada_minutos: hRow.tolerancia_entrada_minutos,
      minutos_semanales_referencia: hRow.minutos_semanales_referencia,
      minutos_desayuno_max: hRow.minutos_desayuno_max,
      minutos_almuerzo_max: hRow.minutos_almuerzo_max,
      minutos_cafe_max: hRow.minutos_cafe_max,
      estado: hRow.estado as "ACTIVO" | "INACTIVO",
      creado_en: hRow.creado_en instanceof Date ? hRow.creado_en.toISOString() : String(hRow.creado_en),
      detalles_dia,
    };
  }

  async obtenerHorarioPorCodigo(codigo: string): Promise<HorarioEntity | null> {
    const hRes = await this.pool.query(
      `SELECT id FROM horarios WHERE LOWER(codigo) = LOWER($1) LIMIT 1;`,
      [codigo.trim()]
    );
    if (hRes.rows.length === 0) return null;
    return this.obtenerHorarioPorId(hRes.rows[0].id);
  }

  async guardarHorario(horario: HorarioEntity): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      await client.query(
        `INSERT INTO horarios (
          id, codigo, nombre, tolerancia_entrada_minutos, minutos_semanales_referencia, 
          minutos_desayuno_max, minutos_almuerzo_max, minutos_cafe_max, estado
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          codigo = EXCLUDED.codigo,
          nombre = EXCLUDED.nombre,
          tolerancia_entrada_minutos = EXCLUDED.tolerancia_entrada_minutos,
          minutos_semanales_referencia = EXCLUDED.minutos_semanales_referencia,
          minutos_desayuno_max = EXCLUDED.minutos_desayuno_max,
          minutos_almuerzo_max = EXCLUDED.minutos_almuerzo_max,
          minutos_cafe_max = EXCLUDED.minutos_cafe_max,
          estado = EXCLUDED.estado;`,
        [
          horario.id,
          horario.codigo,
          horario.nombre,
          horario.tolerancia_entrada_minutos || 0,
          horario.minutos_semanales_referencia || 2880,
          horario.minutos_desayuno_max ?? 15,
          horario.minutos_almuerzo_max ?? 30,
          horario.minutos_cafe_max ?? 15,
          horario.estado || "ACTIVO",
        ]
      );

      if (horario.detalles_dia && horario.detalles_dia.length > 0) {
        for (const d of horario.detalles_dia) {
          await client.query(
            `INSERT INTO horario_detalles_dia (
              horario_id, dia_semana, es_laborable, hora_entrada, hora_salida, cruza_medianoche, minutos_esperados
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (horario_id, dia_semana) DO UPDATE SET
              es_laborable = EXCLUDED.es_laborable,
              hora_entrada = EXCLUDED.hora_entrada,
              hora_salida = EXCLUDED.hora_salida,
              cruza_medianoche = EXCLUDED.cruza_medianoche,
              minutos_esperados = EXCLUDED.minutos_esperados;`,
            [
              horario.id,
              d.dia_semana,
              d.es_laborable,
              d.hora_entrada || null,
              d.hora_salida || null,
              d.cruza_medianoche || false,
              d.minutos_esperados || 0,
            ]
          );
        }
      }

      await client.query("COMMIT;");
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async crearHorario(
    horario: {
      codigo: string;
      nombre: string;
      tolerancia_entrada_minutos?: number;
      minutos_semanales_referencia?: number;
      minutos_desayuno_max?: number;
      minutos_almuerzo_max?: number;
      minutos_cafe_max?: number;
      estado?: "ACTIVO" | "INACTIVO";
    },
    detalles_dia: HorarioDetalleDia[]
  ): Promise<HorarioEntity> {
    const id = randomUUID();
    const entity: HorarioEntity = {
      id,
      codigo: horario.codigo.trim().toUpperCase(),
      nombre: horario.nombre.trim(),
      tolerancia_entrada_minutos: horario.tolerancia_entrada_minutos || 0,
      minutos_semanales_referencia: horario.minutos_semanales_referencia || 2880,
      minutos_desayuno_max: horario.minutos_desayuno_max ?? 15,
      minutos_almuerzo_max: horario.minutos_almuerzo_max ?? 30,
      minutos_cafe_max: horario.minutos_cafe_max ?? 15,
      estado: horario.estado || "ACTIVO",
      detalles_dia,
    };

    await this.guardarHorario(entity);
    return (await this.obtenerHorarioPorId(id))!;
  }

  async actualizarHorario(
    id: string,
    datos: {
      nombre?: string;
      tolerancia_entrada_minutos?: number;
      minutos_semanales_referencia?: number;
      minutos_desayuno_max?: number;
      minutos_almuerzo_max?: number;
      minutos_cafe_max?: number;
      estado?: "ACTIVO" | "INACTIVO";
    },
    detalles_dia?: HorarioDetalleDia[]
  ): Promise<HorarioEntity> {
    const actual = await this.obtenerHorarioPorId(id);
    if (!actual) {
      const err = new Error(`Horario con ID '${id}' no encontrado.`);
      (err as any).statusCode = 404;
      (err as any).codigo = "RECURSO_NO_ENCONTRADO";
      throw err;
    }

    const actualizado: HorarioEntity = {
      ...actual,
      nombre: datos.nombre !== undefined ? datos.nombre.trim() : actual.nombre,
      tolerancia_entrada_minutos:
        datos.tolerancia_entrada_minutos !== undefined
          ? datos.tolerancia_entrada_minutos
          : actual.tolerancia_entrada_minutos,
      minutos_semanales_referencia:
        datos.minutos_semanales_referencia !== undefined
          ? datos.minutos_semanales_referencia
          : actual.minutos_semanales_referencia,
      minutos_desayuno_max:
        datos.minutos_desayuno_max !== undefined
          ? datos.minutos_desayuno_max
          : actual.minutos_desayuno_max,
      minutos_almuerzo_max:
        datos.minutos_almuerzo_max !== undefined
          ? datos.minutos_almuerzo_max
          : actual.minutos_almuerzo_max,
      minutos_cafe_max:
        datos.minutos_cafe_max !== undefined ? datos.minutos_cafe_max : actual.minutos_cafe_max,
      estado: datos.estado !== undefined ? datos.estado : actual.estado,
      detalles_dia: detalles_dia && detalles_dia.length > 0 ? detalles_dia : actual.detalles_dia,
    };

    await this.guardarHorario(actualizado);
    return (await this.obtenerHorarioPorId(id))!;
  }

  async cambiarEstadoHorario(id: string, estado: "ACTIVO" | "INACTIVO"): Promise<HorarioEntity> {
    return this.actualizarHorario(id, { estado });
  }

  async eliminarHorario(id: string): Promise<void> {
    const actual = await this.obtenerHorarioPorId(id);
    if (!actual) {
      const err = new Error("Horario no encontrado.");
      (err as any).statusCode = 404;
      (err as any).codigo = "RECURSO_NO_ENCONTRADO";
      throw err;
    }

    // 1. Verificar asignaciones_horario (activas o históricas)
    const resAsig = await this.pool.query(
      `SELECT COUNT(*)::int as total FROM asignaciones_horario WHERE horario_id = $1;`,
      [id]
    );
    // 2. Verificar jornadas aplicadas
    const resJornadas = await this.pool.query(
      `SELECT COUNT(*)::int as total FROM jornadas WHERE horario_id_aplicado = $1;`,
      [id]
    );

    const totalAsig = resAsig.rows[0]?.total || 0;
    const totalJornadas = resJornadas.rows[0]?.total || 0;

    if (totalAsig > 0 || totalJornadas > 0) {
      const err = new Error(
        "El horario posee asignaciones o información histórica y no puede eliminarse. Puede desactivarlo."
      );
      (err as any).statusCode = 409;
      (err as any).codigo = "HORARIO_EN_USO";
      throw err;
    }

    // Eliminar días configurados y luego el horario
    await this.pool.query(`DELETE FROM horario_detalles_dia WHERE horario_id = $1;`, [id]);
    await this.pool.query(`DELETE FROM horarios WHERE id = $1;`, [id]);
  }

  async asignarHorarioEmpleado(asignacion: AsignacionHorarioEntity): Promise<void> {
    await this.pool.query(
      `INSERT INTO asignaciones_horario (
        id, empleado_id, horario_id, fecha_inicio, fecha_fin, usuario_asigno_id, creado_en
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        horario_id = EXCLUDED.horario_id,
        fecha_inicio = EXCLUDED.fecha_inicio,
        fecha_fin = EXCLUDED.fecha_fin,
        usuario_asigno_id = EXCLUDED.usuario_asigno_id;`,
      [
        asignacion.id,
        asignacion.empleado_id,
        asignacion.horario_id,
        asignacion.fecha_inicio,
        asignacion.fecha_fin || null,
        asignacion.usuario_asigno_id,
        asignacion.creado_en || new Date().toISOString(),
      ]
    );
  }

  async asignarHorarioConCierrePrevio(params: {
    empleado_id: string;
    horario_id: string;
    fecha_inicio: string;
    fecha_fin?: string;
    usuario_asigno_id: string;
  }): Promise<AsignacionHorarioDetallada> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN;");

      // Validar horario existe y está activo
      const hRes = await client.query(`SELECT id, codigo, nombre, estado FROM horarios WHERE id = $1;`, [
        params.horario_id,
      ]);
      if (hRes.rows.length === 0 || hRes.rows[0].estado !== "ACTIVO") {
        const err = new Error("El horario seleccionado no existe o no se encuentra activo.");
        (err as any).statusCode = 400;
        (err as any).codigo = "HORARIO_NO_ACTIVO";
        throw err;
      }
      const horarioData = hRes.rows[0];

      // Validar que no existan solapamientos ilegales:
      // Si existe una asignación que empiece en o después de la fecha_inicio propuesta
      const solapadasFuturas = await client.query(
        `SELECT id, fecha_inicio, fecha_fin 
         FROM asignaciones_horario 
         WHERE empleado_id = $1 AND fecha_inicio >= $2;`,
        [params.empleado_id, params.fecha_inicio]
      );

      if (solapadasFuturas.rows.length > 0) {
        const err = new Error(
          "Conflicto de asignación: Ya existe una asignación de horario registrada para la fecha indicada o posterior."
        );
        (err as any).statusCode = 409;
        (err as any).codigo = "SOLAPAMIENTO_HORARIO";
        throw err;
      }

      // Cerrar la asignación anterior abierta o que cubría la nueva fecha_inicio
      // fecha_fin_nueva = fecha_inicio - 1 día
      await client.query(
        `UPDATE asignaciones_horario 
         SET fecha_fin = (DATE($1) - INTERVAL '1 day')::date 
         WHERE empleado_id = $2 
           AND (fecha_fin IS NULL OR fecha_fin >= $1);`,
        [params.fecha_inicio, params.empleado_id]
      );

      // Insertar nueva asignación
      const nuevoId = randomUUID();
      const insertRes = await client.query(
        `INSERT INTO asignaciones_horario (
          id, empleado_id, horario_id, fecha_inicio, fecha_fin, usuario_asigno_id
        ) VALUES ($1, $2, $3, $4, $5, $6) 
        RETURNING id, empleado_id, horario_id, fecha_inicio, fecha_fin, usuario_asigno_id, creado_en;`,
        [
          nuevoId,
          params.empleado_id,
          params.horario_id,
          params.fecha_inicio,
          params.fecha_fin || null,
          params.usuario_asigno_id,
        ]
      );

      await client.query("COMMIT;");

      const r = insertRes.rows[0];
      return {
        id: r.id,
        empleado_id: r.empleado_id,
        horario_id: r.horario_id,
        horario_codigo: horarioData.codigo,
        horario_nombre: horarioData.nombre,
        fecha_inicio: r.fecha_inicio instanceof Date ? r.fecha_inicio.toISOString().split("T")[0] : String(r.fecha_inicio),
        fecha_fin: r.fecha_fin ? (r.fecha_fin instanceof Date ? r.fecha_fin.toISOString().split("T")[0] : String(r.fecha_fin)) : undefined,
        usuario_asigno_id: r.usuario_asigno_id,
        creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
      };
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async obtenerHistorialAsignaciones(empleado_id: string): Promise<AsignacionHorarioDetallada[]> {
    const res = await this.pool.query(
      `SELECT ah.id, ah.empleado_id, ah.horario_id, ah.fecha_inicio, ah.fecha_fin, ah.usuario_asigno_id, ah.creado_en,
              h.codigo as horario_codigo, h.nombre as horario_nombre
       FROM asignaciones_horario ah
       JOIN horarios h ON h.id = ah.horario_id
       WHERE ah.empleado_id = $1
       ORDER BY ah.fecha_inicio DESC, ah.creado_en DESC;`,
      [empleado_id]
    );

    return res.rows.map((r) => ({
      id: r.id,
      empleado_id: r.empleado_id,
      horario_id: r.horario_id,
      horario_codigo: r.horario_codigo,
      horario_nombre: r.horario_nombre,
      fecha_inicio: r.fecha_inicio instanceof Date ? r.fecha_inicio.toISOString().split("T")[0] : String(r.fecha_inicio),
      fecha_fin: r.fecha_fin ? (r.fecha_fin instanceof Date ? r.fecha_fin.toISOString().split("T")[0] : String(r.fecha_fin)) : undefined,
      usuario_asigno_id: r.usuario_asigno_id,
      creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
    }));
  }

  async obtenerHorarioVigenteEmpleado(
    empleado_id: string,
    fecha: string
  ): Promise<{ horario: HorarioEntity; detalleDia: HorarioDetalleDia } | null> {
    const res = await this.pool.query(
      `SELECT h.id
       FROM asignaciones_horario a
       JOIN horarios h ON a.horario_id = h.id
       WHERE a.empleado_id = $1
         AND a.fecha_inicio <= $2
         AND (a.fecha_fin IS NULL OR a.fecha_fin >= $2)
       ORDER BY a.fecha_inicio DESC
       LIMIT 1;`,
      [empleado_id, fecha]
    );

    if (res.rows.length === 0) return null;
    const horarioId = res.rows[0].id;
    const horario = await this.obtenerHorarioPorId(horarioId);
    if (!horario) return null;

    const dateObj = new Date(`${fecha}T12:00:00Z`);
    const dayJs = dateObj.getUTCDay();
    const diaSemana = dayJs === 0 ? 7 : dayJs;

    let detalleDia = horario.detalles_dia.find((d) => d.dia_semana === diaSemana);
    if (!detalleDia) {
      detalleDia = {
        dia_semana: diaSemana,
        es_laborable: false,
        cruza_medianoche: false,
        minutos_esperados: 0,
      };
    }

    return { horario, detalleDia };
  }
}
