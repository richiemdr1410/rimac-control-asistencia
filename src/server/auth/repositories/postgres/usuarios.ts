import type { IUsuariosRepository } from "../interfaces/usuarios.js";
import type { UsuarioEntity, UsuarioConDetalles, RolUsuario } from "../../types.js";
import { getPool } from "../../../../db/index.js";
import type pg from "pg";

export class PostgresUsuariosRepository implements IUsuariosRepository {
  private pool: pg.Pool;

  constructor(customPool?: pg.Pool) {
    this.pool = customPool || getPool();
  }

  private mapRowToEntity(row: any): UsuarioEntity {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      nombre_completo: row.nombre_completo,
      password_hash: row.password_hash,
      rol: row.rol,
      empleado_id: row.empleado_id || undefined,
      estado: row.estado,
      creado_en: row.creado_en instanceof Date ? row.creado_en.toISOString() : String(row.creado_en),
      actualizado_en: row.actualizado_en instanceof Date ? row.actualizado_en.toISOString() : String(row.actualizado_en),
    };
  }

  private mapRowToDetalle(row: any): UsuarioConDetalles {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      nombre_completo: row.nombre_completo,
      rol: row.rol as RolUsuario,
      empleado_id: row.empleado_id || undefined,
      estado: row.estado,
      creado_en: row.creado_en instanceof Date ? row.creado_en.toISOString() : String(row.creado_en),
      actualizado_en: row.actualizado_en instanceof Date ? row.actualizado_en.toISOString() : String(row.actualizado_en),
      empleado_nombre: row.empleado_nombre || undefined,
      empleado_cedula: row.empleado_cedula || undefined,
      empleado_correo: row.empleado_correo || undefined,
      empleado_estado: row.empleado_estado || undefined,
      ultimo_acceso_en: row.ultimo_acceso_en instanceof Date ? row.ultimo_acceso_en.toISOString() : (row.ultimo_acceso_en ? String(row.ultimo_acceso_en) : undefined),
      sesiones_activas_count: Number(row.sesiones_activas_count || 0),
    };
  }

  async obtenerPorId(id: string): Promise<UsuarioEntity | null> {
    const res = await this.pool.query(
      `SELECT * FROM usuarios WHERE id = $1 LIMIT 1;`,
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToEntity(res.rows[0]);
  }

  async obtenerPorUsernameOEmail(identificador: string): Promise<UsuarioEntity | null> {
    const idNormalizado = identificador.trim().toLowerCase();
    const aliasMap: Record<string, string> = {
      usr_admin: "admin",
      usr_th: "talento_humano",
      usr_sup_seguridad: "supervisor_seg",
      usr_seguridad: "seguridad",
      usr_empleado: "empleado",
    };
    const targetAlias = aliasMap[idNormalizado] || idNormalizado;

    const res = await this.pool.query(
      `SELECT * FROM usuarios 
       WHERE LOWER(username) = $1 OR LOWER(email) = $1 OR LOWER(username) = $2
       ORDER BY CASE WHEN LOWER(username) = $2 THEN 0 ELSE 1 END
       LIMIT 1;`,
      [idNormalizado, targetAlias]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToEntity(res.rows[0]);
  }

  async obtenerPorEmpleadoId(empleadoId: string): Promise<UsuarioEntity | null> {
    const res = await this.pool.query(
      `SELECT * FROM usuarios WHERE empleado_id = $1 LIMIT 1;`,
      [empleadoId]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToEntity(res.rows[0]);
  }

  async guardar(usuario: UsuarioEntity): Promise<void> {
    await this.pool.query(
      `INSERT INTO usuarios (
        id, username, email, nombre_completo, password_hash, rol, empleado_id, estado, creado_en, actualizado_en
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        nombre_completo = EXCLUDED.nombre_completo,
        password_hash = EXCLUDED.password_hash,
        rol = EXCLUDED.rol,
        empleado_id = EXCLUDED.empleado_id,
        estado = EXCLUDED.estado,
        actualizado_en = EXCLUDED.actualizado_en;`,
      [
        usuario.id,
        usuario.username,
        usuario.email,
        usuario.nombre_completo,
        usuario.password_hash,
        usuario.rol,
        usuario.empleado_id || null,
        usuario.estado,
        usuario.creado_en || new Date().toISOString(),
        usuario.actualizado_en || new Date().toISOString(),
      ]
    );
  }

  async actualizar(id: string, parcial: Partial<UsuarioEntity>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (parcial.username !== undefined) {
      fields.push(`username = $${idx++}`);
      values.push(parcial.username);
    }
    if (parcial.email !== undefined) {
      fields.push(`email = $${idx++}`);
      values.push(parcial.email);
    }
    if (parcial.nombre_completo !== undefined) {
      fields.push(`nombre_completo = $${idx++}`);
      values.push(parcial.nombre_completo);
    }
    if (parcial.password_hash !== undefined) {
      fields.push(`password_hash = $${idx++}`);
      values.push(parcial.password_hash);
    }
    if (parcial.rol !== undefined) {
      fields.push(`rol = $${idx++}`);
      values.push(parcial.rol);
    }
    if (parcial.empleado_id !== undefined) {
      fields.push(`empleado_id = $${idx++}`);
      values.push(parcial.empleado_id || null);
    }
    if (parcial.estado !== undefined) {
      fields.push(`estado = $${idx++}`);
      values.push(parcial.estado);
    }

    fields.push(`actualizado_en = NOW()`);
    values.push(id);

    const query = `UPDATE usuarios SET ${fields.join(", ")} WHERE id = $${idx};`;
    await this.pool.query(query, values);
  }

  async listar(filtros?: { busqueda?: string; rol?: string; estado?: string }): Promise<UsuarioConDetalles[]> {
    const busqueda = filtros?.busqueda?.trim() ? `%${filtros.busqueda.trim()}%` : null;
    const rol = filtros?.rol && filtros.rol !== "TODOS" ? filtros.rol : null;
    const estado = filtros?.estado && filtros.estado !== "TODOS" ? filtros.estado : null;

    const res = await this.pool.query(
      `SELECT 
        u.id,
        u.username,
        u.email,
        u.nombre_completo,
        u.rol,
        u.empleado_id,
        u.estado,
        u.creado_en,
        u.actualizado_en,
        e.nombre_completo AS empleado_nombre,
        e.cedula AS empleado_cedula,
        e.correo_laboral AS empleado_correo,
        e.estado AS empleado_estado,
        (
          SELECT MAX(s.ultimo_acceso_en)
          FROM sesiones s
          WHERE s.usuario_id = u.id AND s.revocada = false
        ) AS ultimo_acceso_en,
        (
          SELECT COUNT(*)::int
          FROM sesiones s
          WHERE s.usuario_id = u.id AND s.revocada = false AND s.expira_en > NOW()
        ) AS sesiones_activas_count
      FROM usuarios u
      LEFT JOIN empleados e ON u.empleado_id = e.id
      WHERE ($1::text IS NULL OR (
        LOWER(u.username) LIKE LOWER($1) OR
        LOWER(u.email) LIKE LOWER($1) OR
        LOWER(u.nombre_completo) LIKE LOWER($1) OR
        LOWER(COALESCE(e.nombre_completo, '')) LIKE LOWER($1) OR
        LOWER(COALESCE(e.cedula, '')) LIKE LOWER($1)
      ))
      AND ($2::text IS NULL OR u.rol = $2)
      AND ($3::text IS NULL OR u.estado = $3)
      ORDER BY u.creado_en DESC;`,
      [busqueda, rol, estado]
    );

    return res.rows.map((r) => this.mapRowToDetalle(r));
  }

  async obtenerDetallePorId(id: string): Promise<UsuarioConDetalles | null> {
    const res = await this.pool.query(
      `SELECT 
        u.id,
        u.username,
        u.email,
        u.nombre_completo,
        u.rol,
        u.empleado_id,
        u.estado,
        u.creado_en,
        u.actualizado_en,
        e.nombre_completo AS empleado_nombre,
        e.cedula AS empleado_cedula,
        e.correo_laboral AS empleado_correo,
        e.estado AS empleado_estado,
        (
          SELECT MAX(s.ultimo_acceso_en)
          FROM sesiones s
          WHERE s.usuario_id = u.id AND s.revocada = false
        ) AS ultimo_acceso_en,
        (
          SELECT COUNT(*)::int
          FROM sesiones s
          WHERE s.usuario_id = u.id AND s.revocada = false AND s.expira_en > NOW()
        ) AS sesiones_activas_count
      FROM usuarios u
      LEFT JOIN empleados e ON u.empleado_id = e.id
      WHERE u.id = $1
      LIMIT 1;`,
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToDetalle(res.rows[0]);
  }

  async contarAdministradoresActivos(excluyendoUsuarioId?: string): Promise<number> {
    const res = await this.pool.query(
      `SELECT COUNT(DISTINCT u.id)::int AS count
       FROM usuarios u
       JOIN roles_permisos rp ON rp.rol = u.rol AND rp.permiso_codigo = 'USUARIOS_ADMINISTRAR' AND rp.activo = true
       WHERE u.estado = 'ACTIVO'
         AND ($1::uuid IS NULL OR u.id != $1::uuid);`,
      [excluyendoUsuarioId || null]
    );
    return Number(res.rows[0]?.count || 0);
  }
}
