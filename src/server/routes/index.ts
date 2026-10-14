import { Router } from "express";
import { healthRouter } from "./health.js";
import { createAuthRouter } from "../auth/routes.js";
import { getRepositoryContainer } from "../repositories/factory.js";
import { IniciarSesionUseCase } from "../auth/use-cases/iniciar-sesion.js";
import { CerrarSesionUseCase } from "../auth/use-cases/cerrar-sesion.js";
import { ValidarSesionUseCase } from "../auth/use-cases/validar-sesion.js";
import { createRequireAuthMiddleware,
  createCsrfProtectionMiddleware,
  requireRole,
  requireEmpleadoSelfOrTH,
  createRequireJefaturaTiempoAdicional,
  createRequirePermissionMiddleware,
  createRequireAnyPermissionMiddleware,
} from "../auth/middlewares.js";
import { RegistrarMarcaUseCase } from "../use-cases/registrar-marca.js";
import { createIdempotencyMiddleware } from "../middlewares/idempotencia.js";
import { createGaritaRouter } from "./garita.js";
import { createAutoservicioRouter } from "./autoservicio.js";
import { createFeriadosRouter } from "./feriados.js";
import { createSolicitudesRouter } from "./solicitudes.js";
import { createAdminPermisosRouter } from "./admin-permisos.js";
import { createAdminUsuariosRouter } from "./admin-usuarios.js";
import { createOrganizacionRouters } from "./organizacion.js";
import { createEmpleadosRouter } from "./empleados.js";
import { createHorariosRouter } from "./horarios.js";
import { createJefaturasRouter } from "./jefaturas.js";
import { createJornadasRouter } from "./jornadas.js";
import { createIncidenciasRouter } from "./incidencias.js";
import { createReportesRouter } from "./reportes.js";
import { DetectorIncidenciasService } from "../services/detector-incidencias.js";
import { RegularizacionJornadasService } from "../services/regularizacion-jornadas.js";
import { seedPostgresDemo } from "../../db/seed.js";
import { GeminiGenAiProvider } from "../rag/providers/gemini-provider.js";
import { IngestaRagService } from "../rag/services/ingesta-service.js";
import { RagQueryService } from "../rag/services/rag-service.js";
import { createRagRouter } from "./rag.js";
import { createAdminRagRouter } from "./admin-rag.js";
import { ProcesamientoDocumentalService } from "../rag/services/procesamiento-documental-service.js";
import { documentStorage } from "../rag/storage/document-storage.js";

export const apiRouter = Router();

// 1. Health check
apiRouter.use(healthRouter);

// 2. Obtención desacoplada de repositorios mediante Factory (PostgreSQL)
const repos = getRepositoryContainer();
const {
  usuariosRepo,
  sesionesRepo,
  jefaturasRepo,
  empleadosRepo,
  horariosRepo,
  jornadasRepo,
  marcasRepo,
  idempotenciaRepo,
  ragRepo,
  feriadosRepo,
  solicitudesRepo,
  auditoriaRepo,
  permisosRepo,
  organizacionRepo,
  incidenciasRepo,
  correccionesRepo,
  reportesRepo,
} = repos;

const iniciarSesionUc = new IniciarSesionUseCase(usuariosRepo, sesionesRepo, empleadosRepo);
const cerrarSesionUc = new CerrarSesionUseCase(sesionesRepo);
const validarSesionUc = new ValidarSesionUseCase(sesionesRepo, usuariosRepo, empleadosRepo);

const authRouter = createAuthRouter(
  iniciarSesionUc,
  cerrarSesionUc,
  validarSesionUc,
  permisosRepo,
  jefaturasRepo
);
apiRouter.use("/auth", authRouter);

// 3. Middlewares transversales de seguridad
const requireAuth = createRequireAuthMiddleware(validarSesionUc);
const csrfProtection = createCsrfProtectionMiddleware();
const requirePermission = createRequirePermissionMiddleware(permisosRepo);
const requireAnyPermission = createRequireAnyPermissionMiddleware(permisosRepo);
const requireJefaturaTA = createRequireJefaturaTiempoAdicional(jefaturasRepo);

