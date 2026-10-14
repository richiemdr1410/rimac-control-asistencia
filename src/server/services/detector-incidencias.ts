import type { IJornadasRepository, JornadaEntity } from "../repositories/interfaces/jornadas.js";
import type { IMarcasRepository, MarcaEntity, TipoMarca } from "../repositories/interfaces/marcas.js";
import type { IIncidenciasRepository, IncidenciaEntity, TipoIncidencia } from "../repositories/interfaces/incidencias.js";
import type { IAuditoriaRepository } from "../repositories/interfaces/auditoria.js";
import { getZonedTimeParts, parseHoraAMinutos } from "../utils/timezone.js";
import { getPool } from "../../db/index.js";
import type pg from "pg";

export interface IncidenciaDetectada {
  tipo: TipoIncidencia;
  descripcion: string;
  minutos_afectados: number;
}

export class DetectorIncidenciasService {
  private pool: pg.Pool;

  constructor(
    private jornadasRepo: IJornadasRepository,
    private marcasRepo: IMarcasRepository,
    private incidenciasRepo: IIncidenciasRepository,
    private auditoriaRepo: IAuditoriaRepository,
    customPool?: pg.Pool
  ) {
    this.pool = customPool || getPool();
  }

  /**
   * Obtiene el valor configurable de minutos de gracia para salida omitida
   */
  async obtenerMinutosGraciaSalidaOmitida(): Promise<number> {
    try {
      const res = await this.pool.query(
        `SELECT valor FROM configuraciones_sistema WHERE clave = 'MINUTOS_GRACIA_SALIDA_OMITIDA' LIMIT 1;`
      );
      if (res.rows.length > 0 && res.rows[0].valor) {
        const val = parseInt(res.rows[0].valor, 10);
        if (!isNaN(val) && val >= 0) return val;
      }
    } catch (err) {
      console.warn("[DetectorIncidencias] Error consultando configuracion de gracia, usando fallback 120:", err);
    }
    return 120;
  }

