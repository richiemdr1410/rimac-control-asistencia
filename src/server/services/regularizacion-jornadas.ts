import type { IJornadasRepository, JornadaEntity } from "../repositories/interfaces/jornadas.js";
import type { IMarcasRepository } from "../repositories/interfaces/marcas.js";
import type { IIncidenciasRepository } from "../repositories/interfaces/incidencias.js";
import type { ICorreccionesMarcasRepository, CorreccionMarcaEntity } from "../repositories/interfaces/correcciones-marcas.js";
import type { IJefaturasRepository } from "../auth/repositories/interfaces/jefaturas.js";
import type { IAuditoriaRepository } from "../repositories/interfaces/auditoria.js";
import type { ISolicitudesRepository } from "../repositories/interfaces/solicitudes.js";
import type { IFeriadosRepository } from "../repositories/interfaces/feriados.js";
import { calcularJornadaDeterminista } from "./calculo-jornada.js";
import { getPool } from "../../db/index.js";
import type pg from "pg";

export interface ActorContext {
  usuario_id: string;
  empleado_id?: string | null;
  rol: string;
  username: string;
}

export class RegularizacionJornadasService {
  private pool: pg.Pool;

  constructor(
    private jornadasRepo: IJornadasRepository,
    private marcasRepo: IMarcasRepository,
    private incidenciasRepo: IIncidenciasRepository,
    private correccionesRepo: ICorreccionesMarcasRepository,
    private jefaturasRepo: IJefaturasRepository,
    private solicitudesRepo: ISolicitudesRepository,
    private feriadosRepo: IFeriadosRepository,
    private auditoriaRepo: IAuditoriaRepository,
    customPool?: pg.Pool
  ) {
    this.pool = customPool || getPool();
  }

  /**
   * Valida reglas ABAC para toma de decisiones jerárquicas o administrativas
   */
  async validarAutorizacionDecision(
    actor: ActorContext,
    empleadoIdDestino: string,
    fechaOperacion: string
  ): Promise<{ autorizada: boolean; motivoRechazo?: string; codigo?: string }> {
    // 1. Prohibición estricta de autoaprobación (aplica para TODOS los roles)
    if (actor.empleado_id && actor.empleado_id === empleadoIdDestino) {
      return {
        autorizada: false,
        codigo: "AUTOAPROBACION_NO_PERMITIDA",
        motivoRechazo:
          "No es posible aprobar o justificar una incidencia correspondiente a su propia jornada. Solicite la revisión de su jefatura directa o de otro responsable autorizado.",
      };
    }

    // 2. Administrador y Talento Humano tienen alcance organizacional general (sobre terceros)
    if (actor.rol === "ADMINISTRADOR" || actor.rol === "TALENTO_HUMANO") {
      return { autorizada: true };
    }

    // 3. Supervisor de Seguridad / Jefatura: Validar asignación de jefatura vigente en la fecha de la jornada
    if (actor.empleado_id) {
      const esJefeValido = await this.jefaturasRepo.esJefaturaValidaEnFecha(
        actor.empleado_id,
        empleadoIdDestino,
        fechaOperacion
      );

      if (esJefeValido) {
        return { autorizada: true };
      }
    }

    return {
      autorizada: false,
      codigo: "ALCANCE_NO_AUTORIZADO",
      motivoRechazo:
        "No tiene autorización para gestionar esta incidencia o marca para el colaborador en la fecha indicada.",
    };
  }

