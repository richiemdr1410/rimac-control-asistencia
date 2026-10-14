import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import type { IFeriadosRepository, FeriadoEntity } from "../repositories/interfaces/feriados.js";
import type { IAuditoriaRepository } from "../repositories/interfaces/auditoria.js";
import { requireRole } from "../auth/middlewares.js";

export function createFeriadosRouter(
  feriadosRepo: IFeriadosRepository,
  auditoriaRepo: IAuditoriaRepository,
  requireAuthMiddleware: any,
  csrfProtectionMiddleware: any,
  requirePermission: (codigo: string) => any
): Router {
  const router = Router();

  router.use(requireAuthMiddleware);

  /**
   * GET /api/feriados
   * Listar todos los feriados.
   * Accesible si posee permiso FERIADOS_VER.
   */
  router.get("/", requirePermission("FERIADOS_VER"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const soloActivos = req.query.activos === "true";
      const feriados = await feriadosRepo.listar(soloActivos);
      res.json({
        exito: true,
        datos: feriados,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/feriados
   * Crear nuevo feriado en el catálogo.
   * Protegido por FERIADOS_ADMINISTRAR.
   */
  router.post(
    "/",
    requirePermission("FERIADOS_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { fecha, descripcion, tipo_feriado, activo } = req.body;

        if (!fecha || !descripcion) {
          const err = new Error("Los campos 'fecha' y 'descripcion' son obligatorios.");
          (err as any).statusCode = 400;
          (err as any).codigo = "DATOS_INVALIDOS";
          return next(err);
        }

        const fechaLimpia = fecha.slice(0, 10);
        const existente = await feriadosRepo.obtenerPorFecha(fechaLimpia);
        if (existente) {
          const err = new Error(`Ya existe un feriado registrado para la fecha ${fechaLimpia}.`);
          (err as any).statusCode = 409;
          (err as any).codigo = "FERIADO_DUPLICADO";
          return next(err);
        }

        const nuevoFeriado: FeriadoEntity = {
          id: randomUUID(),
          fecha: fechaLimpia,
          descripcion: descripcion.trim(),
          tipo_feriado: tipo_feriado || "PAGO_OBLIGATORIO",
          activo: activo !== undefined ? Boolean(activo) : true,
          creado_en: new Date().toISOString(),
        };

        const creado = await feriadosRepo.crear(nuevoFeriado);

        // Registro de auditoría
        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "CREAR_FERIADO",
          entidad_tipo: "feriados",
          entidad_id: creado.id,
          valor_nuevo: creado,
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.status(201).json({
          exito: true,
          datos: creado,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * PUT /api/feriados/:id
   * Actualizar feriado existente.
   * Protegido por FERIADOS_ADMINISTRAR.
   */
  router.put(
    "/:id",
    requirePermission("FERIADOS_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const actual = await feriadosRepo.obtenerPorId(id);
        if (!actual) {
          const err = new Error("Feriado no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }

        const { fecha, descripcion, tipo_feriado, activo } = req.body;
        const actualizado = await feriadosRepo.actualizar(id, {
          fecha,
          descripcion,
          tipo_feriado,
          activo,
        });

        // Registro de auditoría
        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "ACTUALIZAR_FERIADO",
          entidad_tipo: "feriados",
          entidad_id: id,
          valor_anterior: actual,
          valor_nuevo: actualizado,
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.json({
          exito: true,
          datos: actualizado,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * PATCH /api/feriados/:id/estado
   * Activar / Desactivar feriado.
   * Protegido por FERIADOS_ADMINISTRAR.
   */
  router.patch(
    "/:id/estado",
    requirePermission("FERIADOS_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const { activo } = req.body;

        if (activo === undefined) {
          const err = new Error("El campo 'activo' es obligatorio.");
          (err as any).statusCode = 400;
          (err as any).codigo = "DATOS_INVALIDOS";
          return next(err);
        }

        const actual = await feriadosRepo.obtenerPorId(id);
        if (!actual) {
          const err = new Error("Feriado no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }

        const actualizado = await feriadosRepo.actualizar(id, { activo: Boolean(activo) });

        // Registro de auditoría
        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "CAMBIO_ESTADO_FERIADO",
          entidad_tipo: "feriados",
          entidad_id: id,
          motivo: `Feriado ${Boolean(activo) ? "ACTIVADO" : "DESACTIVADO"}`,
          valor_anterior: { activo: actual.activo },
          valor_nuevo: { activo: Boolean(activo) },
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.json({
          exito: true,
          datos: actualizado,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
