import type {
  JornadaEntity,
  IJornadasRepository,
  EstadoJornada,
  SnapshotHorario,
  ResultadosDerivadosJornada,
} from "../interfaces/jornadas.js";
import { getPool } from "../../../db/index.js";
import type pg from "pg";

export class PostgresJornadasRepository implements IJornadasRepository {
  private pool: pg.Pool;

  constructor(customPool?: pg.Pool) {
    this.pool = customPool || getPool();
  }

  private mapRowToEntity(row: any): JornadaEntity {
    const snap: SnapshotHorario = typeof row.snapshot_horario === "string" 
      ? JSON.parse(row.snapshot_horario) 
      : row.snapshot_horario || {
          horario_id_origen: row.horario_id_aplicado,
          hora_entrada_programada: "07:00",
          hora_salida_programada: "16:30",
          tolerancia_minutos: 5,
          minutos_esperados: 570,
          cruza_medianoche: false,
        };

    const entradaCalc = row.hora_entrada_calculo instanceof Date ? row.hora_entrada_calculo.toISOString() : (row.hora_entrada_calculo || undefined);
    const salidaCalc = row.hora_salida_calculo instanceof Date ? row.hora_salida_calculo.toISOString() : (row.hora_salida_calculo || undefined);

    let minutosTotal = Number(row.minutos_tiempo_total) || 0;
    if (minutosTotal === 0 && entradaCalc && salidaCalc) {
      const diffMs = new Date(salidaCalc).getTime() - new Date(entradaCalc).getTime();
      if (diffMs > 0) {
        minutosTotal = Math.max(0, Math.floor(diffMs / 60000));
      }
    }

    const mDescansos = Number(row.minutos_total_descansos) || 0;
    let mEfectivos = Number(row.minutos_efectivos) || 0;
    if (mEfectivos === 0 && minutosTotal > 0) {
      mEfectivos = Math.max(0, minutosTotal - mDescansos);
    }

    const resDerivados: ResultadosDerivadosJornada = {
      hora_entrada_efectiva: entradaCalc,
      hora_salida_efectiva: salidaCalc,
      minutos_desayuno: Number(row.minutos_desayuno) || 0,
      minutos_almuerzo: Number(row.minutos_almuerzo) || 0,
      minutos_cafe: Number(row.minutos_cafe) || 0,
      minutos_descansos: mDescansos,
      minutos_tiempo_total: minutosTotal,
      minutos_efectivos: mEfectivos,
      minutos_justificados_comp: Number(row.minutos_justificados_comp) || 0,
      minutos_justificados_nocomp: Number(row.minutos_justificados_nocomp) || 0,
      minutos_tardanza: Number(row.minutos_tardanza) || 0,
      minutos_salida_anticipada: Number(row.minutos_salida_anticipada) || 0,
      minutos_tiempo_adicional: Number(row.minutos_tiempo_adicional) || 0,
      minutos_tiempo_adicional_aprobado: Number(row.minutos_tiempo_adicional_aprobado) || 0,
      estado_tiempo_adicional: row.estado_tiempo_adicional || (Number(row.minutos_tiempo_adicional) > 0 ? "PENDIENTE" : "NO_APLICA"),
      cumplimiento_porcentaje: parseFloat(row.cumplimiento_porcentaje) || 0,
    };

    const fechaJornadaStr = row.fecha_jornada instanceof Date 
      ? row.fecha_jornada.toISOString().split("T")[0] 
      : String(row.fecha_jornada).split("T")[0];

    return {
      id: row.id,
      empleado_id: row.empleado_id,
      fecha_jornada: fechaJornadaStr,
      estado_jornada: row.estado_jornada as EstadoJornada,
      snapshot_horario: snap,
      resultados_derivados: resDerivados,
      hora_entrada_marcada: row.hora_entrada_marcada instanceof Date ? row.hora_entrada_marcada.toISOString() : row.hora_entrada_marcada || null,
      hora_entrada_calculo: entradaCalc || null,
      origen_entrada_calculo: row.origen_entrada_calculo || "MARCA_FISICA",
      hora_salida_marcada: row.hora_salida_marcada instanceof Date ? row.hora_salida_marcada.toISOString() : row.hora_salida_marcada || null,
      hora_salida_calculo: salidaCalc || null,
      origen_salida_calculo: row.origen_salida_calculo || "MARCA_FISICA",
      es_salida_regularizada: Boolean(row.es_salida_regularizada),
      usuario_regularizo_id: row.usuario_regularizo_id || null,
      fecha_regularizacion: row.regularizada_en instanceof Date ? row.regularizada_en.toISOString() : row.regularizada_en || null,
      minutos_tiempo_adicional_aprobado: Number(row.minutos_tiempo_adicional_aprobado) || 0,
      estado_tiempo_adicional: row.estado_tiempo_adicional || (Number(row.minutos_tiempo_adicional) > 0 ? "PENDIENTE" : "NO_APLICA"),
      usuario_aprobo_ta_id: row.usuario_aprobo_ta_id || null,
      fecha_resolucion_ta: row.fecha_resolucion_ta instanceof Date ? row.fecha_resolucion_ta.toISOString() : row.fecha_resolucion_ta || null,
      motivo_resolucion_ta: row.motivo_resolucion_ta || null,
      es_feriado: Boolean(row.es_feriado),
      creado_en: row.creado_en instanceof Date ? row.creado_en.toISOString() : String(row.creado_en),
      actualizado_en: row.actualizado_en instanceof Date ? row.actualizado_en.toISOString() : String(row.actualizado_en),
      empleado_nombre: row.empleado_nombre || row.nombre_completo || undefined,
      empleado_cedula: row.empleado_cedula || row.cedula || undefined,
      departamento_nombre: row.departamento_nombre || undefined,
      departamento_id: row.departamento_id || undefined,
      minutos_tiempo_total: minutosTotal,
      minutos_efectivos: mEfectivos,
      minutos_desayuno: Number(row.minutos_desayuno) || 0,
      minutos_almuerzo: Number(row.minutos_almuerzo) || 0,
      minutos_cafe: Number(row.minutos_cafe) || 0,
      minutos_total_descansos: mDescansos,
      minutos_tardanza: Number(row.minutos_tardanza) || 0,
      minutos_salida_anticipada: Number(row.minutos_salida_anticipada) || 0,
      minutos_tiempo_adicional: Number(row.minutos_tiempo_adicional) || 0,
      cumplimiento_porcentaje: parseFloat(row.cumplimiento_porcentaje) || 0,
    };
  }

