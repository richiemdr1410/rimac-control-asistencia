import type { IUsuariosRepository } from "../auth/repositories/interfaces/usuarios.js";
import type { ISesionesRepository } from "../auth/repositories/interfaces/sesiones.js";
import type { IJefaturasRepository } from "../auth/repositories/interfaces/jefaturas.js";
import type { IEmpleadosRepository } from "./interfaces/empleados.js";
import type { IHorariosRepository } from "./interfaces/horarios.js";
import type { IJornadasRepository } from "./interfaces/jornadas.js";
import type { IMarcasRepository } from "./interfaces/marcas.js";
import type { IIdempotenciaRepository } from "./interfaces/idempotencia.js";
import type { IRagRepository } from "../rag/domain/rag.types.js";
import type { IFeriadosRepository } from "./interfaces/feriados.js";
import type { ISolicitudesRepository } from "./interfaces/solicitudes.js";
import type { IAuditoriaRepository } from "./interfaces/auditoria.js";
import type { IPermisosRepository } from "./interfaces/permisos.js";
import type { IOrganizacionRepository } from "./interfaces/organizacion.js";
import type { IIncidenciasRepository } from "./interfaces/incidencias.js";
import type { ICorreccionesMarcasRepository } from "./interfaces/correcciones-marcas.js";
import type { IReportesRepository } from "./interfaces/reportes.js";

// Implementaciones PostgreSQL (Proveedor exclusivo definitivo tras Fase 2E)
import { PostgresUsuariosRepository } from "../auth/repositories/postgres/usuarios.js";
import { PostgresSesionesRepository } from "../auth/repositories/postgres/sesiones.js";
import { PostgresJefaturasRepository } from "../auth/repositories/postgres/jefaturas.js";
import { PostgresEmpleadosRepository } from "./postgres/empleados.js";
import { PostgresHorariosRepository } from "./postgres/horarios.js";
import { PostgresJornadasRepository } from "./postgres/jornadas.js";
import { PostgresMarcasRepository } from "./postgres/marcas.js";
import { PostgresIdempotenciaRepository } from "./postgres/idempotencia.js";
import { PostgresRagRepository } from "../rag/repositories/postgres-rag-repository.js";
import { PostgresFeriadosRepository } from "./postgres/feriados.js";
import { PostgresSolicitudesRepository } from "./postgres/solicitudes.js";
import { PostgresAuditoriaRepository } from "./postgres/auditoria.js";
import { PostgresPermisosRepository } from "./postgres/permisos.js";
import { PostgresOrganizacionRepository } from "./postgres/organizacion.js";
import { PostgresIncidenciasRepository } from "./postgres/incidencias.js";
import { PostgresCorreccionesMarcasRepository } from "./postgres/correcciones-marcas.js";
import { PostgresReportesRepository } from "./postgres/reportes.js";

export type PersistenceProviderType = "postgres";

export interface RepositoryContainer {
  provider: PersistenceProviderType;
  usuariosRepo: IUsuariosRepository;
  sesionesRepo: ISesionesRepository;
  jefaturasRepo: IJefaturasRepository;
  empleadosRepo: IEmpleadosRepository;
  horariosRepo: IHorariosRepository;
  jornadasRepo: IJornadasRepository;
  marcasRepo: IMarcasRepository;
  idempotenciaRepo: IIdempotenciaRepository;
  ragRepo: IRagRepository;
  feriadosRepo: IFeriadosRepository;
  solicitudesRepo: ISolicitudesRepository;
  auditoriaRepo: IAuditoriaRepository;
  permisosRepo: IPermisosRepository;
  organizacionRepo: IOrganizacionRepository;
  incidenciasRepo: IIncidenciasRepository;
  correccionesRepo: ICorreccionesMarcasRepository;
  reportesRepo: IReportesRepository;
}

let activeContainer: RepositoryContainer | null = null;

export function getRepositoryContainer(overrideProvider?: string): RepositoryContainer {
  // FASE 2E: Si se solicita explícitamente un proveedor distinto de postgres, rechazar de inmediato
  if (overrideProvider && overrideProvider !== "postgres") {
    throw new Error(
      `[Persistencia Inválida] El proveedor "${overrideProvider}" no está soportado. Firestore ha sido retirado definitivamente. El único proveedor operativo es "postgres".`
    );
  }

  if (process.env.PERSISTENCE_PROVIDER && process.env.PERSISTENCE_PROVIDER.toLowerCase() !== "postgres") {
    throw new Error(
      `[Persistencia Inválida] PERSISTENCE_PROVIDER="${process.env.PERSISTENCE_PROVIDER}" no permitido. El único proveedor operativo es "postgres".`
    );
  }

  // Si ya tenemos un contenedor activo, reutilizarlo
  if (activeContainer && !overrideProvider) {
    return activeContainer;
  }

  const container: RepositoryContainer = {
    provider: "postgres",
    usuariosRepo: new PostgresUsuariosRepository(),
    sesionesRepo: new PostgresSesionesRepository(),
    jefaturasRepo: new PostgresJefaturasRepository(),
    empleadosRepo: new PostgresEmpleadosRepository(),
    horariosRepo: new PostgresHorariosRepository(),
    jornadasRepo: new PostgresJornadasRepository(),
    marcasRepo: new PostgresMarcasRepository(),
    idempotenciaRepo: new PostgresIdempotenciaRepository(),
    ragRepo: new PostgresRagRepository(),
    feriadosRepo: new PostgresFeriadosRepository(),
    solicitudesRepo: new PostgresSolicitudesRepository(),
    auditoriaRepo: new PostgresAuditoriaRepository(),
    permisosRepo: new PostgresPermisosRepository(),
    organizacionRepo: new PostgresOrganizacionRepository(),
    incidenciasRepo: new PostgresIncidenciasRepository(),
    correccionesRepo: new PostgresCorreccionesMarcasRepository(),
    reportesRepo: new PostgresReportesRepository(),
  };

  if (!overrideProvider) {
    activeContainer = container;
  }

  return container;
}
