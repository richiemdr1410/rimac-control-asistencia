import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { IniciarSesionUseCase } from "./use-cases/iniciar-sesion.js";
import { CerrarSesionUseCase } from "./use-cases/cerrar-sesion.js";
import { ValidarSesionUseCase } from "./use-cases/validar-sesion.js";
import type { IPermisosRepository } from "../repositories/interfaces/permisos.js";
import type { IJefaturasRepository } from "./repositories/interfaces/jefaturas.js";
import {
  createRequireAuthMiddleware,
  createCsrfProtectionMiddleware,
  parseCookies,
} from "./middlewares.js";
import { env } from "../config/env.js";

export function createAuthRouter(
  iniciarSesionUc: IniciarSesionUseCase,
  cerrarSesionUc: CerrarSesionUseCase,
  validarSesionUc: ValidarSesionUseCase,
  permisosRepo?: IPermisosRepository,
  jefaturasRepo?: IJefaturasRepository
): Router {
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(validarSesionUc);
  const csrfProtection = createCsrfProtectionMiddleware();

  async function enriquecerUsuario(usuario: any) {
    let permisos: string[] = [];
    if (permisosRepo && usuario?.rol) {
      permisos = await permisosRepo.listarPermisosActivosPorRol(usuario.rol);
    }
    let tieneSubordinados = false;
    if (jefaturasRepo && usuario?.empleado_id) {
      const subs = await jefaturasRepo.obtenerSubordinadosIds(usuario.empleado_id);
      tieneSubordinados = subs.length > 0;
    }
    return {
      ...usuario,
      permisos,
      tiene_subordinados: tieneSubordinados,
    };
  }

  /**
   * POST /api/auth/login
   * Pre-sesión, no requiere CSRF pero valida credenciales de forma constante y emite cookie segura
   */
  router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const username_o_email = req.body?.username_o_email || req.body?.identificador;
      const password = req.body?.password || req.body?.contrasena;
      const userAgent = req.headers["user-agent"];
      const ipOrigen = req.ip || req.socket.remoteAddress;

      const resultado = await iniciarSesionUc.ejecutar({
        username_o_email,
        password,
        user_agent: userAgent,
        ip_origen: ipOrigen,
      });

      // Configurar cookie HttpOnly compatible con iframe de Google AI Studio y producción
      const maxAgeMs = env.SESSION_TTL_HOURS * 60 * 60 * 1000;
      const isHttps =
        req.secure ||
        req.headers["x-forwarded-proto"] === "https" ||
        env.NODE_ENV === "production" ||
        Boolean(process.env.APP_URL?.startsWith("https"));

      res.cookie("sid", resultado.sesion_id, {
        httpOnly: true,
        secure: isHttps,
        sameSite: isHttps ? "none" : "lax",
        maxAge: maxAgeMs,
        path: "/",
        partitioned: isHttps,
      } as any);

      // Cabecera X-Session-Id para clientes con restricciones estrictas de cookies en iframes
      res.setHeader("X-Session-Id", resultado.sesion_id);

      const usuarioEnriquecido = await enriquecerUsuario(resultado.usuario);

      res.status(200).json({
        exito: true,
        datos: {
          usuario: usuarioEnriquecido,
          sesion_id: resultado.sesion_id,
          csrf_token: resultado.csrf_token,
          token_csrf: resultado.csrf_token,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/auth/logout
   * Requiere sesión activa y protección CSRF. Revoca sesión en base de datos y borra cookie
   */
  router.post("/logout", requireAuth, csrfProtection, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.auth) {
        await cerrarSesionUc.ejecutar(req.auth.sesion_id);
      }
      const isHttps =
        req.secure ||
        req.headers["x-forwarded-proto"] === "https" ||
        env.NODE_ENV === "production" ||
        Boolean(process.env.APP_URL?.startsWith("https"));

      res.clearCookie("sid", {
        path: "/",
        httpOnly: true,
        secure: isHttps,
        sameSite: isHttps ? "none" : "lax",
        partitioned: isHttps,
      } as any);
      res.status(200).json({
        exito: true,
        mensaje: "Sesión finalizada exitosamente.",
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/auth/me & GET /api/auth/perfil
   * Retorna perfil público del usuario autenticado (sin hashes ni secretos)
   */
  const handlePerfil = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const authHeader = req.headers.authorization;
      const bearerSid = authHeader?.startsWith("Bearer ") ? authHeader.substring(7).trim() : undefined;
      const sid = cookies["sid"] || (req.headers["x-session-id"] as string) || bearerSid || req.auth!.sesion_id;
      const { usuario, contexto } = await validarSesionUc.ejecutar(sid);

      res.setHeader("X-Session-Id", sid);

      const usuarioEnriquecido = await enriquecerUsuario(usuario);

      res.status(200).json({
        exito: true,
        datos: {
          usuario: usuarioEnriquecido,
          sesion_id: sid,
          csrf_token: contexto.csrf_token,
          token_csrf: contexto.csrf_token,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  router.get("/me", requireAuth, handlePerfil);
  router.get("/perfil", requireAuth, handlePerfil);

  /**
   * GET /api/auth/csrf
   * Retorna el token CSRF ligado a la sesión activa
   */
  router.get("/csrf", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json({
        exito: true,
        datos: {
          csrf_token: req.auth!.csrf_token,
          token_csrf: req.auth!.csrf_token,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
