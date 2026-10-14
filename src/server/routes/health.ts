import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { checkDatabaseHealth } from "../../db/index.js";
import type { ApiSuccessResponse, ApiErrorResponse } from "../../../shared/contracts/common.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const storageHealth = await checkDatabaseHealth();
    const timestamp = new Date().toISOString();

    if (storageHealth.conectado) {
      const respuesta: ApiSuccessResponse<{
        estado: "OK";
        servidor: "OPERATIVO";
        persistencia: {
          adaptador: "POSTGRESQL";
          persistenceProvider: "postgres";
          estado: "CONECTADO";
          latencia_ms: number;
        };
      }> = {
        exito: true,
        datos: {
          estado: "OK",
          servidor: "OPERATIVO",
          persistencia: {
            adaptador: "POSTGRESQL",
            persistenceProvider: "postgres",
            estado: "CONECTADO",
            latencia_ms: storageHealth.latenciaMs ?? 0,
          },
        },
        meta: { timestamp },
      };
      res.status(200).json(respuesta);
    } else {
      const respuesta: ApiErrorResponse = {
        exito: false,
        error: {
          codigo: "SERVICIO_NO_DISPONIBLE",
          mensaje: "El servidor está operativo pero la base de datos PostgreSQL no está disponible.",
          detalles: {
            persistencia: [storageHealth.error || "Fallo de conexión a la base de datos PostgreSQL."],
          },
          timestamp,
        },
      };
      res.status(503).json(respuesta);
    }
  } catch (err) {
    next(err);
  }
});
