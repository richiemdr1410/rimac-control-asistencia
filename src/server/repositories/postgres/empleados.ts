import type {
  IEmpleadosRepository,
  EmpleadoEntity,
  EmpleadoDetalleCompleto,
} from "../interfaces/empleados.js";
import { getPool } from "../../../db/index.js";
import { randomUUID } from "node:crypto";
import type pg from "pg";

export class PostgresEmpleadosRepository implements IEmpleadosRepository {
  private pool: pg.Pool;

  constructor(customPool?: pg.Pool) {
    this.pool = customPool || getPool();
  }

  private mapRowToEntity(row: any): EmpleadoEntity {
    return {
      id: row.id,
      cedula: row.cedula,
      nombre_completo: row.nombre_completo,
      correo_laboral: row.correo_laboral || undefined,
      telefono: row.telefono || undefined,
      referencia_foto: row.referencia_foto || undefined,
      departamento_id: row.departamento_id,
      departamento_nombre: row.departamento_nombre || undefined,
      departamento_codigo: row.departamento_codigo || undefined,
      puesto_id: row.puesto_id,
      puesto_nombre: row.puesto_nombre || undefined,
      puesto_codigo: row.puesto_codigo || undefined,
      usuario_id: row.usuario_id || undefined,
      tiene_usuario: Boolean(row.usuario_id),
      estado: row.estado as "ACTIVO" | "INACTIVO",
      horario_vigente: row.horario_id
        ? {
            id: row.horario_id,
            codigo: row.horario_codigo,
            nombre: row.horario_nombre,
            fecha_inicio: row.horario_fecha_inicio,
          }
        : null,
      jefatura_vigente: row.jefatura_empleado_id
        ? {
            id: row.asig_jefatura_id,
            jefatura_empleado_id: row.jefatura_empleado_id,
            nombre_completo: row.jefatura_nombre,
            cedula: row.jefatura_cedula,
            fecha_inicio:
              row.jefatura_fecha_inicio instanceof Date
                ? row.jefatura_fecha_inicio.toISOString().split("T")[0]
                : String(row.jefatura_fecha_inicio),
            fecha_fin: row.jefatura_fecha_fin
              ? row.jefatura_fecha_fin instanceof Date
                ? row.jefatura_fecha_fin.toISOString().split("T")[0]
                : String(row.jefatura_fecha_fin)
              : null,
            estado: row.jefatura_estado || "ACTIVA",
          }
        : null,
      creado_en: row.creado_en instanceof Date ? row.creado_en.toISOString() : String(row.creado_en),
      actualizado_en:
        row.actualizado_en instanceof Date
          ? row.actualizado_en.toISOString()
          : row.actualizado_en
          ? String(row.actualizado_en)
          : undefined,
    };
  }

