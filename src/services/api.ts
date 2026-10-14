/**
 * Cliente API Centralizado para el MVP de Control de Asistencia RIMAC
 * Garantiza:
 * - CSRF Token en memoria
 * - Idempotency-Key (UUIDv4) por acción intencional
 * - Reintento controlado transparente ante CSRF_INVALIDO (conservando misma clave y payload)
 * - Mapeo de errores y códigos técnicos a mensajes comprensibles
 */

export interface ApiErrorPayload {
  codigo: string;
  mensaje: string;
  titulo?: string;
  detalles?: Record<string, string[]>;
  timestamp?: string;
  status: number;
}

export class AppApiError extends Error {
  public readonly codigo: string;
  public readonly mensaje: string;
  public readonly titulo?: string;
  public readonly detalles?: Record<string, string[]>;
  public readonly status: number;
  public readonly timestamp?: string;

  constructor(payload: ApiErrorPayload) {
    super(payload.mensaje);
    this.name = "AppApiError";
    this.codigo = payload.codigo;
    this.mensaje = payload.mensaje;
    this.titulo = payload.titulo;
    this.detalles = payload.detalles;
    this.status = payload.status;
    this.timestamp = payload.timestamp;
    Object.setPrototypeOf(this, AppApiError.prototype);
  }
}

// Almacén en memoria del token CSRF (nunca localStorage)
let inMemoryCsrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token;
}

export function getCsrfToken(): string | null {
  return inMemoryCsrfToken;
}

// Respaldo de sesión en memoria y sessionStorage para compatibilidad con iframes en Preview AI Studio
let inMemorySessionId: string | null = (() => {
  try {
    return sessionStorage.getItem("rimac_sid");
  } catch {
    return null;
  }
})();

export function setSessionId(sid: string | null): void {
  inMemorySessionId = sid;
  try {
    if (sid) {
      sessionStorage.setItem("rimac_sid", sid);
    } else {
      sessionStorage.removeItem("rimac_sid");
    }
  } catch {}
}

export function getSessionId(): string | null {
  if (!inMemorySessionId) {
    try {
      inMemorySessionId = sessionStorage.getItem("rimac_sid");
    } catch {}
  }
  return inMemorySessionId;
}

type AuthLostListener = () => void;
const authLostListeners: Set<AuthLostListener> = new Set();

export function onAuthLost(listener: AuthLostListener): () => void {
  authLostListeners.add(listener);
  return () => {
    authLostListeners.delete(listener);
  };
}

