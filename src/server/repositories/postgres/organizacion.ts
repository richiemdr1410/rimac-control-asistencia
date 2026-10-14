import type {
  IOrganizacionRepository,
  DepartamentoEntity,
  PuestoEntity,
} from "../interfaces/organizacion.js";
import { getPool } from "../../../db/index.js";
import type pg from "pg";

export class PostgresOrganizacionRepository implements IOrganizacionRepository {
  private pool: pg.Pool;

  constructor(customPool?: pg.Pool) {
    this.pool = customPool || getPool();
  }

  // ==========================================
  // DEPARTAMENTOS
  // ==========================================

  async listarDepartamentos(soloActivos: boolean = false): Promise<DepartamentoEntity[]> {
    const where = soloActivos ? "WHERE activo = true" : "";
    const res = await this.pool.query(
      `SELECT id, codigo, nombre, activo, creado_en 
       FROM departamentos 
       ${where} 
       ORDER BY nombre ASC;`
    );
    return res.rows.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      activo: Boolean(r.activo),
      creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
    }));
  }

  async obtenerDepartamentoPorId(id: string): Promise<DepartamentoEntity | null> {
    const res = await this.pool.query(
      `SELECT id, codigo, nombre, activo, creado_en 
       FROM departamentos 
       WHERE id = $1 
       LIMIT 1;`,
      [id]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      activo: Boolean(r.activo),
      creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
    };
  }

  async obtenerDepartamentoPorCodigo(codigo: string): Promise<DepartamentoEntity | null> {
    const res = await this.pool.query(
      `SELECT id, codigo, nombre, activo, creado_en 
       FROM departamentos 
       WHERE LOWER(codigo) = LOWER($1) 
       LIMIT 1;`,
      [codigo.trim()]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      activo: Boolean(r.activo),
      creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
    };
  }

  async crearDepartamento(depto: {
    codigo: string;
    nombre: string;
    activo?: boolean;
  }): Promise<DepartamentoEntity> {
    const activo = depto.activo !== false;
    const res = await this.pool.query(
      `INSERT INTO departamentos (codigo, nombre, activo) 
       VALUES ($1, $2, $3) 
       RETURNING id, codigo, nombre, activo, creado_en;`,
      [depto.codigo.trim().toUpperCase(), depto.nombre.trim(), activo]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      activo: Boolean(r.activo),
      creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
    };
  }

  async actualizarDepartamento(
    id: string,
    datos: { nombre?: string; activo?: boolean }
  ): Promise<DepartamentoEntity> {
    const actual = await this.obtenerDepartamentoPorId(id);
    if (!actual) {
      const err = new Error(`Departamento con ID '${id}' no encontrado.`);
      (err as any).statusCode = 404;
      (err as any).codigo = "RECURSO_NO_ENCONTRADO";
      throw err;
    }

    const nuevoNombre = datos.nombre !== undefined ? datos.nombre.trim() : actual.nombre;
    const nuevoActivo = datos.activo !== undefined ? datos.activo : actual.activo;

    const res = await this.pool.query(
      `UPDATE departamentos 
       SET nombre = $1, activo = $2 
       WHERE id = $3 
       RETURNING id, codigo, nombre, activo, creado_en;`,
      [nuevoNombre, nuevoActivo, id]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      activo: Boolean(r.activo),
      creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
    };
  }

  async contarDependenciasActivasDepartamento(
    id: string
  ): Promise<{ puestosActivos: number; empleadosActivos: number }> {
    const resPuestos = await this.pool.query(
      `SELECT COUNT(*)::int as total 
       FROM puestos 
       WHERE departamento_id = $1 AND activo = true;`,
      [id]
    );
    const resEmpleados = await this.pool.query(
      `SELECT COUNT(*)::int as total 
       FROM empleados 
       WHERE departamento_id = $1 AND estado = 'ACTIVO';`,
      [id]
    );
    return {
      puestosActivos: resPuestos.rows[0]?.total || 0,
      empleadosActivos: resEmpleados.rows[0]?.total || 0,
    };
  }

  async cambiarEstadoDepartamento(id: string, activo: boolean): Promise<DepartamentoEntity> {
    if (!activo) {
      const { puestosActivos, empleadosActivos } = await this.contarDependenciasActivasDepartamento(id);
      if (puestosActivos > 0 || empleadosActivos > 0) {
        const err = new Error(
          `No se puede desactivar el departamento porque tiene ${puestosActivos} puesto(s) activo(s) y ${empleadosActivos} empleado(s) activo(s) vinculados.`
        );
        (err as any).statusCode = 409;
        (err as any).codigo = "DEPARTAMENTO_CON_DEPENDENCIAS_ACTIVAS";
        throw err;
      }
    }
    return this.actualizarDepartamento(id, { activo });
  }

  async eliminarDepartamento(id: string): Promise<void> {
    const actual = await this.obtenerDepartamentoPorId(id);
    if (!actual) {
      const err = new Error("Departamento no encontrado.");
      (err as any).statusCode = 404;
      (err as any).codigo = "RECURSO_NO_ENCONTRADO";
      throw err;
    }

    // Verificar si tiene puestos asociados (activos o inactivos)
    const resPuestos = await this.pool.query(
      `SELECT COUNT(*)::int as total FROM puestos WHERE departamento_id = $1;`,
      [id]
    );
    // Verificar si tiene empleados asociados (activos o inactivos)
    const resEmpleados = await this.pool.query(
      `SELECT COUNT(*)::int as total FROM empleados WHERE departamento_id = $1;`,
      [id]
    );

    const totalPuestos = resPuestos.rows[0]?.total || 0;
    const totalEmpleados = resEmpleados.rows[0]?.total || 0;

    if (totalPuestos > 0 || totalEmpleados > 0) {
      const err = new Error(
        "El departamento posee información relacionada y no puede eliminarse. Puede desactivarlo para conservar el historial."
      );
      (err as any).statusCode = 409;
      (err as any).codigo = "DEPARTAMENTO_EN_USO";
      throw err;
    }

    await this.pool.query(`DELETE FROM departamentos WHERE id = $1;`, [id]);
  }

  // ==========================================
  // PUESTOS
  // ==========================================

  async listarPuestos(departamentoId?: string, soloActivos: boolean = false): Promise<PuestoEntity[]> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (departamentoId) {
      values.push(departamentoId);
      conditions.push(`p.departamento_id = $${values.length}`);
    }
    if (soloActivos) {
      conditions.push(`p.activo = true`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const res = await this.pool.query(
      `SELECT p.id, p.departamento_id, p.codigo, p.nombre, p.activo, p.creado_en,
              d.nombre as departamento_nombre, d.codigo as departamento_codigo
       FROM puestos p
       JOIN departamentos d ON d.id = p.departamento_id
       ${whereClause}
       ORDER BY d.nombre ASC, p.nombre ASC;`,
      values
    );

    return res.rows.map((r) => ({
      id: r.id,
      departamento_id: r.departamento_id,
      departamento_nombre: r.departamento_nombre,
      departamento_codigo: r.departamento_codigo,
      codigo: r.codigo,
      nombre: r.nombre,
      activo: Boolean(r.activo),
      creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
    }));
  }

  async obtenerPuestoPorId(id: string): Promise<PuestoEntity | null> {
    const res = await this.pool.query(
      `SELECT p.id, p.departamento_id, p.codigo, p.nombre, p.activo, p.creado_en,
              d.nombre as departamento_nombre, d.codigo as departamento_codigo
       FROM puestos p
       JOIN departamentos d ON d.id = p.departamento_id
       WHERE p.id = $1
       LIMIT 1;`,
      [id]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      departamento_id: r.departamento_id,
      departamento_nombre: r.departamento_nombre,
      departamento_codigo: r.departamento_codigo,
      codigo: r.codigo,
      nombre: r.nombre,
      activo: Boolean(r.activo),
      creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
    };
  }

  async obtenerPuestoPorCodigo(codigo: string): Promise<PuestoEntity | null> {
    const res = await this.pool.query(
      `SELECT p.id, p.departamento_id, p.codigo, p.nombre, p.activo, p.creado_en,
              d.nombre as departamento_nombre, d.codigo as departamento_codigo
       FROM puestos p
       JOIN departamentos d ON d.id = p.departamento_id
       WHERE LOWER(p.codigo) = LOWER($1)
       LIMIT 1;`,
      [codigo.trim()]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      departamento_id: r.departamento_id,
      departamento_nombre: r.departamento_nombre,
      departamento_codigo: r.departamento_codigo,
      codigo: r.codigo,
      nombre: r.nombre,
      activo: Boolean(r.activo),
      creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
    };
  }

  async crearPuesto(puesto: {
    departamento_id: string;
    codigo: string;
    nombre: string;
    activo?: boolean;
  }): Promise<PuestoEntity> {
    // Validar departamento existe y activo
    const depto = await this.obtenerDepartamentoPorId(puesto.departamento_id);
    if (!depto || !depto.activo) {
      const err = new Error("El departamento asociado no existe o se encuentra inactivo.");
      (err as any).statusCode = 400;
      (err as any).codigo = "DEPARTAMENTO_INVALIDO";
      throw err;
    }

    const activo = puesto.activo !== false;
    const res = await this.pool.query(
      `INSERT INTO puestos (departamento_id, codigo, nombre, activo) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, departamento_id, codigo, nombre, activo, creado_en;`,
      [puesto.departamento_id, puesto.codigo.trim().toUpperCase(), puesto.nombre.trim(), activo]
    );
    const r = res.rows[0];
    return {
      id: r.id,
      departamento_id: r.departamento_id,
      departamento_nombre: depto.nombre,
      departamento_codigo: depto.codigo,
      codigo: r.codigo,
      nombre: r.nombre,
      activo: Boolean(r.activo),
      creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
    };
  }

  async actualizarPuesto(
    id: string,
    datos: { departamento_id?: string; nombre?: string; activo?: boolean }
  ): Promise<PuestoEntity> {
    const actual = await this.obtenerPuestoPorId(id);
    if (!actual) {
      const err = new Error(`Puesto con ID '${id}' no encontrado.`);
      (err as any).statusCode = 404;
      (err as any).codigo = "RECURSO_NO_ENCONTRADO";
      throw err;
    }

    let nuevoDeptoId = actual.departamento_id;
    if (datos.departamento_id && datos.departamento_id !== actual.departamento_id) {
      const depto = await this.obtenerDepartamentoPorId(datos.departamento_id);
      if (!depto || !depto.activo) {
        const err = new Error("El departamento especificado no existe o se encuentra inactivo.");
        (err as any).statusCode = 400;
        (err as any).codigo = "DEPARTAMENTO_INVALIDO";
        throw err;
      }
      nuevoDeptoId = datos.departamento_id;
    }

    const nuevoNombre = datos.nombre !== undefined ? datos.nombre.trim() : actual.nombre;
    const nuevoActivo = datos.activo !== undefined ? datos.activo : actual.activo;

    const res = await this.pool.query(
      `UPDATE puestos 
       SET departamento_id = $1, nombre = $2, activo = $3 
       WHERE id = $4 
       RETURNING id, departamento_id, codigo, nombre, activo, creado_en;`,
      [nuevoDeptoId, nuevoNombre, nuevoActivo, id]
    );
    const r = res.rows[0];
    const depto = await this.obtenerDepartamentoPorId(r.departamento_id);
    return {
      id: r.id,
      departamento_id: r.departamento_id,
      departamento_nombre: depto?.nombre,
      departamento_codigo: depto?.codigo,
      codigo: r.codigo,
      nombre: r.nombre,
      activo: Boolean(r.activo),
      creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
    };
  }

  async contarEmpleadosActivosPuesto(id: string): Promise<number> {
    const res = await this.pool.query(
      `SELECT COUNT(*)::int as total 
       FROM empleados 
       WHERE puesto_id = $1 AND estado = 'ACTIVO';`,
      [id]
    );
    return res.rows[0]?.total || 0;
  }

  async cambiarEstadoPuesto(id: string, activo: boolean): Promise<PuestoEntity> {
    if (!activo) {
      const empleadosActivos = await this.contarEmpleadosActivosPuesto(id);
      if (empleadosActivos > 0) {
        const err = new Error(
          `No se puede desactivar el puesto porque tiene ${empleadosActivos} empleado(s) activo(s) asignados.`
        );
        (err as any).statusCode = 409;
        (err as any).codigo = "PUESTO_CON_EMPLEADOS_ACTIVOS";
        throw err;
      }
    }
    return this.actualizarPuesto(id, { activo });
  }

  async eliminarPuesto(id: string): Promise<void> {
    const actual = await this.obtenerPuestoPorId(id);
    if (!actual) {
      const err = new Error("Puesto no encontrado.");
      (err as any).statusCode = 404;
      (err as any).codigo = "RECURSO_NO_ENCONTRADO";
      throw err;
    }

    // Verificar si algún empleado (activo o inactivo) está vinculado a este puesto
    const resEmpleados = await this.pool.query(
      `SELECT COUNT(*)::int as total FROM empleados WHERE puesto_id = $1;`,
      [id]
    );
    const totalEmpleados = resEmpleados.rows[0]?.total || 0;

    if (totalEmpleados > 0) {
      const err = new Error(
        "El puesto posee información relacionada y no puede eliminarse. Puede desactivarlo para conservar el historial."
      );
      (err as any).statusCode = 409;
      (err as any).codigo = "PUESTO_EN_USO";
      throw err;
    }

    await this.pool.query(`DELETE FROM puestos WHERE id = $1;`, [id]);
  }
}
