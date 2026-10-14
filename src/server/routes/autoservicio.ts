import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { IEmpleadosRepository } from "../repositories/interfaces/empleados.js";
import type { IHorariosRepository } from "../repositories/interfaces/horarios.js";
import type { IJornadasRepository } from "../repositories/interfaces/jornadas.js";
import type { IMarcasRepository, TipoMarca } from "../repositories/interfaces/marcas.js";
import { RegistrarMarcaUseCase } from "../use-cases/registrar-marca.js";
import { obtenerAccionesValidas } from "../services/maquina-estados-marcas.js";
import { getZonedTimeParts } from "../utils/timezone.js";

const TIPOS_MARCA_VALIDOS: TipoMarca[] = [
  "ENTRADA",
  "INICIO_DESAYUNO",
  "FIN_DESAYUNO",
  "INICIO_ALMUERZO",
  "FIN_ALMUERZO",
  "INICIO_CAFE",
  "FIN_CAFE",
  "SALIDA",
];

export function createAutoservicioRouter(
  empleadosRepo: IEmpleadosRepository,
  horariosRepo: IHorariosRepository,
  jornadasRepo: IJornadasRepository,
  marcasRepo: IMarcasRepository,
  registrarMarcaUc: RegistrarMarcaUseCase,
  requireAuthMiddleware: any,
  csrfProtectionMiddleware: any,
  idempotencyMiddleware: any,
  requirePermission: (codigo: string) => any
): Router {
  const router = Router();

  // 1. Exigir autenticación, empleado vinculado (ABAC) y permiso AUTOSERVICIO_MARCAJE
  router.use(requireAuthMiddleware);
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.auth?.empleado_id) {
      const err = new Error(
        "El usuario autenticado no tiene un perfil de empleado vinculado para realizar autoservicio."
      );
      (err as any).statusCode = 403;
      (err as any).codigo = "USUARIO_SIN_EMPLEADO_VINCULADO";
      return next(err);
    }
    return next();
  });
  router.use(requirePermission("AUTOSERVICIO_MARCAJE"));

  /**
   * GET /api/autoservicio/estado
   * Consulta el estado de jornada actual, última marca y acciones válidas del colaborador autenticado.
   */
  router.get("/estado", async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      const empleado_id = req.auth!.empleado_id!;
      const esSimulacionTest =
        (process.env.NODE_ENV === "test" || process.env.ALLOW_TEST_TIMESTAMPS === "true" || process.env.NODE_ENV !== "production") &&
        typeof req.headers["x-test-simulated-timestamp"] === "string";

      const timestampOficial = esSimulacionTest
        ? (req.headers["x-test-simulated-timestamp"] as string)
        : new Date().toISOString();

      const { dateStr: fechaHoyCR } = getZonedTimeParts(timestampOficial);

      // 1. Consultar jornada de hoy
      const jornadaHoy = await jornadasRepo.obtenerPorEmpleadoYFecha(empleado_id, fechaHoyCR);

      // 2. Determinar si hay jornada abierta activa (hoy o turno nocturno previo)
      let jornadaActiva: any = null;
      if (jornadaHoy && jornadaHoy.estado_jornada === "ABIERTA") {
        jornadaActiva = jornadaHoy;
      } else if (!jornadaHoy) {
        const ayerParts = getZonedTimeParts(new Date(new Date(timestampOficial).getTime() - 24 * 60 * 60 * 1000).toISOString());
        const jornadaAyer = await jornadasRepo.obtenerPorEmpleadoYFecha(empleado_id, ayerParts.dateStr);
        if (jornadaAyer && jornadaAyer.estado_jornada === "ABIERTA") {
          jornadaActiva = jornadaAyer;
        }
      }

      const marcasActivas = jornadaActiva
        ? await marcasRepo.listarMarcasActivasJornada(jornadaActiva.id)
        : [];
      const ultimaMarca = await marcasRepo.obtenerUltimaMarcaEmpleado(empleado_id, timestampOficial);
      const asignacionHorario = await horariosRepo.obtenerHorarioVigenteEmpleado(
        empleado_id,
        fechaHoyCR
      );
      const emp = await empleadosRepo.obtenerPorId(empleado_id);

      // Determinación de acciones válidas:
      // Si hay jornada abierta: acciones según descansos/salida
      // Si la jornada de hoy ya está cerrada: ninguna acción pendiente ([]), flujo finalizado
      // Si no hay jornada hoy ni abierta: puede registrar ENTRADA
      let accionesValidas: TipoMarca[] = [];
      if (jornadaActiva) {
        accionesValidas = obtenerAccionesValidas(true, marcasActivas);
      } else if (jornadaHoy && jornadaHoy.estado_jornada !== "ABIERTA") {
        accionesValidas = [];
      } else {
        accionesValidas = obtenerAccionesValidas(false, []);
      }

      const jornadaReferencia = jornadaActiva || jornadaHoy || null;
      const jornadaDto = jornadaReferencia
        ? {
            id: jornadaReferencia.id,
            fecha_jornada: jornadaReferencia.fecha_jornada,
            estado_jornada: jornadaReferencia.estado_jornada,
            hora_entrada_efectiva:
              jornadaReferencia.resultados_derivados?.hora_entrada_efectiva,
            hora_salida_efectiva:
              jornadaReferencia.resultados_derivados?.hora_salida_efectiva,
            minutos_tiempo_total:
              jornadaReferencia.minutos_tiempo_total ??
              jornadaReferencia.resultados_derivados?.minutos_tiempo_total ?? 0,
            minutos_efectivos:
              jornadaReferencia.minutos_efectivos ??
              jornadaReferencia.resultados_derivados?.minutos_efectivos ?? 0,
            minutos_descansos:
              jornadaReferencia.minutos_total_descansos ??
              jornadaReferencia.resultados_derivados?.minutos_descansos ?? 0,
            cumplimiento_porcentaje:
              jornadaReferencia.cumplimiento_porcentaje ??
              jornadaReferencia.resultados_derivados?.cumplimiento_porcentaje ?? 0,
          }
        : null;

      return res.json({
        exito: true,
        datos: {
          empleado_id,
          empleado: emp
            ? {
                id: emp.id,
                cedula: emp.cedula,
                nombre_completo: emp.nombre_completo,
                departamento_id: emp.departamento_id,
                puesto_id: emp.puesto_id,
                estado: emp.estado,
              }
            : null,
          jornada_actual: jornadaDto,
          jornada_abierta: jornadaActiva ? jornadaDto : null,
          ultima_marca: ultimaMarca
            ? {
                id: ultimaMarca.id,
                tipo_marca: ultimaMarca.tipo_marca,
                timestamp_servidor: ultimaMarca.timestamp_servidor,
                origen_marca: ultimaMarca.origen_marca,
              }
            : null,
          horario_aplicable: asignacionHorario
            ? {
                id: asignacionHorario.horario.id,
                horario_id: asignacionHorario.horario.id,
                nombre: asignacionHorario.horario.nombre,
                hora_entrada: asignacionHorario.detalleDia.hora_entrada,
                hora_salida: asignacionHorario.detalleDia.hora_salida,
                hora_entrada_programada: asignacionHorario.detalleDia.hora_entrada,
                hora_salida_programada: asignacionHorario.detalleDia.hora_salida,
                tolerancia_minutos: asignacionHorario.horario.tolerancia_entrada_minutos ?? 0,
                tolerancia_entrada_minutos: asignacionHorario.horario.tolerancia_entrada_minutos ?? 0,
                es_laborable: asignacionHorario.detalleDia.es_laborable,
              }
            : null,
          acciones_validas: accionesValidas,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  /**
   * GET /api/autoservicio/mis-jornadas
   * Consulta personal de jornadas para el colaborador autenticado.
   */
  router.get(
    "/mis-jornadas",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (req.query.empleado_id && req.query.empleado_id !== req.auth!.empleado_id) {
          const err = new Error("Parámetro no permitido: No está autorizado enviar empleado_id en autoservicio personal.");
          (err as any).statusCode = 400;
          (err as any).codigo = "PARAMETRO_NO_PERMITIDO";
          return next(err);
        }

        const empleado_id = req.auth!.empleado_id!;
        const { fecha, fecha_desde, fecha_hasta, estado_jornada, limite, offset } = req.query as {
          fecha?: string;
          fecha_desde?: string;
          fecha_hasta?: string;
          estado_jornada?: string;
          limite?: string;
          offset?: string;
        };

        const jornadas = await jornadasRepo.listarJornadas({
          empleado_id,
          fecha,
          fecha_desde,
          fecha_hasta,
          estado_jornada,
          limite: limite ? parseInt(limite, 10) : 100,
          offset: offset ? parseInt(offset, 10) : undefined,
        });

        res.json({ exito: true, datos: jornadas });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * POST /api/autoservicio/marcas
   * Registro de marca por autoservicio.
   * El cliente envía únicamente { tipo_marca }.
   * Cualquier atributo de identidad (empleado_id, usuario_id, etc.) es explícitamente rechazado.
   */
  router.post(
    "/marcas",
    csrfProtectionMiddleware,
    idempotencyMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Regla Contractual: Rechazar explícitamente si el cliente intenta manipular atributos de identidad
        if (
          req.body.empleado_id !== undefined ||
          req.body.usuario_id !== undefined ||
          req.body.origen_marca !== undefined ||
          req.body.timestamp_servidor !== undefined
        ) {
          const err = new Error(
            "No está permitido enviar atributos de identidad o control (empleado_id, usuario_id, origen_marca, timestamp_servidor) en el canal de autoservicio."
          );
          (err as any).statusCode = 400;
          (err as any).codigo = "PARAMETRO_NO_PERMITIDO";
          return next(err);
        }

        const { tipo_marca } = req.body;

        if (!tipo_marca || !TIPOS_MARCA_VALIDOS.includes(tipo_marca)) {
          const err = new Error(
            `El campo 'tipo_marca' es obligatorio y debe ser válido. Valores permitidos: ${TIPOS_MARCA_VALIDOS.join(
              ", "
            )}`
          );
          (err as any).statusCode = 400;
          (err as any).codigo = "TIPO_MARCA_INVALIDO";
          return next(err);
        }

        // empleado_id derivado exclusivamente de la sesión verificada
        const empleado_id = req.auth!.empleado_id!;
        const usuario_registrador_id = req.auth!.usuario_id;

        const esSimulacionTest =
          (process.env.NODE_ENV === "test" || process.env.ALLOW_TEST_TIMESTAMPS === "true" || process.env.NODE_ENV !== "production") &&
          typeof req.headers["x-test-simulated-timestamp"] === "string";

        const timestampOficial = esSimulacionTest
          ? (req.headers["x-test-simulated-timestamp"] as string)
          : undefined;

        const resultado = await registrarMarcaUc.ejecutar({
          empleado_id,
          tipo_marca,
          origen_marca: "AUTOSERVICIO",
          usuario_registrador_id,
          timestamp_servidor: timestampOficial,
          coordinacion_idempotencia: req.idempotencyContext,
        });

        return res.status(201).json({
          exito: true,
          datos: resultado,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  return router;
}
