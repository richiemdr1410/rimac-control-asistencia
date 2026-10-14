import type {
  IncidenciaEntity,
  IncidenciaDetalle,
  FiltrosIncidencias,
  IIncidenciasRepository,
  TipoIncidencia,
  EstadoIncidencia,
} from "../interfaces/incidencias.js";
import { getPool } from "../../../db/index.js";
import type pg from "pg";

export class PostgresIncidenciasRepository implements IIncidenciasRepository {
  private pool: pg.Pool;

  constructor(customPool?: pg.Pool) {
    this.pool = customPool || getPool();
  }

  private mapRowToEntity(row: any): IncidenciaEntity {
    return {
      id: row.id,
      jornada_id: row.jornada_id,
      empleado_id: row.empleado_id,
      tipo_incidencia: row.tipo_incidencia as TipoIncidencia,
      descripcion: row.descripcion,
      minutos_afectados: row.minutos_afectados || 0,
      estado: row.estado as EstadoIncidencia,
      resolucion_motivo: row.resolucion_motivo,
      usuario_resolvio_id: row.usuario_resolvio_id,
      fecha_resolucion: row.fecha_resolucion instanceof Date
        ? row.fecha_resolucion.toISOString()
        : row.fecha_resolucion || null,
      creado_en: row.creado_en instanceof Date
        ? row.creado_en.toISOString()
        : String(row.creado_en),
    };
  }

  private mapRowToDetalle(row: any): IncidenciaDetalle {
    const base = this.mapRowToEntity(row);
    return {
      ...base,
      empleado_nombre: row.empleado_nombre,
      empleado_identificador: row.empleado_identificador,
      departamento_nombre: row.departamento_nombre,
      fecha_jornada: row.fecha_jornada instanceof Date
        ? row.fecha_jornada.toISOString().split("T")[0]
        : row.fecha_jornada,
      hora_entrada_programada: row.hora_entrada_programada,
      hora_salida_programada: row.hora_salida_programada,
      usuario_resolvio_nombre: row.usuario_resolvio_nombre,
    };
  }

  async crear(
    incidencia: Omit<IncidenciaEntity, "id" | "creado_en">
  ): Promise<IncidenciaEntity> {
    const res = await this.pool.query(
      `INSERT INTO incidencias (
        jornada_id, empleado_id, tipo_incidencia, descripcion,
        minutos_afectados, estado, resolucion_motivo, usuario_resolvio_id, fecha_resolucion
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (jornada_id, tipo_incidencia) WHERE estado = 'ABIERTA'
      DO UPDATE SET
        descripcion = EXCLUDED.descripcion,
        minutos_afectados = EXCLUDED.minutos_afectados
      RETURNING *;`,
      [
        incidencia.jornada_id,
        incidencia.empleado_id,
        incidencia.tipo_incidencia,
        incidencia.descripcion,
        incidencia.minutos_afectados || 0,
        incidencia.estado || "ABIERTA",
        incidencia.resolucion_motivo || null,
        incidencia.usuario_resolvio_id || null,
        incidencia.fecha_resolucion || null,
      ]
    );
    return this.mapRowToEntity(res.rows[0]);
  }

  async obtenerPorId(id: string): Promise<IncidenciaEntity | null> {
    const res = await this.pool.query(
      `SELECT * FROM incidencias WHERE id = $1 LIMIT 1;`,
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToEntity(res.rows[0]);
  }

  async obtenerDetallePorId(id: string): Promise<IncidenciaDetalle | null> {
    const res = await this.pool.query(
      `SELECT
         i.*,
         e.nombre_completo as empleado_nombre,
         e.cedula as empleado_identificador,
         d.nombre as departamento_nombre,
         j.fecha_jornada,
         j.snapshot_horario->>'hora_entrada_programada' as hora_entrada_programada,
         j.snapshot_horario->>'hora_salida_programada' as hora_salida_programada,
         u_res.username as usuario_resolvio_nombre
       FROM incidencias i
       JOIN empleados e ON e.id = i.empleado_id
       LEFT JOIN departamentos d ON d.id = e.departamento_id
       JOIN jornadas j ON j.id = i.jornada_id
       LEFT JOIN usuarios u_res ON u_res.id = i.usuario_resolvio_id
       WHERE i.id = $1
       LIMIT 1;`,
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToDetalle(res.rows[0]);
  }

  async obtenerAbiertaPorJornadaYTipo(
    jornada_id: string,
    tipo: TipoIncidencia
  ): Promise<IncidenciaEntity | null> {
    const res = await this.pool.query(
      `SELECT * FROM incidencias
       WHERE jornada_id = $1 AND tipo_incidencia = $2 AND estado = 'ABIERTA'
       LIMIT 1;`,
      [jornada_id, tipo]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToEntity(res.rows[0]);
  }

  async listarPorFiltros(filtros: FiltrosIncidencias): Promise<IncidenciaDetalle[]> {
    let sql = `
      SELECT
        i.*,
        e.nombre_completo as empleado_nombre,
        e.cedula as empleado_identificador,
        d.nombre as departamento_nombre,
        j.fecha_jornada,
        j.snapshot_horario->>'hora_entrada_programada' as hora_entrada_programada,
        j.snapshot_horario->>'hora_salida_programada' as hora_salida_programada,
        u_res.username as usuario_resolvio_nombre
      FROM incidencias i
      JOIN empleados e ON e.id = i.empleado_id
      LEFT JOIN departamentos d ON d.id = e.departamento_id
      JOIN jornadas j ON j.id = i.jornada_id
      LEFT JOIN usuarios u_res ON u_res.id = i.usuario_resolvio_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filtros.empleado_id) {
      params.push(filtros.empleado_id);
      sql += ` AND i.empleado_id = $${params.length}`;
    }

    if (filtros.fecha) {
      params.push(filtros.fecha);
      sql += ` AND j.fecha_jornada = $${params.length}`;
    }

    if (filtros.tipo_incidencia) {
      params.push(filtros.tipo_incidencia);
      sql += ` AND i.tipo_incidencia = $${params.length}`;
    }

    if (filtros.estado) {
      params.push(filtros.estado);
      sql += ` AND i.estado = $${params.length}`;
    }

    if (filtros.departamento_id) {
      params.push(filtros.departamento_id);
      sql += ` AND e.departamento_id = $${params.length}`;
    }

    sql += ` ORDER BY i.creado_en DESC LIMIT 200;`;

    const res = await this.pool.query(sql, params);
    return res.rows.map((r) => this.mapRowToDetalle(r));
  }

  async resolverIncidencia(
    id: string,
    estado: "JUSTIFICADA" | "REGULARIZADA" | "DESCARTADA",
    usuario_resolvio_id: string,
    motivo: string
  ): Promise<IncidenciaEntity> {
    const res = await this.pool.query(
      `UPDATE incidencias
       SET
         estado = $2,
         usuario_resolvio_id = $3,
         resolucion_motivo = $4,
         fecha_resolucion = NOW()
       WHERE id = $1
       RETURNING *;`,
      [id, estado, usuario_resolvio_id, motivo]
    );
    if (res.rows.length === 0) {
      throw new Error(`Incidencia no encontrada con ID ${id}`);
    }
    return this.mapRowToEntity(res.rows[0]);
  }
}
