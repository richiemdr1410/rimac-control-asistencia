import { randomUUID } from "node:crypto";
import type { IEmpleadosRepository } from "../repositories/interfaces/empleados.js";
import type { IHorariosRepository } from "../repositories/interfaces/horarios.js";
import type { IJornadasRepository, JornadaEntity } from "../repositories/interfaces/jornadas.js";
import type { IMarcasRepository, MarcaEntity, TipoMarca, OrigenMarca } from "../repositories/interfaces/marcas.js";
import type { IIdempotenciaRepository, RegistroIdempotenciaEntity } from "../repositories/interfaces/idempotencia.js";
import type { ISolicitudesRepository } from "../repositories/interfaces/solicitudes.js";
import type { IFeriadosRepository } from "../repositories/interfaces/feriados.js";
import { calcularJornadaDeterminista } from "../services/calculo-jornada.js";
import { validarTransicionMarca } from "../services/maquina-estados-marcas.js";
import { getZonedTimeParts } from "../utils/timezone.js";

export interface CoordinatedIdempotencyInput {
  docId: string;
  usuario_id: string;
  ruta_endpoint: string;
  idempotency_key: string;
  payload_hash: string;
}

export interface RegistrarMarcaInput {
  empleado_id: string;
  tipo_marca: TipoMarca;
  origen_marca: OrigenMarca;
  usuario_registrador_id: string;
  timestamp_servidor?: string; // Opcional para pruebas o inyección controlada, por defecto now()
  coordinacion_idempotencia?: CoordinatedIdempotencyInput;
}

export interface RegistrarMarcaOutput {
  marca: MarcaEntity;
  jornada: JornadaEntity;
  clasificacion_entrada?: "A_TIEMPO" | "TARDANZA";
}

export class RegistrarMarcaUseCase {
  constructor(
    private empleadosRepo: IEmpleadosRepository,
    private horariosRepo: IHorariosRepository,
    private jornadasRepo: IJornadasRepository,
    private marcasRepo: IMarcasRepository,
    private idempotenciaRepo?: IIdempotenciaRepository,
    private solicitudesRepo?: ISolicitudesRepository,
    private feriadosRepo?: IFeriadosRepository
  ) {}

