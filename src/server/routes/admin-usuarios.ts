import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import type { IUsuariosRepository } from "../auth/repositories/interfaces/usuarios.js";
import type { ISesionesRepository } from "../auth/repositories/interfaces/sesiones.js";
import type { IEmpleadosRepository } from "../repositories/interfaces/empleados.js";
import type { IAuditoriaRepository } from "../repositories/interfaces/auditoria.js";
import type { RolUsuario, UsuarioEntity } from "../auth/types.js";
import { hashPassword, validarPoliticaPassword } from "../auth/crypto.js";

const ROLES_CANONICOS: RolUsuario[] = [
  "ADMINISTRADOR",
  "TALENTO_HUMANO",
  "SUPERVISOR_SEGURIDAD",
  "SEGURIDAD",
  "EMPLEADO",
];

export function createAdminUsuariosRouter(
  usuariosRepo: IUsuariosRepository,
  sesionesRepo: ISesionesRepository,
  empleadosRepo: IEmpleadosRepository,
  auditoriaRepo: IAuditoriaRepository,
  requireAuthMiddleware: any,
  csrfProtectionMiddleware: any,
  requirePermission: (codigo: string) => any
): Router {
  const router = Router();

  // Todos los endpoints de administración de usuarios requieren autenticación y permiso USUARIOS_ADMINISTRAR
  router.use(requireAuthMiddleware);
  router.use(requirePermission("USUARIOS_ADMINISTRAR"));

  /**
   * GET /api/admin/usuarios
   * Listado de usuarios con detalles de colaborador y último acceso.
   * Filtros opcionales: busqueda, rol, estado.
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { busqueda, rol, estado } = req.query;
      const usuarios = await usuariosRepo.listar({
        busqueda: typeof busqueda === "string" ? busqueda : undefined,
        rol: typeof rol === "string" ? rol : undefined,
        estado: typeof estado === "string" ? estado : undefined,
      });

      res.json({
        exito: true,
        datos: usuarios,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/admin/usuarios/:id
   * Consulta individual de usuario con detalle completo (sin hashes).
   */
  router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const usuario = await usuariosRepo.obtenerDetallePorId(req.params.id);
      if (!usuario) {
        const err = new Error("Usuario no encontrado.");
        (err as any).statusCode = 404;
        (err as any).codigo = "USUARIO_NO_ENCONTRADO";
        return next(err);
      }

      res.json({
        exito: true,
        datos: usuario,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/admin/usuarios
   * Creación de usuario vinculado a empleado activo con rol canónico y contraseña segura.
   */
  router.post("/", csrfProtectionMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        username,
        email,
        nombre_completo,
        rol,
        password,
        contrasena,
        empleado_id,
        estado = "ACTIVO",
      } = req.body;

      const actor = (req as any).usuario;
      const passAValidar = password || contrasena;

      // 1. Validar nombre de usuario
      if (!username || typeof username !== "string" || !username.trim()) {
        const err = new Error("El nombre de usuario es obligatorio.");
        (err as any).statusCode = 400;
        (err as any).codigo = "DATOS_INVALIDOS";
        return next(err);
      }
      const usernameNorm = username.trim().toLowerCase();
      if (!/^[a-zA-Z0-9._-]{3,50}$/.test(usernameNorm)) {
        const err = new Error("El nombre de usuario debe contener entre 3 y 50 caracteres alfanuméricos, puntos, guiones o guiones bajos.");
        (err as any).statusCode = 400;
        (err as any).codigo = "USERNAME_INVALIDO";
        return next(err);
      }

      // 2. Validar rol canónico
      if (!rol || !ROLES_CANONICOS.includes(rol as RolUsuario)) {
        const err = new Error(`El rol '${rol}' no es válido. Roles canónicos permitidos: ${ROLES_CANONICOS.join(", ")}`);
        (err as any).statusCode = 400;
        (err as any).codigo = "ROL_INVALIDO";
        return next(err);
      }

      // 3. Validar empleado vinculado (obligatorio para cuentas personales)
      if (!empleado_id || typeof empleado_id !== "string") {
        const err = new Error("Toda cuenta de usuario personal debe vincularse a un colaborador existente.");
        (err as any).statusCode = 400;
        (err as any).codigo = "EMPLEADO_REQUERIDO";
        return next(err);
      }

      const empleado = await empleadosRepo.obtenerPorId(empleado_id);
      if (!empleado) {
        const err = new Error("El colaborador seleccionado no existe en el sistema.");
        (err as any).statusCode = 404;
        (err as any).codigo = "EMPLEADO_NO_ENCONTRADO";
        return next(err);
      }

      if (empleado.estado !== "ACTIVO") {
        const err = new Error("No se puede crear un usuario para un colaborador inactivo o dado de baja.");
        (err as any).statusCode = 400;
        (err as any).codigo = "EMPLEADO_INACTIVO";
        return next(err);
      }

      // Validar que el empleado no tenga ya otra cuenta de usuario
      const usuarioExistenteEmp = await usuariosRepo.obtenerPorEmpleadoId(empleado_id);
      if (usuarioExistenteEmp) {
        const err = new Error(`El colaborador '${empleado.nombre_completo}' ya posee una cuenta de usuario vinculada ('${usuarioExistenteEmp.username}').`);
        (err as any).statusCode = 409;
        (err as any).codigo = "EMPLEADO_YA_TIENE_USUARIO";
        return next(err);
      }

      // 4. Validar unicidad de username
      const usuarioExistente = await usuariosRepo.obtenerPorUsernameOEmail(usernameNorm);
      if (usuarioExistente) {
        const err = new Error(`Ya existe una cuenta con el nombre de usuario '${usernameNorm}'.`);
        (err as any).statusCode = 409;
        (err as any).codigo = "USERNAME_DUPLICADO";
        return next(err);
      }

      // 5. Validar correo electrónico
      const emailNorm = (email && typeof email === "string" && email.trim())
        ? email.trim().toLowerCase()
        : (empleado.correo_laboral ? empleado.correo_laboral.toLowerCase() : `${usernameNorm}@rimac.cr`);

      const emailExistente = await usuariosRepo.obtenerPorUsernameOEmail(emailNorm);
      if (emailExistente) {
        const err = new Error(`El correo electrónico '${emailNorm}' ya está en uso por otra cuenta.`);
        (err as any).statusCode = 409;
        (err as any).codigo = "EMAIL_DUPLICADO";
        return next(err);
      }

      // 6. Validar política de contraseña
      const validacionPass = validarPoliticaPassword(passAValidar);
      if (!validacionPass.valida) {
        const err = new Error(validacionPass.mensaje || "La contraseña no cumple con la política de seguridad.");
        (err as any).statusCode = 400;
        (err as any).codigo = "CONTRASENA_DEBIL";
        return next(err);
      }

      // 7. Generar hash criptográfico seguro
      const passHash = hashPassword(passAValidar);
      const nuevoId = randomUUID();
      const nombreFinal = (nombre_completo && typeof nombre_completo === "string" && nombre_completo.trim())
        ? nombre_completo.trim()
        : empleado.nombre_completo;

      const nuevoUsuario: UsuarioEntity = {
        id: nuevoId,
        username: usernameNorm,
        email: emailNorm,
        nombre_completo: nombreFinal,
        password_hash: passHash,
        rol: rol as RolUsuario,
        empleado_id: empleado.id,
        estado: (estado === "INACTIVO" || estado === "BLOQUEADO") ? estado : "ACTIVO",
        creado_en: new Date().toISOString(),
        actualizado_en: new Date().toISOString(),
      };

      await usuariosRepo.guardar(nuevoUsuario);

      // 8. Auditoría obligatoria (NUNCA registrar contraseñas ni hashes)
      await auditoriaRepo.registrarEvento({
        actor_usuario_id: actor.id,
        rol_actor: actor.rol,
        accion: "CREAR_USUARIO",
        entidad_tipo: "usuarios",
        entidad_id: nuevoId,
        motivo: `Creación de cuenta de usuario '${usernameNorm}' para colaborador '${empleado.nombre_completo}'`,
        valor_nuevo: {
          id: nuevoId,
          username: usernameNorm,
          email: emailNorm,
          nombre_completo: nombreFinal,
          rol: nuevoUsuario.rol,
          empleado_id: empleado.id,
          estado: nuevoUsuario.estado,
        },
        ip_origen: req.ip,
        user_agent: req.headers["user-agent"],
      });

      const usuarioDetalle = await usuariosRepo.obtenerDetallePorId(nuevoId);
      res.status(201).json({
        exito: true,
        datos: usuarioDetalle,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * PUT /api/admin/usuarios/:id
   * Edición de usuario: cambio de rol, vinculación de colaborador, nombre y email.
   * Si cambia el rol, revoca sesiones activas inmediatamente.
   */
  router.put("/:id", csrfProtectionMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { rol, nombre_completo, email, empleado_id } = req.body;
      const actor = (req as any).usuario;

      const usuarioActual = await usuariosRepo.obtenerPorId(id);
      if (!usuarioActual) {
        const err = new Error("Usuario no encontrado.");
        (err as any).statusCode = 404;
        (err as any).codigo = "USUARIO_NO_ENCONTRADO";
        return next(err);
      }

      const parcial: Partial<UsuarioEntity> = {};
      let rolCambiado = false;

      // 1. Cambio de Rol
      if (rol !== undefined && rol !== usuarioActual.rol) {
        if (!ROLES_CANONICOS.includes(rol as RolUsuario)) {
          const err = new Error(`El rol '${rol}' no es válido. Roles canónicos permitidos: ${ROLES_CANONICOS.join(", ")}`);
          (err as any).statusCode = 400;
          (err as any).codigo = "ROL_INVALIDO";
          return next(err);
        }

        // Protección de último administrador
        if (usuarioActual.rol === "ADMINISTRADOR" && usuarioActual.estado === "ACTIVO" && rol !== "ADMINISTRADOR") {
          const otrosAdmins = await usuariosRepo.contarAdministradoresActivos(id);
          if (otrosAdmins === 0) {
            const err = new Error("Protección de seguridad: No se puede retirar el rol ADMINISTRADOR al único administrador activo del sistema.");
            (err as any).statusCode = 409;
            (err as any).codigo = "ULTIMO_ADMINISTRADOR_PROTEGIDO";
            return next(err);
          }
        }

        parcial.rol = rol as RolUsuario;
        rolCambiado = true;
      }

      // 2. Modificación de empleado vinculado
      if (empleado_id !== undefined && empleado_id !== usuarioActual.empleado_id) {
        if (empleado_id) {
          const emp = await empleadosRepo.obtenerPorId(empleado_id);
          if (!emp) {
            const err = new Error("El colaborador indicado no existe.");
            (err as any).statusCode = 404;
            (err as any).codigo = "EMPLEADO_NO_ENCONTRADO";
            return next(err);
          }
          if (emp.estado !== "ACTIVO") {
            const err = new Error("No se puede vincular un usuario a un colaborador inactivo.");
            (err as any).statusCode = 400;
            (err as any).codigo = "EMPLEADO_INACTIVO";
            return next(err);
          }
          const yaVinculado = await usuariosRepo.obtenerPorEmpleadoId(empleado_id);
          if (yaVinculado && yaVinculado.id !== id) {
            const err = new Error(`El colaborador ya está vinculado al usuario '${yaVinculado.username}'.`);
            (err as any).statusCode = 409;
            (err as any).codigo = "EMPLEADO_YA_TIENE_USUARIO";
            return next(err);
          }
          parcial.empleado_id = empleado_id;
        } else {
          // Desvincular solo si no es un rol de colaborador ordinario o bajo regla explícita
          parcial.empleado_id = undefined;
        }
      }

      // 3. Modificación de nombre completo y correo
      if (nombre_completo !== undefined && nombre_completo.trim()) {
        parcial.nombre_completo = nombre_completo.trim();
      }
      if (email !== undefined && email.trim() && email.trim().toLowerCase() !== usuarioActual.email.toLowerCase()) {
        const emailNorm = email.trim().toLowerCase();
        const emailExistente = await usuariosRepo.obtenerPorUsernameOEmail(emailNorm);
        if (emailExistente && emailExistente.id !== id) {
          const err = new Error(`El correo electrónico '${emailNorm}' ya está en uso.`);
          (err as any).statusCode = 409;
          (err as any).codigo = "EMAIL_DUPLICADO";
          return next(err);
        }
        parcial.email = emailNorm;
      }

      await usuariosRepo.actualizar(id, parcial);

      // Si cambió el rol, revocar todas las sesiones del usuario para forzar actualización inmediata de permisos
      if (rolCambiado) {
        await sesionesRepo.revocarPorUsuario(id);

        await auditoriaRepo.registrarEvento({
          actor_usuario_id: actor.id,
          rol_actor: actor.rol,
          accion: "CAMBIAR_ROL_USUARIO",
          entidad_tipo: "usuarios",
          entidad_id: id,
          motivo: `Cambio de rol de ${usuarioActual.rol} a ${parcial.rol} para usuario '${usuarioActual.username}'. Sesiones revocadas.`,
          valor_anterior: { rol: usuarioActual.rol },
          valor_nuevo: { rol: parcial.rol },
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });
      }

      await auditoriaRepo.registrarEvento({
        actor_usuario_id: actor.id,
        rol_actor: actor.rol,
        accion: "MODIFICAR_USUARIO",
        entidad_tipo: "usuarios",
        entidad_id: id,
        motivo: `Actualización de datos para usuario '${usuarioActual.username}'`,
        valor_anterior: {
          nombre_completo: usuarioActual.nombre_completo,
          email: usuarioActual.email,
          empleado_id: usuarioActual.empleado_id,
        },
        valor_nuevo: {
          nombre_completo: parcial.nombre_completo || usuarioActual.nombre_completo,
          email: parcial.email || usuarioActual.email,
          empleado_id: parcial.empleado_id !== undefined ? parcial.empleado_id : usuarioActual.empleado_id,
        },
        ip_origen: req.ip,
        user_agent: req.headers["user-agent"],
      });

      const usuarioActualizado = await usuariosRepo.obtenerDetallePorId(id);
      res.json({
        exito: true,
        datos: usuarioActualizado,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /api/admin/usuarios/:id/estado
   * Activar, desactivar o bloquear cuenta de usuario.
   * Desactivar o bloquear revoca todas las sesiones activas y protege al último administrador.
   */
  router.patch("/:id/estado", csrfProtectionMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { estado, motivo } = req.body;
      const actor = (req as any).usuario;

      if (!estado || !["ACTIVO", "INACTIVO", "BLOQUEADO"].includes(estado)) {
        const err = new Error("Estado inválido. Valores permitidos: ACTIVO, INACTIVO, BLOQUEADO.");
        (err as any).statusCode = 400;
        (err as any).codigo = "ESTADO_INVALIDO";
        return next(err);
      }

      const usuarioActual = await usuariosRepo.obtenerPorId(id);
      if (!usuarioActual) {
        const err = new Error("Usuario no encontrado.");
        (err as any).statusCode = 404;
        (err as any).codigo = "USUARIO_NO_ENCONTRADO";
        return next(err);
      }

      if (usuarioActual.estado === estado) {
        return res.json({
          exito: true,
          mensaje: `El usuario ya se encuentra en estado ${estado}.`,
          datos: await usuariosRepo.obtenerDetallePorId(id),
        });
      }

      // No permitir activar manualmente un usuario personal vinculado a un empleado inactivo
      if (estado === "ACTIVO" && usuarioActual.empleado_id) {
        const emp = await empleadosRepo.obtenerPorId(usuarioActual.empleado_id);
        if (!emp || emp.estado !== "ACTIVO") {
          const err = new Error("No se puede activar una cuenta de usuario vinculada a un colaborador inactivo o dado de baja. Active primero al colaborador en Gestión de Personal.");
          (err as any).statusCode = 400;
          (err as any).codigo = "EMPLEADO_INACTIVO";
          return next(err);
        }
      }

      // Protección de último administrador si se desactiva o bloquea
      if (estado !== "ACTIVO" && usuarioActual.rol === "ADMINISTRADOR" && usuarioActual.estado === "ACTIVO") {
        const otrosAdmins = await usuariosRepo.contarAdministradoresActivos(id);
        if (otrosAdmins === 0) {
          const err = new Error("Protección de seguridad: No se puede desactivar o bloquear al único administrador activo del sistema.");
          (err as any).statusCode = 409;
          (err as any).codigo = "ULTIMO_ADMINISTRADOR_PROTEGIDO";
          return next(err);
        }
      }

      await usuariosRepo.actualizar(id, { estado });

      // Si se desactiva o bloquea, revocar todas las sesiones de inmediato
      if (estado !== "ACTIVO") {
        await sesionesRepo.revocarPorUsuario(id);
      }

      const accionAuditoria = estado === "ACTIVO"
        ? "ACTIVAR_USUARIO"
        : (estado === "BLOQUEADO" ? "BLOQUEAR_USUARIO" : "DESACTIVAR_USUARIO");

      await auditoriaRepo.registrarEvento({
        actor_usuario_id: actor.id,
        rol_actor: actor.rol,
        accion: accionAuditoria,
        entidad_tipo: "usuarios",
        entidad_id: id,
        motivo: motivo || `Cambio de estado de cuenta a ${estado} para usuario '${usuarioActual.username}'`,
        valor_anterior: { estado: usuarioActual.estado },
        valor_nuevo: { estado },
        ip_origen: req.ip,
        user_agent: req.headers["user-agent"],
      });

      const usuarioActualizado = await usuariosRepo.obtenerDetallePorId(id);
      res.json({
        exito: true,
        datos: usuarioActualizado,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/admin/usuarios/:id/restablecer-contrasena
   * Restablecimiento seguro de contraseña por administrador.
   * Almacena nuevo hash scrypt, revoca todas las sesiones anteriores y audita la acción sin credenciales.
   */
  router.post("/:id/restablecer-contrasena", csrfProtectionMiddleware, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { nueva_contrasena, password, contrasena } = req.body;
      const actor = (req as any).usuario;
      const pass = nueva_contrasena || password || contrasena;

      const usuarioActual = await usuariosRepo.obtenerPorId(id);
      if (!usuarioActual) {
        const err = new Error("Usuario no encontrado.");
        (err as any).statusCode = 404;
        (err as any).codigo = "USUARIO_NO_ENCONTRADO";
        return next(err);
      }

      // Validar política de contraseña
      const validacion = validarPoliticaPassword(pass);
      if (!validacion.valida) {
        const err = new Error(validacion.mensaje || "La nueva contraseña no cumple con la política de seguridad.");
        (err as any).statusCode = 400;
        (err as any).codigo = "CONTRASENA_DEBIL";
        return next(err);
      }

      // Hashear con scrypt seguro
      const nuevoHash = hashPassword(pass);
      await usuariosRepo.actualizar(id, { password_hash: nuevoHash });

      // Revocar sesiones activas del usuario afectado
      await sesionesRepo.revocarPorUsuario(id);

      // Auditar sin registrar contraseñas ni hashes
      await auditoriaRepo.registrarEvento({
        actor_usuario_id: actor.id,
        rol_actor: actor.rol,
        accion: "RESTABLECER_CONTRASENA",
        entidad_tipo: "usuarios",
        entidad_id: id,
        motivo: `Restablecimiento administrativo de contraseña para cuenta '${usuarioActual.username}'. Sesiones activas revocadas.`,
        valor_anterior: { sesion_revocada: true },
        valor_nuevo: { password_actualizada: true },
        ip_origen: req.ip,
        user_agent: req.headers["user-agent"],
      });

      res.json({
        exito: true,
        mensaje: "Contraseña restablecida exitosamente. Las sesiones activas del usuario han sido revocadas.",
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * DELETE /api/admin/usuarios/:id
   * La eliminación física está estrictamente prohibida para preservar auditoría e historial.
   */
  router.delete("/:id", (_req: Request, res: Response) => {
    res.status(405).json({
      exito: false,
      codigo: "ELIMINACION_NO_PERMITIDA",
      mensaje: "No está permitida la eliminación física de usuarios para preservar la integridad transaccional e histórica del sistema. Utilice la desactivación de cuenta.",
    });
  });

  return router;
}