function notifyAuthLost(): void {
  authLostListeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

/**
 * Traduce códigos de error técnicos a mensajes accesibles para el usuario
 */
export function getFriendlyErrorMessage(err: unknown): { titulo: string; descripcion: string; codigo?: string } {
  // Extraer información incluso si viene como string JSON o serializado en mensaje/response
  let parsedPayload: any = null;
  if (typeof err === "string") {
    try {
      parsedPayload = JSON.parse(err);
    } catch {}
  } else if (err && typeof err === "object") {
    if (typeof (err as any).message === "string" && (err as any).message.trim().startsWith("{")) {
      try {
        parsedPayload = JSON.parse((err as any).message);
      } catch {}
    }
    if (typeof (err as any).response?.data === "string" && (err as any).response.data.trim().startsWith("{")) {
      try {
        parsedPayload = JSON.parse((err as any).response.data);
      } catch {}
    }
    if (typeof (err as any).data === "string" && (err as any).data.trim().startsWith("{")) {
      try {
        parsedPayload = JSON.parse((err as any).data);
      } catch {}
    }
  }

  // Extraer código, status y mensaje de forma uniforme sin importar si es AppApiError, Error nativo u objeto
  const codigo =
    (err as any)?.codigo ||
    (err as any)?.code ||
    (err as any)?.error?.codigo ||
    (err as any)?.data?.error?.codigo ||
    (err as any)?.data?.codigo ||
    (err as any)?.response?.data?.error?.codigo ||
    (err as any)?.response?.data?.codigo ||
    parsedPayload?.error?.codigo ||
    parsedPayload?.codigo;

  const status =
    (err as any)?.status ||
    (err as any)?.statusCode ||
    (err as any)?.response?.status ||
    parsedPayload?.status;

  const mensajeDirecto =
    (err as any)?.mensaje ||
    (err as any)?.message ||
    (err as any)?.error?.mensaje ||
    (err as any)?.data?.error?.mensaje ||
    (err as any)?.data?.mensaje ||
    (err as any)?.response?.data?.error?.mensaje ||
    (err as any)?.response?.data?.mensaje ||
    parsedPayload?.error?.mensaje ||
    parsedPayload?.mensaje;

  const tituloDirecto =
    (err as any)?.titulo ||
    (err as any)?.error?.titulo ||
    (err as any)?.data?.error?.titulo ||
    (err as any)?.data?.titulo ||
    (err as any)?.response?.data?.error?.titulo ||
    (err as any)?.response?.data?.titulo ||
    parsedPayload?.error?.titulo ||
    parsedPayload?.titulo;

  switch (codigo) {
    case "CREDENCIALES_INVALIDAS":
      return {
        titulo: "Credenciales inválidas",
        descripcion: "Usuario o contraseña incorrectos.",
        codigo: "CREDENCIALES_INVALIDAS",
      };
    case "USUARIO_INACTIVO":
      return {
        titulo: "Cuenta inactiva",
        descripcion: "Su cuenta se encuentra inactiva. Comuníquese con Recursos Humanos o el Departamento de TI.",
        codigo: "USUARIO_INACTIVO",
      };
    case "USUARIO_BLOQUEADO":
      return {
        titulo: "Cuenta bloqueada",
        descripcion: "Su cuenta se encuentra bloqueada. Comuníquese con el Departamento de TI.",
        codigo: "USUARIO_BLOQUEADO",
      };
    case "EMPLEADO_INACTIVO":
      return {
        titulo: "Empleado inactivo",
        descripcion: "Su acceso está deshabilitado porque su expediente laboral se encuentra inactivo. Comuníquese con Recursos Humanos.",
        codigo: "EMPLEADO_INACTIVO",
      };
    case "SESION_EXPIRADA":
      return {
        titulo: "Sesión caducada",
        descripcion: "Su sesión de trabajo ha expirado por inactividad. Por favor ingrese de nuevo.",
        codigo,
      };
    case "SESION_INVALIDA":
      return {
        titulo: "Sesión inválida",
        descripcion: "La sesión actual no es válida o fue revocada. Inicie sesión nuevamente.",
        codigo,
      };
    case "ACCESO_DENEGADO":
    case "PERMISO_DENEGADO":
      return {
        titulo: tituloDirecto || "Permiso denegado",
        descripcion: mensajeDirecto || "No tiene permisos para realizar esta operación",
        codigo,
      };
    case "IDENTIFICADOR_INVALIDO":
      return {
        titulo: tituloDirecto || "Identificador no válido",
        descripcion: mensajeDirecto || "Seleccione un registro válido",
        codigo,
      };
    case "MARCA_NO_ENCONTRADA":
      return {
        titulo: tituloDirecto || "Marca no encontrada",
        descripcion: mensajeDirecto || "La marca seleccionada no existe",
        codigo,
      };
    case "AUTOAPROBACION_NO_PERMITIDA": {
      const esIncidencia =
        tituloDirecto?.toLowerCase().includes("incidencia") ||
        mensajeDirecto?.toLowerCase().includes("incidencia") ||
        (err as any)?.contexto === "incidencia" ||
        (err as any)?.tipo === "incidencia";

      const defaultTitulo = esIncidencia
        ? "No puede resolver su propia incidencia"
        : "No puede resolver su propia solicitud";

      const defaultDescripcion = esIncidencia
        ? "No es posible aprobar o justificar una incidencia correspondiente a su propia jornada. Solicite la revisión de su jefatura directa o de otro responsable autorizado."
        : "No es posible aprobar o rechazar una solicitud correspondiente a usted mismo. La solicitud debe ser revisada por su jefatura directa o por otro responsable autorizado según el flujo de aprobación.";

      return {
        titulo: tituloDirecto || defaultTitulo,
        descripcion: mensajeDirecto || defaultDescripcion,
        codigo: "AUTOAPROBACION_NO_PERMITIDA",
      };
    }
    case "ACCESO_NO_AUTORIZADO":
      return {
        titulo: tituloDirecto || "Acceso no autorizado",
        descripcion: mensajeDirecto || "No tiene autorización de jefatura sobre el colaborador solicitante.",
        codigo,
      };
    case "SOLICITUD_YA_RESUELTA":
      return {
        titulo: tituloDirecto || "Solicitud ya resuelta",
        descripcion: mensajeDirecto || "La solicitud ya se encuentra aprobada o rechazada.",
        codigo,
      };
    case "MOTIVO_RECHAZO_REQUERIDO":
      return {
        titulo: "Motivo de rechazo requerido",
        descripcion:
          mensajeDirecto || "El motivo o comentario de rechazo es estrictamente obligatorio según normativa laboral.",
        codigo,
      };
    case "ALCANCE_NO_AUTORIZADO":
      return {
        titulo: tituloDirecto || "Alcance no autorizado",
        descripcion: mensajeDirecto || "No tiene autorización para gestionar esta incidencia",
        codigo,
      };
    case "CORRECCION_PENDIENTE_EXISTENTE":
      return {
        titulo: tituloDirecto || "Corrección pendiente existente",
        descripcion: mensajeDirecto || "Ya existe una corrección pendiente para esta marca",
        codigo,
      };
    case "INCIDENCIA_NO_ENCONTRADA":
      return {
        titulo: tituloDirecto || "Incidencia no encontrada",
        descripcion: mensajeDirecto || "La incidencia especificada no existe",
        codigo,
      };
    case "JORNADA_NO_ENCONTRADA":
      return {
        titulo: tituloDirecto || "Jornada no encontrada",
        descripcion: mensajeDirecto || "La jornada especificada no existe",
        codigo,
      };
    case "JORNADA_YA_CERRADA":
      return {
        titulo: tituloDirecto || "Jornada ya finalizada",
        descripcion: mensajeDirecto || "La jornada ya se encuentra cerrada. No es posible registrar más marcas para el día de hoy.",
        codigo,
      };
    case "JORNADA_YA_ABIERTA":
      return {
        titulo: tituloDirecto || "Jornada ya iniciada",
        descripcion: mensajeDirecto || "Ya cuenta con una jornada abierta. No es posible registrar una nueva entrada.",
        codigo,
      };
    case "MOTIVO_REQUERIDO":
      return {
        titulo: "Motivo requerido",
        descripcion: mensajeDirecto || "El motivo de la solicitud o resolución es obligatorio.",
        codigo,
      };
    case "CSRF_INVALIDO":
      return {
        titulo: "Error de seguridad (CSRF)",
        descripcion: "El token de seguridad expiró o no coincide. Actualice la vista.",
        codigo,
      };
    case "EMPLEADO_NO_ENCONTRADO":
      return {
        titulo: "Colaborador no encontrado",
        descripcion: "No se localizó un colaborador activo con la cédula o código escaneado.",
        codigo,
      };
    case "COOLDOWN_MARCA_ACTIVO":
      return {
        titulo: "Registro en espera (Cooldown anti-rebote)",
        descripcion: "Debe esperar 60 segundos antes de emitir una marca sucesiva para este colaborador.",
        codigo,
      };
    case "IDEMPOTENCY_KEY_REUTILIZADA":
      return {
        titulo: "Conflicto de clave de idempotencia",
        descripcion: "Esta operación ya fue enviada con datos diferentes. Se generará una nueva solicitud.",
        codigo,
      };
    case "TRANSICION_MARCA_INVALIDA":
      return {
        titulo: "Secuencia de marca no válida",
        descripcion: mensajeDirecto || "La transición de marca solicitada no es permitida según el estado actual de la jornada.",
        codigo,
      };
    case "USUARIO_SIN_EMPLEADO_VINCULADO":
      return {
        titulo: "Sin perfil de empleado",
        descripcion: "Su cuenta de usuario no tiene un colaborador vinculado para registrar autoservicio.",
        codigo,
      };
    case "ARCHIVO_REQUERIDO":
      return {
        titulo: "Archivo requerido",
        descripcion: mensajeDirecto || "Debe seleccionar un archivo PDF para continuar.",
        codigo,
      };
    case "CODIGO_DOCUMENTO_REQUERIDO":
      return {
        titulo: "Código requerido",
        descripcion: mensajeDirecto || "El código documental es obligatorio (ej. DTH-REG-001).",
        codigo,
      };
    case "TITULO_DOCUMENTO_REQUERIDO":
      return {
        titulo: "Título requerido",
        descripcion: mensajeDirecto || "El título del documento es obligatorio.",
        codigo,
      };
    case "VERSION_DOCUMENTO_REQUERIDA":
      return {
        titulo: "Versión requerida",
        descripcion: mensajeDirecto || "La versión del documento es obligatoria (ej. 1.0, 2.0).",
        codigo,
      };
    case "ARCHIVO_VACIO":
      return {
        titulo: "Archivo vacío",
        descripcion: mensajeDirecto || "El archivo cargado se encuentra vacío (0 bytes).",
        codigo,
      };
    case "ARCHIVO_DEMASIADO_GRANDE":
      return {
        titulo: "Archivo demasiado grande",
        descripcion: mensajeDirecto || "El archivo supera el tamaño máximo permitido de 15 MB.",
        codigo,
      };
    case "FORMATO_INVALIDO":
      return {
        titulo: "Formato no permitido",
        descripcion: mensajeDirecto || "Solo se admiten documentos con extensión .pdf.",
        codigo,
      };
    case "PDF_CORRUPTO_O_INVALIDO":
      return {
        titulo: "PDF inválido",
        descripcion: mensajeDirecto || "El archivo no es un documento PDF válido o su estructura binaria está corrupta.",
        codigo,
      };
    case "PDF_SIN_TEXTO_EXTRAIBLE":
      return {
        titulo: "Sin texto extraíble",
        descripcion: mensajeDirecto || "El archivo PDF no contiene texto digital extraíble (posible documento escaneado). Esta versión no dispone de OCR.",
        codigo,
      };
    case "VERSION_YA_EXISTE":
      return {
        titulo: "Versión existente",
        descripcion: mensajeDirecto || "Ya existe una versión con ese identificador para este código documental.",
        codigo,
      };
    case "DOCUMENTO_NO_ENCONTRADO":
      return {
        titulo: "Documento no encontrado",
        descripcion: mensajeDirecto || "El documento solicitado no existe en el sistema.",
        codigo,
      };
    case "DOCUMENTO_NO_LISTO":
      return {
        titulo: "Documento no listo",
        descripcion: mensajeDirecto || "El documento no puede activarse porque aún no se encuentra en estado LISTO.",
        codigo,
      };
    case "ERROR_PROCESAMIENTO_RAG":
      return {
        titulo: "Error de procesamiento",
        descripcion: mensajeDirecto || "Ocurrió un error durante la vectorización o indexación del documento.",
        codigo,
      };
    case "ARCHIVO_NO_REGISTRADO":
    case "ARCHIVO_ORIGINAL_NO_DISPONIBLE":
      return {
        titulo: "Archivo original no disponible",
        descripcion: mensajeDirecto || "El archivo original no se encuentra disponible en el almacenamiento persistente.",
        codigo,
      };
    case "FECHA_VIGENCIA_INVALIDA":
      return {
        titulo: "Fecha de vigencia no válida",
        descripcion: mensajeDirecto || "La fecha de vigencia no es una fecha válida de calendario. Utilice AAAA-MM-DD o DD/MM/AAAA.",
        codigo,
      };
    case "DOCUMENTO_ACTIVO_NO_ELIMINABLE":
      return {
        titulo: "Documento activo",
        descripcion: mensajeDirecto || "No es posible eliminar un documento que se encuentra activo en consultas RAG. Debe desactivarlo primero.",
        codigo,
      };
    case "MOTIVO_ELIMINACION_REQUERIDO":
      return {
        titulo: "Motivo requerido",
        descripcion: mensajeDirecto || "Debe proporcionar una justificación o motivo explícito para la eliminación del documento.",
        codigo,
      };
    case "PARAMETRO_NO_PERMITIDO":
      return {
        titulo: "Parámetro no permitido",
        descripcion: "El canal de autoservicio solo permite el tipo de marca. Los datos de identidad son derivados automáticamente.",
        codigo,
      };
    case "RESPUESTA_NO_JSON":
    case "RESPUESTA_INVALIDA":
    case "SERVICIO_NO_DISPONIBLE":
    case "CONEXION_RECHAZADA":
    case "HTTP_500":
    case "HTTP_502":
    case "HTTP_503":
    case "HTTP_504":
      return {
        titulo: "Servicio no disponible",
        descripcion: "No fue posible conectar con el sistema. Inténtelo nuevamente o comuníquese con el Departamento de TI.",
        codigo: codigo || "SERVICIO_NO_DISPONIBLE",
      };
    default:
      if (status === 401) {
        return {
          titulo: "Credenciales inválidas",
          descripcion: "Usuario o contraseña incorrectos.",
          codigo: "CREDENCIALES_INVALIDAS",
        };
      }
      if (status === 403) {
        return {
          titulo: tituloDirecto || "Acceso denegado",
          descripcion: mensajeDirecto || "Su cuenta no cuenta con los permisos necesarios para realizar esta acción.",
          codigo: codigo || "HTTP_403",
        };
      }
      if (status && status >= 400 && status < 500) {
        return {
          titulo: tituloDirecto || (status === 404 ? "Registro no encontrado" : status === 409 ? "Conflicto" : "Atención"),
          descripcion: mensajeDirecto || "La solicitud no pudo ser procesada con los datos suministrados.",
          codigo: codigo || `HTTP_${status}`,
        };
      }
      return {
        titulo: tituloDirecto || "Servicio no disponible",
        descripcion: "No fue posible conectar con el sistema. Inténtelo nuevamente o comuníquese con el Departamento de TI.",
        codigo: codigo || "SERVICIO_NO_DISPONIBLE",
      };
  }
}

/**
 * Cliente HTTP seguro que administra cookies de sesión HttpOnly, CSRF e Idempotencia
 */
export async function apiRequest<T>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: any;
    idempotencyKey?: string;
    isRetry?: boolean;
  } = {}
): Promise<T> {
  const method = options.method || "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  if (options.body !== undefined && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  // Si tenemos sid disponible en memoria/sessionStorage, enviarlo como cabecera además de cookie
  const currentSid = getSessionId();
  if (currentSid) {
    headers["X-Session-Id"] = currentSid;
    headers["Authorization"] = `Bearer ${currentSid}`;
  }

  // Si es un método mutante, adjuntar CSRF token e Idempotency-Key
  if (method !== "GET") {
    if (!inMemoryCsrfToken && !endpoint.includes("/csrf")) {
      try {
        await renovarCsrfToken();
      } catch {}
    }
    if (inMemoryCsrfToken) {
      headers["X-CSRF-Token"] = inMemoryCsrfToken;
    }
    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method,
      headers,
      body:
        options.body !== undefined
          ? isFormData
            ? options.body
            : JSON.stringify(options.body)
          : undefined,
      credentials: "include", // asegura el envío de cookies HttpOnly en contexto de iframe
    });
  } catch (_netErr) {
    throw new AppApiError({
      status: 503,
      codigo: "SERVICIO_NO_DISPONIBLE",
      mensaje: "No fue posible conectar con el sistema. Inténtelo nuevamente o comuníquese con el Departamento de TI.",
    });
  }

  const contentType = response.headers.get("content-type") || "";
  let data: any = null;
  let rawBodyText = "";
  try {
    rawBodyText = await response.text();
    if (rawBodyText) {
      try {
        data = JSON.parse(rawBodyText);
      } catch {}
    }
  } catch {}

  if (data === null) {
    if (!response.ok && response.status === 403) {
      throw new AppApiError({
        status: 403,
        codigo: rawBodyText.includes("AUTOAPROBACION_NO_PERMITIDA")
          ? "AUTOAPROBACION_NO_PERMITIDA"
          : "ACCESO_DENEGADO",
        titulo: rawBodyText.includes("AUTOAPROBACION_NO_PERMITIDA")
          ? "No puede resolver su propia solicitud"
          : "Acceso denegado",
        mensaje: rawBodyText.includes("AUTOAPROBACION_NO_PERMITIDA")
          ? "No es posible aprobar o rechazar una solicitud correspondiente a usted mismo. La solicitud debe ser revisada por su jefatura directa o por otro responsable autorizado según el flujo de aprobación."
          : "Su cuenta no cuenta con los permisos necesarios para realizar esta acción.",
      });
    }

    if (contentType.includes("application/json")) {
      throw new AppApiError({
        status: response.status,
        codigo: "RESPUESTA_INVALIDA",
        mensaje: "No fue posible conectar con el sistema. Inténtelo nuevamente o comuníquese con el Departamento de TI.",
      });
    } else {
      throw new AppApiError({
        status: response.status,
        codigo: "RESPUESTA_NO_JSON",
        mensaje: "No fue posible conectar con el sistema. Inténtelo nuevamente o comuníquese con el Departamento de TI.",
      });
    }
  }

  // Capturar sesión retornada por cabecera o payload si aplica
  const headerSid = response.headers.get("x-session-id");
  if (headerSid) {
    setSessionId(headerSid);
  } else if (data?.datos?.sesion_id) {
    setSessionId(data.datos.sesion_id);
  }

  // Si el backend responde 401 NO_AUTENTICADO, limpiar credenciales y notificar a React
  // Excluir pre-sesión /login para no emitir eventos no deseados
  if (response.status === 401 && !endpoint.includes("/login")) {
    setSessionId(null);
    setCsrfToken(null);
    notifyAuthLost();
  }

  // Manejo de token CSRF inválido con un único reintento controlado
  if (
    response.status === 403 &&
    data?.error?.codigo === "CSRF_INVALIDO" &&
    !options.isRetry
  ) {
    try {
      const nuevoCsrf = await renovarCsrfToken();
      if (nuevoCsrf) {
        // Reintentar conservando exactamente la misma clave y payload
        return await apiRequest<T>(endpoint, {
          ...options,
          isRetry: true,
        });
      }
    } catch {
      // Si la renovación falla, se propaga el error
    }
  }

  if (!response.ok) {
    const errorData = data?.error;
    let codigoFinal =
      errorData?.codigo ||
      data?.codigo ||
      (response.status === 401 ? "CREDENCIALES_INVALIDAS" : `HTTP_${response.status}`);
    let mensajeFinal =
      errorData?.mensaje ||
      data?.mensaje ||
      response.statusText ||
      "Error en la petición";
    let tituloFinal = errorData?.titulo || data?.titulo;

    if (response.status === 403 && (codigoFinal === "AUTOAPROBACION_NO_PERMITIDA" || rawBodyText.includes("AUTOAPROBACION_NO_PERMITIDA"))) {
      codigoFinal = "AUTOAPROBACION_NO_PERMITIDA";
      tituloFinal = tituloFinal || "No puede resolver su propia solicitud";
      mensajeFinal =
        mensajeFinal ||
        "No es posible aprobar o rechazar una solicitud correspondiente a usted mismo. La solicitud debe ser revisada por su jefatura directa o por otro responsable autorizado según el flujo de aprobación.";
    }

    throw new AppApiError({
      status: response.status,
      codigo: codigoFinal,
      mensaje: mensajeFinal,
      titulo: tituloFinal,
      detalles: errorData?.detalles || data?.detalles,
      timestamp: errorData?.timestamp || data?.timestamp,
    });
  }

  if (data === null || typeof data !== "object") {
    throw new AppApiError({
      status: response.status,
      codigo: "RESPUESTA_INVALIDA",
      mensaje: "No fue posible conectar con el sistema. Inténtelo nuevamente o comuníquese con el Departamento de TI.",
    });
  }

  return data;
}

