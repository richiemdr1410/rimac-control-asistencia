import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { IEmpleadosRepository } from "../repositories/interfaces/empleados.js";
import type { IHorariosRepository } from "../repositories/interfaces/horarios.js";
import type { IJefaturasRepository } from "../auth/repositories/interfaces/jefaturas.js";
import type { IAuditoriaRepository } from "../repositories/interfaces/auditoria.js";
import type { IUsuariosRepository } from "../auth/repositories/interfaces/usuarios.js";
import type { ISesionesRepository } from "../auth/repositories/interfaces/sesiones.js";

export function createEmpleadosRouter(
  empleadosRepo: IEmpleadosRepository,
  horariosRepo: IHorariosRepository,
  jefaturasRepo: IJefaturasRepository,
  auditoriaRepo: IAuditoriaRepository,
  requireAuthMiddleware: any,
  csrfProtectionMiddleware: any,
  requirePermission: (codigo: string) => any,
  requireAnyPermission: (...codigos: string[]) => any,
  _usuariosRepo?: IUsuariosRepository,
  _sesionesRepo?: ISesionesRepository
): Router {
  const router = Router();
  router.use(requireAuthMiddleware);

  /**
   * GET /api/empleados
   * Listar colaboradores con datos organizacionales, horario vigente, jefatura y estado de cuenta de usuario.
   * Protegido por EMPLEADOS_VER.
   */
  router.get(
    "/",
    requirePermission("EMPLEADOS_VER"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { departamento_id, estado, termino } = req.query as Record<string, string>;
        const lista = await empleadosRepo.listar({
          departamento_id,
          estado,
          termino,
        });
        res.json({ exito: true, datos: lista });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/empleados/:id
   * Obtener expediente completo del colaborador (organización, historial de horarios, historial de jefaturas, usuario sí/no).
   * Protegido por EMPLEADOS_VER.
   */
  router.get(
    "/:id",
    requirePermission("EMPLEADOS_VER"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const empleado = await empleadosRepo.obtenerPorIdConRelaciones(req.params.id);
        if (!empleado) {
          const err = new Error("Colaborador no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }
        res.json({ exito: true, datos: empleado });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/empleados
   * Alta de colaborador. Admite alta simple o compuesta (datos + horario + jefatura).
   * Operación transaccional atómica con ROLLBACK ante cualquier fallo.
   * Protegido por EMPLEADOS_ADMINISTRAR y CSRF.
   */
  router.post(
    "/",
    requirePermission("EMPLEADOS_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          cedula,
          nombre_completo,
          correo_laboral,
          telefono,
          departamento_id,
          puesto_id,
          horario_id,
          fecha_inicio_horario,
          fecha_fin_horario,
          jefatura_empleado_id,
          fecha_inicio_jefatura,
          fecha_fin_jefatura,
        } = req.body;

        if (!cedula || !nombre_completo || !departamento_id || !puesto_id) {
          const err = new Error("Cédula, nombre completo, departamento y puesto son obligatorios.");
          (err as any).statusCode = 400;
          (err as any).codigo = "DATOS_INVALIDOS";
          return next(err);
        }

        const usuario = (req as any).usuario;
        const fechaHoy = new Date().toISOString().split("T")[0];

        const nuevo = await empleadosRepo.crearCompuesto({
          empleado: {
            cedula: cedula.trim(),
            nombre_completo: nombre_completo.trim(),
            correo_laboral: correo_laboral ? correo_laboral.trim() : undefined,
            telefono: telefono ? telefono.trim() : undefined,
            departamento_id,
            puesto_id,
          },
          horario: horario_id
            ? {
                horario_id,
                fecha_inicio: fecha_inicio_horario || fechaHoy,
                fecha_fin: fecha_fin_horario || undefined,
                usuario_asigno_id: usuario.id,
              }
            : undefined,
          jefatura: jefatura_empleado_id
            ? {
                jefatura_empleado_id,
                fecha_inicio: fecha_inicio_jefatura || fechaHoy,
                fecha_fin: fecha_fin_jefatura || undefined,
              }
            : undefined,
        });

        // Auditoría
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "CREAR_EMPLEADO",
          entidad_tipo: "empleados",
          entidad_id: nuevo.id,
          motivo: `Alta de colaborador ${nuevo.cedula} - ${nuevo.nombre_completo}`,
          valor_nuevo: nuevo,
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.status(201).json({
          exito: true,
          mensaje: "Colaborador creado correctamente.",
          acceso_sistema: "Acceso al sistema: pendiente de creación de usuario",
          datos: nuevo,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * PUT /api/empleados/:id
   * Actualizar datos organizacionales del colaborador.
   * Protegido por EMPLEADOS_ADMINISTRAR y CSRF.
   */
  router.put(
    "/:id",
    requirePermission("EMPLEADOS_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const actual = await empleadosRepo.obtenerPorId(id);
        if (!actual) {
          const err = new Error("Colaborador no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }

        const { nombre_completo, correo_laboral, telefono, departamento_id, puesto_id } = req.body;
        const actualizado = await empleadosRepo.actualizar(id, {
          nombre_completo,
          correo_laboral,
          telefono,
          departamento_id,
          puesto_id,
        });

        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "ACTUALIZAR_EMPLEADO",
          entidad_tipo: "empleados",
          entidad_id: id,
          valor_anterior: actual,
          valor_nuevo: actualizado,
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.json({ exito: true, datos: actualizado });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * PATCH /api/empleados/:id/estado
   * Baja lógica / reactivación. Conserva todas las marcas, jornadas, solicitudes, auditoría e historial.
   * Protegido por EMPLEADOS_ADMINISTRAR y CSRF.
   */
  router.patch(
    "/:id/estado",
    requirePermission("EMPLEADOS_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const { estado } = req.body;
        if (estado !== "ACTIVO" && estado !== "INACTIVO") {
          const err = new Error("El estado debe ser 'ACTIVO' o 'INACTIVO'.");
          (err as any).statusCode = 400;
          (err as any).codigo = "ESTADO_INVALIDO";
          return next(err);
        }

        const usuarioActor = (req as any).usuario;

        if (estado === "INACTIVO") {
          const resultado = await empleadosRepo.desactivarEmpleadoTransaccional(id);

          // 1. Auditoría: DESACTIVAR_EMPLEADO
          await auditoriaRepo.registrarEvento({
            actor_usuario_id: usuarioActor.id,
            rol_actor: usuarioActor.rol,
            accion: "DESACTIVAR_EMPLEADO",
            entidad_tipo: "empleados",
            entidad_id: id,
            motivo: "Baja administrativa del colaborador",
            valor_nuevo: { estado: "INACTIVO" },
            ip_origen: req.ip,
            user_agent: req.headers["user-agent"],
          });

          // 2. Si tenía usuario personal vinculado, registrar auditoría de usuario y revocación de sesiones
          if (resultado.usuarioDesactivadoId) {
            await auditoriaRepo.registrarEvento({
              actor_usuario_id: usuarioActor.id,
              rol_actor: usuarioActor.rol,
              accion: "DESACTIVAR_USUARIO_POR_BAJA_EMPLEADO",
              entidad_tipo: "usuarios",
              entidad_id: resultado.usuarioDesactivadoId,
              motivo: `Desactivación automática de cuenta de usuario por baja del colaborador ${id}`,
              valor_nuevo: { estado: "INACTIVO" },
              ip_origen: req.ip,
              user_agent: req.headers["user-agent"],
            });

            await auditoriaRepo.registrarEvento({
              actor_usuario_id: usuarioActor.id,
              rol_actor: usuarioActor.rol,
              accion: "REVOCAR_SESIONES_POR_BAJA",
              entidad_tipo: "sesiones",
              entidad_id: resultado.usuarioDesactivadoId,
              motivo: `Revocación inmediata de ${resultado.sesionesRevocadasCount || 0} sesiones activas por baja de colaborador`,
              valor_nuevo: { revocadas: true, sesiones_afectadas: resultado.sesionesRevocadasCount || 0 },
              ip_origen: req.ip,
              user_agent: req.headers["user-agent"],
            });
          }

          res.json({
            exito: true,
            mensaje: "Colaborador desactivado correctamente y cuenta vinculada deshabilitada.",
            datos: resultado.empleado,
          });
        } else {
          // Reactivación de únicamente el expediente
          const actualizado = await empleadosRepo.reactivarEmpleado(id);

          await auditoriaRepo.registrarEvento({
            actor_usuario_id: usuarioActor.id,
            rol_actor: usuarioActor.rol,
            accion: "REACTIVAR_EMPLEADO",
            entidad_tipo: "empleados",
            entidad_id: id,
            motivo: "Reactivación de expediente del colaborador (cuenta de acceso se mantiene inactiva)",
            valor_nuevo: { estado: "ACTIVO" },
            ip_origen: req.ip,
            user_agent: req.headers["user-agent"],
          });

          res.json({
            exito: true,
            mensaje: "Expediente del colaborador reactivado correctamente. Su acceso al sistema continúa inactivo hasta habilitación explícita por administrador.",
            datos: actualizado,
          });
        }
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/empleados/:id/horarios
   * Historial de asignaciones de horario del colaborador.
   * Protegido por HORARIOS_VER.
   */
  router.get(
    "/:id/horarios",
    requirePermission("HORARIOS_VER"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const historial = await horariosRepo.obtenerHistorialAsignaciones(req.params.id);
        res.json({ exito: true, datos: historial });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/empleados/:id/horarios
   * Asignar nuevo horario al colaborador con cierre automático de vigencia anterior.
   * Protegido por HORARIOS_ADMINISTRAR y CSRF.
   */
  router.post(
    "/:id/horarios",
    requirePermission("HORARIOS_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id: empleado_id } = req.params;
        const { horario_id, fecha_inicio, fecha_fin } = req.body;

        if (!horario_id || !fecha_inicio) {
          const err = new Error("El horario y la fecha de inicio son requeridos.");
          (err as any).statusCode = 400;
          (err as any).codigo = "DATOS_INVALIDOS";
          return next(err);
        }

        const usuario = (req as any).usuario;
        const asignacion = await horariosRepo.asignarHorarioConCierrePrevio({
          empleado_id,
          horario_id,
          fecha_inicio,
          fecha_fin,
          usuario_asigno_id: usuario.id,
        });

        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "ASIGNAR_HORARIO",
          entidad_tipo: "asignaciones_horario",
          entidad_id: asignacion.id,
          motivo: `Asignación de horario ${asignacion.horario_codigo} a empleado ${empleado_id} desde ${fecha_inicio}`,
          valor_nuevo: asignacion,
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.status(201).json({
          exito: true,
          mensaje: "Horario asignado correctamente con preservación de historial.",
          datos: asignacion,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/empleados/:id/jefatura
   * Jefatura vigente e historial de asignaciones del colaborador.
   * Protegido por EMPLEADOS_VER o JEFATURAS_ADMINISTRAR.
   */
  router.get(
    "/:id/jefatura",
    requireAnyPermission("EMPLEADOS_VER", "JEFATURAS_ADMINISTRAR"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id: empleado_id } = req.params;
        const vigente = await jefaturasRepo.obtenerJefaturaVigente(empleado_id);
        const historial = await jefaturasRepo.obtenerHistorialPorSubordinado(empleado_id);
        res.json({
          exito: true,
          datos: {
            vigente,
            historial,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/empleados/:id/jefatura
   * Asignar o cambiar jefatura directa con validación de ciclos jerárquicos y cierre de vigencia anterior.
   * Protegido por JEFATURAS_ADMINISTRAR y CSRF.
   */
  router.post(
    "/:id/jefatura",
    requirePermission("JEFATURAS_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id: subordinado_empleado_id } = req.params;
        const { jefatura_empleado_id, fecha_inicio, fecha_fin } = req.body;

        if (!jefatura_empleado_id || !fecha_inicio) {
          const err = new Error("La jefatura y la fecha de inicio son obligatorias.");
          (err as any).statusCode = 400;
          (err as any).codigo = "DATOS_INVALIDOS";
          return next(err);
        }

        const vigenteAntes = await jefaturasRepo.obtenerJefaturaVigente(subordinado_empleado_id);

        const asignacion = await jefaturasRepo.asignarJefaturaDirecta({
          subordinado_empleado_id,
          jefatura_empleado_id,
          fecha_inicio,
          fecha_fin,
        });

        const usuario = (req as any).usuario;
        const accionAuditoria = vigenteAntes ? "CAMBIAR_JEFATURA" : "ASIGNAR_JEFATURA";

        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: accionAuditoria,
          entidad_tipo: "asignaciones_jefatura",
          entidad_id: asignacion.id,
          motivo: `${vigenteAntes ? "Cambio" : "Asignación"} de jefatura directa a ${asignacion.jefatura_nombre} para colaborador ${asignacion.subordinado_nombre}`,
          valor_anterior: vigenteAntes || undefined,
          valor_nuevo: asignacion,
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.status(201).json({
          exito: true,
          mensaje: "Jefatura directa asignada con éxito.",
          datos: asignacion,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * PATCH /api/empleados/:id/jefatura/finalizar
   * Finalizar asignación de jefatura directa vigente del colaborador conservando el historial.
   * Protegido por JEFATURAS_ADMINISTRAR y CSRF.
   */
  router.patch(
    "/:id/jefatura/finalizar",
    requirePermission("JEFATURAS_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id: subordinado_empleado_id } = req.params;
        const { fecha_fin } = req.body || {};

        const vigente = await jefaturasRepo.obtenerJefaturaVigente(subordinado_empleado_id);
        if (!vigente) {
          const err = new Error("El colaborador no tiene una jefatura directa vigente asignada.");
          (err as any).statusCode = 404;
          (err as any).codigo = "RECURSO_NO_ENCONTRADO";
          return next(err);
        }

        const finalizada = await jefaturasRepo.finalizarAsignacionJefatura(vigente.id, fecha_fin);

        const usuario = (req as any).usuario;
        await auditoriaRepo.registrarEvento({
          actor_usuario_id: usuario.id,
          rol_actor: usuario.rol,
          accion: "FINALIZAR_JEFATURA",
          entidad_tipo: "asignaciones_jefatura",
          entidad_id: finalizada.id,
          motivo: `Finalización de asignación de jefatura para colaborador ${finalizada.subordinado_nombre}`,
          valor_anterior: vigente,
          valor_nuevo: finalizada,
          ip_origen: req.ip,
          user_agent: req.headers["user-agent"],
        });

        res.json({
          exito: true,
          mensaje: "Asignación de jefatura finalizada correctamente conservando el historial.",
          datos: finalizada,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
