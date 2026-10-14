import type { MarcaEntity, TipoMarca } from "../repositories/interfaces/marcas.js";
import { getZonedTimeParts, parseHoraAMinutos } from "../utils/timezone.js";

export interface SolicitudAprobadaContext {
  tipo_solicitud: string;
  fecha_inicio: string;
  fecha_fin: string;
  fecha_hora_inicio?: string | null;
  fecha_hora_fin?: string | null;
  minutos_solicitados: number;
}

export interface ResumenCalculoJornada {
  hora_entrada_efectiva?: string;
  hora_salida_efectiva?: string;
  minutos_desayuno: number;
  minutos_almuerzo: number;
  minutos_cafe: number;
  minutos_descansos: number;
  minutos_tiempo_total: number;
  minutos_efectivos: number;
  minutos_tardanza: number;
  minutos_salida_anticipada: number;
  minutos_tiempo_adicional: number;
  minutos_justificados_comp: number;
  minutos_no_justificados: number;
  clasificacion_tardanza?: "SIN_TARDANZA" | "TARDANZA_LEVE_MENOR_15" | "TARDANZA_MAYOR_15";
  es_feriado?: boolean;
  es_ausencia_justificada?: boolean;
}

/**
 * Motor determinista de cálculo de jornada sobre marcas ACTIVAS (RF-CALC-01, RF-TOL-01 a 03)
 * Evalúa los descansos independientes, duraciones efectivas, permisos aprobados y feriados
 * usando la zona horaria operacional oficial.
 */