  /**
   * Evalúa determinísticamente si una jornada específica presenta anomalías o incidencias
   */
  async analizarJornada(
    jornada: JornadaEntity,
    ahoraZonedIso?: string
  ): Promise<IncidenciaDetectada[]> {
    const marcas = await this.marcasRepo.listarMarcasActivasJornada(jornada.id);
    const snapshot = jornada.snapshot_horario;
    const minutosGracia = await this.obtenerMinutosGraciaSalidaOmitida();
    const incidencias: IncidenciaDetectada[] = [];

    const ahora = ahoraZonedIso ? new Date(ahoraZonedIso) : new Date();
    const ahoraParts = getZonedTimeParts(ahora.toISOString());

    // 1. Evaluación de ENTRADA
    const marcaEntrada = marcas.find((m) => m.tipo_marca === "ENTRADA");

    // Construir tiempo de salida programada esperado
    const [progSalidaH, progSalidaM] = snapshot.hora_salida_programada.split(":").map(Number);
    const fechaJornadaParts = jornada.fecha_jornada.split("-").map(Number);
    // Salida programada en hora Costa Rica
    const salidaProgramadaFecha = new Date(
      Date.UTC(fechaJornadaParts[0], fechaJornadaParts[1] - 1, fechaJornadaParts[2], progSalidaH + 6, progSalidaM)
    );

    const margenDeteccionSalidaMs = salidaProgramadaFecha.getTime() + minutosGracia * 60 * 1000;

    // 2. SALIDA_OMITIDA:
    // Existe entrada pero no salida, no está ya regularizada, y el tiempo actual ha superado
    // la hora_salida_programada + MINUTOS_GRACIA_SALIDA_OMITIDA
    const marcaSalida = marcas.find((m) => m.tipo_marca === "SALIDA");

    if (marcaEntrada && !marcaSalida && !jornada.es_salida_regularizada) {
      if (ahora.getTime() >= margenDeteccionSalidaMs) {
        incidencias.push({
          tipo: "SALIDA_OMITIDA",
          descripcion: `Jornada del ${jornada.fecha_jornada} con marca de entrada pero sin registro de salida tras superar el margen de ${minutosGracia} minutos posteriores a la hora programada (${snapshot.hora_salida_programada}).`,
          minutos_afectados: snapshot.minutos_esperados,
        });
      }
    }

    // 3. ENTRADA_OMITIDA:
    // Existen marcas intermedias o salida pero no hay marca de entrada
    if (!marcaEntrada && marcas.length > 0) {
      incidencias.push({
        tipo: "ENTRADA_OMITIDA",
        descripcion: `Se detectaron eventos de marcación en la jornada ${jornada.fecha_jornada} sin una marca de entrada inicial.`,
        minutos_afectados: snapshot.minutos_esperados,
      });
    }

    // 4. MARCA_DUPLICADA:
    // Marcas consecutivas del mismo tipo con diferencia menor a 3 minutos
    for (let i = 0; i < marcas.length - 1; i++) {
      const actual = marcas[i];
      const siguiente = marcas[i + 1];
      if (actual.tipo_marca === siguiente.tipo_marca) {
        const diffMs = Math.abs(
          new Date(siguiente.timestamp_servidor).getTime() - new Date(actual.timestamp_servidor).getTime()
        );
        if (diffMs < 3 * 60 * 1000) {
          incidencias.push({
            tipo: "MARCA_DUPLICADA",
            descripcion: `Doble marcación detectada del tipo ${actual.tipo_marca} en un intervalo de ${Math.round(diffMs / 1000)} segundos.`,
            minutos_afectados: 0,
          });
        }
      }
    }

    // 5. PAUSA_SIN_CIERRE:
    // Pausas abiertas sin cierre (desayuno, almuerzo, café)
    const paresPausas: Array<[TipoMarca, TipoMarca, string]> = [
      ["INICIO_DESAYUNO", "FIN_DESAYUNO", "Desayuno"],
      ["INICIO_ALMUERZO", "FIN_ALMUERZO", "Almuerzo"],
      ["INICIO_CAFE", "FIN_CAFE", "Café"],
    ];

    for (const [inicio, fin, nombrePausa] of paresPausas) {
      const mInicio = marcas.find((m) => m.tipo_marca === inicio);
      const mFin = marcas.find((m) => m.tipo_marca === fin);
      if (mInicio && !mFin) {
        // Si ya hay salida o ha pasado mucho tiempo
        if (marcaSalida || ahora.getTime() - new Date(mInicio.timestamp_servidor).getTime() > 120 * 60 * 1000) {
          incidencias.push({
            tipo: "PAUSA_SIN_CIERRE",
            descripcion: `Pausa de ${nombrePausa} iniciada a las ${mInicio.timestamp_servidor} no cuenta con evento de cierre registrado.`,
            minutos_afectados: 30,
          });
        }
      }
    }

    // 6. SECUENCIA_ANORMAL:
    // Marcación de fin de descanso sin inicio de descanso, o salida antes de entrada
    for (const [inicio, fin, nombrePausa] of paresPausas) {
      const mInicio = marcas.find((m) => m.tipo_marca === inicio);
      const mFin = marcas.find((m) => m.tipo_marca === fin);
      if (mFin && !mInicio) {
        incidencias.push({
          tipo: "SECUENCIA_ANORMAL",
          descripcion: `Registro de fin de ${nombrePausa} sin haberse registrado previamente el inicio del descanso.`,
          minutos_afectados: 15,
        });
      }
    }

    // 6.1 Múltiples desayunos, múltiples almuerzos, múltiples cafés (Fase 4B)
    const initsDesayuno = marcas.filter((m) => m.tipo_marca === "INICIO_DESAYUNO");
    if (initsDesayuno.length > 1) {
      incidencias.push({
        tipo: "SECUENCIA_ANORMAL",
        descripcion: `Múltiples registros de inicio de Desayuno detectados en la misma jornada (${initsDesayuno.length} registros).`,
        minutos_afectados: 15,
      });
    }

    const initsAlmuerzo = marcas.filter((m) => m.tipo_marca === "INICIO_ALMUERZO");
    if (initsAlmuerzo.length > 1) {
      incidencias.push({
        tipo: "SECUENCIA_ANORMAL",
        descripcion: `Múltiples registros de inicio de Almuerzo detectados en la misma jornada (${initsAlmuerzo.length} registros).`,
        minutos_afectados: 30,
      });
    }

    const initsCafe = marcas.filter((m) => m.tipo_marca === "INICIO_CAFE");
    if (initsCafe.length > 1) {
      incidencias.push({
        tipo: "SECUENCIA_ANORMAL",
        descripcion: `Múltiples registros de inicio de Café detectados en la misma jornada (${initsCafe.length} registros).`,
        minutos_afectados: 15,
      });
    }

    // 6.2 Pausas registradas antes de ENTRADA o después de SALIDA (secuencia inconsistente)
    if (marcaEntrada) {
      const entradaMs = new Date(marcaEntrada.timestamp_servidor).getTime();
      const pausasPrevias = marcas.filter(
        (m) => m.tipo_marca !== "ENTRADA" && new Date(m.timestamp_servidor).getTime() < entradaMs
      );
      if (pausasPrevias.length > 0) {
        incidencias.push({
          tipo: "SECUENCIA_ANORMAL",
          descripcion: `Registro de descanso (${pausasPrevias[0].tipo_marca}) efectuado antes de la marca de ENTRADA oficial.`,
          minutos_afectados: 0,
        });
      }
    }

    if (marcaSalida) {
      const salidaMs = new Date(marcaSalida.timestamp_servidor).getTime();
      const pausasPosteriores = marcas.filter(
        (m) => m.tipo_marca !== "SALIDA" && new Date(m.timestamp_servidor).getTime() > salidaMs
      );
      if (pausasPosteriores.length > 0) {
        incidencias.push({
          tipo: "SECUENCIA_ANORMAL",
          descripcion: `Registro de descanso (${pausasPosteriores[0].tipo_marca}) efectuado posterior a la marca de SALIDA oficial.`,
          minutos_afectados: 0,
        });
      }
    }

    // 6.3 Pausas superpuestas y duraciones de pausas
    interface IntervaloPausa {
      nombre: string;
      tipoPausa: "DESAYUNO" | "ALMUERZO" | "CAFE";
      inicioMs: number;
      finMs: number;
      duracionMin: number;
    }
    const intervalos: IntervaloPausa[] = [];

    for (const [iniTipo, finTipo, nombre] of paresPausas) {
      const mInis = marcas.filter((m) => m.tipo_marca === iniTipo);
      const mFins = marcas.filter((m) => m.tipo_marca === finTipo);
      const tipoP: "DESAYUNO" | "ALMUERZO" | "CAFE" = iniTipo.includes("DESAYUNO")
        ? "DESAYUNO"
        : iniTipo.includes("ALMUERZO")
        ? "ALMUERZO"
        : "CAFE";

      for (let i = 0; i < mInis.length; i++) {
        const finMarca = mFins[i];
        if (finMarca) {
          const iniMs = new Date(mInis[i].timestamp_servidor).getTime();
          const finMs = new Date(finMarca.timestamp_servidor).getTime();
          const durMin = Math.round((finMs - iniMs) / (60 * 1000));
          intervalos.push({
            nombre,
            tipoPausa: tipoP,
            inicioMs: iniMs,
            finMs: finMs,
            duracionMin: durMin,
          });

          // Evaluación de duración de cada descanso
          if (durMin > 120 || durMin < 0) {
            incidencias.push({
              tipo: "DURACION_ANOMALA",
              descripcion: `Duración anormalmente extensa en descanso de ${nombre}: ${durMin} minutos registrados.`,
              minutos_afectados: durMin > 0 ? durMin : 0,
            });
          } else if (tipoP === "DESAYUNO" && durMin > 15) {
            incidencias.push({
              tipo: "EXCESO_DESAYUNO",
              descripcion: `Duración de descanso de Desayuno excedió el tiempo reglamentario de 15 minutos: ${durMin} minutos registrados.`,
              minutos_afectados: durMin - 15,
            });
          } else if (tipoP === "ALMUERZO" && durMin > 30) {
            incidencias.push({
              tipo: "EXCESO_ALMUERZO",
              descripcion: `Duración de descanso de Almuerzo excedió el tiempo reglamentario de 30 minutos: ${durMin} minutos registrados.`,
              minutos_afectados: durMin - 30,
            });
          } else if (tipoP === "CAFE" && durMin > 15) {
            incidencias.push({
              tipo: "EXCESO_CAFE",
              descripcion: `Duración de descanso de Café excedió el tiempo reglamentario de 15 minutos: ${durMin} minutos registrados.`,
              minutos_afectados: durMin - 15,
            });
          }
        }
      }
    }

    // Detectar superposición entre intervalos de descanso
    for (let i = 0; i < intervalos.length; i++) {
      for (let j = i + 1; j < intervalos.length; j++) {
        const a = intervalos[i];
        const b = intervalos[j];
        if (a.inicioMs < b.finMs && b.inicioMs < a.finMs) {
          incidencias.push({
            tipo: "SECUENCIA_ANORMAL",
            descripcion: `Pausas superpuestas detectadas entre descanso de ${a.nombre} y descanso de ${b.nombre}.`,
            minutos_afectados: 15,
          });
        }
      }
    }

    // 7. DURACION_ANOMALA:
    // Jornada con duración efectiva mayor a 16 horas continuas o menor a 1 hora habiendo salida
    if (marcaEntrada && marcaSalida) {
      const durMs = new Date(marcaSalida.timestamp_servidor).getTime() - new Date(marcaEntrada.timestamp_servidor).getTime();
      const durHoras = durMs / (1000 * 60 * 60);
      if (durHoras > 16) {
        incidencias.push({
          tipo: "DURACION_ANOMALA",
          descripcion: `Duración de jornada excede las 16 horas continuas (${durHoras.toFixed(1)} horas registradas).`,
          minutos_afectados: Math.round(durHoras * 60),
        });
      } else if (durHoras < 0.25 && durHoras > 0) {
        incidencias.push({
          tipo: "DURACION_ANOMALA",
          descripcion: `Duración de jornada anormalmente corta (menos de 15 minutos entre entrada y salida).`,
          minutos_afectados: Math.round(durHoras * 60),
        });
      }
    }

    // 8. INCONSISTENCIA_HORARIO:
    // Jornada marcada en día no hábil sin turno programado o desfase extremo (> 4 horas de la entrada programada)
    if (marcaEntrada) {
      const zEntrada = getZonedTimeParts(marcaEntrada.timestamp_servidor);
      const minEntradaEfectiva = zEntrada.hour * 60 + zEntrada.minute;
      const minEntradaProg = parseHoraAMinutos(snapshot.hora_entrada_programada);
      const desfase = Math.abs(minEntradaEfectiva - minEntradaProg);
      if (desfase > 240) {
        incidencias.push({
          tipo: "INCONSISTENCIA_HORARIO",
          descripcion: `Desfase de marcación de entrada de ${Math.round(desfase / 60)} horas respecto a la hora programada (${snapshot.hora_entrada_programada}).`,
          minutos_afectados: desfase,
        });
      }
    }

    return incidencias;
  }