// Operación controlada de Seed: Capacidad técnica del entorno DEMO exclusiva de ADMINISTRADOR autenticado con CSRF
apiRouter.post(
  "/seed",
  requireAuth,
  requireRole("ADMINISTRADOR"),
  csrfProtection,
  async (req, res, next) => {
    try {
      const resultado = await seedPostgresDemo();
      res.json({ exito: true, datos: resultado });
    } catch (err) {
      next(err);
    }
  }
);

// 4. Repositorios y Casos de Uso del Core de Asistencia
const registrarMarcaUc = new RegistrarMarcaUseCase(
  empleadosRepo,
  horariosRepo,
  jornadasRepo,
  marcasRepo,
  idempotenciaRepo,
  solicitudesRepo,
  feriadosRepo
);

const idempotencyMiddleware = createIdempotencyMiddleware(idempotenciaRepo);

// 5. Módulos funcionales de Garita y Autoservicio
const garitaRouter = createGaritaRouter(
  empleadosRepo,
  horariosRepo,
  jornadasRepo,
  marcasRepo,
  registrarMarcaUc,
  requireAuth,
  csrfProtection,
  idempotencyMiddleware,
  requirePermission
);
apiRouter.use("/garita", garitaRouter);

const autoservicioRouter = createAutoservicioRouter(
  empleadosRepo,
  horariosRepo,
  jornadasRepo,
  marcasRepo,
  registrarMarcaUc,
  requireAuth,
  csrfProtection,
  idempotencyMiddleware,
  requirePermission
);
apiRouter.use("/autoservicio", autoservicioRouter);

// 6. Módulos Fase 3: Feriados y Solicitudes de Colaborador
const feriadosRouter = createFeriadosRouter(
  feriadosRepo,
  auditoriaRepo,
  requireAuth,
  csrfProtection,
  requirePermission
);
apiRouter.use("/feriados", feriadosRouter);

const solicitudesRouter = createSolicitudesRouter(
  solicitudesRepo,
  jefaturasRepo,
  auditoriaRepo,
  permisosRepo,
  requireAuth,
  csrfProtection,
  requirePermission
);
apiRouter.use("/solicitudes", solicitudesRouter);

// Módulo Fase 4A: Incidencias, Salidas Omitidas y Correcciones de Marcas
const detectorIncidenciasService = new DetectorIncidenciasService(
  jornadasRepo,
  marcasRepo,
  incidenciasRepo,
  auditoriaRepo
);

const regularizacionJornadasService = new RegularizacionJornadasService(
  jornadasRepo,
  marcasRepo,
  incidenciasRepo,
  correccionesRepo,
  jefaturasRepo,
  solicitudesRepo,
  feriadosRepo,
  auditoriaRepo
);

const incidenciasRouter = createIncidenciasRouter(
  incidenciasRepo,
  correccionesRepo,
  jornadasRepo,
  marcasRepo,
  auditoriaRepo,
  detectorIncidenciasService,
  regularizacionJornadasService,
  requireAuth,
  csrfProtection,
  requirePermission,
  requireAnyPermission,
  jefaturasRepo,
  empleadosRepo
);
apiRouter.use("/incidencias", incidenciasRouter);
apiRouter.use("/correcciones-marcas", incidenciasRouter);

// 7. Subsistema GenAI + RAG Documental (DTH-REG-001)
const genAiProvider = new GeminiGenAiProvider();
const ingestaRagService = new IngestaRagService(ragRepo, genAiProvider);
const ragQueryService = new RagQueryService(ragRepo, genAiProvider);

// Inicialización asíncrona no bloqueante del corpus
ingestaRagService.asegurarCorpusIngestado().catch((err) => {
  console.warn("[App] Error no bloqueante al inicializar corpus RAG:", err);
});

const ragRouter = createRagRouter(
  ragQueryService,
  ingestaRagService,
  ragRepo,
  requireAuth,
  csrfProtection,
  requirePermission,
  requireAnyPermission
);
apiRouter.use("/rag", ragRouter);

