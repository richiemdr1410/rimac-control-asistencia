import type { Request, Response, NextFunction } from "express";
import type { ContextoAutenticado, RolUsuario } from "./types.js";
import type { IJefaturasRepository } from "./repositories/interfaces/jefaturas.js";
import type { IPermisosRepository } from "../repositories/interfaces/permisos.js";
import { ValidarSesionUseCase } from "./use-cases/validar-sesion.js";

// Extender el Request de Express con el contexto autenticado
declare global {
  namespace Express {
    interface Request {
      auth?: ContextoAutenticado;
    }
  }
}

/**
 * Parsea cookies desde la cabecera Cookie sin dependencias externas
 */
export function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;

  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    const name = parts.shift()?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join("=").trim());
    }
  });
  return list;
}

/**
 * Middleware para exigir sesión autenticada válida
 */
export function createRequireAuthMiddleware(validarSesionUc: ValidarSesionUseCase) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const authHeader = req.headers.authorization;
      const bearerSid = authHeader?.startsWith("Bearer ") ? authHeader.substring(7).trim() : undefined;
      const sid = cookies["sid"] || (req.headers["x-session-id"] as string) || bearerSid;

      if (!sid) {
        const err = new Error("Autenticación requerida.");
        (err as any).statusCode = 401;
        (err as any).codigo = "NO_AUTENTICADO";
        throw err;
      }

      const { contexto } = await validarSesionUc.ejecutar(sid);
      req.auth = contexto;
      (req as any).usuario = {
        id: contexto.usuario_id,
        usuario_id: contexto.usuario_id,
        rol: contexto.rol,
        empleado_id: contexto.empleado_id,
        sesion_id: contexto.sesion_id,
        csrf_token: contexto.csrf_token,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware para protección CSRF en métodos mutantes (POST, PUT, PATCH, DELETE)
 */
export function createCsrfProtectionMiddleware() {
  const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

  return (req: Request, res: Response, next: NextFunction) => {
    // Si la ruta no muta estado o no está autenticada (ej. login pre-sesión), se omite
    if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
      return next();
    }

    if (!req.auth) {
      // Rutas que no requieren autenticación manejan su propia protección o están exentas (como /login)
      return next();
    }

    const clientToken = (req.headers["x-csrf-token"] as string) || req.body?.csrf_token;
    if (!clientToken || clientToken !== req.auth.csrf_token) {
      const err = new Error("Token CSRF inválido o ausente.");
      (err as any).statusCode = 403;
      (err as any).codigo = "CSRF_INVALIDO";
      return next(err);
    }

    next();
  };
}

/**
 * Middleware RBAC: exige que el usuario posea uno de los roles permitidos
 */
export function requireRole(...rolesPermitidos: RolUsuario[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      const err = new Error("No autenticado.");
      (err as any).statusCode = 401;
      (err as any).codigo = "NO_AUTENTICADO";
      return next(err);
    }

    if (!rolesPermitidos.includes(req.auth.rol)) {
      const err = new Error(`Acceso denegado: El rol ${req.auth.rol} no tiene privilegios para esta operación.`);
      (err as any).statusCode = 403;
      (err as any).codigo = "PERMISO_DENEGADO";
      return next(err);
    }

    next();
  };
}

/**
 * Middleware central RBAC configurable: exige que el rol del usuario posea el permiso activo
 */
export function createRequirePermissionMiddleware(permisosRepo: IPermisosRepository) {
  return (permisoCodigo: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.auth) {
          const err = new Error("No autenticado.");
          (err as any).statusCode = 401;
          (err as any).codigo = "NO_AUTENTICADO";
          return next(err);
        }

        const tienePermiso = await permisosRepo.rolTienePermiso(req.auth.rol, permisoCodigo);
        if (!tienePermiso) {
          const err = new Error(
            `Acceso denegado: El rol ${req.auth.rol} no posee el permiso activo '${permisoCodigo}'.`
          );
          (err as any).statusCode = 403;
          (err as any).codigo = "PERMISO_DENEGADO";
          (err as any).detalles = { permiso_requerido: [permisoCodigo] };
          return next(err);
        }

        next();
      } catch (err) {
        next(err);
      }
    };
  };
}

/**
 * Middleware RBAC: exige que el rol del usuario posea AL MENOS UNO de los permisos indicados
 */
