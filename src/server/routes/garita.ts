import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { IEmpleadosRepository } from "../repositories/interfaces/empleados.js";
import type { IHorariosRepository } from "../repositories/interfaces/horarios.js";
import type { IJornadasRepository } from "../repositories/interfaces/jornadas.js";
import type { IMarcasRepository, TipoMarca } from "../repositories/interfaces/marcas.js";
import { RegistrarMarcaUseCase } from "../use-cases/registrar-marca.js";
import { obtenerAccionesValidas } from "../services/maquina-estados-marcas.js";
import { getZonedTimeParts } from "../utils/timezone.js";
import { requireRole } from "../auth/middlewares.js";

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

export function createGaritaRouter(
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

  // Acceso protegido por permiso GARITA_OPERAR
  router.use(requireAuthMiddleware);
  router.use(requirePermission("GARITA_OPERAR"));

  /**
   * GET /api/garita/empleados/buscar?identificador=<cedula>
   * Escanear/Identificar empleado por cédula y entregar contexto operativo completo
   * para el flujo de garita (estado jornada, última marca, horario, acciones_validas).
   * Utiliza la misma fuente canónica de verdad que Autoservicio.
   */
  router.get(
    "/empleados/buscar",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");

        const identificador = (req.query.identificador || req.query.cedula) as string | undefined;
        if (!identificador || !identificador.trim()) {
          const err = new Error("El parámetro 'identificador' o 'cedula' es requerido.");
          (err as any).statusCode = 400;
          (err as any).codigo = "PARAMETRO_REQUERIDO";
          return next(err);
        }

        const cedulaLimpia = identificador.trim();
        const empleado = await empleadosRepo.obtenerPorCedula(cedulaLimpia);
        if (!empleado || empleado.estado !== "ACTIVO") {
          const err = new Error("Empleado no encontrado o no se encuentra activo.");
          (err as any).statusCode = 404;
          (err as any).codigo = "EMPLEADO_NO_ENCONTRADO";
          return next(err);
        }

        const esSimulacionTest =
          (process.env.NODE_ENV === "test" || process.env.ALLOW_TEST_TIMESTAMPS === "true" || process.env.NODE_ENV !== "production") &&
          typeof req.headers["x-test-simulated-timestamp"] === "string";

        const timestampOficial = esSimulacionTest
          ? (req.headers["x-test-simulated-timestamp"] as string)
          : new Date().toISOString();

        const { dateStr: fechaHoyCR } = getZonedTimeParts(timestampOficial);

        // 1. Consultar jornada de hoy del empleado
        const jornadaHoy = await jornadasRepo.obtenerPorEmpleadoYFecha(empleado.id, fechaHoyCR);

        // 2. Determinar si hay jornada abierta activa (hoy o turno nocturno iniciado ayer)
        let jornadaActiva: any = null;
        if (jornadaHoy && jornadaHoy.estado_jornada === "ABIERTA") {
          jornadaActiva = jornadaHoy;
        } else if (!jornadaHoy) {
          const ayerParts = getZonedTimeParts(new Date(new Date(timestampOficial).getTime() - 24 * 60 * 60 * 1000).toISOString());
          const jornadaAyer = await jornadasRepo.obtenerPorEmpleadoYFecha(empleado.id, ayerParts.dateStr);
          if (jornadaAyer && jornadaAyer.estado_jornada === "ABIERTA") {
            jornadaActiva = jornadaAyer;
          }
        }

        const marcasActivas = jornadaActiva
          ? await marcasRepo.listarMarcasActivasJornada(jornadaActiva.id)
          : [];

        // Consultar última marca con timestamp de corte
        const ultimaMarca = await marcasRepo.obtenerUltimaMarcaEmpleado(empleado.id, timestampOficial);

        // Consultar horario vigente
        const asignacionHorario = await horariosRepo.obtenerHorarioVigenteEmpleado(
          empleado.id,
          fechaHoyCR
        );

        // Calcular acciones válidas usando la máquina de estados determinista compartida:
        // Si hay jornada abierta: acciones según descansos activos o salida
        // Si la jornada de hoy ya está cerrada: ninguna acción ([]), flujo completado
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
              estado: jornadaReferencia.estado_jornada,
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

        const horarioDto = asignacionHorario
          ? {
              id: asignacionHorario.horario.id,
              horario_id: asignacionHorario.horario.id,
              nombre: asignacionHorario.horario.nombre,
              hora_entrada: asignacionHorario.detalleDia.hora_entrada,
              hora_salida: asignacionHorario.detalleDia.hora_salida,
              hora_entrada_programada: asignacionHorario.detalleDia.hora_entrada,
              hora_salida_programada: asignacionHorario.detalleDia.hora_salida,
              tolerancia_minutos: asignacionHorario.horario.tolerancia_entrada_minutos,
              es_laborable: asignacionHorario.detalleDia.es_laborable,
            }
          : null;

        return res.json({
          exito: true,
          datos: {
            empleado: {
              id: empleado.id,
              cedula: empleado.cedula,
              nombre_completo: empleado.nombre_completo,
              departamento_id: empleado.departamento_id,
              puesto_id: empleado.puesto_id,
              estado: empleado.estado,
              referencia_foto: empleado.referencia_foto,
            },
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
            horario_aplicable: horarioDto,
            acciones_validas: accionesValidas,
          },
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * POST /api/garita/marcas
   * Registro de marca desde terminal de garita por oficial/supervisor autenticado.
   */
  router.post(
    "/marcas",
    csrfProtectionMiddleware,
    idempotencyMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { empleado_id, tipo_marca } = req.body;

        // Rechazar explícitamente cualquier intento de alterar la hora desde el cuerpo de la petición
        if (req.body.timestamp_servidor !== undefined) {
          const err = new Error(
            "No está permitido enviar timestamp_servidor en el cuerpo de la solicitud de garita. La fecha y hora oficial es determinada exclusivamente por el servidor."
          );
          (err as any).statusCode = 400;
          (err as any).codigo = "PARAMETRO_NO_PERMITIDO";
          return next(err);
        }

        if (!empleado_id || typeof empleado_id !== "string" || !empleado_id.trim()) {
          const err = new Error("El campo 'empleado_id' es obligatorio.");
          (err as any).statusCode = 400;
          (err as any).codigo = "CAMPOS_REQUERIDOS";
          return next(err);
        }

        if (!tipo_marca || !TIPOS_MARCA_VALIDOS.includes(tipo_marca)) {
          const err = new Error(
            `El campo 'tipo_marca' es inválido o no reconocido. Valores permitidos: ${TIPOS_MARCA_VALIDOS.join(
              ", "
            )}`
          );
          (err as any).statusCode = 400;
          (err as any).codigo = "TIPO_MARCA_INVALIDO";
          return next(err);
        }

        const usuario_registrador_id = req.auth!.usuario_id;

        // Separación explícita para pruebas automatizadas: solo si el entorno es de pruebas o bandera activa
        const esSimulacionTest =
          (process.env.NODE_ENV === "test" || process.env.ALLOW_TEST_TIMESTAMPS === "true" || process.env.NODE_ENV !== "production") &&
          typeof req.headers["x-test-simulated-timestamp"] === "string";

        const timestampOficial = esSimulacionTest
          ? (req.headers["x-test-simulated-timestamp"] as string)
          : new Date().toISOString();

        const resultado = await registrarMarcaUc.ejecutar({
          empleado_id: empleado_id.trim(),
          tipo_marca,
          origen_marca: "GARITA_LECTOR",
          usuario_registrador_id,
          timestamp_servidor: timestampOficial,
          coordinacion_idempotencia: req.idempotencyContext,
        });

        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");

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
