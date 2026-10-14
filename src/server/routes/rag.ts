import { Router, Request, Response, NextFunction } from "express";
import type { RagQueryService } from "../rag/services/rag-service.js";
import type { IngestaRagService } from "../rag/services/ingesta-service.js";
import type { IRagRepository } from "../rag/domain/rag.types.js";

export function createRagRouter(
  ragQueryService: RagQueryService,
  ingestaRagService: IngestaRagService,
  ragRepo: IRagRepository,
  requireAuthMiddleware: any,
  csrfProtectionMiddleware: any,
  requirePermission: (codigo: string) => any,
  requireAnyPermission?: (...codigos: string[]) => any
): Router {
  const router = Router();

  const middlewareEstado = requireAnyPermission
    ? requireAnyPermission("RAG_ESTADO_VER", "RAG_CONSULTAR")
    : requirePermission("RAG_ESTADO_VER");

  /**
   * GET /api/rag/estado
   * Consulta el estado del corpus documental indexado y fuentes autorizadas activas.
   * Protegido por RAG_ESTADO_VER o RAG_CONSULTAR.
   */
  router.get(
    "/estado",
    requireAuthMiddleware,
    middlewareEstado,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const cantidad = await ragRepo.contarFragmentos(true);
        const docsActivos = await ragRepo.listarDocumentos({ soloActivos: true });

        return res.status(200).json({
          exito: true,
          datos: {
            documentos_activos_total: docsActivos.length,
            fragmentos_indexados: cantidad,
            documentos: docsActivos.map((d) => ({
              id: d.id,
              codigo: d.codigo,
              titulo: d.titulo,
              version: d.version,
              total_fragmentos: d.total_fragmentos,
              fecha_vigencia: d.fecha_vigencia,
            })),
            // Campos de compatibilidad hacia atrás
            documento_activo:
              docsActivos.length === 1
                ? docsActivos[0].titulo
                : `${docsActivos.length} documentos corporativos autorizados`,
            codigo_documento:
              docsActivos.length === 1 ? docsActivos[0].codigo : "CORPUS_POLITICAS",
            version: docsActivos.length === 1 ? docsActivos[0].version : "1.0",
            vigencia: "Vigente",
            indexado: cantidad > 0,
            modelo_generativo: "gemini-3.8-flash",
            modelo_embeddings: "gemini-embedding-2-preview",
          },
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * POST /api/rag/ingestar
   * Dispara o fuerza la ingesta y vectorización del corpus DTH-REG-001.
   * Protegido por RAG_DOCUMENTOS_ADMINISTRAR y CSRF.
   */
  router.post(
    "/ingestar",
    requireAuthMiddleware,
    requirePermission("RAG_DOCUMENTOS_ADMINISTRAR"),
    csrfProtectionMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const forzar = Boolean(req.body.forzar);
        const resultado = await ingestaRagService.asegurarCorpusIngestado(forzar);
        return res.status(200).json({
          exito: true,
          datos: resultado,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  /**
   * POST /api/rag/consultar
   * Punto de consulta RAG con lenguaje natural.
   * Protegido por RAG_CONSULTAR.
   */
  router.post(
    "/consultar",
    requireAuthMiddleware,
    requirePermission("RAG_CONSULTAR"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { pregunta } = req.body;

        if (!pregunta || typeof pregunta !== "string" || !pregunta.trim()) {
          const err = new Error("El campo 'pregunta' es obligatorio.");
          (err as any).statusCode = 400;
          (err as any).codigo = "PREGUNTA_REQUERIDA";
          return next(err);
        }

        const resultado = await ragQueryService.consultar(pregunta);

        return res.status(200).json({
          exito: true,
          datos: resultado,
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  return router;
}