  async ejecutar(input: RegistrarMarcaInput): Promise<RegistrarMarcaOutput> {
    const timestampActual = input.timestamp_servidor || new Date().toISOString();
    // Determinar la fecha operacional usando la zona horaria oficial (America/Costa_Rica)
    const zonedParts = getZonedTimeParts(timestampActual);
    const fechaCalendario = zonedParts.dateStr;

    // 1. Validar existencia y estado del empleado
    const empleado = await this.empleadosRepo.obtenerPorId(input.empleado_id);
    if (!empleado || empleado.estado !== "ACTIVO") {
      const err = new Error("Empleado no encontrado o inactivo.");
      (err as any).statusCode = 404;
      (err as any).codigo = "RECURSO_NO_ENCONTRADO";
      throw err;
    }

    // 2. Cooldown de 60 segundos anti-rebote (RF-EST-03, DEC-023)
    const ultimaMarca = await this.marcasRepo.obtenerUltimaMarcaEmpleado(input.empleado_id, timestampActual);
    if (ultimaMarca) {
      const deltaMs = new Date(timestampActual).getTime() - new Date(ultimaMarca.timestamp_servidor).getTime();
      if (deltaMs >= 0 && deltaMs < 60000) {
        const err = new Error("Cooldown activo: Debe esperar 60 segundos entre registros sucesivos.");
        (err as any).statusCode = 409;
        (err as any).codigo = "COOLDOWN_MARCA_ACTIVO";
        throw err;
      }
    }

    // 3. Ejecución bajo arquitectura PostgreSQL (Proveedor exclusivo)
    // Determinar jornada de hoy y posible jornada activa (hoy o turno nocturno de ayer)
    const jornadaHoy = await this.jornadasRepo.obtenerPorEmpleadoYFecha(input.empleado_id, fechaCalendario);
    let jornadaAbierta: JornadaEntity | null = null;
    if (jornadaHoy && jornadaHoy.estado_jornada === "ABIERTA") {
      jornadaAbierta = jornadaHoy;
    } else if (!jornadaHoy) {
      const ayerParts = getZonedTimeParts(new Date(new Date(timestampActual).getTime() - 24 * 60 * 60 * 1000).toISOString());
      const jornadaAyer = await this.jornadasRepo.obtenerPorEmpleadoYFecha(input.empleado_id, ayerParts.dateStr);
      if (jornadaAyer && jornadaAyer.estado_jornada === "ABIERTA") {
        jornadaAbierta = jornadaAyer;
      }
    }

    // Protección explícita para evitar segunda SALIDA o marcas sobre jornada cerrada
    if (input.tipo_marca !== "ENTRADA" && !jornadaAbierta) {
      if (jornadaHoy && jornadaHoy.estado_jornada !== "ABIERTA") {
        const err = new Error(
          input.tipo_marca === "SALIDA"
            ? "La jornada ya se encuentra cerrada. No es posible registrar una salida duplicada."
            : "La jornada ya se encuentra cerrada. No es posible registrar marcas sobre una jornada finalizada."
        );
        (err as any).statusCode = 409;
        (err as any).codigo = "JORNADA_YA_CERRADA";
        throw err;
      }
    }

    // Protección para evitar segunda ENTRADA si hoy ya tiene jornada
    if (input.tipo_marca === "ENTRADA") {
      if (jornadaHoy) {
        const err = new Error(
          jornadaHoy.estado_jornada === "ABIERTA"
            ? "El empleado ya cuenta con una jornada abierta."
            : "El empleado ya cuenta con una jornada cerrada para el día de hoy."
        );
        (err as any).statusCode = 409;
        (err as any).codigo = jornadaHoy.estado_jornada === "ABIERTA" ? "JORNADA_YA_ABIERTA" : "JORNADA_YA_CERRADA";
        throw err;
      }
      if (jornadaAbierta) {
        const err = new Error("El empleado ya cuenta con una jornada abierta.");
        (err as any).statusCode = 409;
        (err as any).codigo = "JORNADA_YA_ABIERTA";
        throw err;
      }
    }

    const marcasActivas = jornadaAbierta
      ? await this.marcasRepo.listarMarcasActivasJornada(jornadaAbierta.id)
      : [];

    validarTransicionMarca(input.tipo_marca, Boolean(jornadaAbierta), marcasActivas);

    // Consultar feriados y solicitudes aprobadas aplicables
    const esFeriado = this.feriadosRepo ? await this.feriadosRepo.esFeriadoActivo(fechaCalendario) : false;
    let solicitudesAprobadas: any[] = [];
    if (this.solicitudesRepo) {
      solicitudesAprobadas = await this.solicitudesRepo.obtenerSolicitudesAprobadasEnRango(
        input.empleado_id,
        fechaCalendario,
        fechaCalendario
      );
    }

    let jornada: JornadaEntity;
    let clasificacionEntrada: "A_TIEMPO" | "TARDANZA" | undefined;

    if (input.tipo_marca === "ENTRADA") {
      const asignacionHorario = await this.horariosRepo.obtenerHorarioVigenteEmpleado(
        input.empleado_id,
        fechaCalendario
      );
      if (!asignacionHorario || !asignacionHorario.detalleDia.es_laborable) {
        const err = new Error("El empleado no tiene un horario laboral programado para esta fecha.");
        (err as any).statusCode = 422;
        (err as any).codigo = "TRANSICION_MARCA_INVALIDA";
        throw err;
      }

      const { horario, detalleDia } = asignacionHorario;

      jornada = {
        id: randomUUID(),
        empleado_id: input.empleado_id,
        fecha_jornada: fechaCalendario,
        estado_jornada: "ABIERTA",
        snapshot_horario: {
          horario_id_origen: horario.id,
          hora_entrada_programada: detalleDia.hora_entrada || "08:00",
          hora_salida_programada: detalleDia.hora_salida || "17:00",
          tolerancia_minutos: horario.tolerancia_entrada_minutos,
          minutos_esperados: detalleDia.minutos_esperados,
          cruza_medianoche: detalleDia.cruza_medianoche,
        },
        resultados_derivados: {
          hora_entrada_efectiva: timestampActual,
          minutos_descansos: 0,
          minutos_efectivos: 0,
          minutos_justificados_comp: 0,
          minutos_justificados_nocomp: 0,
          minutos_tardanza: 0,
          minutos_salida_anticipada: 0,
          cumplimiento_porcentaje: 0,
        },
        creado_en: timestampActual,
        actualizado_en: timestampActual,
      };

      const nuevaMarca: MarcaEntity = {
        id: randomUUID(),
        jornada_id: jornada.id,
        empleado_id: input.empleado_id,
        tipo_marca: input.tipo_marca,
        timestamp_servidor: timestampActual,
        origen_marca: input.origen_marca,
        estado_marca: "ACTIVA",
        usuario_registrador_id: input.usuario_registrador_id,
        creado_en: timestampActual,
      };

      const calculo = calcularJornadaDeterminista([nuevaMarca], jornada.snapshot_horario, {
        solicitudesAprobadas,
        esFeriado,
      });
      clasificacionEntrada = calculo.minutos_tardanza > 0 ? "TARDANZA" : "A_TIEMPO";
      jornada.resultados_derivados.minutos_tardanza = calculo.minutos_tardanza;
      jornada.resultados_derivados.minutos_justificados_comp = calculo.minutos_justificados_comp;

      await this.jornadasRepo.crearJornada(jornada);
      await this.marcasRepo.crearMarca(nuevaMarca);

      if (input.coordinacion_idempotencia && this.idempotenciaRepo) {
        const registroIdem: RegistroIdempotenciaEntity = {
          id: input.coordinacion_idempotencia.docId,
          usuario_id: input.coordinacion_idempotencia.usuario_id,
          ruta_endpoint: input.coordinacion_idempotencia.ruta_endpoint,
          idempotency_key: input.coordinacion_idempotencia.idempotency_key,
          payload_hash: input.coordinacion_idempotencia.payload_hash,
          status_code: 201,
          response_body: {
            exito: true,
            datos: {
              marca: nuevaMarca,
              jornada,
              clasificacion_entrada: clasificacionEntrada,
            },
          },
          creado_en: timestampActual,
        };
        await this.idempotenciaRepo.guardar(registroIdem);
      }

      return {
        marca: nuevaMarca,
        jornada,
        clasificacion_entrada: clasificacionEntrada,
      };
    } else {
      jornada = jornadaAbierta!;

      const nuevaMarca: MarcaEntity = {
        id: randomUUID(),
        jornada_id: jornada.id,
        empleado_id: input.empleado_id,
        tipo_marca: input.tipo_marca,
        timestamp_servidor: timestampActual,
        origen_marca: input.origen_marca,
        estado_marca: "ACTIVA",
        usuario_registrador_id: input.usuario_registrador_id,
        creado_en: timestampActual,
      };

      await this.marcasRepo.crearMarca(nuevaMarca);

      if (input.tipo_marca === "SALIDA") {
        const todasMarcas = [...marcasActivas, nuevaMarca];
        const calculo = calcularJornadaDeterminista(todasMarcas, jornada.snapshot_horario, {
          solicitudesAprobadas,
          esFeriado,
        });

        const porcentaje =
          jornada.snapshot_horario.minutos_esperados > 0
            ? Math.min(
                100,
                Number(
                  (
                    ((calculo.minutos_efectivos + calculo.minutos_justificados_comp) /
                      jornada.snapshot_horario.minutos_esperados) *
                    100
                  ).toFixed(2)
                )
              )
            : 0;

        jornada.estado_jornada = "CERRADA_NORMAL";
        jornada.resultados_derivados = {
          ...jornada.resultados_derivados,
          ...calculo,
          cumplimiento_porcentaje: porcentaje,
        };
        jornada.actualizado_en = timestampActual;

        await this.jornadasRepo.actualizarJornada(jornada);
      }

      if (input.coordinacion_idempotencia && this.idempotenciaRepo) {
        const registroIdem: RegistroIdempotenciaEntity = {
          id: input.coordinacion_idempotencia.docId,
          usuario_id: input.coordinacion_idempotencia.usuario_id,
          ruta_endpoint: input.coordinacion_idempotencia.ruta_endpoint,
          idempotency_key: input.coordinacion_idempotencia.idempotency_key,
          payload_hash: input.coordinacion_idempotencia.payload_hash,
          status_code: 201,
          response_body: {
            exito: true,
            datos: {
              marca: nuevaMarca,
              jornada,
            },
          },
          creado_en: timestampActual,
        };
        await this.idempotenciaRepo.guardar(registroIdem);
      }

      return {
        marca: nuevaMarca,
        jornada,
      };
    }
  }
}