  /**
   * Recalcula determinísticamente una jornada preservando las marcas físicas y
   * aplicando correcciones aprobadas y/o salidas regularizadas.
   */
  async recalcularJornada(jornadaId: string): Promise<JornadaEntity> {
    const jornada = await this.jornadasRepo.obtenerPorId(jornadaId);
    if (!jornada) {
      throw new Error(`Jornada no encontrada con ID ${jornadaId}`);
    }

    // Listar marcas activas (respetando correcciones aprobadas de anulación o sustitución)
    const marcasActivas = await this.marcasRepo.listarMarcasActivasJornada(jornada.id);

    // Obtener solicitudes aprobadas vigentes para la fecha
    let solicitudesAprobadas: any[] = [];
    try {
      const sols = await this.solicitudesRepo.obtenerSolicitudesAprobadasEnRango(
        jornada.empleado_id,
        jornada.fecha_jornada,
        jornada.fecha_jornada
      );
      solicitudesAprobadas = sols.map((s) => ({
        tipo_solicitud: s.tipo_solicitud,
        fecha_inicio: s.fecha_inicio,
        fecha_fin: s.fecha_fin,
        fecha_hora_inicio: s.fecha_hora_inicio,
        fecha_hora_fin: s.fecha_hora_fin,
        minutos_solicitados: s.minutos_solicitados || 0,
      }));
    } catch (e) {
      // Ignorar si el repositorio no implementa la consulta o si no hay solicitudes
    }

    const esFeriado = await this.feriadosRepo.esFeriadoActivo(jornada.fecha_jornada);

    // Si tiene salida regularizada aprobada
    let salidaRegularizadaIso: string | undefined = undefined;
    if (jornada.es_salida_regularizada && jornada.hora_salida_calculo) {
      salidaRegularizadaIso = jornada.hora_salida_calculo;
    }

    const calculo = calcularJornadaDeterminista(marcasActivas, jornada.snapshot_horario, {
      solicitudesAprobadas,
      esFeriado,
      salidaRegularizadaIso,
    });

    const tieneEntrada = Boolean(calculo.hora_entrada_efectiva);
    const tieneSalida = Boolean(calculo.hora_salida_efectiva);

    let nuevoEstado = jornada.estado_jornada;
    if (jornada.es_salida_regularizada) {
      nuevoEstado = "REGULARIZADA" as any;
    } else if (tieneEntrada && tieneSalida) {
      nuevoEstado = "CERRADA_NORMAL";
    } else if (tieneEntrada && !tieneSalida) {
      nuevoEstado = "ABIERTA";
    }

    jornada.estado_jornada = nuevoEstado;
    jornada.resultados_derivados = {
      hora_entrada_efectiva: calculo.hora_entrada_efectiva,
      hora_salida_efectiva: calculo.hora_salida_efectiva,
      minutos_desayuno: calculo.minutos_desayuno,
      minutos_almuerzo: calculo.minutos_almuerzo,
      minutos_cafe: calculo.minutos_cafe,
      minutos_descansos: calculo.minutos_descansos,
      minutos_tiempo_total: calculo.minutos_tiempo_total,
      minutos_efectivos: calculo.minutos_efectivos,
      minutos_tardanza: calculo.minutos_tardanza,
      minutos_salida_anticipada: calculo.minutos_salida_anticipada,
      minutos_tiempo_adicional: calculo.minutos_tiempo_adicional,
      minutos_justificados_comp: calculo.minutos_justificados_comp,
      minutos_justificados_nocomp: 0,
      cumplimiento_porcentaje:
        jornada.snapshot_horario.minutos_esperados > 0
          ? Math.min(100, Math.round(((calculo.minutos_efectivos + calculo.minutos_justificados_comp) / jornada.snapshot_horario.minutos_esperados) * 100))
          : 0,
    };

    await this.jornadasRepo.actualizarJornada(jornada);
    return jornada;
  }

