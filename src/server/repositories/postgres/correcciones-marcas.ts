import type {
  CorreccionMarcaEntity,
  CorreccionMarcaDetalle,
  FiltrosCorrecciones,
  ICorreccionesMarcasRepository,
  TipoAjusteMarca,
  EstadoCorreccionMarca,
} from "../interfaces/correcciones-marcas.js";
import type { TipoMarca } from "../interfaces/marcas.js";
import { getPool } from "../../../db/index.js";
import type pg from "pg";

export class PostgresCorreccionesMarcasRepository implements ICorreccionesMarcasRepository {
  private pool: pg.Pool;

  constructor(customPool?: pg.Pool) {
    this.pool = customPool || getPool();
  }

  private mapRowToEntity(row: any): CorreccionMarcaEntity {
    return {
      id: row.id,
      marca_original_id: row.marca_original_id,
      tipo_ajuste: row.tipo_ajuste as TipoAjusteMarca,
      timestamp_propuesto: row.timestamp_propuesto instanceof Date
        ? row.timestamp_propuesto.toISOString()
        : row.timestamp_propuesto || null,
      tipo_marca_propuesto: row.tipo_marca_propuesto as TipoMarca || null,
      motivo: row.motivo,
      usuario_solicito_id: row.usuario_solicito_id,
      usuario_autorizo_id: row.usuario_autorizo_id,
      estado: row.estado as EstadoCorreccionMarca,
      fecha_resolucion: row.fecha_resolucion instanceof Date
        ? row.fecha_resolucion.toISOString()
        : row.fecha_resolucion || null,
      creado_en: row.creado_en instanceof Date
        ? row.creado_en.toISOString()
        : String(row.creado_en),
    };
  }

  private mapRowToDetalle(row: any): CorreccionMarcaDetalle {
    const base = this.mapRowToEntity(row);
    return {
      ...base,
      marca_original_tipo: row.marca_original_tipo as TipoMarca,
      marca_original_timestamp: row.marca_original_timestamp instanceof Date
        ? row.marca_original_timestamp.toISOString()
        : String(row.marca_original_timestamp),
      empleado_id: row.empleado_id,
      empleado_nombre: row.empleado_nombre,
      empleado_identificador: row.empleado_identificador,
      jornada_id: row.jornada_id,
      fecha_jornada: row.fecha_jornada instanceof Date
        ? row.fecha_jornada.toISOString().split("T")[0]
        : String(row.fecha_jornada),
      usuario_solicito_nombre: row.usuario_solicito_nombre,
      usuario_autorizo_nombre: row.usuario_autorizo_nombre,
    };
  }

  async crear(
    correccion: Omit<CorreccionMarcaEntity, "id" | "creado_en" | "estado" | "usuario_autorizo_id" | "fecha_resolucion">
  ): Promise<CorreccionMarcaEntity> {
    const res = await this.pool.query(
      `INSERT INTO correcciones_marcas (
        marca_original_id, tipo_ajuste, timestamp_propuesto, tipo_marca_propuesto,
        motivo, usuario_solicito_id, estado
      ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDIENTE')
      RETURNING *;`,
      [
        correccion.marca_original_id,
        correccion.tipo_ajuste,
        correccion.timestamp_propuesto || null,
        correccion.tipo_marca_propuesto || null,
        correccion.motivo,
        correccion.usuario_solicito_id,
      ]
    );
    return this.mapRowToEntity(res.rows[0]);
  }

  async obtenerPorId(id: string): Promise<CorreccionMarcaEntity | null> {
    const res = await this.pool.query(
      `SELECT * FROM correcciones_marcas WHERE id = $1 LIMIT 1;`,
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToEntity(res.rows[0]);
  }

  async obtenerDetallePorId(id: string): Promise<CorreccionMarcaDetalle | null> {
    const res = await this.pool.query(
      `SELECT
         cm.*,
         m.tipo_marca as marca_original_tipo,
         m.timestamp_servidor as marca_original_timestamp,
         m.empleado_id,
         e.nombre_completo as empleado_nombre,
         e.cedula as empleado_identificador,
         m.jornada_id,
         j.fecha_jornada,
         u_sol.username as usuario_solicito_nombre,
         u_aut.username as usuario_autorizo_nombre
       FROM correcciones_marcas cm
       JOIN marcas m ON m.id = cm.marca_original_id
       JOIN empleados e ON e.id = m.empleado_id
       JOIN jornadas j ON j.id = m.jornada_id
       LEFT JOIN usuarios u_sol ON u_sol.id = cm.usuario_solicito_id
       LEFT JOIN usuarios u_aut ON u_aut.id = cm.usuario_autorizo_id
       WHERE cm.id = $1
       LIMIT 1;`,
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToDetalle(res.rows[0]);
  }

  async obtenerPendientePorMarcaId(
    marca_original_id: string
  ): Promise<CorreccionMarcaEntity | null> {
    const res = await this.pool.query(
      `SELECT * FROM correcciones_marcas
       WHERE marca_original_id = $1 AND estado = 'PENDIENTE'
       LIMIT 1;`,
      [marca_original_id]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToEntity(res.rows[0]);
  }

  async listar(filtros?: FiltrosCorrecciones): Promise<CorreccionMarcaDetalle[]> {
    let sql = `
      SELECT
        cm.*,
        m.tipo_marca as marca_original_tipo,
        m.timestamp_servidor as marca_original_timestamp,
        m.empleado_id,
        e.nombre_completo as empleado_nombre,
        e.cedula as empleado_identificador,
        m.jornada_id,
        j.fecha_jornada,
        u_sol.username as usuario_solicito_nombre,
        u_aut.username as usuario_autorizo_nombre
      FROM correcciones_marcas cm
      JOIN marcas m ON m.id = cm.marca_original_id
      JOIN empleados e ON e.id = m.empleado_id
      JOIN jornadas j ON j.id = m.jornada_id
      LEFT JOIN usuarios u_sol ON u_sol.id = cm.usuario_solicito_id
      LEFT JOIN usuarios u_aut ON u_aut.id = cm.usuario_autorizo_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filtros?.empleado_id) {
      params.push(filtros.empleado_id);
      sql += ` AND m.empleado_id = $${params.length}`;
    }

    if (filtros?.estado) {
      params.push(filtros.estado);
      sql += ` AND cm.estado = $${params.length}`;
    }

    if (filtros?.fecha) {
      params.push(filtros.fecha);
      sql += ` AND j.fecha_jornada = $${params.length}`;
    }

    sql += ` ORDER BY cm.creado_en DESC LIMIT 200;`;

    const res = await this.pool.query(sql, params);
    return res.rows.map((r) => this.mapRowToDetalle(r));
  }

  async decidirCorreccion(
    id: string,
    estado: "APROBADA" | "RECHAZADA",
    usuario_autorizo_id: string
  ): Promise<CorreccionMarcaEntity> {
    const res = await this.pool.query(
      `UPDATE correcciones_marcas
       SET
         estado = $2,
         usuario_autorizo_id = $3,
         fecha_resolucion = NOW()
       WHERE id = $1
       RETURNING *;`,
      [id, estado, usuario_autorizo_id]
    );
    if (res.rows.length === 0) {
      throw new Error(`Corrección no encontrada con ID ${id}`);
    }
    return this.mapRowToEntity(res.rows[0]);
  }
}
