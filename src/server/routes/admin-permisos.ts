import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { IPermisosRepository } from "../repositories/interfaces/permisos.js";
import type { IAuditoriaRepository } from "../repositories/interfaces/auditoria.js";
import type { RolUsuario } from "../auth/types.js";

const ROLES_CANONICOS: RolUsuario[] = [
  "ADMINISTRADOR",
  "TALENTO_HUMANO",
  "SUPERVISOR_SEGURIDAD",
  "SEGURIDAD",
  "EMPLEADO",
];

export function createAdminPermisosRouter(
  permisosRepo: IPermisosRepository,
  auditoriaRepo: IAuditoriaRepository,
  requireAuthMiddleware: any,
  csrfProtectionMiddleware: any,
  requirePermission: (codigo: string) => any
): Router {
  const router = Router();

  router.use(requireAuthMiddleware);

  /**
   * GET /api/admin/permisos
   * Devuelve el catálogo completo de permisos agrupados por módulo.
   * Protegido por ROLES_PERMISOS_ADMINISTRAR.
   */
  router.get(
    "/permisos",
    requirePermission("ROLES_PERMISOS_ADMINISTRAR"),
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const todos = await permisosRepo.listarPermisos();
        const agrupados: Record<string, typeof todos> = {};
        for (const p of todos) {
          if (!agrupados[p.modulo]) {
            agrupados[p.modulo] = [];
          }
          agrupados[p.modulo].push(p);
        }

        res.json({
          exito: true,
          datos: {
            permisos: todos,
            agrupados,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/admin/roles-permisos
   * Devuelve la matriz completa de los 5 roles canónicos × permisos.
   * Protegido por ROLES_PERMISOS_ADMINISTRAR.
   */
  router.get(
    "/roles-permisos",
    requirePermission("ROLES_PERMISOS_ADMINISTRAR"),
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const matriz = await permisosRepo.obtenerMatrizCompleta();
        res.json({
          exito: true,
          datos: matriz,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * PUT /api/admin/roles-permisos/:rol
   * Actualiza la lista de permisos activos para un rol canónico.
   * Protegido por ROLES_PERMISOS_ADMINISTRAR y CSRF.
   */
  router.put(
    "/roles-permisos/:rol",
    requirePermission("ROLES_PERMISOS_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rolParam = req.params.rol as RolUsuario;
        const usuarioActor = (req as any).usuario;

        if (!ROLES_CANONICOS.includes(rolParam)) {
          const err = new Error(
            `El rol '${rolParam}' no es válido. Solo se admiten los cinco roles canónicos: ${ROLES_CANONICOS.join(", ")}.`
          );
          (err as any).statusCode = 400;
          (err as any).codigo = "ROL_INVALIDO";
          return next(err);
        }

        const { permisos_activos } = req.body;
        if (!Array.isArray(permisos_activos)) {
          const err = new Error("El campo 'permisos_activos' es requerido y debe ser un arreglo de códigos.");
          (err as any).statusCode = 400;
          (err as any).codigo = "DATOS_INVALIDOS";
          return next(err);
        }

        // Ejecutar actualización atómica con validación de protecciones críticas
        const resultado = await permisosRepo.actualizarPermisosRol(
          rolParam,
          permisos_activos,
          usuarioActor.id
        );

        // Registrar cada cambio en la bitácora de auditoría
        for (const detalle of resultado.detalles) {
          await auditoriaRepo.registrarEvento({
            actor_usuario_id: usuarioActor.id,
            rol_actor: usuarioActor.rol,
            accion: "MODIFICAR_MATRIZ_PERMISOS",
            entidad_tipo: "roles_permisos",
            entidad_id: `${rolParam}:${detalle.permiso}`,
            motivo: `Permiso ${detalle.permiso} ${detalle.ahora ? "ACTIVADO" : "DESACTIVADO"} para rol ${rolParam}`,
            valor_anterior: { rol: rolParam, permiso: detalle.permiso, activo: detalle.antes },
            valor_nuevo: { rol: rolParam, permiso: detalle.permiso, activo: detalle.ahora },
            ip_origen: req.ip,
            user_agent: req.headers["user-agent"],
          });
        }

        res.json({
          exito: true,
          mensaje: `Matriz de permisos para el rol ${rolParam} actualizada con éxito (${resultado.modificados} cambios).`,
          datos: {
            rol: rolParam,
            permisos_activos,
            modificaciones: resultado.detalles,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