/**
 * Consulta y actualiza el token CSRF en memoria
 */
export async function renovarCsrfToken(): Promise<string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const currentSid = getSessionId();
  if (currentSid) {
    headers["X-Session-Id"] = currentSid;
    headers["Authorization"] = `Bearer ${currentSid}`;
  }

  const res = await fetch("/api/auth/csrf", {
    method: "GET",
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error("No se pudo obtener el token CSRF");
  }
  const json = await res.json();
  const token = json?.datos?.token_csrf || json?.token_csrf;
  if (token) {
    setCsrfToken(token);
    return token;
  }
  throw new Error("Respuesta de CSRF sin token válido");
}

// =========================================================================
// MÓDULO ADMINISTRACIÓN DOCUMENTAL RAG (FASE 3.2E)
// =========================================================================

export interface RagDocumentoDto {
  id: string;
  codigo: string;
  titulo: string;
  version: string;
  descripcion?: string | null;
  fecha_vigencia?: string | null;
  estado_procesamiento: "RECIBIDO" | "PROCESANDO" | "LISTO" | "ERROR";
  error_mensaje?: string | null;
  hash_archivo?: string | null;
  nombre_archivo_original?: string | null;
  ruta_almacenamiento?: string | null;
  tamano_bytes?: number | null;
  mime_type?: string | null;
  total_paginas: number;
  total_fragmentos: number;
  creado_por_id?: string | null;
  creado_por_nombre?: string | null;
  activo: boolean;
  activado_en?: string | null;
  activado_por_id?: string | null;
  activado_por_nombre?: string | null;
  creado_en: string;
  actualizado_en: string;
  archivo_disponible?: boolean;
}

