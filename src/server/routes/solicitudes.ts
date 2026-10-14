import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import type {
  ISolicitudesRepository,
  SolicitudEntity,
  SolicitudDecisionEntity,
  SolicitudEvidenciaEntity,
  EstadoSolicitud,
} from "../repositories/interfaces/solicitudes.js";
import type { IJefaturasRepository } from "../auth/repositories/interfaces/jefaturas.js";
import type { IAuditoriaRepository } from "../repositories/interfaces/auditoria.js";
import type { IPermisosRepository } from "../repositories/interfaces/permisos.js";

const TIPOS_SOLICITUD_VALIDOS = [
  "PERMISO",
  "VACACIONES",
  "JUSTIFICACION_AUSENCIA",
  "JUSTIFICACION_TARDIA",
  "JUSTIFICACION_MARCA_OMITIDA",
  "PERMISO_CON_GOCE",
  "PERMISO_SIN_GOCE",
  "INCAPACIDAD",
];

export function createSolicitudesRouter(
  solicitudesRepo: ISolicitudesRepository,
  jefaturasRepo: IJefaturasRepository,
  auditoriaRepo: IAuditoriaRepository,
  permisosRepo: IPermisosRepository,
  requireAuthMiddleware: any,
  csrfProtectionMiddleware: any,
  requirePermission: (codigo: string) => any
): Router {
  const router = Router();

  router.use(requireAuthMiddleware);

  /**
   * GET /api/solicitudes/politicas
   * Listar políticas de aprobación configuradas.
   * Protegido por SOLICITUDES_POLITICAS_VER.
   */
  router.get(
    "/politicas",
    requirePermission("SOLICITUDES_POLITICAS_VER"),
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const politicas = await solicitudesRepo.listarPoliticas();
        res.json({
          exito: true,
          datos: politicas,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/solicitudes/mis-solicitudes
   * Listar solicitudes personales del empleado autenticado.
   * Protegido por AUTOSERVICIO_SOLICITUDES_VER + ABAC empleado propio.
   */
  router.get(
    "/mis-solicitudes",
    requirePermission("AUTOSERVICIO_SOLICITUDES_VER"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const usuario = (req as any).usuario;
        if (!usuario.empleado_id) {
          const err = new Error("El usuario no tiene una identidad laboral vinculada.");
          (err as any).statusCode = 403;
          (err as any).codigo = "USUARIO_SIN_EMPLEADO_VINCULADO";
          return next(err);
        }

        const solicitudes = await solicitudesRepo.listarSolicitudesEmpleado(usuario.empleado_id);
        res.json({
          exito: true,
          datos: solicitudes,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/solicitudes
   * Crear nueva solicitud personal para el empleado autenticado.
   * Protegido por AUTOSERVICIO_SOLICITUDES_CREAR + CSRF + ABAC empleado propio.
   */
  router.post(
    "/",
    requirePermission("AUTOSERVICIO_SOLICITUDES_CREAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const usuario = (req as any).usuario;
        if (!usuario.empleado_id) {
          const err = new Error("El usuario no tiene una identidad laboral vinculada.");
          (err as any).statusCode = 403;
          (err as any).codigo = "USUARIO_SIN_EMPLEADO_VINCULADO";
          return next(err);
        }

        // SEGURIDAD estricta: No se permite enviar otro empleado_id en el payload
        if (req.body.empleado_id && req.body.empleado_id !== usuario.empleado_id) {
          const err = new Error("No está permitido crear solicitudes en nombre de otro colaborador.");
          (err as any).statusCode = 400;
          (err as any).codigo = "PARAMETRO_NO_PERMITIDO";
          return next(err);
        }

        const {
          tipo_solicitud,
          fecha_inicio,
          fecha_fin,
          fecha_hora_inicio,
          fecha_hora_fin,
          motivo,
          evidencia,
        } = req.body;

        if (!tipo_solicitud || !fecha_inicio || !fecha_fin || !motivo) {
          const err = new Error("Los campos 'tipo_solicitud', 'fecha_inicio', 'fecha_fin' y 'motivo' son requeridos.");
          (err as any).statusCode = 400;
          (err as any).codigo = "DATOS_INVALIDOS";
          return next(err);
        }

        if (!TIPOS_SOLICITUD_VALIDOS.includes(tipo_solicitud)) {
          const err = new Error(`Tipo de solicitud '${tipo_solicitud}' no válido.`);
          (err as any).statusCode = 400;
          (err as any).codigo = "TIPO_SOLICITUD_INVALIDO";
          return next(err);
        }

        const politica = await solicitudesRepo.obtenerPolitica(tipo_solicitud);
        if (!politica) {
          const err = new Error(`No existe una política configurada para el tipo ${tipo_solicitud}.`);
          (err as any).statusCode = 422;
          (err as any).codigo = "POLITICA_NO_ENCONTRADA";
          return next(err);
        }

        const fechaIni = fecha_inicio.slice(0, 10);
        const fechaFin = fecha_fin.slice(0, 10);
        if (fechaFin < fechaIni) {
          const err = new Error("La fecha final no puede ser anterior a la fecha inicial.");
          (err as any).statusCode = 400;
          (err as any).codigo = "RANGO_FECHAS_INVALIDO";
          return next(err);
        }

        // Calcular minutos solicitados
        let minutos = 480; // Default día estándar
        if (fecha_hora_inicio && fecha_hora_fin) {
          const tIni = new Date(fecha_hora_inicio).getTime();
          const tFin = new Date(fecha_hora_fin).getTime();
          if (tFin <= tIni) {
            const err = new Error("La hora de finalización debe ser posterior a la de inicio.");
            (err as any).statusCode = 400;
            (err as any).codigo = "RANGO_HORAS_INVALIDO";
            return next(err);
          }
          minutos = Math.round((tFin - tIni) / 60000);
        } else {
          // Cálculo por días calendario
          const msPerDay = 86400000;
          const dIni = new Date(fechaIni).getTime();
          const dFin = new Date(fechaFin).getTime();
          const dias = Math.max(1, Math.round((dFin - dIni) / msPerDay) + 1);
          minutos = dias * 480;
        }

        // Evidencias si existen
        const evidenciasList: SolicitudEvidenciaEntity[] = [];
        if (evidencia && evidencia.nombre_archivo) {
          evidenciasList.push({
            id: randomUUID(),
            solicitud_id: "", // Se asigna abajo
            nombre_archivo: evidencia.nombre_archivo,
            tipo_mime: evidencia.tipo_mime || "application/pdf",
            referencia_almacenamiento: evidencia.referencia_almacenamiento || `evidencias/${usuario.empleado_id}/${Date.now()}_${evidencia.nombre_archivo}`,
            hash_archivo: evidencia.hash_archivo || "hash-placeholder",
            cargado_por_usuario_id: usuario.id,
            creado_en: new Date().toISOString(),
          });
        }

        const nuevaSolicitud: SolicitudEntity = {
          id: randomUUID(),
          empleado_id: usuario.empleado_id,
          politica_id: politica.id,
          tipo_solicitud,
          fecha_inicio: fechaIni,
          fecha_fin: fechaFin,
          fecha_hora_inicio: fecha_hora_inicio || null,
          fecha_hora_fin: fecha_hora_fin || null,
          minutos_solicitados: minutos,
          motivo: motivo.trim(),
          estado: "PENDIENTE",
          creado_en: new Date().toISOString(),
        };

        if (evidenciasList.length > 0) {
          evidenciasList[0].solicitud_id = nuevaSolicitud.id;
        }

        const guardada = await solicitudesRepo.crearSolicitud(nuevaSolicitud, evidenciasList);

        // Registro de auditoría
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "CREAR_SOLICITUD",
          entidad_tipo: "solicitudes_justificacion",
          entidad_id: guardada.id,
          valor_nuevo: guardada,
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.status(201).json({
          exito: true,
          datos: guardada,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/solicitudes/pendientes
   * Bandeja de aprobación de solicitudes para Jefatura / Talento Humano / Admin.
   * Protegido por SOLICITUDES_BANDEJA_VER + ámbito ABAC de subordinados.
   */
  router.get(
    "/pendientes",
    requirePermission("SOLICITUDES_BANDEJA_VER"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const usuario = (req as any).usuario;

        let subordinadosIds: string[] = [];
        if (usuario.empleado_id) {
          subordinadosIds = await jefaturasRepo.obtenerSubordinadosIds(usuario.empleado_id);
        }

        const esTH = usuario.rol === "TALENTO_HUMANO";
        const esAdmin = usuario.rol === "ADMINISTRADOR";

        // Si no es perfil con alcance global (TH/Admin) y no tiene subordinados, la bandeja retorna vacía
        if (!esTH && !esAdmin && subordinadosIds.length === 0) {
          return res.json({
            exito: true,
            datos: [],
          });
        }

        const solicitudes = await solicitudesRepo.listarSolicitudesPendientesParaRevisor({
          rol: usuario.rol,
          empleado_id: usuario.empleado_id,
          subordinados_ids: subordinadosIds,
        });

        res.json({
          exito: true,
          datos: solicitudes,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/solicitudes/:id
   * Consultar detalle e historial de una solicitud.
   */
  router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const usuario = (req as any).usuario;
      const solicitud = await solicitudesRepo.obtenerSolicitudPorId(id);

      if (!solicitud) {
        const err = new Error("Solicitud no encontrada.");
        (err as any).statusCode = 404;
        (err as any).codigo = "RECURSO_NO_ENCONTRADO";
        return next(err);
      }

      // Validar acceso: el empleado dueño, su jefatura, o TH/Admin
      const esPropietario = usuario.empleado_id === solicitud.empleado_id;
      const esTHoAdmin = usuario.rol === "TALENTO_HUMANO" || usuario.rol === "ADMINISTRADOR";
      let esJefatura = false;
      if (usuario.empleado_id) {
        esJefatura = await jefaturasRepo.esJefaturaValidaEnFecha(
          usuario.empleado_id,
          solicitud.empleado_id,
          solicitud.fecha_inicio
        );
      }

      if (!esPropietario && !esTHoAdmin && !esJefatura) {
        const err = new Error("No tiene permisos para consultar esta solicitud.");
        (err as any).statusCode = 403;
        (err as any).codigo = "PERMISO_DENEGADO";
        return next(err);
      }

      res.json({
        exito: true,
        datos: solicitud,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/solicitudes/:id/aprobar
   * Aprobar solicitud con validación ABAC según política.
   */
  router.post(
    "/:id/aprobar",
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const usuario = (req as any).usuario;
        const { comentarios } = req.body;

        const solicitud = await solicitudesRepo.obtenerSolicitudPorId(id);
        if (!solicitud) {
          const err = new Error("Solicitud no encontrada.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }

        if (solicitud.estado === "APROBADA" || solicitud.estado === "RECHAZADA") {
          const err = new Error(`La solicitud ya se encuentra resuelta (${solicitud.estado}).`);
          (err as any).statusCode = 409;
          (err as any).codigo = "SOLICITUD_YA_RESUELTA";
          return next(err);
        }

        // PROHIBICIÓN ABSOLUTA DE AUTOAPROBACIÓN (Reglas Fase 3.1 y 4A.2)
        const actorEmpleadoId = usuario.empleado_id || (req as any).auth?.empleado_id;
        if (actorEmpleadoId && solicitud.empleado_id === actorEmpleadoId) {
          const err = new Error(
            "No es posible aprobar o rechazar una solicitud correspondiente a usted mismo. La solicitud debe ser revisada por su jefatura directa o por otro responsable autorizado según el flujo de aprobación."
          );
          (err as any).statusCode = 403;
          (err as any).codigo = "AUTOAPROBACION_NO_PERMITIDA";
          (err as any).titulo = "No puede resolver su propia solicitud";
          return next(err);
        }

        const politica = solicitud.politica;
        if (!politica) {
          const err = new Error("No se localizó la política asociada a la solicitud.");
          (err as any).statusCode = 500;
          return next(err);
        }

        // Evaluar nivel y ABAC
        const nivelActual = solicitud.estado === "PENDIENTE" ? 1 : 2;
        let rolEvaluador = "JEFATURA_DIRECTA";
        let nuevoEstado: EstadoSolicitud = "APROBADA";

        if (nivelActual === 1) {
          if (politica.rol_aprobador_nivel_1 === "JEFATURA_DIRECTA") {
            rolEvaluador = "JEFATURA_DIRECTA";
            // Validar permiso funcional
            const tienePermisoJefatura = await permisosRepo.rolTienePermiso(
              usuario.rol,
              "SOLICITUDES_APROBAR_JEFATURA"
            );
            if (!tienePermisoJefatura) {
              const err = new Error("El rol no posee el permiso 'SOLICITUDES_APROBAR_JEFATURA'.");
              (err as any).statusCode = 403;
              (err as any).codigo = "PERMISO_DENEGADO";
              return next(err);
            }

            // Validar que el usuario sea jefatura activa del empleado solicitante (ABAC)
            if (!usuario.empleado_id) {
              const err = new Error("El usuario no tiene identidad de colaborador para actuar como jefatura.");
              (err as any).statusCode = 403;
              (err as any).codigo = "PERMISO_DENEGADO";
              return next(err);
            }

            const esJefatura = await jefaturasRepo.esJefaturaValidaEnFecha(
              usuario.empleado_id,
              solicitud.empleado_id,
              solicitud.fecha_inicio
            );

            if (!esJefatura) {
              const err = new Error("No tiene autorización de jefatura sobre el colaborador solicitante.");
              (err as any).statusCode = 403;
              (err as any).codigo = "ACCESO_NO_AUTORIZADO";
              return next(err);
            }
          } else if (politica.rol_aprobador_nivel_1 === "TALENTO_HUMANO") {
            rolEvaluador = "TALENTO_HUMANO";
            const tienePermisoTH = await permisosRepo.rolTienePermiso(
              usuario.rol,
              "SOLICITUDES_APROBAR_TH"
            );
            if (!tienePermisoTH) {
              const err = new Error("Se requiere el permiso 'SOLICITUDES_APROBAR_TH' para evaluar este paso.");
              (err as any).statusCode = 403;
              (err as any).codigo = "PERMISO_DENEGADO";
              return next(err);
            }
          }

          // Si requiere 2 niveles, pasa a EN_REVISION; si requiere 1, pasa a APROBADA
          if (politica.niveles_aprobacion_requeridos > 1) {
            nuevoEstado = "EN_REVISION";
          } else {
            nuevoEstado = "APROBADA";
          }
        } else if (nivelActual === 2) {
          rolEvaluador = politica.rol_aprobador_nivel_2 || "TALENTO_HUMANO";
          const tienePermisoTH = await permisosRepo.rolTienePermiso(
            usuario.rol,
            "SOLICITUDES_APROBAR_TH"
          );
          if (!tienePermisoTH) {
            const err = new Error("El nivel 2 requiere el permiso 'SOLICITUDES_APROBAR_TH'.");
            (err as any).statusCode = 403;
            (err as any).codigo = "PERMISO_DENEGADO";
            return next(err);
          }
          nuevoEstado = "APROBADA";
        }

        const decision: SolicitudDecisionEntity = {
          id: randomUUID(),
          solicitud_id: id,
          nivel: nivelActual,
          rol_evaluador: usuario.rol, // Actor real y rol utilizado
          usuario_decisor_id: usuario.id,
          decision: "APROBADA",
          comentarios: comentarios || null,
          fecha_decision: new Date().toISOString(),
        };

        await solicitudesRepo.registrarDecision(decision, nuevoEstado);

        // Registro de auditoría
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "APROBAR_SOLICITUD",
          entidad_tipo: "solicitudes_justificacion",
          entidad_id: id,
          motivo: comentarios || `Aprobación Nivel ${nivelActual}`,
          valor_anterior: { estado: solicitud.estado },
          valor_nuevo: { estado: nuevoEstado, decision },
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.json({
          exito: true,
          datos: {
            solicitud_id: id,
            estado_anterior: solicitud.estado,
            nuevo_estado: nuevoEstado,
            decision,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/solicitudes/:id/rechazar
   * Rechazar solicitud con justificación obligatoria.
   */
  router.post(
    "/:id/rechazar",
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const usuario = (req as any).usuario;
        const { comentarios } = req.body;

        if (!comentarios || !comentarios.trim()) {
          const err = new Error("El motivo o comentario de rechazo es estrictamente obligatorio.");
          (err as any).statusCode = 400;
          (err as any).codigo = "MOTIVO_RECHAZO_REQUERIDO";
          return next(err);
        }

        const solicitud = await solicitudesRepo.obtenerSolicitudPorId(id);
        if (!solicitud) {
          const err = new Error("Solicitud no encontrada.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }

        if (solicitud.estado === "APROBADA" || solicitud.estado === "RECHAZADA") {
          const err = new Error(`La solicitud ya se encuentra resuelta (${solicitud.estado}).`);
          (err as any).statusCode = 409;
          (err as any).codigo = "SOLICITUD_YA_RESUELTA";
          return next(err);
        }

        // PROHIBICIÓN ABSOLUTA DE AUTORECHAZO (Reglas Fase 3.1 y 4A.2)
        const actorEmpleadoId = usuario.empleado_id || (req as any).auth?.empleado_id;
        if (actorEmpleadoId && solicitud.empleado_id === actorEmpleadoId) {
          const err = new Error(
            "No es posible aprobar o rechazar una solicitud correspondiente a usted mismo. La solicitud debe ser revisada por su jefatura directa o por otro responsable autorizado según el flujo de aprobación."
          );
          (err as any).statusCode = 403;
          (err as any).codigo = "AUTOAPROBACION_NO_PERMITIDA";
          (err as any).titulo = "No puede resolver su propia solicitud";
          return next(err);
        }

        const politica = solicitud.politica;
        const nivelActual = solicitud.estado === "PENDIENTE" ? 1 : 2;
        let rolEvaluador = "JEFATURA_DIRECTA";

        if (nivelActual === 1) {
          if (politica?.rol_aprobador_nivel_1 === "JEFATURA_DIRECTA") {
            rolEvaluador = "JEFATURA_DIRECTA";
            const tienePermisoJefatura = await permisosRepo.rolTienePermiso(
              usuario.rol,
              "SOLICITUDES_APROBAR_JEFATURA"
            );
            if (!tienePermisoJefatura) {
              const err = new Error("El rol no posee el permiso 'SOLICITUDES_APROBAR_JEFATURA'.");
              (err as any).statusCode = 403;
              (err as any).codigo = "PERMISO_DENEGADO";
              return next(err);
            }

            if (!usuario.empleado_id) {
              const err = new Error("El usuario no tiene identidad de colaborador para actuar como jefatura.");
              (err as any).statusCode = 403;
              (err as any).codigo = "PERMISO_DENEGADO";
              return next(err);
            }

            const esJefatura = await jefaturasRepo.esJefaturaValidaEnFecha(
              usuario.empleado_id,
              solicitud.empleado_id,
              solicitud.fecha_inicio
            );

            if (!esJefatura) {
              const err = new Error("No tiene autorización de jefatura sobre el colaborador solicitante.");
              (err as any).statusCode = 403;
              (err as any).codigo = "ACCESO_NO_AUTORIZADO";
              return next(err);
            }
          } else {
            rolEvaluador = "TALENTO_HUMANO";
            const tienePermisoTH = await permisosRepo.rolTienePermiso(
              usuario.rol,
              "SOLICITUDES_APROBAR_TH"
            );
            if (!tienePermisoTH) {
              const err = new Error("Se requiere el permiso 'SOLICITUDES_APROBAR_TH' para evaluar este paso.");
              (err as any).statusCode = 403;
              (err as any).codigo = "PERMISO_DENEGADO";
              return next(err);
            }
          }
        } else if (nivelActual === 2) {
          rolEvaluador = "TALENTO_HUMANO";
          const tienePermisoTH = await permisosRepo.rolTienePermiso(
            usuario.rol,
            "SOLICITUDES_APROBAR_TH"
          );
          if (!tienePermisoTH) {
            const err = new Error("El nivel 2 requiere el permiso 'SOLICITUDES_APROBAR_TH'.");
            (err as any).statusCode = 403;
            (err as any).codigo = "PERMISO_DENEGADO";
            return next(err);
          }
        }

        const decision: SolicitudDecisionEntity = {
          id: randomUUID(),
          solicitud_id: id,
          nivel: nivelActual,
          rol_evaluador: usuario.rol, // Actor real y rol utilizado
          usuario_decisor_id: usuario.id,
          decision: "RECHAZADA",
          comentarios: comentarios.trim(),
          fecha_decision: new Date().toISOString(),
        };

        await solicitudesRepo.registrarDecision(decision, "RECHAZADA");

        // Registro de auditoría
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "RECHAZAR_SOLICITUD",
          entidad_tipo: "solicitudes_justificacion",
          entidad_id: id,
          motivo: comentarios.trim(),
          valor_anterior: { estado: solicitud.estado },
          valor_nuevo: { estado: "RECHAZADA", decision },
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.json({
          exito: true,
          datos: {
            solicitud_id: id,
            estado_anterior: solicitud.estado,
            nuevo_estado: "RECHAZADA",
            decision,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
