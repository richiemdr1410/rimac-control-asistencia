import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { IOrganizacionRepository } from "../repositories/interfaces/organizacion.js";
import type { IAuditoriaRepository } from "../repositories/interfaces/auditoria.js";

export function createOrganizacionRouters(
  organizacionRepo: IOrganizacionRepository,
  auditoriaRepo: IAuditoriaRepository,
  requireAuthMiddleware: any,
  csrfProtectionMiddleware: any,
  requirePermission: (codigo: string) => any,
  requireAnyPermission: (...codigos: string[]) => any
): { departamentosRouter: Router; puestosRouter: Router } {
  // ==========================================
  // 1. DEPARTAMENTOS ROUTER
  // ==========================================
  const departamentosRouter = Router();
  departamentosRouter.use(requireAuthMiddleware);

  // Listar departamentos (ORGANIZACION_ADMINISTRAR o EMPLEADOS_VER)
  departamentosRouter.get(
    "/",
    requireAnyPermission("ORGANIZACION_ADMINISTRAR", "EMPLEADOS_VER"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const soloActivos = req.query.activos === "true";
        const deptos = await organizacionRepo.listarDepartamentos(soloActivos);
        res.json({ exito: true, datos: deptos });
      } catch (err) {
        next(err);
      }
    }
  );

  // Obtener departamento por ID
  departamentosRouter.get(
    "/:id",
    requireAnyPermission("ORGANIZACION_ADMINISTRAR", "EMPLEADOS_VER"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const depto = await organizacionRepo.obtenerDepartamentoPorId(req.params.id);
        if (!depto) {
          const err = new Error("Departamento no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }
        res.json({ exito: true, datos: depto });
      } catch (err) {
        next(err);
      }
    }
  );

  // Crear departamento
  departamentosRouter.post(
    "/",
    requirePermission("ORGANIZACION_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { codigo, nombre, activo } = req.body;
        if (!codigo || !codigo.trim() || !nombre || !nombre.trim()) {
          const err = new Error("Los campos 'codigo' y 'nombre' son obligatorios.");
          (err as any).statusCode = 400;
          (err as any).codigo = "DATOS_INVALIDOS";
          return next(err);
        }

        const existente = await organizacionRepo.obtenerDepartamentoPorCodigo(codigo);
        if (existente) {
          const err = new Error(`Ya existe un departamento con el código '${codigo.trim().toUpperCase()}'.`);
          (err as any).statusCode = 409;
          (err as any).codigo = "CODIGO_DUPLICADO";
          return next(err);
        }

        const nuevo = await organizacionRepo.crearDepartamento({
          codigo: codigo.trim(),
          nombre: nombre.trim(),
          activo: activo !== false,
        });

        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "CREAR_DEPARTAMENTO",
          entidad_tipo: "departamentos",
          entidad_id: nuevo.id,
          motivo: `Creación de departamento ${nuevo.codigo} - ${nuevo.nombre}`,
          valor_nuevo: nuevo,
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.status(201).json({ exito: true, datos: nuevo });
      } catch (err) {
        next(err);
      }
    }
  );

  // Editar departamento
  departamentosRouter.put(
    "/:id",
    requirePermission("ORGANIZACION_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const actual = await organizacionRepo.obtenerDepartamentoPorId(id);
        if (!actual) {
          const err = new Error("Departamento no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }

        const { nombre, activo } = req.body;
        const actualizado = await organizacionRepo.actualizarDepartamento(id, {
          nombre: nombre ? nombre.trim() : undefined,
          activo: typeof activo === "boolean" ? activo : undefined,
        });

        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "ACTUALIZAR_DEPARTAMENTO",
          entidad_tipo: "departamentos",
          entidad_id: id,
          valor_anterior: actual,
          valor_nuevo: actualizado,
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.json({ exito: true, datos: actualizado });
      } catch (err) {
        next(err);
      }
    }
  );

  // Activar / Desactivar departamento
  departamentosRouter.patch(
    "/:id/estado",
    requirePermission("ORGANIZACION_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const { activo } = req.body;
        if (typeof activo !== "boolean") {
          const err = new Error("El campo 'activo' debe ser un valor booleano.");
          (err as any).statusCode = 400;
          (err as any).codigo = "DATOS_INVALIDOS";
          return next(err);
        }

        const actual = await organizacionRepo.obtenerDepartamentoPorId(id);
        if (!actual) {
          const err = new Error("Departamento no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }

        const actualizado = await organizacionRepo.cambiarEstadoDepartamento(id, activo);

        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: activo ? "ACTIVAR_DEPARTAMENTO" : "DESACTIVAR_DEPARTAMENTO",
          entidad_tipo: "departamentos",
          entidad_id: id,
          valor_anterior: { activo: actual.activo },
          valor_nuevo: { activo },
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.json({ exito: true, datos: actualizado });
      } catch (err) {
        next(err);
      }
    }
  );

  // Eliminar departamento (físico, controlado con validación estricta de dependencias)
  departamentosRouter.delete(
    "/:id",
    requirePermission("ORGANIZACION_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const actual = await organizacionRepo.obtenerDepartamentoPorId(id);
        if (!actual) {
          const err = new Error("Departamento no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }

        // Registrar auditoría de eliminación antes de borrar la entidad funcional
        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "ELIMINAR_DEPARTAMENTO",
          entidad_tipo: "departamentos",
          entidad_id: id,
          motivo: `Eliminación permanente del departamento ${actual.codigo} - ${actual.nombre}`,
          valor_anterior: actual,
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        await organizacionRepo.eliminarDepartamento(id);

        res.json({
          exito: true,
          mensaje: "Departamento eliminado exitosamente.",
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================
  // 2. PUESTOS ROUTER
  // ==========================================
  const puestosRouter = Router();
  puestosRouter.use(requireAuthMiddleware);

  // Listar puestos (ORGANIZACION_ADMINISTRAR o EMPLEADOS_VER)
  puestosRouter.get(
    "/",
    requireAnyPermission("ORGANIZACION_ADMINISTRAR", "EMPLEADOS_VER"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const departamentoId = req.query.departamento_id as string | undefined;
        const soloActivos = req.query.activos === "true";
        const puestos = await organizacionRepo.listarPuestos(departamentoId, soloActivos);
        res.json({ exito: true, datos: puestos });
      } catch (err) {
        next(err);
      }
    }
  );

  // Obtener puesto por ID
  puestosRouter.get(
    "/:id",
    requireAnyPermission("ORGANIZACION_ADMINISTRAR", "EMPLEADOS_VER"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const puesto = await organizacionRepo.obtenerPuestoPorId(req.params.id);
        if (!puesto) {
          const err = new Error("Puesto no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }
        res.json({ exito: true, datos: puesto });
      } catch (err) {
        next(err);
      }
    }
  );

  // Crear puesto
  puestosRouter.post(
    "/",
    requirePermission("ORGANIZACION_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { departamento_id, codigo, nombre, activo } = req.body;
        if (!departamento_id || !codigo || !codigo.trim() || !nombre || !nombre.trim()) {
          const err = new Error("Los campos 'departamento_id', 'codigo' y 'nombre' son obligatorios.");
          (err as any).statusCode = 400;
          (err as any).codigo = "DATOS_INVALIDOS";
          return next(err);
        }

        const existente = await organizacionRepo.obtenerPuestoPorCodigo(codigo);
        if (existente) {
          const err = new Error(`Ya existe un puesto con el código '${codigo.trim().toUpperCase()}'.`);
          (err as any).statusCode = 409;
          (err as any).codigo = "CODIGO_DUPLICADO";
          return next(err);
        }

        const nuevo = await organizacionRepo.crearPuesto({
          departamento_id,
          codigo: codigo.trim(),
          nombre: nombre.trim(),
          activo: activo !== false,
        });

        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "CREAR_PUESTO",
          entidad_tipo: "puestos",
          entidad_id: nuevo.id,
          motivo: `Creación de puesto ${nuevo.codigo} - ${nuevo.nombre}`,
          valor_nuevo: nuevo,
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.status(201).json({ exito: true, datos: nuevo });
      } catch (err) {
        next(err);
      }
    }
  );

  // Editar puesto
  puestosRouter.put(
    "/:id",
    requirePermission("ORGANIZACION_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const actual = await organizacionRepo.obtenerPuestoPorId(id);
        if (!actual) {
          const err = new Error("Puesto no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }

        const { departamento_id, nombre, activo } = req.body;
        const actualizado = await organizacionRepo.actualizarPuesto(id, {
          departamento_id,
          nombre: nombre ? nombre.trim() : undefined,
          activo: typeof activo === "boolean" ? activo : undefined,
        });

        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "ACTUALIZAR_PUESTO",
          entidad_tipo: "puestos",
          entidad_id: id,
          valor_anterior: actual,
          valor_nuevo: actualizado,
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.json({ exito: true, datos: actualizado });
      } catch (err) {
        next(err);
      }
    }
  );

  // Activar / Desactivar puesto
  puestosRouter.patch(
    "/:id/estado",
    requirePermission("ORGANIZACION_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const { activo } = req.body;
        if (typeof activo !== "boolean") {
          const err = new Error("El campo 'activo' debe ser un valor booleano.");
          (err as any).statusCode = 400;
          (err as any).codigo = "DATOS_INVALIDOS";
          return next(err);
        }

        const actual = await organizacionRepo.obtenerPuestoPorId(id);
        if (!actual) {
          const err = new Error("Puesto no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }

        const actualizado = await organizacionRepo.cambiarEstadoPuesto(id, activo);

        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: activo ? "ACTIVAR_PUESTO" : "DESACTIVAR_PUESTO",
          entidad_tipo: "puestos",
          entidad_id: id,
          valor_anterior: { activo: actual.activo },
          valor_nuevo: { activo },
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.json({ exito: true, datos: actualizado });
      } catch (err) {
        next(err);
      }
    }
  );

  // Eliminar puesto (físico, controlado con validación de no poseer empleados vinculados)
  puestosRouter.delete(
    "/:id",
    requirePermission("ORGANIZACION_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const actual = await organizacionRepo.obtenerPuestoPorId(id);
        if (!actual) {
          const err = new Error("Puesto no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }

        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "ELIMINAR_PUESTO",
          entidad_tipo: "puestos",
          entidad_id: id,
          motivo: `Eliminación permanente del puesto ${actual.codigo} - ${actual.nombre}`,
          valor_anterior: actual,
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        await organizacionRepo.eliminarPuesto(id);

        res.json({
          exito: true,
          mensaje: "Puesto eliminado exitosamente.",
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return { departamentosRouter, puestosRouter };
}