export function createRequireAnyPermissionMiddleware(permisosRepo: IPermisosRepository) {
  return (...permisosCodigos: string[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.auth) {
          const err = new Error("No autenticado.");
          (err as any).statusCode = 401;
          (err as any).codigo = "NO_AUTENTICADO";
          return next(err);
        }

        for (const cod of permisosCodigos) {
          const tiene = await permisosRepo.rolTienePermiso(req.auth.rol, cod);
          if (tiene) {
            return next();
          }
        }

        const err = new Error(
          `Acceso denegado: El rol ${req.auth.rol} no posee ninguno de los permisos requeridos: ${permisosCodigos.join(", ")}.`
        );
        (err as any).statusCode = 403;
        (err as any).codigo = "PERMISO_DENEGADO";
        (err as any).detalles = { permisos_requeridos: permisosCodigos };
        return next(err);
      } catch (err) {
        next(err);
      }
    };
  };
}

/**
 * Middleware ABAC: Regla de Acceso a Expediente de Empleado
 * - TALENTO_HUMANO tiene acceso global.
 * - EMPLEADO únicamente a su propio empleado_id.
 * - Otros roles denegados.
 */
export function requireEmpleadoSelfOrTH(paramEmpleadoIdName: string = "empleado_id") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      const err = new Error("No autenticado.");
      (err as any).statusCode = 401;
      (err as any).codigo = "NO_AUTENTICADO";
      return next(err);
    }

    const targetEmpleadoId = req.params[paramEmpleadoIdName] || req.query[paramEmpleadoIdName] || req.body[paramEmpleadoIdName];

    if (req.auth.rol === "TALENTO_HUMANO") {
      return next();
    }

    if (req.auth.rol === "EMPLEADO" && req.auth.empleado_id && req.auth.empleado_id === targetEmpleadoId) {
      return next();
    }

    const err = new Error("Acceso denegado: Solo puede consultar sus propios registros.");
    (err as any).statusCode = 403;
    (err as any).codigo = "PERMISO_DENEGADO";
    return next(err);
  };
}

/**
 * Middleware ABAC: Regla de Aprobación de Tiempo Adicional por Jefatura
 * - Se valida la relación jerárquica histórica activa a la fecha_jornada consultada.
 * - TALENTO_HUMANO también puede resolver en su instancia global.
 * - ADMINISTRADOR o usuarios sin relación jerárquica son estrictamente DENEGADOS (403).
 */
export function createRequireJefaturaTiempoAdicional(jefaturasRepo: IJefaturasRepository) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.auth) {
        const err = new Error("No autenticado.");
        (err as any).statusCode = 401;
        (err as any).codigo = "NO_AUTENTICADO";
        throw err;
      }

      // Si es TALENTO_HUMANO, tiene alcance de aprobación institucional
      if (req.auth.rol === "TALENTO_HUMANO") {
        return next();
      }

      // ADMINISTRADOR no tiene bypass operacional por defecto
      if (req.auth.rol === "ADMINISTRADOR") {
        const err = new Error("Acceso denegado: El rol ADMINISTRADOR no posee facultades de aprobación operacional.");
        (err as any).statusCode = 403;
        (err as any).codigo = "PERMISO_DENEGADO";
        throw err;
      }

      const { subordinado_empleado_id, fecha_jornada } = req.body || {};
      if (!subordinado_empleado_id || !fecha_jornada) {
        const err = new Error("Se requiere subordinado_empleado_id y fecha_jornada para evaluar autoridad.");
        (err as any).statusCode = 400;
        (err as any).codigo = "DATOS_INCOMPLETOS";
        throw err;
      }

      const miEmpleadoId = req.auth.empleado_id;
      if (!miEmpleadoId) {
        const err = new Error("El usuario no tiene un empleado vinculado para actuar como Jefatura.");
        (err as any).statusCode = 403;
        (err as any).codigo = "PERMISO_DENEGADO";
        throw err;
      }

      const esValida = await jefaturasRepo.esJefaturaValidaEnFecha(
        miEmpleadoId,
        subordinado_empleado_id,
        fecha_jornada
      );

      if (!esValida) {
        const err = new Error("Acceso denegado: No posee relación de Jefatura activa para la fecha de jornada indicada.");
        (err as any).statusCode = 403;
        (err as any).codigo = "PERMISO_DENEGADO";
        throw err;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