export async function listarDocumentosRagAdmin(filtros?: {
  codigo?: string;
  activos?: boolean;
}): Promise<RagDocumentoDto[]> {
  const params = new URLSearchParams();
  if (filtros?.codigo) params.set("codigo", filtros.codigo);
  if (filtros?.activos !== undefined) params.set("activos", String(filtros.activos));
  const queryStr = params.toString() ? `?${params.toString()}` : "";
  const res = await apiRequest<{ exito: boolean; datos: RagDocumentoDto[] }>(
    `/api/admin/rag/documentos${queryStr}`
  );
  return res.datos || [];
}

export async function cargarDocumentoRagPdf(formData: FormData): Promise<{
  exito: boolean;
  mensaje: string;
  datos: RagDocumentoDto;
}> {
  return await apiRequest<{ exito: boolean; mensaje: string; datos: RagDocumentoDto }>(
    "/api/admin/rag/documentos",
    {
      method: "POST",
      body: formData,
    }
  );
}

export async function activarDocumentoRag(id: string): Promise<{
  exito: boolean;
  mensaje: string;
  datos: RagDocumentoDto;
}> {
  return await apiRequest<{ exito: boolean; mensaje: string; datos: RagDocumentoDto }>(
    `/api/admin/rag/documentos/${id}/activar`,
    {
      method: "PATCH",
    }
  );
}