const procesamientoDocumentalService = new ProcesamientoDocumentalService(
  ragRepo,
  genAiProvider,
  documentStorage,
  auditoriaRepo
);

const adminRagRouter = createAdminRagRouter(
  ragRepo,
  procesamientoDocumentalService,
  documentStorage,
  auditoriaRepo,
  requireAuth,
  csrfProtection,
  requirePermission
);
apiRouter.use("/admin/rag", adminRagRouter);

// 8. Módulo de Administración de Permisos y Roles (Fase 3.2B) y Usuarios (Fase 3.2D)
const adminPermisosRouter = createAdminPermisosRouter(
  permisosRepo,
  auditoriaRepo,
  requireAuth,
  csrfProtection,
  requirePermission
);
apiRouter.use("/admin", adminPermisosRouter);

const adminUsuariosRouter = createAdminUsuariosRouter(
  usuariosRepo,
  sesionesRepo,
  empleadosRepo,
  auditoriaRepo,
  requireAuth,
  csrfProtection,
  requirePermission
);
apiRouter.use("/admin/usuarios", adminUsuariosRouter);

// 9. Módulos Fase 3.2C: Organización, Empleados, Horarios y Jefaturas
const { departamentosRouter, puestosRouter } = createOrganizacionRouters(
  organizacionRepo,
  auditoriaRepo,
  requireAuth,
  csrfProtection,
  requirePermission,
  requireAnyPermission
);
apiRouter.use("/departamentos", departamentosRouter);
apiRouter.use("/puestos", puestosRouter);

const horariosRouter = createHorariosRouter(
  horariosRepo,
  auditoriaRepo,
  requireAuth,
  csrfProtection,
  requirePermission
);
apiRouter.use("/horarios", horariosRouter);

const jefaturasRouter = createJefaturasRouter(
  jefaturasRepo,
  auditoriaRepo,
  requireAuth,
  csrfProtection,
  requirePermission
);
apiRouter.use("/jefaturas", jefaturasRouter);

// Consulta de expediente confidencial de empleado (ABAC legacy)
apiRouter.get(
  "/empleados/:empleado_id/expediente",
  requireAuth,
  requireEmpleadoSelfOrTH("empleado_id"),
  (req, res) => {
    res.json({
      exito: true,
      datos: {
        empleado_id: req.params.empleado_id,
        detalle: "EXPEDIENTE_CONFIDENCIAL",
      },
    });
  }
);

const empleadosRouter = createEmpleadosRouter(
  empleadosRepo,
  horariosRepo,
  jefaturasRepo,
  auditoriaRepo,
  requireAuth,
  csrfProtection,
  requirePermission,
  requireAnyPermission,
  usuariosRepo,
  sesionesRepo
);
apiRouter.use("/empleados", empleadosRouter);

// 10. Módulo Fase 4B: Consolidación de Jornadas, Pausas y Tiempo Adicional
const jornadasRouter = createJornadasRouter(
  jornadasRepo,
  marcasRepo,
  jefaturasRepo,
  auditoriaRepo,
  incidenciasRepo,
  empleadosRepo,
  requireAuth,
  csrfProtection,
  requirePermission,
  requireAnyPermission
);
apiRouter.use("/jornadas", jornadasRouter);

// Reutilización oficial de endpoint existente de tiempo adicional (RF-TA-01, Fase 4B)
apiRouter.post(
  "/jefatura/aprobar-tiempo-adicional",
  (req, res, next) => {
    req.url = "/aprobar-tiempo-adicional";
    jornadasRouter(req, res, next);
  }
);
apiRouter.get(
  "/jefatura/tiempo-adicional/pendientes",
  (req, res, next) => {
    req.url = "/tiempo-adicional/pendientes";
    jornadasRouter(req, res, next);
  }
);

// 11. Módulo Fase 5: Dashboard, Reportería y Analítica Operativa
const reportesRouter = createReportesRouter(
  reportesRepo,
  jefaturasRepo,
  permisosRepo,
  requireAuth,
  csrfProtection,
  requirePermission,
  requireAnyPermission
);
apiRouter.use("/reportes", reportesRouter);

