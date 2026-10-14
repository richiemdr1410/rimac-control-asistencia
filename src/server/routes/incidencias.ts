import { Router } from "express";
import type { Request, Response } from "express";
import type { IIncidenciasRepository } from "../repositories/interfaces/incidencias.js";
import type { ICorreccionesMarcasRepository } from "../repositories/interfaces/correcciones-marcas.js";
import type { IJornadasRepository } from "../repositories/interfaces/jornadas.js";
import type { IMarcasRepository } from "../repositories/interfaces/marcas.js";
import type { IAuditoriaRepository } from "../repositories/interfaces/auditoria.js";
import type { IJefaturasRepository } from "../auth/repositories/interfaces/jefaturas.js";
import type { IEmpleadosRepository } from "../repositories/interfaces/empleados.js";
import type { DetectorIncidenciasService } from "../services/detector-incidencias.js";
import type { RegularizacionJornadasService, ActorContext } from "../services/regularizacion-jornadas.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esUuidValido(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id);
}

export function createIncidenciasRouter(
  incidenciasRepo: IIncidenciasRepository,
  correccionesRepo: ICorreccionesMarcasRepository,
  jornadasRepo: IJornadasRepository,
  marcasRepo: IMarcasRepository,
  auditoriaRepo: IAuditoriaRepository,
  detectorService: DetectorIncidenciasService,
  regularizacionService: RegularizacionJornadasService,
  requireAuth: any,
  csrfProtection: any,
  requirePermission: (permiso: string) => any,
  requireAnyPermission: (...permisos: string[]) => any,
  jefaturasRepo?: IJefaturasRepository,
  _empleadosRepo?: IEmpleadosRepository
): Router {
  const router = Router();

  function getActor(req: Request): ActorContext {
    const user = (req as any).usuario || (req as any).auth;
    return {
      usuario_id: user?.id || user?.sub,
      empleado_id: user?.empleado_id || null,
      rol: user?.rol || "",
      username: user?.username || user?.identificador || "sistema",
    };
  }

  // 1. Listar incidencias con filtros y reglas de visibilidad por rol
  router.get(
    "/",
    requireAuth,
    requirePermission("INCIDENCIAS_VER"),
    async (req: Request, res: Response) => {
      try {
        const actor = getActor(req);
        let { empleado_id, fecha, tipo_incidencia, estado, departamento_id } = req.query;

        // Regla EMPLEADO: solo puede consultar sus propias incidencias
        if (actor.rol === "EMPLEADO") {
          if (!actor.empleado_id) {
            return res.json({ exito: true, datos: [] });
          }
          empleado_id = actor.empleado_id;
        } else if (empleado_id && !esUuidValido(empleado_id)) {
          return res.status(400).json({
            exito: false,
            codigo: "IDENTIFICADOR_INVALIDO",
            mensaje: "Seleccione un registro válido",
            error: { codigo: "IDENTIFICADOR_INVALIDO", mensaje: "Seleccione un registro válido" },
          });
        }

        if (departamento_id && !esUuidValido(departamento_id)) {
          return res.status(400).json({
            exito: false,
            codigo: "IDENTIFICADOR_INVALIDO",
            mensaje: "Seleccione un registro válido",
            error: { codigo: "IDENTIFICADOR_INVALIDO", mensaje: "Seleccione un registro válido" },
          });
        }

        const listado = await incidenciasRepo.listarPorFiltros({
          empleado_id: empleado_id ? String(empleado_id) : undefined,
          fecha: fecha ? String(fecha) : undefined,
          tipo_incidencia: tipo_incidencia ? (String(tipo_incidencia) as any) : undefined,
          estado: estado ? (String(estado) as any) : undefined,
          departamento_id: departamento_id ? String(departamento_id) : undefined,
        });

        res.json({
          exito: true,
          datos: listado,
        });
      } catch (err: any) {
        console.error("[IncidenciasRouter] Error al listar incidencias:", err);
        res.status(500).json({
          exito: false,
          codigo: "ERROR_INTERNO",
          mensaje: err.message || "Error al listar incidencias",
          error: { codigo: "ERROR_INTERNO", mensaje: err.message || "Error al listar incidencias" },
        });
      }
    }
  );

  // 2. Disparar detección de incidencias
  router.post(
    "/detectar",
    requireAuth,
    csrfProtection,
    requireAnyPermission("INCIDENCIAS_GESTIONAR", "JORNADAS_REGULARIZAR"),
    async (req: Request, res: Response) => {
      try {
        const { jornada_id, ahora_simulada } = req.body;
        const actor = getActor(req);

        if (jornada_id) {
          if (!esUuidValido(jornada_id)) {
            return res.status(400).json({
              exito: false,
              codigo: "IDENTIFICADOR_INVALIDO",
              mensaje: "Seleccione un registro válido",
              error: { codigo: "IDENTIFICADOR_INVALIDO", mensaje: "Seleccione un registro válido" },
            });
          }

          const jornada = await jornadasRepo.obtenerPorId(jornada_id);
          if (!jornada) {
            return res.status(404).json({
              exito: false,
              codigo: "JORNADA_NO_ENCONTRADA",
              mensaje: "Jornada no encontrada",
              error: { codigo: "JORNADA_NO_ENCONTRADA", mensaje: "Jornada no encontrada" },
            });
          }

          const registradas = await detectorService.procesarJornada(
            jornada,
            actor.usuario_id,
            ahora_simulada
          );

          return res.json({
            exito: true,
            mensaje: `Detección completada. Incidencias registradas: ${registradas.length}`,
            datos: registradas,
          });
        }

        const resumen = await detectorService.procesarTodasJornadasAbiertas(actor.usuario_id);
        res.json({
          exito: true,
          mensaje: `Escaneo completado sobre ${resumen.total} jornadas abiertas. ${resumen.incidenciasGeneradas} incidencias detectadas.`,
          datos: resumen,
        });
      } catch (err: any) {
        console.error("[IncidenciasRouter] Error en detección:", err);
        res.status(500).json({
          exito: false,
          codigo: "ERROR_DETECCION",
          mensaje: err.message || "Error en detección de incidencias",
          error: { codigo: "ERROR_DETECCION", mensaje: err.message || "Error en detección de incidencias" },
        });
      }
    }
  );

  // 3. Regularizar salida omitida (con validación de UUID y prohibición estricta de autoaprobación)
  router.post(
    "/regularizar-salida",
    requireAuth,
    csrfProtection,
    requirePermission("JORNADAS_REGULARIZAR"),
    async (req: Request, res: Response) => {
      try {
        const { jornada_id, motivo } = req.body;

        if (!jornada_id || !esUuidValido(jornada_id)) {
          return res.status(400).json({
            exito: false,
            codigo: "IDENTIFICADOR_INVALIDO",
            mensaje: "Seleccione un registro válido",
            error: { codigo: "IDENTIFICADOR_INVALIDO", mensaje: "Seleccione un registro válido" },
          });
        }

        if (!motivo || typeof motivo !== "string" || motivo.trim().length === 0) {
          return res.status(400).json({
            exito: false,
            codigo: "MOTIVO_REQUERIDO",
            mensaje: "El motivo de regularización es obligatorio.",
            error: { codigo: "MOTIVO_REQUERIDO", mensaje: "El motivo de regularización es obligatorio." },
          });
        }

        const actor = getActor(req);

        // Pre-verificación de autoaprobación contra la jornada
        const jornadaPrevia = await jornadasRepo.obtenerPorId(jornada_id);
        if (!jornadaPrevia) {
          return res.status(404).json({
            exito: false,
            codigo: "JORNADA_NO_ENCONTRADA",
            mensaje: "Jornada no encontrada",
            error: { codigo: "JORNADA_NO_ENCONTRADA", mensaje: "Jornada no encontrada" },
          });
        }

        if (actor.empleado_id && actor.empleado_id === jornadaPrevia.empleado_id) {
          return res.status(403).json({
            exito: false,
            codigo: "AUTOAPROBACION_NO_PERMITIDA",
            titulo: "No puede resolver su propia incidencia",
            mensaje:
              "No es posible aprobar o justificar una incidencia correspondiente a su propia jornada. Solicite la revisión de su jefatura directa o de otro responsable autorizado.",
            error: {
              codigo: "AUTOAPROBACION_NO_PERMITIDA",
              titulo: "No puede resolver su propia incidencia",
              mensaje:
                "No es posible aprobar o justificar una incidencia correspondiente a su propia jornada. Solicite la revisión de su jefatura directa o de otro responsable autorizado.",
            },
          });
        }

        const resultado = await regularizacionService.regularizarSalidaOmitida(
          jornada_id,
          actor,
          motivo.trim()
        );

        res.json({
          exito: true,
          mensaje: resultado.mensaje,
          datos: resultado.jornada,
        });
      } catch (err: any) {
        const status = err.statusCode || 400;
        const codigo = err.codigo || (status === 403 ? "ALCANCE_NO_AUTORIZADO" : "ERROR_REGULARIZACION");
        console.warn("[IncidenciasRouter] Regularización fallida:", err.message);
        res.status(status).json({
          exito: false,
          codigo,
          mensaje: err.message || "Error al regularizar salida omitida",
          error: { codigo, mensaje: err.message || "Error al regularizar salida omitida" },
        });
      }
    }
  );

  // 4. Resolver o descartar incidencia manualmente (con validación de autoaprobación)
  router.post(
    "/:id/resolver",
    requireAuth,
    csrfProtection,
    requirePermission("INCIDENCIAS_GESTIONAR"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { estado, motivo } = req.body;

        if (!esUuidValido(id)) {
          return res.status(400).json({
            exito: false,
            codigo: "IDENTIFICADOR_INVALIDO",
            mensaje: "Seleccione un registro válido",
            error: { codigo: "IDENTIFICADOR_INVALIDO", mensaje: "Seleccione un registro válido" },
          });
        }

        if (!motivo || typeof motivo !== "string" || motivo.trim().length === 0) {
          return res.status(400).json({
            exito: false,
            codigo: "MOTIVO_REQUERIDO",
            mensaje: "El motivo de resolución es obligatorio.",
            error: { codigo: "MOTIVO_REQUERIDO", mensaje: "El motivo de resolución es obligatorio." },
          });
        }

        if (estado !== "JUSTIFICADA" && estado !== "DESCARTADA") {
          return res.status(400).json({
            exito: false,
            codigo: "DATOS_INVALIDOS",
            mensaje: "El estado de resolución debe ser JUSTIFICADA o DESCARTADA.",
            error: { codigo: "DATOS_INVALIDOS", mensaje: "El estado de resolución debe ser JUSTIFICADA o DESCARTADA." },
          });
        }

        const actor = getActor(req);
        const incidencia = await incidenciasRepo.obtenerDetallePorId(id);
        if (!incidencia) {
          return res.status(404).json({
            exito: false,
            codigo: "INCIDENCIA_NO_ENCONTRADA",
            mensaje: "Incidencia no encontrada",
            error: { codigo: "INCIDENCIA_NO_ENCONTRADA", mensaje: "Incidencia no encontrada" },
          });
        }

        // Prohibición estricta de autoaprobación y autorresolución (para TODOS los roles)
        if (actor.empleado_id && actor.empleado_id === incidencia.empleado_id) {
          return res.status(403).json({
            exito: false,
            codigo: "AUTOAPROBACION_NO_PERMITIDA",
            titulo: "No puede resolver su propia incidencia",
            mensaje:
              "No es posible aprobar o justificar una incidencia correspondiente a su propia jornada. Solicite la revisión de su jefatura directa o de otro responsable autorizado.",
            error: {
              codigo: "AUTOAPROBACION_NO_PERMITIDA",
              titulo: "No puede resolver su propia incidencia",
              mensaje:
                "No es posible aprobar o justificar una incidencia correspondiente a su propia jornada. Solicite la revisión de su jefatura directa o de otro responsable autorizado.",
            },
          });
        }

        // Validar alcance jerárquico ABAC para el responsable
        const validacion = await regularizacionService.validarAutorizacionDecision(
          actor,
          incidencia.empleado_id,
          incidencia.fecha_jornada || new Date().toISOString().split("T")[0]
        );

        if (!validacion.autorizada) {
          return res.status(403).json({
            exito: false,
            codigo: validacion.codigo || "ALCANCE_NO_AUTORIZADO",
            mensaje: validacion.motivoRechazo || "No tiene autorización para gestionar esta incidencia",
            error: {
              codigo: validacion.codigo || "ALCANCE_NO_AUTORIZADO",
              mensaje: validacion.motivoRechazo || "No tiene autorización para gestionar esta incidencia",
            },
          });
        }

        const resuelta = await incidenciasRepo.resolverIncidencia(
          id,
          estado,
          actor.usuario_id,
          motivo.trim()
        );

        await auditoriaRepo.registrarEvento({
          accion: "RESOLVER_INCIDENCIA",
          actor_usuario_id: actor.usuario_id,
          rol_actor: actor.rol || "USUARIO",
          entidad_tipo: "incidencias",
          entidad_id: id,
          motivo: motivo.trim(),
          valor_anterior: { estado: incidencia.estado },
          valor_nuevo: { estado, motivo: motivo.trim() },
        });

        res.json({
          exito: true,
          mensaje: "Incidencia resuelta exitosamente.",
          datos: resuelta,
        });
      } catch (err: any) {
        res.status(err.statusCode || 500).json({
          exito: false,
          codigo: err.codigo || "ERROR_RESOLUCION",
          mensaje: err.message || "Error al resolver incidencia",
          error: { codigo: err.codigo || "ERROR_RESOLUCION", mensaje: err.message || "Error al resolver incidencia" },
        });
      }
    }
  );

  // 5. Consultar marcas físicas por fecha para el formulario guiado de corrección
  router.get(
    "/marcas-por-fecha",
    requireAuth,
    requireAnyPermission("CORRECCIONES_MARCAS_SOLICITAR", "CORRECCIONES_MARCAS_APROBAR", "INCIDENCIAS_VER"),
    async (req: Request, res: Response) => {
      try {
        const actor = getActor(req);
        const { fecha, empleado_id } = req.query as Record<string, string>;

        if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
          return res.status(400).json({
            exito: false,
            codigo: "IDENTIFICADOR_INVALIDO",
            mensaje: "Fecha de jornada inválida (formato esperado YYYY-MM-DD)",
            error: { codigo: "IDENTIFICADOR_INVALIDO", mensaje: "Fecha de jornada inválida (formato esperado YYYY-MM-DD)" },
          });
        }

        // Determinar empleado destino según rol
        let targetEmpleadoId = actor.empleado_id;

        if (actor.rol === "EMPLEADO") {
          // El empleado solo puede consultar sus propias marcas
          if (empleado_id && empleado_id !== actor.empleado_id) {
            return res.status(403).json({
              exito: false,
              codigo: "ALCANCE_NO_AUTORIZADO",
              mensaje: "No tiene autorización para consultar marcas de terceros.",
              error: { codigo: "ALCANCE_NO_AUTORIZADO", mensaje: "No tiene autorización para consultar marcas de terceros." },
            });
          }
          targetEmpleadoId = actor.empleado_id;
        } else if (empleado_id) {
          if (!esUuidValido(empleado_id)) {
            return res.status(400).json({
              exito: false,
              codigo: "IDENTIFICADOR_INVALIDO",
              mensaje: "Seleccione un registro válido",
              error: { codigo: "IDENTIFICADOR_INVALIDO", mensaje: "Seleccione un registro válido" },
            });
          }

          // Si es supervisor, validar relación de jefatura
          if (actor.rol === "SUPERVISOR_SEGURIDAD" && actor.empleado_id !== empleado_id && jefaturasRepo && actor.empleado_id) {
            const esJefeValido = await jefaturasRepo.esJefaturaValidaEnFecha(
              actor.empleado_id,
              empleado_id,
              fecha
            );
            if (!esJefeValido) {
              return res.status(403).json({
                exito: false,
                codigo: "ALCANCE_NO_AUTORIZADO",
                mensaje: "No tiene relación de jefatura activa para consultar marcas de este colaborador en la fecha indicada.",
                error: {
                  codigo: "ALCANCE_NO_AUTORIZADO",
                  mensaje: "No tiene relación de jefatura activa para consultar marcas de este colaborador en la fecha indicada.",
                },
              });
            }
          }

          targetEmpleadoId = empleado_id;
        }

        if (!targetEmpleadoId || !esUuidValido(targetEmpleadoId)) {
          return res.status(400).json({
            exito: false,
            codigo: "IDENTIFICADOR_INVALIDO",
            mensaje: "Seleccione un registro válido",
            error: { codigo: "IDENTIFICADOR_INVALIDO", mensaje: "Seleccione un registro válido" },
          });
        }

        // Obtener jornada correspondiente a la fecha
        const jornada = await jornadasRepo.obtenerPorEmpleadoYFecha(targetEmpleadoId, fecha);

        // Consultar marcas físicas asociadas
        const resMarcas = await (incidenciasRepo as any).pool.query(
          `SELECT
             m.id,
             m.jornada_id,
             m.empleado_id,
             m.tipo_marca,
             m.timestamp_servidor,
             m.canal_marca,
             m.usuario_registrador_id,
             m.creado_en,
             (SELECT cm.id FROM correcciones_marcas cm WHERE cm.marca_original_id = m.id AND cm.estado = 'PENDIENTE' LIMIT 1) as correccion_pendiente_id
           FROM marcas m
           WHERE m.empleado_id = $1
             AND (
               ${jornada ? `m.jornada_id = '${jornada.id}' OR ` : ""}
               DATE(m.timestamp_servidor AT TIME ZONE 'America/Costa_Rica') = $2::date
             )
           ORDER BY m.timestamp_servidor ASC;`,
          [targetEmpleadoId, fecha]
        );

        const marcas = resMarcas.rows.map((row: any) => ({
          id: row.id,
          tipo_marca: row.tipo_marca,
          timestamp_servidor: row.timestamp_servidor instanceof Date ? row.timestamp_servidor.toISOString() : row.timestamp_servidor,
          canal_marca: row.canal_marca,
          tiene_correccion_pendiente: Boolean(row.correccion_pendiente_id),
          correccion_pendiente_id: row.correccion_pendiente_id || null,
        }));

        res.json({
          exito: true,
          datos: {
            jornada: jornada
              ? {
                  id: jornada.id,
                  fecha_jornada: jornada.fecha_jornada,
                  estado_jornada: jornada.estado_jornada,
                  snapshot_horario: jornada.snapshot_horario,
                  es_salida_regularizada: jornada.es_salida_regularizada,
                }
              : null,
            marcas,
            mensaje_informativo:
              marcas.length === 0
                ? "No existen marcas físicas registradas para la fecha seleccionada."
                : undefined,
          },
        });
      } catch (err: any) {
        console.error("[IncidenciasRouter] Error en marcas-por-fecha:", err);
        res.status(500).json({
          exito: false,
          codigo: "ERROR_CONSULTA",
          mensaje: err.message || "Error al consultar marcas de la jornada",
          error: { codigo: "ERROR_CONSULTA", mensaje: err.message || "Error al consultar marcas de la jornada" },
        });
      }
    }
  );

  // 6. Listar correcciones de marcas
  router.get(
    "/correcciones/todas",
    requireAuth,
    requireAnyPermission("CORRECCIONES_MARCAS_SOLICITAR", "CORRECCIONES_MARCAS_APROBAR", "INCIDENCIAS_VER"),
    async (req: Request, res: Response) => {
      try {
        const actor = getActor(req);
        let { empleado_id, estado, fecha } = req.query;

        if (actor.rol === "EMPLEADO") {
          if (!actor.empleado_id) {
            return res.json({ exito: true, datos: [] });
          }
          empleado_id = actor.empleado_id;
        } else if (empleado_id && !esUuidValido(empleado_id)) {
          return res.status(400).json({
            exito: false,
            codigo: "IDENTIFICADOR_INVALIDO",
            mensaje: "Seleccione un registro válido",
            error: { codigo: "IDENTIFICADOR_INVALIDO", mensaje: "Seleccione un registro válido" },
          });
        }

        const correcciones = await correccionesRepo.listar({
          empleado_id: empleado_id ? String(empleado_id) : undefined,
          estado: estado ? (String(estado) as any) : undefined,
          fecha: fecha ? String(fecha) : undefined,
        });

        res.json({
          exito: true,
          datos: correcciones,
        });
      } catch (err: any) {
        res.status(500).json({
          exito: false,
          codigo: "ERROR_LISTAR_CORRECCIONES",
          mensaje: err.message || "Error al listar correcciones de marcas",
          error: { codigo: "ERROR_LISTAR_CORRECCIONES", mensaje: err.message || "Error al listar correcciones de marcas" },
        });
      }
    }
  );

  // 7. Solicitar corrección administrativa de una marca física
  router.post(
    "/correcciones/solicitar",
    requireAuth,
    csrfProtection,
    requirePermission("CORRECCIONES_MARCAS_SOLICITAR"),
    async (req: Request, res: Response) => {
      try {
        const {
          marca_original_id,
          tipo_ajuste,
          motivo,
          timestamp_propuesto,
          tipo_marca_propuesto,
        } = req.body;

        // Validación estricta de UUID antes de llegar a la base de datos
        if (!marca_original_id || !esUuidValido(marca_original_id)) {
          return res.status(400).json({
            exito: false,
            codigo: "IDENTIFICADOR_INVALIDO",
            mensaje: "Seleccione una marca válida para continuar",
            error: {
              codigo: "IDENTIFICADOR_INVALIDO",
              mensaje: "Seleccione una marca válida para continuar",
            },
          });
        }

        if (!tipo_ajuste || !["ANULACION_LOGICA", "SUSTITUCION_TIMESTAMP", "SUSTITUCION_TIPO"].includes(tipo_ajuste)) {
          return res.status(400).json({
            exito: false,
            codigo: "DATOS_INVALIDOS",
            mensaje: "Tipo de ajuste no válido.",
            error: { codigo: "DATOS_INVALIDOS", mensaje: "Tipo de ajuste no válido." },
          });
        }

        if (!motivo || typeof motivo !== "string" || motivo.trim().length === 0) {
          return res.status(400).json({
            exito: false,
            codigo: "MOTIVO_REQUERIDO",
            mensaje: "El motivo de la solicitud de corrección es obligatorio.",
            error: { codigo: "MOTIVO_REQUERIDO", mensaje: "El motivo de la solicitud de corrección es obligatorio." },
          });
        }

        const actor = getActor(req);
        const creada = await regularizacionService.solicitarCorreccionMarca(
          marca_original_id,
          tipo_ajuste,
          motivo.trim(),
          actor,
          { timestamp_propuesto, tipo_marca_propuesto }
        );

        res.json({
          exito: true,
          mensaje: "Solicitud de corrección de marca registrada correctamente.",
          datos: creada,
        });
      } catch (err: any) {
        const status = err.statusCode || 400;
        const codigo = err.codigo || (status === 404 ? "MARCA_NO_ENCONTRADA" : status === 409 ? "CORRECCION_PENDIENTE_EXISTENTE" : "ERROR_SOLICITUD");
        res.status(status).json({
          exito: false,
          codigo,
          mensaje: err.message || "Error al solicitar corrección de marca",
          error: { codigo, mensaje: err.message || "Error al solicitar corrección de marca" },
        });
      }
    }
  );

  // 8. Decidir (aprobar/rechazar) corrección de marca con control ABAC y no autoaprobación
  router.post(
    "/correcciones/:id/decidir",
    requireAuth,
    csrfProtection,
    requirePermission("CORRECCIONES_MARCAS_APROBAR"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { decision } = req.body;

        if (!esUuidValido(id)) {
          return res.status(400).json({
            exito: false,
            codigo: "IDENTIFICADOR_INVALIDO",
            mensaje: "Seleccione un registro válido",
            error: { codigo: "IDENTIFICADOR_INVALIDO", mensaje: "Seleccione un registro válido" },
          });
        }

        if (decision !== "APROBAR" && decision !== "RECHAZAR") {
          return res.status(400).json({
            exito: false,
            codigo: "DATOS_INVALIDOS",
            mensaje: "La decisión debe ser 'APROBAR' o 'RECHAZAR'.",
            error: { codigo: "DATOS_INVALIDOS", mensaje: "La decisión debe ser 'APROBAR' o 'RECHAZAR'." },
          });
        }

        const actor = getActor(req);

        // Pre-verificación de autoaprobación sobre la corrección
        const detalle = await correccionesRepo.obtenerDetallePorId(id);
        if (!detalle) {
          return res.status(404).json({
            exito: false,
            codigo: "CORRECCION_NO_ENCONTRADA",
            mensaje: "Corrección no encontrada",
            error: { codigo: "CORRECCION_NO_ENCONTRADA", mensaje: "Corrección no encontrada" },
          });
        }

        if (actor.empleado_id && actor.empleado_id === detalle.empleado_id) {
          return res.status(403).json({
            exito: false,
            codigo: "AUTOAPROBACION_NO_PERMITIDA",
            titulo: "No puede resolver su propia incidencia",
            mensaje:
              "No es posible aprobar o justificar una incidencia correspondiente a su propia jornada. Solicite la revisión de su jefatura directa o de otro responsable autorizado.",
            error: {
              codigo: "AUTOAPROBACION_NO_PERMITIDA",
              titulo: "No puede resolver su propia incidencia",
              mensaje:
                "No es posible aprobar o justificar una incidencia correspondiente a su propia jornada. Solicite la revisión de su jefatura directa o de otro responsable autorizado.",
            },
          });
        }

        const resultado = await regularizacionService.decidirCorreccionMarca(
          id,
          decision,
          actor
        );

        res.json({
          exito: true,
          mensaje: resultado.mensaje,
          datos: resultado.correccion,
        });
      } catch (err: any) {
        const status = err.statusCode || 400;
        const codigo = err.codigo || (status === 403 ? "ALCANCE_NO_AUTORIZADO" : "ERROR_DECISION");
        res.status(status).json({
          exito: false,
          codigo,
          mensaje: err.message || "Error al procesar decisión de corrección",
          error: { codigo, mensaje: err.message || "Error al procesar decisión de corrección" },
        });
      }
    }
  );

  // 9. Consultar marcas físicas y cálculo de una jornada
  router.get(
    "/jornadas/:jornada_id/marcas",
    requireAuth,
    requireAnyPermission("INCIDENCIAS_VER", "CORRECCIONES_MARCAS_SOLICITAR", "CORRECCIONES_MARCAS_APROBAR"),
    async (req: Request, res: Response) => {
      try {
        const { jornada_id } = req.params;

        if (!esUuidValido(jornada_id)) {
          return res.status(400).json({
            exito: false,
            codigo: "IDENTIFICADOR_INVALIDO",
            mensaje: "Seleccione un registro válido",
            error: { codigo: "IDENTIFICADOR_INVALIDO", mensaje: "Seleccione un registro válido" },
          });
        }

        const actor = getActor(req);
        const jornada = await jornadasRepo.obtenerPorId(jornada_id);
        if (!jornada) {
          return res.status(404).json({
            exito: false,
            codigo: "JORNADA_NO_ENCONTRADA",
            mensaje: "Jornada no encontrada",
            error: { codigo: "JORNADA_NO_ENCONTRADA", mensaje: "Jornada no encontrada" },
          });
        }

        // Regla EMPLEADO: solo puede ver su propia jornada
        if (actor.rol === "EMPLEADO" && actor.empleado_id && actor.empleado_id !== jornada.empleado_id) {
          return res.status(403).json({
            exito: false,
            codigo: "ALCANCE_NO_AUTORIZADO",
            mensaje: "No tiene autorización para consultar marcas de terceros.",
            error: { codigo: "ALCANCE_NO_AUTORIZADO", mensaje: "No tiene autorización para consultar marcas de terceros." },
          });
        }

        // Marcas físicas originales
        const resMarcasFisicas = await (incidenciasRepo as any).pool.query(
          `SELECT * FROM marcas WHERE jornada_id = $1 ORDER BY timestamp_servidor ASC;`,
          [jornada_id]
        );

        // Marcas activas (con sustituciones o anulaciones aprobadas)
        const marcasActivas = await marcasRepo.listarMarcasActivasJornada(jornada_id);

        res.json({
          exito: true,
          datos: {
            jornada,
            marcas_fisicas: resMarcasFisicas.rows,
            marcas_activas_calculo: marcasActivas,
            es_salida_regularizada: jornada.es_salida_regularizada,
            hora_salida_calculo: jornada.hora_salida_calculo,
            origen_salida_calculo: jornada.origen_salida_calculo,
          },
        });
      } catch (err: any) {
        res.status(500).json({
          exito: false,
          codigo: "ERROR_CONSULTA",
          mensaje: err.message || "Error al consultar marcas de la jornada",
          error: { codigo: "ERROR_CONSULTA", mensaje: err.message || "Error al consultar marcas de la jornada" },
        });
      }
    }
  );

  return router;
}
