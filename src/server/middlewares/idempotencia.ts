import { createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { IIdempotenciaRepository } from "../repositories/interfaces/idempotencia.js";

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

declare global {
  namespace Express {
    interface Request {
      idempotencyContext?: {
        docId: string;
        usuario_id: string;
        ruta_endpoint: string;
        idempotency_key: string;
        payload_hash: string;
      };
    }
  }
}

export function calcularPayloadHash(payload: any): string {
  if (!payload || typeof payload !== "object") {
    return createHash("sha256").update(String(payload || "")).digest("hex");
  }
  const keys = Object.keys(payload).sort();
  const sortedObj: Record<string, any> = {};
  for (const k of keys) {
    sortedObj[k] = payload[k];
  }
  return createHash("sha256").update(JSON.stringify(sortedObj)).digest("hex");
}

export function createIdempotencyMiddleware(idempotenciaRepo: IIdempotenciaRepository) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const keyHeader = req.headers["idempotency-key"] as string | undefined;

      // 1. Validar presencia
      if (!keyHeader || !keyHeader.trim()) {
        const err = new Error("La cabecera Idempotency-Key es requerida.");
        (err as any).statusCode = 400;
        (err as any).codigo = "IDEMPOTENCY_KEY_REQUERIDA";
        return next(err);
      }

      const cleanKey = keyHeader.trim();

      // 2. Validar formato UUIDv4
      if (!UUID_V4_REGEX.test(cleanKey)) {
        const err = new Error("La cabecera Idempotency-Key debe tener formato UUIDv4 válido.");
        (err as any).statusCode = 400;
        (err as any).codigo = "IDEMPOTENCY_KEY_INVALIDA";
        return next(err);
      }

      // 3. Obtener identidad de la solicitud: (usuario_id, ruta_endpoint, Idempotency-Key)
      const usuario_id = req.auth?.usuario_id;
      if (!usuario_id) {
        const err = new Error("Sesión requerida para procesar solicitud con idempotencia.");
        (err as any).statusCode = 401;
        (err as any).codigo = "SESION_REQUERIDA";
        return next(err);
      }

      const ruta_endpoint = (req.originalUrl || req.baseUrl + req.path || req.path).split("?")[0];
      const payloadHash = calcularPayloadHash(req.body);

      // 4. Buscar registro existente
      const existente = await idempotenciaRepo.obtener(usuario_id, ruta_endpoint, cleanKey);
      if (existente) {
        if (existente.payload_hash === payloadHash) {
          // Misma clave + mismo payload: Devolver respuesta HTTP previamente almacenada sin re-ejecutar efectos
          return res.status(existente.status_code).json(existente.response_body);
        } else {
          // Misma clave + payload diferente: HTTP 409 IDEMPOTENCY_KEY_REUTILIZADA
          const err = new Error("La clave de idempotencia ya fue utilizada con un payload diferente.");
          (err as any).statusCode = 409;
          (err as any).codigo = "IDEMPOTENCY_KEY_REUTILIZADA";
          return next(err);
        }
      }

      // 5. Inyectar contexto para coordinación atómica en la capa de persistencia
      const docId = idempotenciaRepo.calcularIdDocumento(usuario_id, ruta_endpoint, cleanKey);
      req.idempotencyContext = {
        docId,
        usuario_id,
        ruta_endpoint,
        idempotency_key: cleanKey,
        payload_hash: payloadHash,
      };

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