  /**
   * Ejecuta la detección determinista y almacena las incidencias en la base de datos sin duplicados.
   */
  async procesarJornada(
    jornada: JornadaEntity,
    actorId?: string,
    ahoraZonedIso?: string
  ): Promise<IncidenciaEntity[]> {
    const detectadas = await this.analizarJornada(jornada, ahoraZonedIso);
    const registradas: IncidenciaEntity[] = [];

    for (const d of detectadas) {
      // Verificar si ya existe una incidencia abierta idéntica
      const existente = await this.incidenciasRepo.obtenerAbiertaPorJornadaYTipo(
        jornada.id,
        d.tipo
      );

      if (!existente) {
        const creada = await this.incidenciasRepo.crear({
          jornada_id: jornada.id,
          empleado_id: jornada.empleado_id,
          tipo_incidencia: d.tipo,
          descripcion: d.descripcion,
          minutos_afectados: d.minutos_afectados,
          estado: "ABIERTA",
        });

        registradas.push(creada);

        // Registrar en auditoría inmutable
        await this.auditoriaRepo.registrarEvento({
          accion: "DETECTAR_INCIDENCIA",
          actor_usuario_id: actorId || null,
          rol_actor: "SISTEMA",
          entidad_tipo: "incidencias",
          entidad_id: creada.id,
          valor_nuevo: {
            tipo_incidencia: d.tipo,
            jornada_id: jornada.id,
            empleado_id: jornada.empleado_id,
            descripcion: d.descripcion,
          },
        });
      } else {
        registradas.push(existente);
      }
    }

    return registradas;
  }

  /**
   * Procesa todas las jornadas abiertas o activas para detección periódica
   */
  async procesarTodasJornadasAbiertas(actorId?: string): Promise<{ total: number; incidenciasGeneradas: number }> {
    const abiertas = await this.jornadasRepo.obtenerTodasJornadasAbiertas();
    let countIncidencias = 0;

    for (const j of abiertas) {
      const res = await this.procesarJornada(j, actorId);
      countIncidencias += res.length;
    }

    return {
      total: abiertas.length,
      incidenciasGeneradas: countIncidencias,
    };
  }
}