  /**
   * Regulariza una salida omitida utilizando la hora de salida programada del turno oficial.
   */
  async regularizarSalidaOmitida(
    jornadaId: string,
    actor: ActorContext,
    motivo: string
  ): Promise<{ jornada: JornadaEntity; mensaje: string }> {
    if (!motivo || motivo.trim().length === 0) {
      const err: any = new Error("El motivo de regularización es obligatorio.");
      err.statusCode = 400;
      err.codigo = "MOTIVO_REQUERIDO";
      throw err;
    }

    const jornada = await this.jornadasRepo.obtenerPorId(jornadaId);
    if (!jornada) {
      const err: any = new Error(`Jornada no encontrada con ID ${jornadaId}`);
      err.statusCode = 404;
      err.codigo = "JORNADA_NO_ENCONTRADA";
      throw err;
    }

    // Verificar que exista marca de entrada
    const marcas = await this.marcasRepo.listarMarcasActivasJornada(jornada.id);
    const marcaEntrada = marcas.find((m) => m.tipo_marca === "ENTRADA");
    if (!marcaEntrada) {
      const err: any = new Error("No se puede regularizar salida en una jornada sin marca de entrada registrada.");
      err.statusCode = 400;
      err.codigo = "ENTRADA_REQUERIDA";
      throw err;
    }

    // Verificar que no tenga ya una salida física
    const marcaSalida = marcas.find((m) => m.tipo_marca === "SALIDA");
    if (marcaSalida) {
      const err: any = new Error("La jornada ya cuenta con una marca física de salida.");
      err.statusCode = 400;
      err.codigo = "SALIDA_YA_EXISTE";
      throw err;
    }

    // Validar autorización ABAC (segregación de funciones y no autoaprobación)
    const validacion = await this.validarAutorizacionDecision(
      actor,
      jornada.empleado_id,
      jornada.fecha_jornada
    );

    if (!validacion.autorizada) {
      const error: any = new Error(validacion.motivoRechazo || "Operación no autorizada.");
      error.statusCode = 403;
      error.codigo = validacion.codigo || "ALCANCE_NO_AUTORIZADO";
      throw error;
    }

    // Construir la fecha/hora de salida programada oficial en formato ISO con zona horaria Costa Rica (-06:00)
    const [salidaH, salidaM] = jornada.snapshot_horario.hora_salida_programada.split(":");
    const horaSalidaIso = `${jornada.fecha_jornada}T${salidaH.padStart(2, "0")}:${salidaM.padStart(2, "0")}:00-06:00`;

    // Recalcular con la salida programada
    const calculo = calcularJornadaDeterminista(marcas, jornada.snapshot_horario, {
      salidaRegularizadaIso: horaSalidaIso,
    });

    const resultados = {
      hora_entrada_efectiva: marcaEntrada.timestamp_servidor,
      hora_salida_efectiva: horaSalidaIso,
      minutos_desayuno: calculo.minutos_desayuno,
      minutos_almuerzo: calculo.minutos_almuerzo,
      minutos_cafe: calculo.minutos_cafe,
      minutos_descansos: calculo.minutos_descansos,
      minutos_tiempo_total: calculo.minutos_tiempo_total,
      minutos_efectivos: calculo.minutos_efectivos,
      minutos_tardanza: calculo.minutos_tardanza,
      minutos_salida_anticipada: 0,
      minutos_tiempo_adicional: 0, // No reconocer horas extra
      minutos_justificados_comp: calculo.minutos_justificados_comp,
      minutos_justificados_nocomp: 0,
      cumplimiento_porcentaje:
        jornada.snapshot_horario.minutos_esperados > 0
          ? Math.min(100, Math.round(((calculo.minutos_efectivos + calculo.minutos_justificados_comp) / jornada.snapshot_horario.minutos_esperados) * 100))
          : 0,
    };

    // Actualizar jornada de forma transaccional con trazabilidad explícita de regularización
    await this.jornadasRepo.actualizarRegularizacionSalida(
      jornada.id,
      horaSalidaIso,
      actor.usuario_id,
      resultados,
      "REGULARIZADA" as any
    );

    // Resolver cualquier incidencia abierta de SALIDA_OMITIDA asociada
    const incidenciaSalida = await this.incidenciasRepo.obtenerAbiertaPorJornadaYTipo(
      jornada.id,
      "SALIDA_OMITIDA"
    );

    if (incidenciaSalida) {
      await this.incidenciasRepo.resolverIncidencia(
        incidenciaSalida.id,
        "REGULARIZADA",
        actor.usuario_id,
        `Salida regularizada formalmente por ${actor.username}. Motivo: ${motivo}`
      );
    }

    // Registrar auditoría inmutable
    await this.auditoriaRepo.registrarEvento({
      accion: "APROBAR_REGULARIZACION_SALIDA",
      actor_usuario_id: actor.usuario_id,
      rol_actor: actor.rol || "USUARIO",
      entidad_tipo: "jornadas",
      entidad_id: jornada.id,
      motivo,
      valor_anterior: {
        estado_jornada: jornada.estado_jornada,
        hora_salida_calculo: jornada.hora_salida_calculo,
      },
      valor_nuevo: {
        estado_jornada: "REGULARIZADA",
        hora_salida_calculo: horaSalidaIso,
        origen_salida_calculo: "SALIDA_PROGRAMADA_REGULARIZADA",
        motivo,
      },
    });

    const jornadaActualizada = await this.jornadasRepo.obtenerPorId(jornada.id);

    return {
      jornada: jornadaActualizada!,
      mensaje: "Salida regularizada con éxito utilizando el horario oficial programado.",
    };
  }

