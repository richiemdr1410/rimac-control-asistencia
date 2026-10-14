import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { IJefaturasRepository } from "../auth/repositories/interfaces/jefaturas.js";
import type { IAuditoriaRepository } from "../repositories/interfaces/auditoria.js";

export function createJefaturasRouter(
  jefaturasRepo: IJefaturasRepository,
  auditoriaRepo: IAuditoriaRepository,
  requireAuthMiddleware: any,
  csrfProtectionMiddleware: any,
  requirePermission: (codigo: string) => any
): Router {
  const router = Router();
  router.use(requireAuthMiddleware);

  /**
   * GET /api/jefaturas
   * Listar todas las relaciones de jefatura directa vigentes en la organización.
   * Protegido por JEFATURAS_ADMINISTRAR.
   */
  router.get(
    "/",
    requirePermission("JEFATURAS_ADMINISTRAR"),
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const asignaciones = await jefaturasRepo.listarTodasVigentes();
        res.json({ exito: true, datos: asignaciones });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/jefaturas
   * Asignar o cambiar jefatura directa con validación de ciclos (A→B→A y multinivel),
   * no autojefatura y cierre de vigencia anterior.
   * Protegido por JEFATURAS_ADMINISTRAR y CSRF.
   */
  router.post(
    "/",
    requirePermission("JEFATURAS_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { subordinado_empleado_id, jefatura_empleado_id, fecha_inicio, fecha_fin } = req.body;

        if (!subordinado_empleado_id || !jefatura_empleado_id || !fecha_inicio) {
          const err = new Error(
            "Los campos 'subordinado_empleado_id', 'jefatura_empleado_id' y 'fecha_inicio' son obligatorios."
          );
          (err as any).statusCode = 400;
          (err as any).codigo = "DATOS_INVALIDOS";
          return next(err);
        }

        const asignacion = await jefaturasRepo.asignarJefaturaDirecta({
          subordinado_empleado_id,
          jefatura_empleado_id,
          fecha_inicio,
          fecha_fin,
        });

        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "ASIGNAR_JEFATURA",
          entidad_tipo: "asignaciones_jefatura",
          entidad_id: asignacion.id,
          motivo: `Asignación de jefatura directa ${asignacion.jefatura_nombre} para colaborador ${asignacion.subordinado_nombre}`,
          valor_nuevo: asignacion,
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.status(201).json({
          exito: true,
          mensaje: "Jefatura directa asignada correctamente con preservación de historial.",
          datos: asignacion,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * PATCH /api/jefaturas/:id/finalizar
   * Finalizar asignación de jefatura vigente cerrando su vigencia y conservando historial.
   * Protegido por JEFATURAS_ADMINISTRAR y CSRF.
   */
  router.patch(
    "/:id/finalizar",
    requirePermission("JEFATURAS_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const { fecha_fin } = req.body || {};

        const asignacion = await jefaturasRepo.finalizarAsignacionJefatura(id, fecha_fin);

        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "FINALIZAR_JEFATURA",
          entidad_tipo: "asignaciones_jefatura",
          entidad_id: id,
          motivo: `Finalización de asignación de jefatura para colaborador ${asignacion.subordinado_nombre}`,
          valor_nuevo: asignacion,
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.json({
          exito: true,
          mensaje: "Asignación de jefatura finalizada correctamente conservando el historial.",
          datos: asignacion,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * DELETE /api/jefaturas/:id
   * Eliminar físicamente una asignación creada por error que carezca de relevancia histórica u operaciones.
   * Protegido por JEFATURAS_ADMINISTRAR y CSRF.
   */
  router.delete(
    "/:id",
    requirePermission("JEFATURAS_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;

        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "ELIMINAR_ASIGNACION_JEFATURA",
          entidad_tipo: "asignaciones_jefatura",
          entidad_id: id,
          motivo: `Eliminación física de asignación errónea de jefatura`,
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        await jefaturasRepo.eliminarAsignacionJefatura(id);

        res.json({
          exito: true,
          mensaje: "Asignación de jefatura eliminada exitosamente.",
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
