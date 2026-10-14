import type { IFeriadosRepository, FeriadoEntity } from "../interfaces/feriados.js";
import { getPool } from "../../../db/index.js";
import type pg from "pg";

export class PostgresFeriadosRepository implements IFeriadosRepository {
  private pool: pg.Pool;

  constructor(customPool?: pg.Pool) {
    this.pool = customPool || getPool();
  }

  private mapRow(row: any): FeriadoEntity {
    return {
      id: row.id,
      fecha: typeof row.fecha === "string" ? row.fecha.slice(0, 10) : new Date(row.fecha).toISOString().slice(0, 10),
      descripcion: row.descripcion,
      tipo_feriado: row.tipo_feriado,
      activo: Boolean(row.activo),
      creado_en: row.creado_en ? new Date(row.creado_en).toISOString() : undefined,
    };
  }

  async listar(soloActivos: boolean = false): Promise<FeriadoEntity[]> {
    const query = soloActivos
      ? `SELECT id, fecha, descripcion, tipo_feriado, activo, creado_en FROM feriados WHERE activo = true ORDER BY fecha ASC;`
      : `SELECT id, fecha, descripcion, tipo_feriado, activo, creado_en FROM feriados ORDER BY fecha ASC;`;
    const res = await this.pool.query(query);
    return res.rows.map((r) => this.mapRow(r));
  }

  async obtenerPorId(id: string): Promise<FeriadoEntity | null> {
    const res = await this.pool.query(
      `SELECT id, fecha, descripcion, tipo_feriado, activo, creado_en FROM feriados WHERE id = $1 LIMIT 1;`,
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  async obtenerPorFecha(fecha: string): Promise<FeriadoEntity | null> {
    const fechaLimpia = fecha.slice(0, 10);
    const res = await this.pool.query(
      `SELECT id, fecha, descripcion, tipo_feriado, activo, creado_en FROM feriados WHERE fecha = $1 LIMIT 1;`,
      [fechaLimpia]
    );
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  async crear(feriado: FeriadoEntity): Promise<FeriadoEntity> {
    const fechaLimpia = feriado.fecha.slice(0, 10);
    const res = await this.pool.query(
      `INSERT INTO feriados (id, fecha, descripcion, tipo_feriado, activo, creado_en)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, fecha, descripcion, tipo_feriado, activo, creado_en;`,
      [
        feriado.id,
        fechaLimpia,
        feriado.descripcion,
        feriado.tipo_feriado || "PAGO_OBLIGATORIO",
        feriado.activo !== undefined ? feriado.activo : true,
        feriado.creado_en || new Date().toISOString(),
      ]
    );
    return this.mapRow(res.rows[0]);
  }

  async actualizar(id: string, datos: Partial<FeriadoEntity>): Promise<FeriadoEntity | null> {
    const actual = await this.obtenerPorId(id);
    if (!actual) return null;

    const nuevaFecha = datos.fecha ? datos.fecha.slice(0, 10) : actual.fecha;
    const nuevaDescripcion = datos.descripcion !== undefined ? datos.descripcion : actual.descripcion;
    const nuevoTipo = datos.tipo_feriado !== undefined ? datos.tipo_feriado : actual.tipo_feriado;
    const nuevoActivo = datos.activo !== undefined ? datos.activo : actual.activo;

    const res = await this.pool.query(
      `UPDATE feriados
       SET fecha = $1, descripcion = $2, tipo_feriado = $3, activo = $4
       WHERE id = $5
       RETURNING id, fecha, descripcion, tipo_feriado, activo, creado_en;`,
      [nuevaFecha, nuevaDescripcion, nuevoTipo, nuevoActivo, id]
    );
    return this.mapRow(res.rows[0]);
  }

  async esFeriadoActivo(fecha: string): Promise<boolean> {
    const fechaLimpia = fecha.slice(0, 10);
    const res = await this.pool.query(
      `SELECT 1 FROM feriados WHERE fecha = $1 AND activo = true LIMIT 1;`,
      [fechaLimpia]
    );
    return res.rows.length > 0;
  }
}