  /**
   * Solicita una corrección administrativa sobre una marca física existente
   */
  async solicitarCorreccionMarca(
    marcaOriginalId: string,
    tipoAjuste: "ANULACION_LOGICA" | "SUSTITUCION_TIMESTAMP" | "SUSTITUCION_TIPO",
    motivo: string,
    actor: ActorContext,
    propuesto?: {
      timestamp_propuesto?: string;
      tipo_marca_propuesto?: any;
    }
  ): Promise<CorreccionMarcaEntity> {
    if (!motivo || motivo.trim().length === 0) {
      const err: any = new Error("El motivo de la solicitud de corrección es obligatorio.");
      err.statusCode = 400;
      err.codigo = "MOTIVO_REQUERIDO";
      throw err;
    }

    const marca = await this.marcasRepo.obtenerPorId(marcaOriginalId);
    if (!marca) {
      const err: any = new Error("La marca seleccionada no existe");
      err.statusCode = 404;
      err.codigo = "MARCA_NO_ENCONTRADA";
      throw err;
    }

    // Regla de acceso EMPLEADO: solo puede solicitar correcciones sobre sus propias marcas
    if (actor.rol === "EMPLEADO" && actor.empleado_id && actor.empleado_id !== marca.empleado_id) {
      const err: any = new Error("No tiene autorización para solicitar correcciones sobre marcas de terceros.");
      err.statusCode = 403;
      err.codigo = "ALCANCE_NO_AUTORIZADO";
      throw err;
    }

    // Verificar que no exista otra corrección pendiente sobre la misma marca
    const pendiente = await this.correccionesRepo.obtenerPendientePorMarcaId(marcaOriginalId);
    if (pendiente) {
      const err: any = new Error("Ya existe una corrección pendiente para esta marca");
      err.statusCode = 409;
      err.codigo = "CORRECCION_PENDIENTE_EXISTENTE";
      throw err;
    }

    const creada = await this.correccionesRepo.crear({
      marca_original_id: marcaOriginalId,
      tipo_ajuste: tipoAjuste,
      timestamp_propuesto: propuesto?.timestamp_propuesto || null,
      tipo_marca_propuesto: propuesto?.tipo_marca_propuesto || null,
      motivo,
      usuario_solicito_id: actor.usuario_id,
    });

    // Auditoría
    await this.auditoriaRepo.registrarEvento({
      accion: "SOLICITAR_CORRECCION_MARCA",
      actor_usuario_id: actor.usuario_id,
      rol_actor: actor.rol || "USUARIO",
      entidad_tipo: "correcciones_marcas",
      entidad_id: creada.id,
      motivo,
      valor_nuevo: {
        marca_original_id: marcaOriginalId,
        tipo_ajuste: tipoAjuste,
        motivo,
        timestamp_propuesto: propuesto?.timestamp_propuesto,
        tipo_marca_propuesto: propuesto?.tipo_marca_propuesto,
      },
    });

    return creada;
  }

  /**
   * Decide (aprueba o rechaza) una solicitud de corrección de marca con control ABAC
   */
  async decidirCorreccionMarca(
    correccionId: string,
    decision: "APROBAR" | "RECHAZAR",
    actor: ActorContext
  ): Promise<{ correccion: CorreccionMarcaEntity; mensaje: string }> {
    const correccion = await this.correccionesRepo.obtenerDetallePorId(correccionId);
    if (!correccion) {
      const err: any = new Error(`Corrección no encontrada con ID ${correccionId}`);
      err.statusCode = 404;
      err.codigo = "CORRECCION_NO_ENCONTRADA";
      throw err;
    }

    if (correccion.estado !== "PENDIENTE") {
      const err: any = new Error(`No se permite modificar una corrección de marca ya resuelta con estado ${correccion.estado}`);
      err.statusCode = 400;
      err.codigo = "ESTADO_INVALIDO";
      throw err;
    }

    // Validar control ABAC
    const validacion = await this.validarAutorizacionDecision(
      actor,
      correccion.empleado_id,
      correccion.fecha_jornada
    );

    if (!validacion.autorizada) {
      const error: any = new Error(validacion.motivoRechazo || "Operación no autorizada.");
      error.statusCode = 403;
      error.codigo = validacion.codigo || "ALCANCE_NO_AUTORIZADO";
      throw error;
    }

    const nuevoEstado = decision === "APROBAR" ? "APROBADA" : "RECHAZADA";

    const resuelta = await this.correccionesRepo.decidirCorreccion(
      correccionId,
      nuevoEstado,
      actor.usuario_id
    );

    // Auditoría
    await this.auditoriaRepo.registrarEvento({
      accion: decision === "APROBAR" ? "APROBAR_CORRECCION_MARCA" : "RECHAZAR_CORRECCION_MARCA",
      actor_usuario_id: actor.usuario_id,
      rol_actor: actor.rol || "USUARIO",
      entidad_tipo: "correcciones_marcas",
      entidad_id: correccionId,
      valor_anterior: { estado: "PENDIENTE" },
      valor_nuevo: { estado: nuevoEstado, usuario_autorizo_id: actor.usuario_id },
    });

    // Si fue aprobada, recalcular inmediatamente la jornada asociada
    if (decision === "APROBAR") {
      await this.recalcularJornada(correccion.jornada_id);
    }

    return {
      correccion: resuelta,
      mensaje: decision === "APROBAR" ? "Corrección aprobada y jornada recalculada con éxito." : "Corrección rechazada formalmente.",
    };
  }
}