export async function desactivarDocumentoRag(id: string): Promise<{
  exito: boolean;
  mensaje: string;
  datos: RagDocumentoDto;
}> {
  return await apiRequest<{ exito: boolean; mensaje: string; datos: RagDocumentoDto }>(
    `/api/admin/rag/documentos/${id}/desactivar`,
    {
      method: "PATCH",
    }
  );
}

export async function consultarEstadoDocumentoRag(id: string): Promise<{
  id: string;
  codigo: string;
  version: string;
  estado_procesamiento: "RECIBIDO" | "PROCESANDO" | "LISTO" | "ERROR";
  error_mensaje?: string | null;
  total_fragmentos: number;
  total_paginas: number;
  activo: boolean;
}> {
  const res = await apiRequest<{ exito: boolean; datos: any }>(
    `/api/admin/rag/documentos/${id}/estado`
  );
  return res.datos;
}

export async function descargarDocumentoRagOriginal(
  id: string,
  nombreDescarga: string
): Promise<void> {
  const headers: Record<string, string> = {};
  const currentSid = getSessionId();
  if (currentSid) {
    headers["X-Session-Id"] = currentSid;
    headers["Authorization"] = `Bearer ${currentSid}`;
  }

  const res = await fetch(`/api/admin/rag/documentos/${id}/descargar`, {
    method: "GET",
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    let msg = "No fue posible descargar el archivo.";
    try {
      const j = await res.json();
      msg = j.error?.mensaje || j.mensaje || msg;
    } catch {}
    throw new Error(msg);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreDescarga || `documento_${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function asociarArchivoOriginalRag(
  id: string,
  formData: FormData
): Promise<{
  exito: boolean;
  mensaje: string;
  datos: RagDocumentoDto;
}> {
  return await apiRequest<{ exito: boolean; mensaje: string; datos: RagDocumentoDto }>(
    `/api/admin/rag/documentos/${id}/asociar-archivo`,
    {
      method: "POST",
      body: formData,
    }
  );
}

export async function eliminarDocumentoRag(
  id: string,
  motivo: string
): Promise<{
  exito: boolean;
  mensaje: string;
  datos: { id: string; codigo: string; version: string; archivo_fisico_eliminado?: boolean };
}> {
  return await apiRequest<{
    exito: boolean;
    mensaje: string;
    datos: { id: string; codigo: string; version: string; archivo_fisico_eliminado?: boolean };
  }>(`/api/admin/rag/documentos/${id}`, {
    method: "DELETE",
    body: { motivo },
  });
}


