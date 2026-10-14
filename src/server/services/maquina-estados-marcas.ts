import type { MarcaEntity, TipoMarca } from "../repositories/interfaces/marcas.js";

export type EstadoDescanso = "CERRADO" | "EN_DESAYUNO" | "EN_ALMUERZO" | "EN_CAFE";

export interface EstadoActualJornada {
  tiene_jornada_abierta: boolean;
  estado_descanso: EstadoDescanso;
  tipo_descanso_abierto?: "DESAYUNO" | "ALMUERZO" | "CAFE";
}

/**
 * Inspecciona las marcas activas cronológicamente y determina el estado actual del descanso.
 */
export function obtenerEstadoDescanso(marcasActivas: MarcaEntity[]): EstadoActualJornada {
  const marcasOrdenadas = [...marcasActivas].sort((a, b) =>
    a.timestamp_servidor > b.timestamp_servidor ? 1 : -1
  );

  let estadoDescanso: EstadoDescanso = "CERRADO";
  let tipoAbierto: "DESAYUNO" | "ALMUERZO" | "CAFE" | undefined = undefined;

  for (const m of marcasOrdenadas) {
    switch (m.tipo_marca) {
      case "INICIO_DESAYUNO":
        estadoDescanso = "EN_DESAYUNO";
        tipoAbierto = "DESAYUNO";
        break;
      case "FIN_DESAYUNO":
        estadoDescanso = "CERRADO";
        tipoAbierto = undefined;
        break;
      case "INICIO_ALMUERZO":
        estadoDescanso = "EN_ALMUERZO";
        tipoAbierto = "ALMUERZO";
        break;
      case "FIN_ALMUERZO":
        estadoDescanso = "CERRADO";
        tipoAbierto = undefined;
        break;
      case "INICIO_CAFE":
        estadoDescanso = "EN_CAFE";
        tipoAbierto = "CAFE";
        break;
      case "FIN_CAFE":
        estadoDescanso = "CERRADO";
        tipoAbierto = undefined;
        break;
    }
  }

  return {
    tiene_jornada_abierta: true,
    estado_descanso: estadoDescanso,
    tipo_descanso_abierto: tipoAbierto,
  };
}

/**
 * Retorna la lista determinista de acciones de marca actualmente válidas
 * según el estado de la jornada y de los descansos.
 */
export function obtenerAccionesValidas(
  tieneJornadaAbierta: boolean,
  marcasActivasJornada: MarcaEntity[] = []
): TipoMarca[] {
  if (!tieneJornadaAbierta) {
    return ["ENTRADA"];
  }

  const { estado_descanso } = obtenerEstadoDescanso(marcasActivasJornada);

  if (estado_descanso === "EN_DESAYUNO") {
    return ["FIN_DESAYUNO"];
  }
  if (estado_descanso === "EN_ALMUERZO") {
    return ["FIN_ALMUERZO"];
  }
  if (estado_descanso === "EN_CAFE") {
    return ["FIN_CAFE"];
  }

  // Descanso CERRADO: puede iniciar cualquier descanso o marcar salida
  return ["INICIO_DESAYUNO", "INICIO_ALMUERZO", "INICIO_CAFE", "SALIDA"];
}

/**
 * Valida si la transición de marca es válida según las reglas deterministas de la máquina de estados.
 * Lanza un error operacional con código específico si la transición es inválida.
 */
export function validarTransicionMarca(
  tipoMarca: TipoMarca,
  jornadaAbierta: boolean,
  marcasActivasJornada: MarcaEntity[]
): void {
  // 1. Validar requerimiento de jornada abierta para marcas que no sean ENTRADA
  if (tipoMarca !== "ENTRADA" && !jornadaAbierta) {
    const err = new Error(`No se puede registrar ${tipoMarca} sin una jornada abierta.`);
    (err as any).statusCode = 422;
    (err as any).codigo = "TRANSICION_MARCA_INVALIDA";
    throw err;
  }

  // 2. Validar que no se intente una segunda ENTRADA con jornada abierta
  if (tipoMarca === "ENTRADA" && jornadaAbierta) {
    const err = new Error("El empleado ya cuenta con una jornada abierta.");
    (err as any).statusCode = 409;
    (err as any).codigo = "JORNADA_YA_ABIERTA";
    throw err;
  }

  if (tipoMarca === "ENTRADA") {
    return; // ENTRADA sin jornada abierta es válida
  }

  // Obtener estado actual de descansos dentro de la jornada
  const { estado_descanso, tipo_descanso_abierto } = obtenerEstadoDescanso(marcasActivasJornada);

  // 3. Validar descansos: INICIO_*
  if (tipoMarca === "INICIO_DESAYUNO" || tipoMarca === "INICIO_ALMUERZO" || tipoMarca === "INICIO_CAFE") {
    if (estado_descanso !== "CERRADO") {
      const err = new Error(
        `No se puede registrar ${tipoMarca} mientras exista otro descanso abierto (${tipo_descanso_abierto}).`
      );
      (err as any).statusCode = 422;
      (err as any).codigo = "TRANSICION_MARCA_INVALIDA";
      throw err;
    }
    return;
  }

  // 4. Validar descansos: FIN_*
  if (tipoMarca === "FIN_DESAYUNO") {
    if (estado_descanso !== "EN_DESAYUNO") {
      const err = new Error("No se puede registrar FIN_DESAYUNO sin un INICIO_DESAYUNO previo abierto.");
      (err as any).statusCode = 422;
      (err as any).codigo = "TRANSICION_MARCA_INVALIDA";
      throw err;
    }
    return;
  }

  if (tipoMarca === "FIN_ALMUERZO") {
    if (estado_descanso !== "EN_ALMUERZO") {
      const err = new Error("No se puede registrar FIN_ALMUERZO sin un INICIO_ALMUERZO previo abierto.");
      (err as any).statusCode = 422;
      (err as any).codigo = "TRANSICION_MARCA_INVALIDA";
      throw err;
    }
    return;
  }

  if (tipoMarca === "FIN_CAFE") {
    if (estado_descanso !== "EN_CAFE") {
      const err = new Error("No se puede registrar FIN_CAFE sin un INICIO_CAFE previo abierto.");
      (err as any).statusCode = 422;
      (err as any).codigo = "TRANSICION_MARCA_INVALIDA";
      throw err;
    }
    return;
  }

  // 5. Validar SALIDA: no debe haber descanso abierto
  if (tipoMarca === "SALIDA") {
    if (estado_descanso !== "CERRADO") {
      const err = new Error(
        `No se puede registrar SALIDA mientras el descanso (${tipo_descanso_abierto}) permanezca abierto.`
      );
      (err as any).statusCode = 422;
      (err as any).codigo = "TRANSICION_MARCA_INVALIDA";
      throw err;
    }
    return;
  }
}
