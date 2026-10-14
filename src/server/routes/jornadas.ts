import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { IJornadasRepository } from "../repositories/interfaces/jornadas.js";
import type { IMarcasRepository } from "../repositories/interfaces/marcas.js";
import type { IJefaturasRepository } from "../auth/repositories/interfaces/jefaturas.js";
import type { IAuditoriaRepository } from "../repositories/interfaces/auditoria.js";
import type { IIncidenciasRepository } from "../repositories/interfaces/incidencias.js";
import type { IEmpleadosRepository } from "../repositories/interfaces/empleados.js";

export function createJornadasRouter(
  jornadasRepo: IJornadasRepository,
  marcasRepo: IMarcasRepository,
  jefaturasRepo: IJefaturasRepository,
  auditoriaRepo: IAuditoriaRepository,
  incidenciasRepo: IIncidenciasRepository,
  empleadosRepo: IEmpleadosRepository,
  requireAuthMiddleware: any,
  csrfProtectionMiddleware: any,
  requirePermission: (codigo: string) => any,
  requireAnyPermission?: (...codigos: string[]) => any
): Router {
  const router = Router();
  router.use(requireAuthMiddleware);

  const checkPersonal = requireAnyPermission
    ? requireAnyPermission("JORNADAS_PERSONALES_VER", "JORNADAS_DETALLE_VER")
    : requirePermission("JORNADAS_DETALLE_VER");

  const checkAdmin = requireAnyPermission
    ? requireAnyPermission("JORNADAS_INSTITUCIONALES_VER", "JORNADAS_EQUIPO_VER", "JORNADAS_DETALLE_VER")
    : requirePermission("JORNADAS_DETALLE_VER");

  const checkDetalle = requireAnyPermission
    ? requireAnyPermission(
        "JORNADAS_PERSONALES_VER",
        "JORNADAS_EQUIPO_VER",
        "JORNADAS_INSTITUCIONALES_VER",
        "JORNADAS_DETALLE_VER"
      )
    : requirePermission("JORNADAS_DETALLE_VER");

  /**
   * GET /api/jornadas/mis-jornadas
   * Consulta personal de jornadas para Autoservicio -> Mis Jornadas y Pausas.
   * Requiere permiso personal (JORNADAS_PERSONALES_VER o JORNADAS_DETALLE_VER).
   * Obtiene empleado_id exclusivamente de la sesión; rechaza empleado_id enviado por cliente.
   */
  router.get(
    "/mis-jornadas",
    checkPersonal,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const usuario = req.auth!;

        if (!usuario.empleado_id) {
          const err = new Error("El usuario autenticado no tiene un perfil de empleado vinculado.");
          (err as any).statusCode = 403;
          (err as any).codigo = "USUARIO_SIN_EMPLEADO_VINCULADO";
          return next(err);
        }

        // Rechazar intento de consultar otros colaboradores en autoservicio
        if (req.query.empleado_id && req.query.empleado_id !== usuario.empleado_id) {
          const err = new Error("Parámetro no permitido: No está autorizado consultar otros colaboradores desde autoservicio personal.");
          (err as any).statusCode = 400;
          (err as any).codigo = "PARAMETRO_NO_PERMITIDO";
          return next(err);
        }

        const { fecha, fecha_desde, fecha_hasta, estado_jornada, limite, offset } = req.query as {
          fecha?: string;
          fecha_desde?: string;
          fecha_hasta?: string;
          estado_jornada?: string;
          limite?: string;
          offset?: string;
        };

        const jornadas = await jornadasRepo.listarJornadas({
          empleado_id: usuario.empleado_id,
          fecha,
          fecha_desde,
          fecha_hasta,
          estado_jornada,
          limite: limite ? parseInt(limite, 10) : 100,
          offset: offset ? parseInt(offset, 10) : undefined,
        });

        res.json({ exito: true, datos: jornadas });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/jornadas
   * Módulo operativo/administrativo: Muestra jornadas de terceros de acuerdo con RBAC + ABAC.
   * No debe mostrarse ni permitir acceso a un EMPLEADO ordinario sin subordinados.
   * Requiere permiso institucional o de equipo (JORNADAS_INSTITUCIONALES_VER, JORNADAS_EQUIPO_VER o JORNADAS_DETALLE_VER).
   */
  router.get(
    "/",
    checkAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const usuario = req.auth!;

        const {
          fecha,
          fecha_desde,
          fecha_hasta,
          empleado_id: targetEmpId,
          estado_jornada,
          departamento_id,
          busqueda,
          limite,
          offset,
        } = req.query as {
          fecha?: string;
          fecha_desde?: string;
          fecha_hasta?: string;
          empleado_id?: string;
          estado_jornada?: string;
          departamento_id?: string;
          busqueda?: string;
          limite?: string;
          offset?: string;
        };

        let filtroEmpleadoId: string | undefined = undefined;
        let filtroSubordinados: string[] | undefined = undefined;

        if (usuario.rol === "EMPLEADO") {
          // EMPLEADO ordinario sin subordinados no tiene acceso al módulo administrativo
          if (!usuario.empleado_id) {
            const err = new Error("El usuario no tiene empleado vinculado.");
            (err as any).statusCode = 403;
            (err as any).codigo = "PERMISO_DENEGADO";
            return next(err);
          }

          const subsIds = await jefaturasRepo.obtenerSubordinadosIds(usuario.empleado_id);
          if (!subsIds || subsIds.length === 0) {
            const err = new Error(
              "Acceso denegado: El módulo administrativo de jornadas está reservado para jefaturas con colaboradores a cargo o roles con alcance institucional. Para consultar sus propias jornadas utilice Autoservicio -> Mis Jornadas y Pausas."
            );
            (err as any).statusCode = 403;
            (err as any).codigo = "PERMISO_DENEGADO";
            return next(err);
          }

          // EMPLEADO que es jefatura: únicamente sobre sus subordinados vigentes
          if (targetEmpId) {
            if (!subsIds.includes(targetEmpId) && targetEmpId !== usuario.empleado_id) {
              const err = new Error("Acceso denegado: El colaborador consultado no pertenece a su alcance de supervisión.");
              (err as any).statusCode = 403;
              (err as any).codigo = "PERMISO_DENEGADO";
              return next(err);
            }
            filtroEmpleadoId = targetEmpId;
          } else {
            filtroSubordinados = subsIds;
          }
        } else if (usuario.rol === "SUPERVISOR_SEGURIDAD") {
          const miEmpId = usuario.empleado_id;
          if (!miEmpId) {
            const err = new Error("El supervisor no tiene perfil de empleado vinculado.");
            (err as any).statusCode = 403;
            (err as any).codigo = "PERMISO_DENEGADO";
            return next(err);
          }
          const subsIds = await jefaturasRepo.obtenerSubordinadosIds(miEmpId);
          const permitidos = [miEmpId, ...subsIds];

          if (targetEmpId) {
            if (!permitidos.includes(targetEmpId)) {
              const err = new Error("Acceso denegado: El colaborador consultado no pertenece a su alcance de supervisión.");
              (err as any).statusCode = 403;
              (err as any).codigo = "PERMISO_DENEGADO";
              return next(err);
            }
            filtroEmpleadoId = targetEmpId;
          } else {
            filtroSubordinados = permitidos;
          }
        } else if (usuario.rol === "TALENTO_HUMANO" || usuario.rol === "ADMINISTRADOR") {
          filtroEmpleadoId = targetEmpId || undefined;
        } else {
          // SEGURIDAD y otros roles sin acceso
          const err = new Error("Acceso denegado: Su rol no posee acceso al módulo de jornadas.");
          (err as any).statusCode = 403;
          (err as any).codigo = "PERMISO_DENEGADO";
          return next(err);
        }

        const jornadas = await jornadasRepo.listarJornadas({
          empleado_id: filtroEmpleadoId,
          subordinados_ids: filtroSubordinados,
          fecha,
          fecha_desde,
          fecha_hasta,
          estado_jornada,
          departamento_id,
          busqueda,
          limite: limite ? parseInt(limite, 10) : undefined,
          offset: offset ? parseInt(offset, 10) : undefined,
        });

        res.json({ exito: true, datos: jornadas });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/jornadas/tiempo-adicional/pendientes
   * Lista jornadas con tiempo adicional detectado según alcance ABAC/RBAC.
   * Requiere permiso TIEMPO_ADICIONAL_VER.
   */
  router.get(
    "/tiempo-adicional/pendientes",
    requirePermission("TIEMPO_ADICIONAL_VER"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const usuario = req.auth!;
        const { estado, empleado_id: targetEmpId } = req.query as {
          estado?: string;
          empleado_id?: string;
        };

        let filtroEmpleadoId: string | undefined = undefined;
        let filtroSubordinados: string[] | undefined = undefined;

        if (usuario.rol === "EMPLEADO") {
          if (!usuario.empleado_id) {
            const err = new Error("El usuario no tiene empleado vinculado.");
            (err as any).statusCode = 403;
            (err as any).codigo = "PERMISO_DENEGADO";
            return next(err);
          }
          if (targetEmpId && targetEmpId !== usuario.empleado_id) {
            const err = new Error("Acceso denegado: Solo puede consultar su propio tiempo adicional.");
            (err as any).statusCode = 403;
            (err as any).codigo = "PERMISO_DENEGADO";
            return next(err);
          }
          filtroEmpleadoId = usuario.empleado_id;
        } else if (usuario.rol === "SUPERVISOR_SEGURIDAD") {
          const miEmpId = usuario.empleado_id;
          if (!miEmpId) {
            const err = new Error("El supervisor no tiene perfil de empleado vinculado.");
            (err as any).statusCode = 403;
            (err as any).codigo = "PERMISO_DENEGADO";
            return next(err);
          }
          const subsIds = await jefaturasRepo.obtenerSubordinadosIds(miEmpId);
          const permitidos = [miEmpId, ...subsIds];

          if (targetEmpId) {
            if (!permitidos.includes(targetEmpId)) {
              const err = new Error("Acceso denegado: El colaborador no pertenece a su alcance de supervisión.");
              (err as any).statusCode = 403;
              (err as any).codigo = "PERMISO_DENEGADO";
              return next(err);
            }
            filtroEmpleadoId = targetEmpId;
          } else {
            filtroSubordinados = permitidos;
          }
        } else if (usuario.rol === "TALENTO_HUMANO" || usuario.rol === "ADMINISTRADOR") {
          filtroEmpleadoId = targetEmpId || undefined;
        } else {
          const err = new Error("Acceso denegado: Su rol no posee acceso a tiempo adicional.");
          (err as any).statusCode = 403;
          (err as any).codigo = "PERMISO_DENEGADO";
          return next(err);
        }

        const items = await jornadasRepo.listarJornadasConTiempoAdicional({
          estado: estado || "TODOS",
          empleado_id: filtroEmpleadoId,
          subordinados_ids: filtroSubordinados,
        });

        res.json({ exito: true, datos: items });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/jornadas/:id/detalle
   * Consulta exhaustiva del desglose de jornada, marcas activas y descansos.
   * Requiere permiso JORNADAS_DETALLE_VER.
   */
  router.get(
    "/:id/detalle",
    checkDetalle,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const usuario = req.auth!;

        const jornada = await jornadasRepo.obtenerPorId(id);
        if (!jornada) {
          const err = new Error(`Jornada con ID ${id} no encontrada.`);
          (err as any).statusCode = 404;
          (err as any).codigo = "JORNADA_NO_ENCONTRADA";
          return next(err);
        }

        // Validación ABAC
        if (usuario.rol === "EMPLEADO") {
          if (jornada.empleado_id !== usuario.empleado_id) {
            const esValida = await jefaturasRepo.esJefaturaValidaEnFecha(
              usuario.empleado_id || "",
              jornada.empleado_id,
              jornada.fecha_jornada
            );
            if (!esValida) {
              const err = new Error("Acceso denegado: Solo puede consultar sus propias jornadas o las de sus subordinados autorizados.");
              (err as any).statusCode = 403;
              (err as any).codigo = "PERMISO_DENEGADO";
              return next(err);
            }
          }
        } else if (usuario.rol === "SUPERVISOR_SEGURIDAD") {
          if (jornada.empleado_id !== usuario.empleado_id) {
            const esValida = await jefaturasRepo.esJefaturaValidaEnFecha(
              usuario.empleado_id || "",
              jornada.empleado_id,
              jornada.fecha_jornada
            );
            if (!esValida) {
              const err = new Error("Acceso denegado: El colaborador no pertenece a su alcance jerárquico para la fecha de la jornada.");
              (err as any).statusCode = 403;
              (err as any).codigo = "PERMISO_DENEGADO";
              return next(err);
            }
          }
        } else if (usuario.rol !== "TALENTO_HUMANO" && usuario.rol !== "ADMINISTRADOR") {
          const err = new Error("Acceso denegado: No posee permisos para consultar detalle de jornada.");
          (err as any).statusCode = 403;
          (err as any).codigo = "PERMISO_DENEGADO";
          return next(err);
        }

        const marcas = await marcasRepo.listarMarcasActivasJornada(jornada.id);
        const empleado = await empleadosRepo.obtenerPorId(jornada.empleado_id);
        const incidencias = await incidenciasRepo.listarPorFiltros({
          empleado_id: jornada.empleado_id,
          fecha: jornada.fecha_jornada,
        });

        res.json({
          exito: true,
          datos: {
            jornada,
            marcas,
            empleado: empleado
              ? {
                  id: empleado.id,
                  nombre_completo: empleado.nombre_completo,
                  cedula: empleado.cedula,
                  departamento_id: empleado.departamento_id,
                }
              : null,
            incidencias,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/jefatura/aprobar-tiempo-adicional
   * Resolución de tiempo adicional detectado (APROBAR_TOTAL, APROBAR_PARCIAL, RECHAZAR).
   * Requiere permiso JORNADAS_TIEMPO_EXTRA_APROBAR y protección CSRF.
   * Aplica estricta prohibición de autoaprobación y control de alcance jerárquico ABAC.
   */
  const handleAprobarTiempoAdicional = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const usuario = req.auth!;
      const {
        jornada_id,
        subordinado_empleado_id,
        fecha_jornada,
        decision,
        minutos_aprobados,
        motivo,
      } = req.body || {};

      if (!decision || !motivo || typeof motivo !== "string" || motivo.trim().length === 0) {
        const err = new Error("Los campos 'decision' y 'motivo' son obligatorios.");
        (err as any).statusCode = 400;
        (err as any).codigo = "DATOS_INVALIDOS";
        return next(err);
      }

      if (!["APROBAR_TOTAL", "APROBAR_PARCIAL", "RECHAZAR"].includes(decision)) {
        const err = new Error("La decisión debe ser 'APROBAR_TOTAL', 'APROBAR_PARCIAL' o 'RECHAZAR'.");
        (err as any).statusCode = 400;
        (err as any).codigo = "DATOS_INVALIDOS";
        return next(err);
      }

      // 1. Localizar la jornada
      let jornada = jornada_id ? await jornadasRepo.obtenerPorId(jornada_id) : null;
      if (!jornada && subordinado_empleado_id && fecha_jornada) {
        jornada = await jornadasRepo.obtenerPorEmpleadoYFecha(subordinado_empleado_id, fecha_jornada);
      }

      if (!jornada) {
        const err = new Error("No se encontró la jornada especificada para resolver tiempo adicional.");
        (err as any).statusCode = 404;
        (err as any).codigo = "JORNADA_NO_ENCONTRADA";
        return next(err);
      }

      // Validar que no sea una jornada abierta sin salida
      if (jornada.estado_jornada === "ABIERTA" || !jornada.hora_salida_calculo) {
        const err = new Error("No se puede aprobar tiempo adicional en una jornada abierta o pendiente de consolidar.");
        (err as any).statusCode = 400;
        (err as any).codigo = "JORNADA_ABIERTA";
        return next(err);
      }

      // 2. REGLA ESTRICTA DE AUTOAPROBACIÓN (Fase 4A.2 y Fase 4B)
      // Ni TALENTO_HUMANO, ni ADMINISTRADOR, ni SUPERVISOR pueden autoaprobar su propio tiempo adicional
      if (usuario.empleado_id && jornada.empleado_id === usuario.empleado_id) {
        const err = new Error(
          "No es posible aprobar o rechazar tiempo adicional correspondiente a usted mismo. La jornada debe ser revisada por su jefatura directa o por otro responsable autorizado según el flujo de aprobación."
        );
        (err as any).statusCode = 403;
        (err as any).codigo = "AUTOAPROBACION_NO_PERMITIDA";
        (err as any).titulo = "No puede resolver su propia jornada";
        return next(err);
      }

      // 3. Validación ABAC de autoridad
      if (usuario.rol === "TALENTO_HUMANO") {
        // Alcance institucional autorizado
      } else if (usuario.rol === "ADMINISTRADOR") {
        // Administrador autorizado por permiso si no es propia
      } else if (usuario.rol === "SUPERVISOR_SEGURIDAD") {
        if (!usuario.empleado_id) {
          const err = new Error("El usuario no tiene un empleado vinculado para actuar como Jefatura.");
          (err as any).statusCode = 403;
          (err as any).codigo = "PERMISO_DENEGADO";
          return next(err);
        }
        const esValida = await jefaturasRepo.esJefaturaValidaEnFecha(
          usuario.empleado_id,
          jornada.empleado_id,
          jornada.fecha_jornada
        );
        if (!esValida) {
          const err = new Error(
            "Acceso denegado: No posee relación de Jefatura activa para el colaborador en la fecha de la jornada indicada."
          );
          (err as any).statusCode = 403;
          (err as any).codigo = "PERMISO_DENEGADO";
          return next(err);
        }
      } else {
        const err = new Error("Acceso denegado: Su rol no posee facultades para aprobar tiempo adicional.");
        (err as any).statusCode = 403;
        (err as any).codigo = "PERMISO_DENEGADO";
        return next(err);
      }

      // 4. Validación de minutos y decisión
      const minutosDetectados =
        jornada.resultados_derivados?.minutos_tiempo_adicional || 0;

      let minutosFinales = 0;
      if (decision === "APROBAR_TOTAL") {
        minutosFinales = minutosDetectados;
      } else if (decision === "APROBAR_PARCIAL") {
        const minNum = Number(minutos_aprobados);
        if (isNaN(minNum) || minNum <= 0 || minNum > minutosDetectados) {
          const err = new Error(
            `Para aprobación parcial, los minutos aprobados deben ser un valor entero entre 1 y ${minutosDetectados}.`
          );
          (err as any).statusCode = 400;
          (err as any).codigo = "DATOS_INVALIDOS";
          return next(err);
        }
        minutosFinales = Math.floor(minNum);
      } else {
        // RECHAZAR
        minutosFinales = 0;
      }

      // 5. Persistir resolución en base de datos
      const jornadaActualizada = await jornadasRepo.aprobarTiempoAdicional(jornada.id, {
        decision,
        minutos_aprobados: minutosFinales,
        usuario_id: usuario.usuario_id,
        motivo: motivo.trim(),
      });

      // 6. Auditoría inmutable obligatoria
      await auditoriaRepo.registrarEvento({
        actor_usuario_id: usuario.usuario_id,
        rol_actor: usuario.rol,
        accion: decision === "RECHAZAR" ? "RECHAZAR_TIEMPO_ADICIONAL" : "APROBAR_TIEMPO_ADICIONAL",
        entidad_tipo: "jornadas",
        entidad_id: jornada.id,
        motivo: `Resolución de tiempo adicional: ${decision} (${minutosFinales} min aprobados de ${minutosDetectados} min detectados). Motivo: ${motivo.trim()}`,
        valor_anterior: {
          estado_tiempo_adicional: jornada.estado_tiempo_adicional,
          minutos_tiempo_adicional_aprobado: jornada.minutos_tiempo_adicional_aprobado,
        },
        valor_nuevo: {
          estado_tiempo_adicional: jornadaActualizada.estado_tiempo_adicional,
          minutos_tiempo_adicional_aprobado: jornadaActualizada.minutos_tiempo_adicional_aprobado,
          usuario_aprobo_ta_id: usuario.usuario_id,
          fecha_resolucion_ta: jornadaActualizada.fecha_resolucion_ta,
          motivo_resolucion_ta: motivo.trim(),
        },
        ip_origen: req.ip,
        user_agent: req.headers["user-agent"],
      });

      // 7. Resolver incidencia abierta TIEMPO_ADICIONAL_PENDIENTE si existía
      try {
        const incAbierta = await incidenciasRepo.obtenerAbiertaPorJornadaYTipo(
          jornada.id,
          "TIEMPO_ADICIONAL_PENDIENTE"
        );
        if (incAbierta) {
          await incidenciasRepo.resolverIncidencia(
            incAbierta.id,
            decision === "RECHAZAR" ? "DESCARTADA" : "REGULARIZADA",
            usuario.usuario_id,
            `Resuelta por jefatura mediante decisión ${decision}: ${motivo.trim()}`
          );
        }
      } catch (errInc) {
        console.warn("[Jornadas] Error no bloqueante al resolver incidencia vinculada de tiempo adicional:", errInc);
      }

      res.json({
        exito: true,
        mensaje: `Tiempo adicional procesado exitosamente (${decision}).`,
        datos: jornadaActualizada,
      });
    } catch (err) {
      next(err);
    }
  };

  // Montar endpoint en la ruta propia de jornadas
  router.post(
    "/aprobar-tiempo-adicional",
    requirePermission("JORNADAS_TIEMPO_EXTRA_APROBAR"),
    csrfProtectionMiddleware,
    handleAprobarTiempoAdicional
  );

  return router;
}