export function calcularJornadaDeterminista(
  marcasActivas: MarcaEntity[],
  snapshot: {
    hora_entrada_programada: string;
    hora_salida_programada: string;
    tolerancia_minutos: number;
    minutos_esperados: number;
    cruza_medianoche: boolean;
  },
  opciones?: {
    solicitudesAprobadas?: SolicitudAprobadaContext[];
    esFeriado?: boolean;
    salidaRegularizadaIso?: string;
  }
): ResumenCalculoJornada {
  const entrada = marcasActivas.find((m) => m.tipo_marca === "ENTRADA");
  const salidaFisica = marcasActivas.find((m) => m.tipo_marca === "SALIDA");
  const salida: MarcaEntity | undefined = salidaFisica || (opciones?.salidaRegularizadaIso ? {
    id: "REGULARIZADA",
    empleado_id: entrada?.empleado_id || "",
    jornada_id: entrada?.jornada_id || "",
    tipo_marca: "SALIDA" as TipoMarca,
    timestamp_servidor: opciones.salidaRegularizadaIso,
    origen_marca: "CORRECCION_ADMINISTRATIVA",
    estado_marca: "ACTIVA",
    usuario_registrador_id: "SISTEMA",
    creado_en: opciones.salidaRegularizadaIso,
  } : undefined);

  // Cálculo individual y exacto de cada pausa real registrada
  let minutosDesayuno = 0;
  let minutosAlmuerzo = 0;
  let minutosCafe = 0;

  const paresDesayuno = marcasActivas.filter((m) => m.tipo_marca === "INICIO_DESAYUNO");
  const finesDesayuno = marcasActivas.filter((m) => m.tipo_marca === "FIN_DESAYUNO");
  for (let i = 0; i < paresDesayuno.length; i++) {
    const fin = finesDesayuno[i];
    if (fin) {
      const durMs = new Date(fin.timestamp_servidor).getTime() - new Date(paresDesayuno[i].timestamp_servidor).getTime();
      if (durMs > 0) minutosDesayuno += Math.floor(durMs / (1000 * 60));
    }
  }

  const paresAlmuerzo = marcasActivas.filter((m) => m.tipo_marca === "INICIO_ALMUERZO");
  const finesAlmuerzo = marcasActivas.filter((m) => m.tipo_marca === "FIN_ALMUERZO");
  for (let i = 0; i < paresAlmuerzo.length; i++) {
    const fin = finesAlmuerzo[i];
    if (fin) {
      const durMs = new Date(fin.timestamp_servidor).getTime() - new Date(paresAlmuerzo[i].timestamp_servidor).getTime();
      if (durMs > 0) minutosAlmuerzo += Math.floor(durMs / (1000 * 60));
    }
  }

  const paresCafe = marcasActivas.filter((m) => m.tipo_marca === "INICIO_CAFE");
  const finesCafe = marcasActivas.filter((m) => m.tipo_marca === "FIN_CAFE");
  for (let i = 0; i < paresCafe.length; i++) {
    const fin = finesCafe[i];
    if (fin) {
      const durMs = new Date(fin.timestamp_servidor).getTime() - new Date(paresCafe[i].timestamp_servidor).getTime();
      if (durMs > 0) minutosCafe += Math.floor(durMs / (1000 * 60));
    }
  }

  const minutosDescansos = minutosDesayuno + minutosAlmuerzo + minutosCafe;

  let minutosTiempoTotal = 0;
  let minutosEfectivos = 0;
  let minutosTardanza = 0;
  let minutosSalidaAnticipada = 0;
  let minutosTiempoAdicional = 0;
  let minutosJustificados = 0;
  let esAusenciaJustificada = false;

  const solicitudes = opciones?.solicitudesAprobadas || [];
  const esFeriado = Boolean(opciones?.esFeriado);

  // Evaluar solicitudes aprobadas de día completo (VACACIONES, JUSTIFICACION_AUSENCIA)
  for (const sol of solicitudes) {
    if (
      sol.tipo_solicitud === "VACACIONES" ||
      sol.tipo_solicitud === "JUSTIFICACION_AUSENCIA"
    ) {
      esAusenciaJustificada = true;
      minutosJustificados += Math.min(snapshot.minutos_esperados, sol.minutos_solicitados || snapshot.minutos_esperados);
    }
  }

  // Evaluar permisos parciales (PERMISO, JUSTIFICACION_TARDIA)
  let permisoInicioCubiertoHastaMin: number | null = null;
  for (const sol of solicitudes) {
    if (
      sol.tipo_solicitud === "PERMISO" ||
      sol.tipo_solicitud === "JUSTIFICACION_TARDIA" ||
      sol.tipo_solicitud === "PERMISO_CON_GOCE" ||
      sol.tipo_solicitud === "PERMISO_SIN_GOCE"
    ) {
      if (sol.fecha_hora_inicio && sol.fecha_hora_fin) {
        const zIni = getZonedTimeParts(sol.fecha_hora_inicio);
        const zFin = getZonedTimeParts(sol.fecha_hora_fin);
        const minIni = zIni.hour * 60 + zIni.minute;
        const minFin = zFin.hour * 60 + zFin.minute;
        const minProg = parseHoraAMinutos(snapshot.hora_entrada_programada);

        // Si el permiso cubre desde el inicio programado
        if (minIni <= minProg) {
          permisoInicioCubiertoHastaMin = Math.max(permisoInicioCubiertoHastaMin || 0, minFin);
          const duracionPermiso = Math.max(0, minFin - minProg);
          minutosJustificados += duracionPermiso;
        } else {
          // Permiso intermedio
          const duracion = Math.max(0, minFin - minIni);
          minutosJustificados += duracion;
        }
      } else if (sol.minutos_solicitados) {
        minutosJustificados += sol.minutos_solicitados;
      }
    }
  }

  if (entrada) {
    // Evaluar tardanza en zona horaria America/Costa_Rica
    const zonedEntrada = getZonedTimeParts(entrada.timestamp_servidor);
    const minutosEntradaEfectiva = zonedEntrada.hour * 60 + zonedEntrada.minute;
    const minutosEntradaProg = parseHoraAMinutos(snapshot.hora_entrada_programada);

    // Si había un permiso aprobado cubriendo el inicio:
    if (permisoInicioCubiertoHastaMin !== null) {
      // La entrada esperada se traslada al fin del permiso
      if (minutosEntradaEfectiva <= permisoInicioCubiertoHastaMin + snapshot.tolerancia_minutos) {
        // Entrada cubierta por el permiso aprobado: NO es tardanza injustificada
        minutosTardanza = 0;
      } else {
        // Excedió la hora del permiso
        minutosTardanza = minutosEntradaEfectiva - permisoInicioCubiertoHastaMin;
      }
    } else {
      const diferenciaEntrada = minutosEntradaEfectiva - minutosEntradaProg;
      // Regla de Tardanza (Requisito 10): a partir de cinco minutos después de la hora exacta de inicio
      if (diferenciaEntrada > snapshot.tolerancia_minutos) {
        minutosTardanza = diferenciaEntrada;
      }
    }
  }

  if (entrada && salida) {
    const tiempoBrutoMs = new Date(salida.timestamp_servidor).getTime() - new Date(entrada.timestamp_servidor).getTime();
    minutosTiempoTotal = Math.max(0, Math.floor(tiempoBrutoMs / (1000 * 60)));
    minutosEfectivos = Math.max(0, minutosTiempoTotal - minutosDescansos);

    // Evaluación de salida en zona horaria operacional
    const zonedSalida = getZonedTimeParts(salida.timestamp_servidor);
    const zonedEntrada = getZonedTimeParts(entrada.timestamp_servidor);

    let minutosSalidaEfectiva = zonedSalida.hour * 60 + zonedSalida.minute;
    let minutosSalidaProg = parseHoraAMinutos(snapshot.hora_salida_programada);

    if (snapshot.cruza_medianoche) {
      if (zonedSalida.dateStr > zonedEntrada.dateStr || minutosSalidaEfectiva < parseHoraAMinutos(snapshot.hora_entrada_programada)) {
        minutosSalidaEfectiva += 1440;
      }
      minutosSalidaProg += 1440;
    }

    if (minutosSalidaEfectiva < minutosSalidaProg) {
      minutosSalidaAnticipada = minutosSalidaProg - minutosSalidaEfectiva;
    } else if (minutosSalidaEfectiva > minutosSalidaProg) {
      minutosTiempoAdicional = minutosSalidaEfectiva - minutosSalidaProg;
    }
  }

  // Clasificación de tardanza (Requisito 10)
  let clasificacionTardanza: "SIN_TARDANZA" | "TARDANZA_LEVE_MENOR_15" | "TARDANZA_MAYOR_15" = "SIN_TARDANZA";
  if (minutosTardanza > 15) {
    clasificacionTardanza = "TARDANZA_MAYOR_15";
  } else if (minutosTardanza > 0) {
    clasificacionTardanza = "TARDANZA_LEVE_MENOR_15";
  }

  // Tiempo no justificado (si no cubrió los minutos esperados)
  const totalReconocido = minutosEfectivos + minutosJustificados;
  const minutosNoJustificados = Math.max(0, snapshot.minutos_esperados - totalReconocido);

  return {
    hora_entrada_efectiva: entrada ? entrada.timestamp_servidor : undefined,
    hora_salida_efectiva: salida ? salida.timestamp_servidor : undefined,
    minutos_desayuno: minutosDesayuno,
    minutos_almuerzo: minutosAlmuerzo,
    minutos_cafe: minutosCafe,
    minutos_descansos: minutosDescansos,
    minutos_tiempo_total: minutosTiempoTotal,
    minutos_efectivos: minutosEfectivos,
    minutos_tardanza: minutosTardanza,
    minutos_salida_anticipada: minutosSalidaAnticipada,
    minutos_tiempo_adicional: minutosTiempoAdicional,
    minutos_justificados_comp: minutosJustificados,
    minutos_no_justificados: minutosNoJustificados,
    clasificacion_tardanza: clasificacionTardanza,
    es_feriado: esFeriado,
    es_ausencia_justificada: esAusenciaJustificada,
  };
}
