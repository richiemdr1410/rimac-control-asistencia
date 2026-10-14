import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { IHorariosRepository } from "../repositories/interfaces/horarios.js";
import type { IAuditoriaRepository } from "../repositories/interfaces/auditoria.js";

export function createHorariosRouter(
  horariosRepo: IHorariosRepository,
  auditoriaRepo: IAuditoriaRepository,
  requireAuthMiddleware: any,
  csrfProtectionMiddleware: any,
  requirePermission: (codigo: string) => any
): Router {
  const router = Router();
  router.use(requireAuthMiddleware);

  /**
   * GET /api/horarios
   * Listar horarios con configuración de tolerancias y descansos.
   * Protegido por HORARIOS_VER.
   */
  router.get(
    "/",
    requirePermission("HORARIOS_VER"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const soloActivos = req.query.activos === "true";
        const lista = await horariosRepo.listar(soloActivos);
        res.json({ exito: true, datos: lista });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/horarios/:id
   * Obtener detalle completo de un horario con sus 7 días de la semana.
   * Protegido por HORARIOS_VER.
   */
  router.get(
    "/:id",
    requirePermission("HORARIOS_VER"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const horario = await horariosRepo.obtenerHorarioPorId(req.params.id);
        if (!horario) {
          const err = new Error("Horario no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }
        res.json({ exito: true, datos: horario });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/horarios
   * Crear nuevo horario con sus días configurados.
   * Protegido por HORARIOS_ADMINISTRAR y CSRF.
   */
  router.post(
    "/",
    requirePermission("HORARIOS_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          codigo,
          nombre,
          tolerancia_entrada_minutos,
          minutos_semanales_referencia,
          minutos_desayuno_max,
          minutos_almuerzo_max,
          minutos_cafe_max,
          detalles_dia,
        } = req.body;

        if (!codigo || !codigo.trim() || !nombre || !nombre.trim()) {
          const err = new Error("El código y nombre del horario son obligatorios.");
          (err as any).statusCode = 400;
          (err as any).codigo = "DATOS_INVALIDOS";
          return next(err);
        }

        const existente = await horariosRepo.obtenerHorarioPorCodigo(codigo);
        if (existente) {
          const err = new Error(`Ya existe un horario con el código '${codigo.trim().toUpperCase()}'.`);
          (err as any).statusCode = 409;
          (err as any).codigo = "CODIGO_DUPLICADO";
          return next(err);
        }

        const nuevo = await horariosRepo.crearHorario(
          {
            codigo: codigo.trim(),
            nombre: nombre.trim(),
            tolerancia_entrada_minutos,
            minutos_semanales_referencia,
            minutos_desayuno_max,
            minutos_almuerzo_max,
            minutos_cafe_max,
          },
          detalles_dia || []
        );

        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "CREAR_HORARIO",
          entidad_tipo: "horarios",
          entidad_id: nuevo.id,
          motivo: `Creación de horario ${nuevo.codigo} - ${nuevo.nombre}`,
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

  /**
   * PUT /api/horarios/:id
   * Actualizar horario y detalle de días.
   * Protegido por HORARIOS_ADMINISTRAR y CSRF.
   */
  router.put(
    "/:id",
    requirePermission("HORARIOS_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const actual = await horariosRepo.obtenerHorarioPorId(id);
        if (!actual) {
          const err = new Error("Horario no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }

        const {
          nombre,
          tolerancia_entrada_minutos,
          minutos_semanales_referencia,
          minutos_desayuno_max,
          minutos_almuerzo_max,
          minutos_cafe_max,
          detalles_dia,
        } = req.body;

        const actualizado = await horariosRepo.actualizarHorario(
          id,
          {
            nombre,
            tolerancia_entrada_minutos,
            minutos_semanales_referencia,
            minutos_desayuno_max,
            minutos_almuerzo_max,
            minutos_cafe_max,
          },
          detalles_dia
        );

        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "ACTUALIZAR_HORARIO",
          entidad_tipo: "horarios",
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

  /**
   * PATCH /api/horarios/:id/estado
   * Activar / Desactivar horario.
   * Protegido por HORARIOS_ADMINISTRAR y CSRF.
   */
  router.patch(
    "/:id/estado",
    requirePermission("HORARIOS_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const { estado } = req.body;
        if (estado !== "ACTIVO" && estado !== "INACTIVO") {
          const err = new Error("El estado debe ser 'ACTIVO' o 'INACTIVO'.");
          (err as any).statusCode = 400;
          (err as any).codigo = "ESTADO_INVALIDO";
          return next(err);
        }

        const actual = await horariosRepo.obtenerHorarioPorId(id);
        if (!actual) {
          const err = new Error("Horario no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }

        const actualizado = await horariosRepo.cambiarEstadoHorario(id, estado);

        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: estado === "ACTIVO" ? "ACTIVAR_HORARIO" : "DESACTIVAR_HORARIO",
          entidad_tipo: "horarios",
          entidad_id: id,
          valor_anterior: { estado: actual.estado },
          valor_nuevo: { estado },
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.json({ exito: true, datos: actualizado });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * DELETE /api/horarios/:id
   * Eliminar horario físicamente si no tiene asignaciones ni uso histórico.
   * Protegido por HORARIOS_ADMINISTRAR y CSRF.
   */
  router.delete(
    "/:id",
    requirePermission("HORARIOS_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const actual = await horariosRepo.obtenerHorarioPorId(id);
        if (!actual) {
          const err = new Error("Horario no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }

        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "ELIMINAR_HORARIO",
          entidad_tipo: "horarios",
          entidad_id: id,
          motivo: `Eliminación permanente del horario ${actual.codigo} - ${actual.nombre}`,
          valor_anterior: actual,
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        await horariosRepo.eliminarHorario(id);

        res.json({
          exito: true,
          mensaje: "Horario eliminado exitosamente.",
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