  async obtenerPorId(id: string): Promise<JornadaEntity | null> {
    const res = await this.pool.query(
      `SELECT j.*, 
              e.nombre_completo AS empleado_nombre, 
              e.cedula AS empleado_cedula,
              d.nombre AS departamento_nombre,
              d.id AS departamento_id
       FROM jornadas j
       LEFT JOIN empleados e ON e.id = j.empleado_id
       LEFT JOIN departamentos d ON d.id = e.departamento_id
       WHERE j.id = $1 LIMIT 1;`,
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToEntity(res.rows[0]);
  }

  async obtenerJornadaAbierta(empleado_id: string, fechaMax?: string): Promise<JornadaEntity | null> {
    let sql = `SELECT * FROM jornadas 
       WHERE empleado_id = $1 AND estado_jornada = 'ABIERTA'`;
    const params: any[] = [empleado_id];
    if (fechaMax) {
      params.push(fechaMax);
      sql += ` AND fecha_jornada <= $${params.length}`;
    }
    sql += ` ORDER BY fecha_jornada DESC LIMIT 1;`;
    const res = await this.pool.query(sql, params);
    if (res.rows.length === 0) return null;
    return this.mapRowToEntity(res.rows[0]);
  }

  async obtenerTodasJornadasAbiertas(): Promise<JornadaEntity[]> {
    const res = await this.pool.query(
      `SELECT * FROM jornadas 
       WHERE estado_jornada = 'ABIERTA' 
       ORDER BY fecha_jornada ASC;`
    );
    return res.rows.map((r) => this.mapRowToEntity(r));
  }

  async listarJornadas(filtros?: any): Promise<JornadaEntity[]> {
    let sql = `
      SELECT j.*, 
             e.nombre_completo AS empleado_nombre, 
             e.cedula AS empleado_cedula,
             d.nombre AS departamento_nombre,
             d.id AS departamento_id
      FROM jornadas j
      LEFT JOIN empleados e ON e.id = j.empleado_id
      LEFT JOIN departamentos d ON d.id = e.departamento_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filtros?.empleado_id) {
      params.push(filtros.empleado_id);
      sql += ` AND j.empleado_id = $${params.length}`;
    }

    if (filtros?.subordinados_ids && filtros.subordinados_ids.length > 0) {
      params.push(filtros.subordinados_ids);
      sql += ` AND j.empleado_id = ANY($${params.length}::uuid[])`;
    }

    if (filtros?.fecha) {
      params.push(filtros.fecha);
      sql += ` AND j.fecha_jornada = $${params.length}`;
    }

    if (filtros?.fecha_desde) {
      params.push(filtros.fecha_desde);
      sql += ` AND j.fecha_jornada >= $${params.length}`;
    }

    if (filtros?.fecha_hasta) {
      params.push(filtros.fecha_hasta);
      sql += ` AND j.fecha_jornada <= $${params.length}`;
    }

    if (filtros?.estado_jornada && filtros.estado_jornada !== "TODOS") {
      if (filtros.estado_jornada === "CERRADA") {
        sql += ` AND (j.estado_jornada = 'CERRADA_NORMAL' OR j.estado_jornada = 'CERRADA')`;
      } else {
        params.push(filtros.estado_jornada);
        sql += ` AND j.estado_jornada = $${params.length}`;
      }
    }

    if (filtros?.departamento_id) {
      params.push(filtros.departamento_id);
      sql += ` AND e.departamento_id = $${params.length}`;
    }

    if (filtros?.busqueda && filtros.busqueda.trim()) {
      params.push(`%${filtros.busqueda.trim()}%`);
      sql += ` AND (e.nombre_completo ILIKE $${params.length} OR e.cedula ILIKE $${params.length})`;
    }

    sql += ` ORDER BY j.fecha_jornada DESC, j.creado_en DESC`;

    const limite = filtros?.limite ? Math.min(Math.max(1, filtros.limite), 500) : 200;
    params.push(limite);
    sql += ` LIMIT $${params.length}`;

    if (filtros?.offset && filtros.offset > 0) {
      params.push(filtros.offset);
      sql += ` OFFSET $${params.length}`;
    }

    const res = await this.pool.query(sql, params);
    return res.rows.map((r) => this.mapRowToEntity(r));
  }

  async obtenerPorEmpleadoYFecha(empleado_id: string, fecha_jornada: string): Promise<JornadaEntity | null> {
    const res = await this.pool.query(
      `SELECT * FROM jornadas 
       WHERE empleado_id = $1 AND fecha_jornada = $2 
       LIMIT 1;`,
      [empleado_id, fecha_jornada]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToEntity(res.rows[0]);
  }

  async crearJornada(jornada: JornadaEntity): Promise<void> {
    const r: Partial<ResultadosDerivadosJornada> = jornada.resultados_derivados || {};
    const horarioId = jornada.snapshot_horario?.horario_id_origen;

    await this.pool.query(
      `INSERT INTO jornadas (
        id, empleado_id, fecha_jornada, estado_jornada, horario_id_aplicado, snapshot_horario,
        hora_entrada_marcada, hora_entrada_calculo, origen_entrada_calculo,
        hora_salida_marcada, hora_salida_calculo, origen_salida_calculo,
        minutos_desayuno, minutos_almuerzo, minutos_cafe, minutos_total_descansos,
        minutos_tiempo_total, minutos_efectivos, minutos_tardanza,
        minutos_salida_anticipada, minutos_tiempo_adicional,
        minutos_tiempo_adicional_aprobado, estado_tiempo_adicional, es_feriado,
        minutos_justificados_comp, minutos_justificados_nocomp,
        cumplimiento_porcentaje, creado_en, actualizado_en
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18, $19,
        $20, $21,
        $22, $23, $24,
        $25, $26,
        $27, $28, $29
      )
      ON CONFLICT (id) DO UPDATE SET
        estado_jornada = EXCLUDED.estado_jornada,
        hora_entrada_calculo = EXCLUDED.hora_entrada_calculo,
        hora_salida_calculo = EXCLUDED.hora_salida_calculo,
        minutos_desayuno = EXCLUDED.minutos_desayuno,
        minutos_almuerzo = EXCLUDED.minutos_almuerzo,
        minutos_cafe = EXCLUDED.minutos_cafe,
        minutos_total_descansos = EXCLUDED.minutos_total_descansos,
        minutos_tiempo_total = EXCLUDED.minutos_tiempo_total,
        minutos_efectivos = EXCLUDED.minutos_efectivos,
        minutos_tardanza = EXCLUDED.minutos_tardanza,
        minutos_salida_anticipada = EXCLUDED.minutos_salida_anticipada,
        minutos_tiempo_adicional = EXCLUDED.minutos_tiempo_adicional,
        minutos_tiempo_adicional_aprobado = EXCLUDED.minutos_tiempo_adicional_aprobado,
        estado_tiempo_adicional = EXCLUDED.estado_tiempo_adicional,
        es_feriado = EXCLUDED.es_feriado,
        cumplimiento_porcentaje = EXCLUDED.cumplimiento_porcentaje,
        actualizado_en = NOW();`,
      [
        jornada.id,
        jornada.empleado_id,
        jornada.fecha_jornada,
        jornada.estado_jornada,
        horarioId,
        JSON.stringify(jornada.snapshot_horario || {}),
        r.hora_entrada_efectiva || null,
        r.hora_entrada_efectiva || null,
        "MARCA_FISICA",
        r.hora_salida_efectiva || null,
        r.hora_salida_efectiva || null,
        "MARCA_FISICA",
        r.minutos_desayuno || 0,
        r.minutos_almuerzo || 0,
        r.minutos_cafe || 0,
        r.minutos_descansos || 0,
        r.minutos_tiempo_total || 0,
        r.minutos_efectivos || 0,
        r.minutos_tardanza || 0,
        r.minutos_salida_anticipada || 0,
        r.minutos_tiempo_adicional || 0,
        jornada.minutos_tiempo_adicional_aprobado || r.minutos_tiempo_adicional_aprobado || 0,
        jornada.estado_tiempo_adicional || r.estado_tiempo_adicional || (r.minutos_tiempo_adicional && r.minutos_tiempo_adicional > 0 ? "PENDIENTE" : "NO_APLICA"),
        Boolean(jornada.es_feriado),
        r.minutos_justificados_comp || 0,
        r.minutos_justificados_nocomp || 0,
        r.cumplimiento_porcentaje || 0,
        jornada.creado_en || new Date().toISOString(),
        jornada.actualizado_en || new Date().toISOString(),
      ]
    );
  }

  async actualizarJornada(jornada: JornadaEntity): Promise<void> {
    const r: Partial<ResultadosDerivadosJornada> = jornada.resultados_derivados || {};
    await this.pool.query(
      `UPDATE jornadas SET
        estado_jornada = $2,
        snapshot_horario = $3,
        hora_entrada_calculo = $4,
        hora_salida_calculo = $5,
        minutos_desayuno = $6,
        minutos_almuerzo = $7,
        minutos_cafe = $8,
        minutos_total_descansos = $9,
        minutos_tiempo_total = $10,
        minutos_efectivos = $11,
        minutos_tardanza = $12,
        minutos_salida_anticipada = $13,
        minutos_tiempo_adicional = $14,
        minutos_tiempo_adicional_aprobado = $15,
        estado_tiempo_adicional = $16,
        usuario_aprobo_ta_id = $17,
        fecha_resolucion_ta = $18,
        motivo_resolucion_ta = $19,
        es_feriado = $20,
        minutos_justificados_comp = $21,
        minutos_justificados_nocomp = $22,
        cumplimiento_porcentaje = $23,
        actualizado_en = NOW()
       WHERE id = $1;`,
      [
        jornada.id,
        jornada.estado_jornada,
        JSON.stringify(jornada.snapshot_horario || {}),
        r.hora_entrada_efectiva || null,
        r.hora_salida_efectiva || null,
        r.minutos_desayuno || 0,
        r.minutos_almuerzo || 0,
        r.minutos_cafe || 0,
        r.minutos_descansos || 0,
        r.minutos_tiempo_total || 0,
        r.minutos_efectivos || 0,
        r.minutos_tardanza || 0,
        r.minutos_salida_anticipada || 0,
        r.minutos_tiempo_adicional || 0,
        jornada.minutos_tiempo_adicional_aprobado || r.minutos_tiempo_adicional_aprobado || 0,
        jornada.estado_tiempo_adicional || r.estado_tiempo_adicional || (r.minutos_tiempo_adicional && r.minutos_tiempo_adicional > 0 ? "PENDIENTE" : "NO_APLICA"),
        jornada.usuario_aprobo_ta_id || null,
        jornada.fecha_resolucion_ta || null,
        jornada.motivo_resolucion_ta || null,
        Boolean(jornada.es_feriado),
        r.minutos_justificados_comp || 0,
        r.minutos_justificados_nocomp || 0,
        r.cumplimiento_porcentaje || 0,
      ]
    );
  }

  async listarJornadasConTiempoAdicional(filtros?: {
    estado?: string;
    empleado_id?: string;
    subordinados_ids?: string[];
  }): Promise<any[]> {
    let sql = `
      SELECT 
        j.*,
        e.nombre_completo AS empleado_nombre,
        e.cedula AS empleado_cedula,
        d.nombre AS departamento_nombre,
        u_ta.nombre_completo AS usuario_aprobo_nombre
      FROM jornadas j
      JOIN empleados e ON j.empleado_id = e.id
      LEFT JOIN departamentos d ON e.departamento_id = d.id
      LEFT JOIN usuarios u_ta ON j.usuario_aprobo_ta_id = u_ta.id
      WHERE j.minutos_tiempo_adicional > 0
    `;
    const params: any[] = [];

    if (filtros?.estado && filtros.estado !== "TODOS") {
      params.push(filtros.estado);
      sql += ` AND j.estado_tiempo_adicional = $${params.length}`;
    }

    if (filtros?.empleado_id) {
      params.push(filtros.empleado_id);
      sql += ` AND j.empleado_id = $${params.length}`;
    }

    if (filtros?.subordinados_ids && filtros.subordinados_ids.length > 0) {
      params.push(filtros.subordinados_ids);
      sql += ` AND j.empleado_id = ANY($${params.length}::uuid[])`;
    }

    sql += ` ORDER BY j.fecha_jornada DESC, j.creado_en DESC LIMIT 200;`;

    const res = await this.pool.query(sql, params);
    return res.rows.map((row) => ({
      ...this.mapRowToEntity(row),
      minutos_tiempo_adicional: row.minutos_tiempo_adicional || 0,
      minutos_tiempo_adicional_aprobado: row.minutos_tiempo_adicional_aprobado || 0,
      estado_tiempo_adicional: row.estado_tiempo_adicional || "PENDIENTE",
      minutos_tiempo_total: row.minutos_tiempo_total || 0,
      minutos_efectivos: row.minutos_efectivos || 0,
      empleado_nombre: row.empleado_nombre,
      empleado_cedula: row.empleado_cedula,
      departamento_nombre: row.departamento_nombre,
      usuario_aprobo_nombre: row.usuario_aprobo_nombre,
    }));
  }

  async aprobarTiempoAdicional(
    jornadaId: string,
    datos: {
      decision: "APROBAR_TOTAL" | "APROBAR_PARCIAL" | "RECHAZAR";
      minutos_aprobados: number;
      usuario_id: string;
      motivo: string;
    }
  ): Promise<JornadaEntity> {
    const estado =
      datos.decision === "APROBAR_TOTAL"
        ? "APROBADO_TOTAL"
        : datos.decision === "APROBAR_PARCIAL"
        ? "APROBADO_PARCIAL"
        : "RECHAZADO";

    const minutosAprobados = datos.decision === "RECHAZAR" ? 0 : datos.minutos_aprobados;

    const res = await this.pool.query(
      `UPDATE jornadas SET
        estado_tiempo_adicional = $2,
        minutos_tiempo_adicional_aprobado = $3,
        usuario_aprobo_ta_id = $4,
        fecha_resolucion_ta = NOW(),
        motivo_resolucion_ta = $5,
        actualizado_en = NOW()
       WHERE id = $1
       RETURNING *;`,
      [jornadaId, estado, minutosAprobados, datos.usuario_id, datos.motivo]
    );

    if (res.rows.length === 0) {
      throw new Error(`Jornada con ID ${jornadaId} no encontrada.`);
    }

    return this.mapRowToEntity(res.rows[0]);
  }

  async actualizarRegularizacionSalida(
    jornadaId: string,
    horaSalidaCalculoIso: string,
    usuarioRegularizoId: string,
    resultados: ResultadosDerivadosJornada,
    nuevoEstado: EstadoJornada
  ): Promise<void> {
    await this.pool.query(
      `UPDATE jornadas SET
        estado_jornada = $2,
        hora_salida_calculo = $3,
        origen_salida_calculo = 'SALIDA_PROGRAMADA_REGULARIZADA',
        es_salida_regularizada = true,
        usuario_regularizo_id = $4,
        regularizada_en = NOW(),
        minutos_desayuno = $5,
        minutos_almuerzo = $6,
        minutos_cafe = $7,
        minutos_total_descansos = $8,
        minutos_tiempo_total = $9,
        minutos_efectivos = $10,
        minutos_tardanza = $11,
        minutos_salida_anticipada = $12,
        minutos_tiempo_adicional = $13,
        minutos_justificados_comp = $14,
        minutos_justificados_nocomp = $15,
        cumplimiento_porcentaje = $16,
        actualizado_en = NOW()
       WHERE id = $1;`,
      [
        jornadaId,
        nuevoEstado,
        horaSalidaCalculoIso,
        usuarioRegularizoId,
        resultados.minutos_desayuno || 0,
        resultados.minutos_almuerzo || 0,
        resultados.minutos_cafe || 0,
        resultados.minutos_descansos || 0,
        resultados.minutos_tiempo_total || 0,
        resultados.minutos_efectivos || 0,
        resultados.minutos_tardanza || 0,
        resultados.minutos_salida_anticipada || 0,
        resultados.minutos_tiempo_adicional || 0,
        resultados.minutos_justificados_comp || 0,
        resultados.minutos_justificados_nocomp || 0,
        resultados.cumplimiento_porcentaje || 0,
      ]
    );
  }
}
