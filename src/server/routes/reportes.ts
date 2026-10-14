import { Router, Request, Response, NextFunction } from "express";
import type { IReportesRepository, FiltrosReporte } from "../repositories/interfaces/reportes.js";
import type { IJefaturasRepository } from "../auth/repositories/interfaces/jefaturas.js";
import type { IPermisosRepository } from "../repositories/interfaces/permisos.js";

export function createReportesRouter(
  reportesRepo: IReportesRepository,
  jefaturasRepo: IJefaturasRepository,
  permisosRepo: IPermisosRepository,
  requireAuth: any,
  csrfProtection: any,
  requirePermission: any,
  requireAnyPermission?: any
) {
  const router = Router();

  // Middleware base de autenticación para todas las rutas de reportes
  router.use(requireAuth);

  /**
   * Helper para resolver alcance RBAC + ABAC
   */
  async function resolverAlcance(req: Request): Promise<{
    filtros: FiltrosReporte;
    esInstitucional: boolean;
    esEquipo: boolean;
    esPersonal: boolean;
  }> {
    const usuario = req.auth!;

    const tieneInstitucional = await permisosRepo.rolTienePermiso(usuario.rol, "REPORTES_INSTITUCIONALES_VER");
    const tieneEquipo = await permisosRepo.rolTienePermiso(usuario.rol, "REPORTES_EQUIPO_VER");
    const tienePersonal = await permisosRepo.rolTienePermiso(usuario.rol, "REPORTES_PERSONALES_VER");

    // Si no tiene ningún permiso de reportería, denegar
    if (!tieneInstitucional && !tieneEquipo && !tienePersonal) {
      const err = new Error("Acceso denegado: No cuenta con permisos para consultar reportes.");
      (err as any).statusCode = 403;
      (err as any).codigo = "PERMISO_REPORTE_DENEGADO";
      throw err;
    }

    const {
      fecha_desde,
      fecha_hasta,
      empleado_id: targetEmpId,
      departamento_id,
      busqueda,
      estado,
      tipo_incidencia,
      tipo_solicitud,
      limite,
      offset,
    } = req.query as {
      fecha_desde?: string;
      fecha_hasta?: string;
      empleado_id?: string;
      departamento_id?: string;
      busqueda?: string;
      estado?: string;
      tipo_incidencia?: string;
      tipo_solicitud?: string;
      limite?: string;
      offset?: string;
    };

    const filtros: FiltrosReporte = {
      fecha_desde: fecha_desde || undefined,
      fecha_hasta: fecha_hasta || undefined,
      departamento_id: departamento_id || undefined,
      busqueda: busqueda || undefined,
      estado: estado || undefined,
      tipo_incidencia: tipo_incidencia || undefined,
      tipo_solicitud: tipo_solicitud || undefined,
      limite: limite ? parseInt(limite, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    };

    // Caso A: Alcance Institucional (TALENTO_HUMANO, ADMINISTRADOR con REPORTES_INSTITUCIONALES_VER)
    if (tieneInstitucional) {
      if (targetEmpId) {
        filtros.empleado_id = targetEmpId;
      }
      return { filtros, esInstitucional: true, esEquipo: false, esPersonal: false };
    }

    // Caso B: Alcance de Equipo ABAC (Jefaturas o SUPERVISOR_SEGURIDAD con REPORTES_EQUIPO_VER)
    if (tieneEquipo && usuario.empleado_id) {
      const subs = await jefaturasRepo.obtenerSubordinadosIds(usuario.empleado_id);
      const subordinadosValidos = Array.isArray(subs) ? subs : [];

      if (subordinadosValidos.length > 0) {
        const equipoAutorizado = [...subordinadosValidos, usuario.empleado_id];

        if (targetEmpId) {
          if (!equipoAutorizado.includes(targetEmpId)) {
            const err = new Error(
              "Acceso denegado: El colaborador consultado está fuera de su alcance de supervisión autorizado (ABAC)."
            );
            (err as any).statusCode = 403;
            (err as any).codigo = "ALCANCE_ABAC_NO_AUTORIZADO";
            throw err;
          }
          filtros.empleado_id = targetEmpId;
        } else {
          filtros.subordinados_ids = equipoAutorizado;
        }

        return { filtros, esInstitucional: false, esEquipo: true, esPersonal: false };
      }
    }

    // Caso C: Alcance Personal (EMPLEADO con REPORTES_PERSONALES_VER)
    if (tienePersonal) {
      if (!usuario.empleado_id) {
        const err = new Error("El usuario no tiene un perfil de colaborador vinculado para consultar reportes personales.");
        (err as any).statusCode = 403;
        (err as any).codigo = "USUARIO_SIN_EMPLEADO";
        throw err;
      }

      if (targetEmpId && targetEmpId !== usuario.empleado_id) {
        const err = new Error(
          "Acceso denegado: Un colaborador sin subordinados sólo puede consultar sus propios reportes personales."
        );
        (err as any).statusCode = 403;
        (err as any).codigo = "ALCANCE_PERSONAL_ESTRICTO";
        throw err;
      }

      filtros.empleado_id = usuario.empleado_id;
      return { filtros, esInstitucional: false, esEquipo: false, esPersonal: true };
    }

    const err = new Error("Acceso denegado: No posee alcance autorizado para reportería.");
    (err as any).statusCode = 403;
    throw err;
  }

  /**
   * Helper para verificar permiso de exportación
   */
  async function verificarPermisoExportar(req: Request) {
    const usuario = req.auth!;
    const tieneExportar = await permisosRepo.rolTienePermiso(usuario.rol, "REPORTES_EXPORTAR");
    if (!tieneExportar) {
      const err = new Error("Acceso denegado: No cuenta con el permiso requerido REPORTES_EXPORTAR.");
      (err as any).statusCode = 403;
      (err as any).codigo = "PERMISO_EXPORTAR_DENEGADO";
      throw err;
    }
  }

  /**
   * GET /api/reportes/dashboard
   * KPIs e indicadores analíticos del período según alcance efectivo
   */
  router.get("/dashboard", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { filtros, esInstitucional, esEquipo, esPersonal } = await resolverAlcance(req);
      const kpis = await reportesRepo.obtenerKpisDashboard(filtros);

      res.json({
        exito: true,
        datos: {
          kpis,
          alcance: {
            esInstitucional,
            esEquipo,
            esPersonal,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/reportes/asistencia
   * Reporte A: Asistencia consolidada por colaborador
   */
  router.get("/asistencia", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { filtros } = await resolverAlcance(req);
      const datos = await reportesRepo.obtenerReporteAsistencia(filtros);
      res.json({ exito: true, datos });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/reportes/horas-jornadas
   * Reporte B: Horas y Jornadas con totales
   */
  router.get("/horas-jornadas", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { filtros } = await resolverAlcance(req);
      const resultado = await reportesRepo.obtenerReporteHorasJornadas(filtros);
      res.json({ exito: true, datos: resultado });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/reportes/resumen-horas
   * Reporte Principal: Resumen Consolidado de Horas por Colaborador (Quincenal / Mensual)
   */
  router.get("/resumen-horas", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { filtros } = await resolverAlcance(req);
      const resultado = await reportesRepo.obtenerResumenHorasColaborador(filtros);
      res.json({ exito: true, datos: resultado });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/reportes/incidencias
   * Reporte C: Incidencias del período
   */
  router.get("/incidencias", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { filtros } = await resolverAlcance(req);
      const datos = await reportesRepo.obtenerReporteIncidencias(filtros);
      res.json({ exito: true, datos });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/reportes/solicitudes
   * Reporte D: Solicitudes y Justificaciones
   */
  router.get("/solicitudes", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { filtros } = await resolverAlcance(req);
      const datos = await reportesRepo.obtenerReporteSolicitudes(filtros);
      res.json({ exito: true, datos });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/reportes/feriados
   * Reporte E: Feriados del período y personal que laboró
   */
  router.get("/feriados", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { filtros } = await resolverAlcance(req);
      const datos = await reportesRepo.obtenerReporteFeriados(filtros);
      res.json({ exito: true, datos });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/reportes/correcciones
   * Reporte F: Correcciones de marcas
   */
  router.get("/correcciones", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { filtros } = await resolverAlcance(req);
      const datos = await reportesRepo.obtenerReporteCorrecciones(filtros);
      res.json({ exito: true, datos });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/reportes/auditoria
   * Reporte G: Trazabilidad y bitácora (Requiere AUDITORIA_VER)
   */
  router.get("/auditoria", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const usuario = req.auth!;
      const tieneAuditoria = await permisosRepo.rolTienePermiso(usuario.rol, "AUDITORIA_VER");
      if (!tieneAuditoria) {
        const err = new Error("Acceso denegado: Requiere el permiso AUDITORIA_VER.");
        (err as any).statusCode = 403;
        (err as any).codigo = "PERMISO_AUDITORIA_DENEGADO";
        throw err;
      }

      const { fecha_desde, fecha_hasta, busqueda, limite, offset } = req.query as {
        fecha_desde?: string;
        fecha_hasta?: string;
        busqueda?: string;
        limite?: string;
        offset?: string;
      };

      const datos = await reportesRepo.obtenerReporteAuditoria({
        fecha_desde,
        fecha_hasta,
        busqueda,
        limite: limite ? parseInt(limite, 10) : 100,
        offset: offset ? parseInt(offset, 10) : 0,
      });

      res.json({ exito: true, datos });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/reportes/exportar
   * Exportación oficial CSV (Requiere REPORTES_EXPORTAR + Alcance RBAC/ABAC)
   */
  router.get("/exportar", async (req: Request, res: Response, next: NextFunction) => {
    try {
      await verificarPermisoExportar(req);
      const { filtros } = await resolverAlcance(req);
      const tipo = (req.query.tipo as string) || "asistencia";

      let csvContent = "";
      let filename = `reporte_rimac_${tipo}_${new Date().toISOString().split("T")[0]}.csv`;

      // Helper para escapar strings para formato CSV
      const escapeCsv = (val: any) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      if (tipo === "asistencia") {
        const data = await reportesRepo.obtenerReporteAsistencia(filtros);
        const headers = [
          "Colaborador",
          "Cédula",
          "Departamento",
          "Puesto",
          "Jornadas Programadas",
          "Jornadas Registradas",
          "Entradas Registradas",
          "Salidas Registradas",
          "Tardías",
          "Ausencias",
          "Salidas Omitidas",
          "Jornadas Regularizadas",
          "Minutos Efectivos Totales",
        ];
        const rows = data.map((d) => [
          escapeCsv(d.empleado_nombre),
          escapeCsv(d.empleado_cedula),
          escapeCsv(d.departamento_nombre),
          escapeCsv(d.puesto_nombre),
          d.jornadas_programadas,
          d.jornadas_registradas,
          d.entradas_registradas,
          d.salidas_registradas,
          d.tardias,
          d.ausencias,
          d.salidas_omitidas,
          d.jornadas_regularizadas,
          d.minutos_efectivos_totales,
        ]);
        csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
      } else if (tipo === "resumen-horas") {
        const resResumen = await reportesRepo.obtenerResumenHorasColaborador(filtros);
        const headers = [
          "Colaborador",
          "Cédula",
          "Departamento",
          "Puesto",
          "Jornadas Programadas",
          "Jornadas Registradas",
          "Tiempo Programado",
          "Tiempo Total Jornada",
          "Desayuno (min)",
          "Almuerzo (min)",
          "Café (min)",
          "Total Pausas",
          "Tiempo Efectivo Trabajado",
          "Tiempo Adicional Detectado",
          "Tiempo Adicional Aprobado",
          "Tardías",
          "Minutos Tardía",
          "Ausencias",
          "Jornadas Regularizadas",
        ];
        const fmtH = (min: number) => {
          const h = Math.floor(min / 60);
          const m = min % 60;
          return `${h} h ${m} min`;
        };
        const rows = resResumen.items.map((d) => [
          escapeCsv(d.empleado_nombre),
          escapeCsv(d.empleado_cedula),
          escapeCsv(d.departamento_nombre),
          escapeCsv(d.puesto_nombre || "-"),
          d.jornadas_programadas,
          d.jornadas_registradas,
          escapeCsv(fmtH(d.minutos_programados)),
          escapeCsv(fmtH(d.minutos_tiempo_total)),
          d.minutos_desayuno,
          d.minutos_almuerzo,
          d.minutos_cafe,
          escapeCsv(fmtH(d.minutos_total_descansos)),
          escapeCsv(fmtH(d.minutos_efectivos)),
          escapeCsv(fmtH(d.minutos_tiempo_adicional)),
          escapeCsv(fmtH(d.minutos_tiempo_adicional_aprobado)),
          d.tardias,
          d.minutos_tardia,
          d.ausencias,
          d.jornadas_regularizadas,
        ]);
        csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
      } else if (tipo === "horas-jornadas") {
        const resHoras = await reportesRepo.obtenerReporteHorasJornadas(filtros);
        const headers = [
          "Fecha",
          "Colaborador",
          "Cédula",
          "Departamento",
          "Horario",
          "Hora Entrada",
          "Hora Salida",
          "Tiempo Total (min)",
          "Descansos (min)",
          "Desayuno (min)",
          "Almuerzo (min)",
          "Café (min)",
          "Tiempo Efectivo (min)",
          "Tiempo Adicional Detectado (min)",
          "Tiempo Adicional Aprobado (min)",
          "Estado Tiempo Adicional",
          "Estado Jornada",
        ];
        const rows = resHoras.items.map((d) => [
          escapeCsv(d.fecha_jornada),
          escapeCsv(d.empleado_nombre),
          escapeCsv(d.empleado_cedula),
          escapeCsv(d.departamento_nombre),
          escapeCsv(d.horario_nombre || "General"),
          escapeCsv(d.hora_entrada_calculo || "-"),
          escapeCsv(d.hora_salida_calculo || "-"),
          d.minutos_tiempo_total,
          d.minutos_total_descansos,
          d.minutos_desayuno,
          d.minutos_almuerzo,
          d.minutos_cafe,
          d.minutos_efectivos,
          d.minutos_tiempo_adicional,
          d.minutos_tiempo_adicional_aprobado,
          escapeCsv(d.estado_tiempo_adicional || "-"),
          escapeCsv(d.estado_jornada),
        ]);
        csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
      } else if (tipo === "incidencias") {
        const data = await reportesRepo.obtenerReporteIncidencias(filtros);
        const headers = [
          "Fecha",
          "Colaborador",
          "Cédula",
          "Departamento",
          "Tipo de Incidencia",
          "Minutos Afectados",
          "Estado",
          "Descripción",
          "Motivo Resolución",
          "Usuario Resolvió",
          "Fecha Resolución",
        ];
        const rows = data.map((d) => [
          escapeCsv(d.fecha_jornada),
          escapeCsv(d.empleado_nombre),
          escapeCsv(d.empleado_cedula),
          escapeCsv(d.departamento_nombre),
          escapeCsv(d.tipo_incidencia),
          d.minutos_afectados,
          escapeCsv(d.estado),
          escapeCsv(d.descripcion),
          escapeCsv(d.resolucion_motivo || "-"),
          escapeCsv(d.usuario_resolvio_nombre || "-"),
          escapeCsv(d.fecha_resolucion || "-"),
        ]);
        csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
      } else if (tipo === "solicitudes") {
        const data = await reportesRepo.obtenerReporteSolicitudes(filtros);
        const headers = [
          "Colaborador",
          "Cédula",
          "Departamento",
          "Tipo Solicitud",
          "Fecha Inicio",
          "Fecha Fin",
          "Minutos Solicitados",
          "Motivo",
          "Estado",
          "Aprobador",
          "Fecha Resolución",
          "Comentarios Decisión",
        ];
        const rows = data.map((d) => [
          escapeCsv(d.empleado_nombre),
          escapeCsv(d.empleado_cedula),
          escapeCsv(d.departamento_nombre),
          escapeCsv(d.tipo_solicitud),
          escapeCsv(d.fecha_inicio),
          escapeCsv(d.fecha_fin),
          d.minutos_solicitados,
          escapeCsv(d.motivo),
          escapeCsv(d.estado),
          escapeCsv(d.aprobador_nombre || "-"),
          escapeCsv(d.fecha_resolucion || "-"),
          escapeCsv(d.comentarios_resolucion || "-"),
        ]);
        csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
      } else if (tipo === "feriados") {
        const data = await reportesRepo.obtenerReporteFeriados(filtros);
        const headers = [
          "Fecha Feriado",
          "Descripción",
          "Tipo Feriado",
          "Trabajó en Feriado",
          "Colaborador",
          "Cédula",
          "Departamento",
          "Hora Entrada",
          "Hora Salida",
          "Tiempo Efectivo (min)",
        ];
        const rows = data.map((d) => [
          escapeCsv(d.fecha),
          escapeCsv(d.descripcion),
          escapeCsv(d.tipo_feriado),
          escapeCsv(d.trabajo_en_feriado ? "SÍ" : "NO"),
          escapeCsv(d.empleado_nombre || "-"),
          escapeCsv(d.empleado_cedula || "-"),
          escapeCsv(d.departamento_nombre || "-"),
          escapeCsv(d.hora_entrada_calculo || "-"),
          escapeCsv(d.hora_salida_calculo || "-"),
          d.minutos_efectivos,
        ]);
        csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
      } else if (tipo === "correcciones") {
        const data = await reportesRepo.obtenerReporteCorrecciones(filtros);
        const headers = [
          "Fecha Solicitud",
          "Colaborador",
          "Cédula",
          "Departamento",
          "Tipo Ajuste",
          "Marca Original Tipo",
          "Marca Original Timestamp",
          "Timestamp Propuesto",
          "Tipo Marca Propuesto",
          "Motivo",
          "Estado",
          "Solicitó",
          "Autorizó",
          "Fecha Resolución",
        ];
        const rows = data.map((d) => [
          escapeCsv(d.creado_en),
          escapeCsv(d.empleado_nombre),
          escapeCsv(d.empleado_cedula),
          escapeCsv(d.departamento_nombre),
          escapeCsv(d.tipo_ajuste),
          escapeCsv(d.marca_original_tipo),
          escapeCsv(d.marca_original_timestamp),
          escapeCsv(d.timestamp_propuesto),
          escapeCsv(d.tipo_marca_propuesto),
          escapeCsv(d.motivo),
          escapeCsv(d.estado),
          escapeCsv(d.usuario_solicito_nombre || "-"),
          escapeCsv(d.usuario_autorizo_nombre || "-"),
          escapeCsv(d.fecha_resolucion || "-"),
        ]);
        csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
      } else if (tipo === "auditoria") {
        const data = await reportesRepo.obtenerReporteAuditoria(filtros);
        const headers = [
          "Fecha/Hora",
          "Usuario",
          "Rol",
          "Acción",
          "Entidad Tipo",
          "Entidad ID",
          "Motivo",
          "IP Origen",
        ];
        const rows = data.map((d) => [
          escapeCsv(d.timestamp_evento),
          escapeCsv(d.usuario_nombre || "-"),
          escapeCsv(d.rol_actor || "-"),
          escapeCsv(d.accion),
          escapeCsv(d.entidad_tipo),
          escapeCsv(d.entidad_id || "-"),
          escapeCsv(d.motivo || "-"),
          escapeCsv(d.ip_origen || "-"),
        ]);
        csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
      } else {
        const err = new Error("Tipo de reporte no reconocido para exportación.");
        (err as any).statusCode = 400;
        throw err;
      }

      // Añadir UTF-8 BOM (0xEF, 0xBB, 0xBF) para soporte nativo en Excel con tildes y caracteres en español
      const bomBuffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(csvContent, "utf-8")]);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(bomBuffer);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
