import type {
  IPermisosRepository,
  PermisoEntity,
  MatrizRolesPermisos,
} from "../interfaces/permisos.js";
import type { RolUsuario } from "../../auth/types.js";
import { getPool } from "../../../db/index.js";
import type pg from "pg";

const ROLES_CANONICOS: RolUsuario[] = [
  "ADMINISTRADOR",
  "TALENTO_HUMANO",
  "SUPERVISOR_SEGURIDAD",
  "SEGURIDAD",
  "EMPLEADO",
];

export class PostgresPermisosRepository implements IPermisosRepository {
  private pool: pg.Pool;
  // Cache en memoria: rol -> { permisos: Set<string>, expiraEn: number }
  private cachePermisosPorRol: Map<RolUsuario, { permisos: Set<string>; expiraEn: number }> = new Map();
  private readonly CACHE_TTL_MS = 60 * 1000; // 60 segundos TTL

  constructor(customPool?: pg.Pool) {
    this.pool = customPool || getPool();
  }

  invalidarCache(rol?: RolUsuario): void {
    if (rol) {
      this.cachePermisosPorRol.delete(rol);
    } else {
      this.cachePermisosPorRol.clear();
    }
  }

  async listarPermisos(): Promise<PermisoEntity[]> {
    const res = await this.pool.query(
      `SELECT codigo, modulo, descripcion, critico, creado_en 
       FROM permisos 
       ORDER BY modulo ASC, codigo ASC;`
    );
    return res.rows.map((r) => ({
      codigo: r.codigo,
      modulo: r.modulo,
      descripcion: r.descripcion,
      critico: Boolean(r.critico),
      creado_en: r.creado_en ? new Date(r.creado_en).toISOString() : new Date().toISOString(),
    }));
  }

  async listarPermisosActivosPorRol(rol: RolUsuario): Promise<string[]> {
    const ahora = Date.now();
    const cached = this.cachePermisosPorRol.get(rol);
    if (cached && cached.expiraEn > ahora) {
      return Array.from(cached.permisos);
    }

    const res = await this.pool.query(
      `SELECT permiso_codigo 
       FROM roles_permisos 
       WHERE rol = $1 AND activo = true;`,
      [rol]
    );

    const permisosArray = res.rows.map((r) => r.permiso_codigo as string);
    this.cachePermisosPorRol.set(rol, {
      permisos: new Set(permisosArray),
      expiraEn: ahora + this.CACHE_TTL_MS,
    });

    return permisosArray;
  }

  async rolTienePermiso(rol: RolUsuario, permisoCodigo: string): Promise<boolean> {
    const activos = await this.listarPermisosActivosPorRol(rol);
    return activos.includes(permisoCodigo);
  }

  async obtenerMatrizCompleta(): Promise<MatrizRolesPermisos> {
    const permisos = await this.listarPermisos();
    const resAsignaciones = await this.pool.query(
      `SELECT rol, permiso_codigo 
       FROM roles_permisos 
       WHERE activo = true;`
    );

    const asignaciones: Record<RolUsuario, string[]> = {
      ADMINISTRADOR: [],
      TALENTO_HUMANO: [],
      SUPERVISOR_SEGURIDAD: [],
      SEGURIDAD: [],
      EMPLEADO: [],
    };

    for (const row of resAsignaciones.rows) {
      const r = row.rol as RolUsuario;
      if (asignaciones[r]) {
        asignaciones[r].push(row.permiso_codigo);
      }
    }

    return {
      roles: ROLES_CANONICOS,
      permisos,
      asignaciones,
    };
  }

  async actualizarPermisosRol(
    rol: RolUsuario,
    permisosActivos: string[],
    usuarioActorId: string
  ): Promise<{ modificados: number; detalles: Array<{ permiso: string; antes: boolean; ahora: boolean }> }> {
    // 1. Validar que el rol sea estrictamente uno de los 5 roles canónicos
    if (!ROLES_CANONICOS.includes(rol)) {
      const err = new Error(`El rol '${rol}' no es válido. Solo se admiten los cinco roles canónicos.`);
      (err as any).statusCode = 400;
      (err as any).codigo = "ROL_INVALIDO";
      throw err;
    }

    // 2. Validar que todos los permisos indicados existan en el catálogo
    const todosPermisos = await this.listarPermisos();
    const codigosExistentes = new Set(todosPermisos.map((p) => p.codigo));
    const setNuevos = new Set(permisosActivos);

    for (const p of setNuevos) {
      if (!codigosExistentes.has(p)) {
        const err = new Error(`El permiso '${p}' no existe en el catálogo.`);
        (err as any).statusCode = 400;
        (err as any).codigo = "PERMISO_INEXISTENTE";
        throw err;
      }
    }

    // 3. Protección de último administrador para permisos críticos:
    // Si se está desactivando ROLES_PERMISOS_ADMINISTRAR o USUARIOS_ADMINISTRAR en este rol,
    // verificar si algún otro rol canónico lo mantiene activo.
    const permisosCriticosAValidar = ["ROLES_PERMISOS_ADMINISTRAR", "USUARIOS_ADMINISTRAR"];
    for (const permisoCritico of permisosCriticosAValidar) {
      const tieneEnNuevos = setNuevos.has(permisoCritico);
      if (!tieneEnNuevos) {
        const otrosRolesRes = await this.pool.query(
          `SELECT DISTINCT rol 
           FROM roles_permisos 
           WHERE permiso_codigo = $1 
             AND activo = true 
             AND rol != $2;`,
          [permisoCritico, rol]
        );

        if (otrosRolesRes.rows.length === 0) {
          const err = new Error(
            `Protección de seguridad activada: No se puede retirar el permiso crítico '${permisoCritico}' porque dejaría al sistema sin ningún rol con dicha facultad de administración.`
          );
          (err as any).statusCode = 409;
          (err as any).codigo = "PERMISO_CRITICO_PROTEGIDO";
          throw err;
        }
      }
    }

    // 4. Ejecutar actualización en transacción PostgreSQL
    const client = await this.pool.connect();
    const detalles: Array<{ permiso: string; antes: boolean; ahora: boolean }> = [];

    try {
      await client.query("BEGIN;");

      // Consultar estado actual
      const actualRes = await client.query(
        `SELECT permiso_codigo, activo 
         FROM roles_permisos 
         WHERE rol = $1;`,
        [rol]
      );
      const estadoActualMap = new Map<string, boolean>();
      for (const row of actualRes.rows) {
        estadoActualMap.set(row.permiso_codigo, Boolean(row.activo));
      }

      let modificados = 0;

      // Para cada permiso en el catálogo, actualizar o insertar estado
      for (const perm of todosPermisos) {
        const antes = estadoActualMap.get(perm.codigo) ?? false;
        const ahora = setNuevos.has(perm.codigo);

        if (antes !== ahora) {
          modificados++;
          detalles.push({ permiso: perm.codigo, antes, ahora });

          await client.query(
            `INSERT INTO roles_permisos (
              rol, permiso_codigo, activo, actualizado_por_usuario_id, actualizado_en
            ) VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (rol, permiso_codigo) DO UPDATE SET
              activo = EXCLUDED.activo,
              actualizado_por_usuario_id = EXCLUDED.actualizado_por_usuario_id,
              actualizado_en = NOW();`,
            [rol, perm.codigo, ahora, usuarioActorId]
          );
        }
      }

      await client.query("COMMIT;");

      // Invalidar cache inmediatamente
      this.invalidarCache(rol);

      return { modificados, detalles };
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }
}
