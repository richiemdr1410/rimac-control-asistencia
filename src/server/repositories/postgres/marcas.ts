import type {
  MarcaEntity,
  IMarcasRepository,
  TipoMarca,
  OrigenMarca,
  EstadoMarca,
} from "../interfaces/marcas.js";
import { getPool } from "../../../db/index.js";
import type pg from "pg";

export class PostgresMarcasRepository implements IMarcasRepository {
  private pool: pg.Pool;

  constructor(customPool?: pg.Pool) {
    this.pool = customPool || getPool();
  }

  private mapCanalToOrigen(canal: string): OrigenMarca {
    switch (canal) {
      case "GARITA":
        return "GARITA_LECTOR";
      case "COMEDOR":
      case "COMPUTADORA_EMPLEADO":
        return "AUTOSERVICIO";
      default:
        return "GARITA_LECTOR";
    }
  }

  private mapOrigenToCanal(origen: string): string {
    switch (origen) {
      case "GARITA_LECTOR":
        return "GARITA";
      case "AUTOSERVICIO":
        return "COMPUTADORA_EMPLEADO";
      default:
        return "GARITA";
    }
  }

  private mapRowToEntity(row: any): MarcaEntity {
    return {
      id: row.id,
      jornada_id: row.jornada_id,
      empleado_id: row.empleado_id,
      tipo_marca: row.tipo_marca as TipoMarca,
      timestamp_servidor: row.timestamp_servidor instanceof Date 
        ? row.timestamp_servidor.toISOString() 
        : String(row.timestamp_servidor),
      origen_marca: this.mapCanalToOrigen(row.canal_marca),
      estado_marca: "ACTIVA" as EstadoMarca,
      usuario_registrador_id: row.usuario_registrador_id,
      creado_en: row.creado_en instanceof Date 
        ? row.creado_en.toISOString() 
        : String(row.creado_en),
    };
  }

  async crearMarca(marca: MarcaEntity): Promise<void> {
    const canal = this.mapOrigenToCanal(marca.origen_marca);
    await this.pool.query(
      `INSERT INTO marcas (
        id, jornada_id, empleado_id, tipo_marca, timestamp_servidor, canal_marca, usuario_registrador_id, creado_en
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
      [
        marca.id,
        marca.jornada_id,
        marca.empleado_id,
        marca.tipo_marca,
        marca.timestamp_servidor,
        canal,
        marca.usuario_registrador_id,
        marca.creado_en || new Date().toISOString(),
      ]
    );
  }

  async obtenerPorId(id: string): Promise<MarcaEntity | null> {
    const res = await this.pool.query(
      `SELECT * FROM marcas WHERE id = $1 LIMIT 1;`,
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToEntity(res.rows[0]);
  }

  async listarMarcasActivasJornada(jornada_id: string): Promise<MarcaEntity[]> {
    const res = await this.pool.query(
      `SELECT 
         m.id,
         m.empleado_id,
         m.jornada_id,
         COALESCE(c_sub.tipo_marca_propuesto, m.tipo_marca) as tipo_marca,
         COALESCE(c_sub.timestamp_propuesto, m.timestamp_servidor) as timestamp_servidor,
         m.canal_marca,
         m.usuario_registrador_id,
         m.creado_en
       FROM marcas m
       LEFT JOIN correcciones_marcas c_anul
         ON c_anul.marca_original_id = m.id AND c_anul.estado = 'APROBADA' AND c_anul.tipo_ajuste = 'ANULACION_LOGICA'
       LEFT JOIN correcciones_marcas c_sub
         ON c_sub.marca_original_id = m.id AND c_sub.estado = 'APROBADA' AND c_sub.tipo_ajuste IN ('SUSTITUCION_TIMESTAMP', 'SUSTITUCION_TIPO')
       WHERE m.jornada_id = $1
         AND c_anul.id IS NULL
       ORDER BY COALESCE(c_sub.timestamp_propuesto, m.timestamp_servidor) ASC;`,
      [jornada_id]
    );
    return res.rows.map((r) => this.mapRowToEntity(r));
  }

  async obtenerUltimaMarcaEmpleado(empleado_id: string, timestampMax?: string): Promise<MarcaEntity | null> {
    let sql = `SELECT 
         m.id,
         m.empleado_id,
         m.jornada_id,
         COALESCE(c_sub.tipo_marca_propuesto, m.tipo_marca) as tipo_marca,
         COALESCE(c_sub.timestamp_propuesto, m.timestamp_servidor) as timestamp_servidor,
         m.canal_marca,
         m.usuario_registrador_id,
         m.creado_en
       FROM marcas m
       LEFT JOIN correcciones_marcas c_anul
         ON c_anul.marca_original_id = m.id AND c_anul.estado = 'APROBADA' AND c_anul.tipo_ajuste = 'ANULACION_LOGICA'
       LEFT JOIN correcciones_marcas c_sub
         ON c_sub.marca_original_id = m.id AND c_sub.estado = 'APROBADA' AND c_sub.tipo_ajuste IN ('SUSTITUCION_TIMESTAMP', 'SUSTITUCION_TIPO')
       WHERE m.empleado_id = $1
         AND c_anul.id IS NULL`;
    const params: any[] = [empleado_id];
    if (timestampMax) {
      params.push(timestampMax);
      sql += ` AND COALESCE(c_sub.timestamp_propuesto, m.timestamp_servidor) <= $${params.length}`;
    }
    sql += ` ORDER BY COALESCE(c_sub.timestamp_propuesto, m.timestamp_servidor) DESC LIMIT 1;`;
    const res = await this.pool.query(sql, params);
    if (res.rows.length === 0) return null;
    return this.mapRowToEntity(res.rows[0]);
  }
}