  async obtenerPorId(id: string): Promise<EmpleadoEntity | null> {
    const res = await this.pool.query(
      `SELECT e.*, 
              d.nombre as departamento_nombre, d.codigo as departamento_codigo,
              p.nombre as puesto_nombre, p.codigo as puesto_codigo,
              u.id as usuario_id,
              ah.horario_id, h.codigo as horario_codigo, h.nombre as horario_nombre, ah.fecha_inicio as horario_fecha_inicio,
              aj.id as asig_jefatura_id, aj.jefatura_empleado_id, jefe.nombre_completo as jefatura_nombre, jefe.cedula as jefatura_cedula,
              aj.fecha_inicio as jefatura_fecha_inicio, aj.fecha_fin as jefatura_fecha_fin, aj.estado as jefatura_estado
       FROM empleados e
       LEFT JOIN departamentos d ON d.id = e.departamento_id
       LEFT JOIN puestos p ON p.id = e.puesto_id
       LEFT JOIN usuarios u ON u.empleado_id = e.id
       LEFT JOIN LATERAL (
         SELECT ash.horario_id, ash.fecha_inicio
         FROM asignaciones_horario ash
         WHERE ash.empleado_id = e.id
           AND ash.fecha_inicio <= CURRENT_DATE
           AND (ash.fecha_fin IS NULL OR ash.fecha_fin >= CURRENT_DATE)
         ORDER BY ash.fecha_inicio DESC
         LIMIT 1
       ) ah ON true
       LEFT JOIN horarios h ON h.id = ah.horario_id
       LEFT JOIN LATERAL (
         SELECT asj.id, asj.jefatura_empleado_id, asj.fecha_inicio, asj.fecha_fin, asj.estado
         FROM asignaciones_jefatura asj
         WHERE asj.subordinado_empleado_id = e.id
           AND asj.estado = 'ACTIVA'
           AND asj.fecha_inicio <= CURRENT_DATE
           AND (asj.fecha_fin IS NULL OR asj.fecha_fin >= CURRENT_DATE)
         ORDER BY asj.fecha_inicio DESC
         LIMIT 1
       ) aj ON true
       LEFT JOIN empleados jefe ON jefe.id = aj.jefatura_empleado_id
       WHERE e.id = $1
       LIMIT 1;`,
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToEntity(res.rows[0]);
  }

  async obtenerPorIdConRelaciones(id: string): Promise<EmpleadoDetalleCompleto | null> {
    const empleado = await this.obtenerPorId(id);
    if (!empleado) return null;

    // 1. Historial de Horarios
    const resHorarios = await this.pool.query(
      `SELECT ah.id, ah.horario_id, h.codigo, h.nombre, ah.fecha_inicio, ah.fecha_fin, ah.usuario_asigno_id, ah.creado_en
       FROM asignaciones_horario ah
       JOIN horarios h ON h.id = ah.horario_id
       WHERE ah.empleado_id = $1
       ORDER BY ah.fecha_inicio DESC, ah.creado_en DESC;`,
      [id]
    );

    // 2. Historial de Jefaturas
    const resJefaturas = await this.pool.query(
      `SELECT aj.id, aj.jefatura_empleado_id, jefe.nombre_completo as nombre_jefatura, jefe.cedula as cedula_jefatura,
              aj.fecha_inicio, aj.fecha_fin, aj.estado, aj.creado_en
       FROM asignaciones_jefatura aj
       JOIN empleados jefe ON jefe.id = aj.jefatura_empleado_id
       WHERE aj.subordinado_empleado_id = $1
       ORDER BY aj.fecha_inicio DESC, aj.creado_en DESC;`,
      [id]
    );

    // 3. Usuario asociado
    const resUsuario = await this.pool.query(
      `SELECT id, username, rol, estado
       FROM usuarios
       WHERE empleado_id = $1
       LIMIT 1;`,
      [id]
    );

    const usuario = resUsuario.rows.length > 0 ? resUsuario.rows[0] : null;

    return {
      ...empleado,
      historial_horarios: resHorarios.rows.map((r) => ({
        id: r.id,
        horario_id: r.horario_id,
        codigo: r.codigo,
        nombre: r.nombre,
        fecha_inicio: r.fecha_inicio instanceof Date ? r.fecha_inicio.toISOString().split("T")[0] : String(r.fecha_inicio),
        fecha_fin: r.fecha_fin ? (r.fecha_fin instanceof Date ? r.fecha_fin.toISOString().split("T")[0] : String(r.fecha_fin)) : null,
        usuario_asigno_id: r.usuario_asigno_id,
        creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
      })),
      historial_jefaturas: resJefaturas.rows.map((r) => ({
        id: r.id,
        jefatura_empleado_id: r.jefatura_empleado_id,
        nombre_jefatura: r.nombre_jefatura,
        cedula_jefatura: r.cedula_jefatura,
        fecha_inicio: r.fecha_inicio instanceof Date ? r.fecha_inicio.toISOString().split("T")[0] : String(r.fecha_inicio),
        fecha_fin: r.fecha_fin ? (r.fecha_fin instanceof Date ? r.fecha_fin.toISOString().split("T")[0] : String(r.fecha_fin)) : null,
        estado: r.estado,
        creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
      })),
      usuario: usuario
        ? {
            id: usuario.id,
            identificador: usuario.username,
            rol: usuario.rol,
            estado: usuario.estado,
          }
        : null,
    };
  }

  async obtenerPorCedula(cedula: string): Promise<EmpleadoEntity | null> {
    const res = await this.pool.query(
      `SELECT e.*, 
              d.nombre as departamento_nombre, d.codigo as departamento_codigo,
              p.nombre as puesto_nombre, p.codigo as puesto_codigo,
              u.id as usuario_id
       FROM empleados e
       LEFT JOIN departamentos d ON d.id = e.departamento_id
       LEFT JOIN puestos p ON p.id = e.puesto_id
       LEFT JOIN usuarios u ON u.empleado_id = e.id
       WHERE LOWER(e.cedula) = LOWER($1)
       LIMIT 1;`,
      [cedula.trim()]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToEntity(res.rows[0]);
  }

  async obtenerPorCorreo(correo: string): Promise<EmpleadoEntity | null> {
    const res = await this.pool.query(
      `SELECT e.*, 
              d.nombre as departamento_nombre, d.codigo as departamento_codigo,
              p.nombre as puesto_nombre, p.codigo as puesto_codigo,
              u.id as usuario_id
       FROM empleados e
       LEFT JOIN departamentos d ON d.id = e.departamento_id
       LEFT JOIN puestos p ON p.id = e.puesto_id
       LEFT JOIN usuarios u ON u.empleado_id = e.id
       WHERE LOWER(e.correo_laboral) = LOWER($1)
       LIMIT 1;`,
      [correo.trim()]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToEntity(res.rows[0]);
  }

  async listar(filtros?: {
    departamento_id?: string;
    estado?: string;
    termino?: string;
  }): Promise<EmpleadoEntity[]> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (filtros?.departamento_id) {
      values.push(filtros.departamento_id);
      conditions.push(`e.departamento_id = $${values.length}`);
    }

    if (filtros?.estado) {
      values.push(filtros.estado.toUpperCase());
      conditions.push(`e.estado = $${values.length}`);
    }

    if (filtros?.termino && filtros.termino.trim()) {
      values.push(`%${filtros.termino.trim().toLowerCase()}%`);
      const idx = values.length;
      conditions.push(
        `(LOWER(e.nombre_completo) LIKE $${idx} OR LOWER(e.cedula) LIKE $${idx} OR LOWER(e.correo_laboral) LIKE $${idx})`
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const res = await this.pool.query(
      `SELECT e.*, 
              d.nombre as departamento_nombre, d.codigo as departamento_codigo,
              p.nombre as puesto_nombre, p.codigo as puesto_codigo,
              u.id as usuario_id,
              ah.horario_id, h.codigo as horario_codigo, h.nombre as horario_nombre, ah.fecha_inicio as horario_fecha_inicio,
              aj.id as asig_jefatura_id, aj.jefatura_empleado_id, jefe.nombre_completo as jefatura_nombre, jefe.cedula as jefatura_cedula,
              aj.fecha_inicio as jefatura_fecha_inicio, aj.fecha_fin as jefatura_fecha_fin, aj.estado as jefatura_estado
       FROM empleados e
       LEFT JOIN departamentos d ON d.id = e.departamento_id
       LEFT JOIN puestos p ON p.id = e.puesto_id
       LEFT JOIN usuarios u ON u.empleado_id = e.id
       LEFT JOIN LATERAL (
         SELECT ash.horario_id, ash.fecha_inicio
         FROM asignaciones_horario ash
         WHERE ash.empleado_id = e.id
           AND ash.fecha_inicio <= CURRENT_DATE
           AND (ash.fecha_fin IS NULL OR ash.fecha_fin >= CURRENT_DATE)
         ORDER BY ash.fecha_inicio DESC
         LIMIT 1
       ) ah ON true
       LEFT JOIN horarios h ON h.id = ah.horario_id
       LEFT JOIN LATERAL (
         SELECT asj.id, asj.jefatura_empleado_id, asj.fecha_inicio, asj.fecha_fin, asj.estado
         FROM asignaciones_jefatura asj
         WHERE asj.subordinado_empleado_id = e.id
           AND asj.estado = 'ACTIVA'
           AND asj.fecha_inicio <= CURRENT_DATE
           AND (asj.fecha_fin IS NULL OR asj.fecha_fin >= CURRENT_DATE)
         ORDER BY asj.fecha_inicio DESC
         LIMIT 1
       ) aj ON true
       LEFT JOIN empleados jefe ON jefe.id = aj.jefatura_empleado_id
       ${whereClause}
       ORDER BY e.nombre_completo ASC;`,
      values
    );

    return res.rows.map(this.mapRowToEntity);
  }

  async listarActivos(): Promise<EmpleadoEntity[]> {
    return this.listar({ estado: "ACTIVO" });
  }

  async crear(empleado: {
    id?: string;
    cedula: string;
    nombre_completo: string;
    correo_laboral?: string;
    telefono?: string;
    departamento_id: string;
    puesto_id: string;
    referencia_foto?: string;
    estado?: "ACTIVO" | "INACTIVO";
  }): Promise<EmpleadoEntity> {
    const id = empleado.id || randomUUID();
    const estado = empleado.estado || "ACTIVO";

    // 1. Validar que la cédula sea única
    const existenteCedula = await this.obtenerPorCedula(empleado.cedula);
    if (existenteCedula) {
      const err = new Error(`Ya existe un colaborador registrado con la cédula '${empleado.cedula}'.`);
      (err as any).statusCode = 409;
      (err as any).codigo = "CEDULA_DUPLICADA";
      throw err;
    }

    // 2. Validar que el puesto pertenezca al departamento
    const resPuesto = await this.pool.query(
      `SELECT departamento_id, activo FROM puestos WHERE id = $1;`,
      [empleado.puesto_id]
    );
    if (resPuesto.rows.length === 0) {
      const err = new Error("El puesto indicado no existe.");
      (err as any).statusCode = 400;
      (err as any).codigo = "PUESTO_INVALIDO";
      throw err;
    }
    if (resPuesto.rows[0].departamento_id !== empleado.departamento_id) {
      const err = new Error(
        "Inconsistencia organizacional: El puesto seleccionado no pertenece al departamento del colaborador."
      );
      (err as any).statusCode = 400;
      (err as any).codigo = "PUESTO_DEPARTAMENTO_INCONSISTENTE";
      throw err;
    }
    if (!resPuesto.rows[0].activo) {
      const err = new Error("El puesto seleccionado se encuentra inactivo.");
      (err as any).statusCode = 400;
      (err as any).codigo = "PUESTO_INACTIVO";
      throw err;
    }

    await this.pool.query(
      `INSERT INTO empleados (
        id, cedula, nombre_completo, correo_laboral, telefono, departamento_id, puesto_id, referencia_foto, estado
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
      [
        id,
        empleado.cedula.trim(),
        empleado.nombre_completo.trim(),
        empleado.correo_laboral ? empleado.correo_laboral.trim().toLowerCase() : null,
        empleado.telefono ? empleado.telefono.trim() : null,
        empleado.departamento_id,
        empleado.puesto_id,
        empleado.referencia_foto || null,
        estado,
      ]
    );

    const creado = await this.obtenerPorId(id);
    return creado!;
  }

  async actualizar(
    id: string,
    datos: {
      nombre_completo?: string;
      correo_laboral?: string;
      telefono?: string;
      departamento_id?: string;
      puesto_id?: string;
      referencia_foto?: string;
    }
  ): Promise<EmpleadoEntity> {
    const actual = await this.obtenerPorId(id);
    if (!actual) {
      const err = new Error(`Colaborador con ID '${id}' no encontrado.`);
      (err as any).statusCode = 404;
      (err as any).codigo = "RECURSO_NO_ENCONTRADO";
      throw err;
    }

    const nuevoDeptoId = datos.departamento_id || actual.departamento_id;
    const nuevoPuestoId = datos.puesto_id || actual.puesto_id;

    // Validar consistencia puesto - departamento
    if (datos.departamento_id || datos.puesto_id) {
      const resPuesto = await this.pool.query(
        `SELECT departamento_id, activo FROM puestos WHERE id = $1;`,
        [nuevoPuestoId]
      );
      if (resPuesto.rows.length === 0) {
        const err = new Error("El puesto indicado no existe.");
        (err as any).statusCode = 400;
        (err as any).codigo = "PUESTO_INVALIDO";
        throw err;
      }
      if (resPuesto.rows[0].departamento_id !== nuevoDeptoId) {
        const err = new Error(
          "Inconsistencia organizacional: El puesto seleccionado no pertenece al departamento del colaborador."
        );
        (err as any).statusCode = 400;
        (err as any).codigo = "PUESTO_DEPARTAMENTO_INCONSISTENTE";
        throw err;
      }
    }

    // Validar correo laboral si cambia
    if (datos.correo_laboral && datos.correo_laboral.trim().toLowerCase() !== actual.correo_laboral?.toLowerCase()) {
      const existenteCorreo = await this.obtenerPorCorreo(datos.correo_laboral.trim());
      if (existenteCorreo && existenteCorreo.id !== id) {
        const err = new Error(`El correo laboral '${datos.correo_laboral}' ya está registrado.`);
        (err as any).statusCode = 409;
        (err as any).codigo = "CORREO_DUPLICADO";
        throw err;
      }
    }

    await this.pool.query(
      `UPDATE empleados SET
        nombre_completo = COALESCE($1, nombre_completo),
        correo_laboral = COALESCE($2, correo_laboral),
        telefono = COALESCE($3, telefono),
        departamento_id = $4,
        puesto_id = $5,
        referencia_foto = COALESCE($6, referencia_foto),
        actualizado_en = NOW()
       WHERE id = $7;`,
      [
        datos.nombre_completo ? datos.nombre_completo.trim() : null,
        datos.correo_laboral ? datos.correo_laboral.trim().toLowerCase() : null,
        datos.telefono ? datos.telefono.trim() : null,
        nuevoDeptoId,
        nuevoPuestoId,
        datos.referencia_foto || null,
        id,
      ]
    );

    const actualizado = await this.obtenerPorId(id);
    return actualizado!;
  }

  async cambiarEstado(
    id: string,
    estado: "ACTIVO" | "INACTIVO"
  ): Promise<{ empleado: EmpleadoEntity; tieneUsuarioAsociado: boolean }> {
    if (estado === "INACTIVO") {
      const res = await this.desactivarEmpleadoTransaccional(id);
      return {
        empleado: res.empleado,
        tieneUsuarioAsociado: Boolean(res.usuarioDesactivadoId),
      };
    } else {
      const empleado = await this.reactivarEmpleado(id);
      return {
        empleado,
        tieneUsuarioAsociado: Boolean(empleado.tiene_usuario),
      };
    }
  }

  async desactivarEmpleadoTransaccional(id: string): Promise<{
    empleado: EmpleadoEntity;
    usuarioDesactivadoId?: string;
    sesionesRevocadasCount?: number;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      // 1. Obtener y bloquear empleado
      const resEmp = await client.query(
        `SELECT * FROM empleados WHERE id = $1 FOR UPDATE;`,
        [id]
      );
      if (resEmp.rows.length === 0) {
        const err = new Error(`Colaborador con ID '${id}' no encontrado.`);
        (err as any).statusCode = 404;
        (err as any).codigo = "RECURSO_NO_ENCONTRADO";
        throw err;
      }

      // 2. Buscar usuario personal vinculado
      const resUsr = await client.query(
        `SELECT * FROM usuarios WHERE empleado_id = $1 FOR UPDATE;`,
        [id]
      );
      const usuario = resUsr.rows.length > 0 ? resUsr.rows[0] : null;

      // 3. Proteger al último administrador funcional
      if (usuario && usuario.estado === "ACTIVO" && usuario.rol === "ADMINISTRADOR") {
        const resAdmins = await client.query(
          `SELECT COUNT(DISTINCT u.id)::int AS count
           FROM usuarios u
           JOIN roles_permisos rp ON rp.rol = u.rol AND rp.permiso_codigo = 'USUARIOS_ADMINISTRAR' AND rp.activo = true
           WHERE u.estado = 'ACTIVO' AND u.id != $1;`,
          [usuario.id]
        );
        const otrosAdmins = Number(resAdmins.rows[0]?.count || 0);
        if (otrosAdmins === 0) {
          const err = new Error(
            "Protección de seguridad: No se puede desactivar al colaborador porque su cuenta de usuario es el único administrador activo del sistema."
          );
          (err as any).statusCode = 409;
          (err as any).codigo = "ULTIMO_ADMINISTRADOR_PROTEGIDO";
          throw err;
        }
      }

      // 4. Actualizar empleado a INACTIVO
      await client.query(
        `UPDATE empleados SET estado = 'INACTIVO', actualizado_en = NOW() WHERE id = $1;`,
        [id]
      );

      let usuarioDesactivadoId: string | undefined;
      let sesionesRevocadasCount: number | undefined;

      // 5. Si existe usuario vinculado, desactivarlo y revocar todas sus sesiones de inmediato
      if (usuario) {
        usuarioDesactivadoId = usuario.id;
        await client.query(
          `UPDATE usuarios SET estado = 'INACTIVO', actualizado_en = NOW() WHERE id = $1;`,
          [usuario.id]
        );

        const resSes = await client.query(
          `UPDATE sesiones SET revocada = true WHERE usuario_id = $1 AND revocada = false;`,
          [usuario.id]
        );
        sesionesRevocadasCount = resSes.rowCount || 0;
      }

      await client.query("COMMIT;");

      const actualizado = (await this.obtenerPorId(id))!;
      return {
        empleado: actualizado,
        usuarioDesactivadoId,
        sesionesRevocadasCount,
      };
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async reactivarEmpleado(id: string): Promise<EmpleadoEntity> {
    const actual = await this.obtenerPorId(id);
    if (!actual) {
      const err = new Error(`Colaborador con ID '${id}' no encontrado.`);
      (err as any).statusCode = 404;
      (err as any).codigo = "RECURSO_NO_ENCONTRADO";
      throw err;
    }

    // Reactivar ÚNICAMENTE el expediente del colaborador en empleados
    await this.pool.query(
      `UPDATE empleados SET estado = 'ACTIVO', actualizado_en = NOW() WHERE id = $1;`,
      [id]
    );

    // No reactivar automáticamente la cuenta de usuario vinculada
    return (await this.obtenerPorId(id))!;
  }

  async crearCompuesto(params: {
    empleado: {
      id?: string;
      cedula: string;
      nombre_completo: string;
      correo_laboral?: string;
      telefono?: string;
      departamento_id: string;
      puesto_id: string;
    };
    horario?: {
      horario_id: string;
      fecha_inicio: string;
      fecha_fin?: string;
      usuario_asigno_id: string;
    };
    jefatura?: {
      jefatura_empleado_id: string;
      fecha_inicio: string;
      fecha_fin?: string;
    };
  }): Promise<EmpleadoEntity> {
    const client = await this.pool.connect();
    const empleadoId = params.empleado.id || randomUUID();

    try {
      await client.query("BEGIN;");

      // 1. Validar cédula única
      const resCedula = await client.query(
        `SELECT id FROM empleados WHERE LOWER(cedula) = LOWER($1);`,
        [params.empleado.cedula.trim()]
      );
      if (resCedula.rows.length > 0) {
        const err = new Error(`Ya existe un colaborador registrado con la cédula '${params.empleado.cedula}'.`);
        (err as any).statusCode = 409;
        (err as any).codigo = "CEDULA_DUPLICADA";
        throw err;
      }

      // 2. Validar consistencia puesto / departamento
      const resPuesto = await client.query(
        `SELECT departamento_id, activo FROM puestos WHERE id = $1;`,
        [params.empleado.puesto_id]
      );
      if (resPuesto.rows.length === 0) {
        const err = new Error("El puesto indicado no existe.");
        (err as any).statusCode = 400;
        (err as any).codigo = "PUESTO_INVALIDO";
        throw err;
      }
      if (resPuesto.rows[0].departamento_id !== params.empleado.departamento_id) {
        const err = new Error(
          "Inconsistencia organizacional: El puesto seleccionado no pertenece al departamento del colaborador."
        );
        (err as any).statusCode = 400;
        (err as any).codigo = "PUESTO_DEPARTAMENTO_INCONSISTENTE";
        throw err;
      }

      // 3. Insertar empleado
      await client.query(
        `INSERT INTO empleados (
          id, cedula, nombre_completo, correo_laboral, telefono, departamento_id, puesto_id, estado
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVO');`,
        [
          empleadoId,
          params.empleado.cedula.trim(),
          params.empleado.nombre_completo.trim(),
          params.empleado.correo_laboral ? params.empleado.correo_laboral.trim().toLowerCase() : null,
          params.empleado.telefono ? params.empleado.telefono.trim() : null,
          params.empleado.departamento_id,
          params.empleado.puesto_id,
        ]
      );

      // 4. Si se especificó horario: registrar asignación
      if (params.horario?.horario_id) {
        const resHorario = await client.query(
          `SELECT id, estado FROM horarios WHERE id = $1;`,
          [params.horario.horario_id]
        );
        if (resHorario.rows.length === 0 || resHorario.rows[0].estado !== "ACTIVO") {
          const err = new Error("El horario seleccionado no existe o no se encuentra activo.");
          (err as any).statusCode = 400;
          (err as any).codigo = "HORARIO_INVALIDO";
          throw err;
        }

        await client.query(
          `INSERT INTO asignaciones_horario (
            id, empleado_id, horario_id, fecha_inicio, fecha_fin, usuario_asigno_id
          ) VALUES ($1, $2, $3, $4, $5, $6);`,
          [
            randomUUID(),
            empleadoId,
            params.horario.horario_id,
            params.horario.fecha_inicio,
            params.horario.fecha_fin || null,
            params.horario.usuario_asigno_id,
          ]
        );
      }

      // 5. Si se especificó jefatura: validar y registrar asignación
      if (params.jefatura?.jefatura_empleado_id) {
        const jefaturaId = params.jefatura.jefatura_empleado_id;
        if (jefaturaId === empleadoId) {
          const err = new Error("Un colaborador no puede ser asignado como su propia jefatura directa.");
          (err as any).statusCode = 400;
          (err as any).codigo = "AUTOJEFATURA_NO_PERMITIDA";
          throw err;
        }

        const resJefe = await client.query(
          `SELECT id, estado FROM empleados WHERE id = $1;`,
          [jefaturaId]
        );
        if (resJefe.rows.length === 0 || resJefe.rows[0].estado !== "ACTIVO") {
          const err = new Error("La jefatura seleccionada no existe o no es un colaborador activo.");
          (err as any).statusCode = 400;
          (err as any).codigo = "JEFATURA_INVALIDA";
          throw err;
        }

        await client.query(
          `INSERT INTO asignaciones_jefatura (
            id, jefatura_empleado_id, subordinado_empleado_id, fecha_inicio, fecha_fin, estado
          ) VALUES ($1, $2, $3, $4, $5, 'ACTIVA');`,
          [
            randomUUID(),
            jefaturaId,
            empleadoId,
            params.jefatura.fecha_inicio,
            params.jefatura.fecha_fin || null,
          ]
        );
      }

      await client.query("COMMIT;");

      const resultado = await this.obtenerPorId(empleadoId);
      return resultado!;
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async crearOActualizar(empleado: EmpleadoEntity): Promise<void> {
    await this.pool.query(
      `INSERT INTO empleados (
        id, cedula, nombre_completo, correo_laboral, telefono, departamento_id, puesto_id, referencia_foto, estado, creado_en
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        cedula = EXCLUDED.cedula,
        nombre_completo = EXCLUDED.nombre_completo,
        correo_laboral = EXCLUDED.correo_laboral,
        telefono = EXCLUDED.telefono,
        departamento_id = EXCLUDED.departamento_id,
        puesto_id = EXCLUDED.puesto_id,
        referencia_foto = EXCLUDED.referencia_foto,
        estado = EXCLUDED.estado,
        actualizado_en = NOW();`,
      [
        empleado.id,
        empleado.cedula,
        empleado.nombre_completo,
        empleado.correo_laboral || null,
        empleado.telefono || null,
        empleado.departamento_id,
        empleado.puesto_id,
        empleado.referencia_foto || null,
        empleado.estado || "ACTIVO",
        empleado.creado_en || new Date().toISOString(),
      ]
    );
  }
}
