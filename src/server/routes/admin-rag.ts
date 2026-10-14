import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import type { IRagRepository } from "../rag/domain/rag.types.js";
import { type ProcesamientoDocumentalService, validarYNormalizarFechaVigencia } from "../rag/services/procesamiento-documental-service.js";
import type { IDocumentStorageService } from "../rag/storage/document-storage.js";
import type { IAuditoriaRepository } from "../repositories/interfaces/auditoria.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB
  },
});

export function createAdminRagRouter(
  ragRepo: IRagRepository,
  procesamientoService: ProcesamientoDocumentalService,
  storageService: IDocumentStorageService,
  auditoriaRepo: IAuditoriaRepository | undefined,
  requireAuth: any,
  csrfProtection: any,
  requirePermission: (codigo: string) => any
): Router {
  const router = Router();
  const permisoAdmin = requirePermission("RAG_DOCUMENTOS_ADMINISTRAR");

  /**
   * GET /api/admin/rag/documentos
   * Lista todos los documentos y versiones registradas con sus metadatos y estado.
   * Protegido por RAG_DOCUMENTOS_ADMINISTRAR.
   */
  router.get(
    "/documentos",
    requireAuth,
    permisoAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const codigo = req.query.codigo as string | undefined;
        const soloActivos = req.query.activos === "true";
        const docs = await ragRepo.listarDocumentos({ codigo, soloActivos });
        res.json({
          exito: true,
          datos: docs,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/admin/rag/documentos
   * Carga de documento PDF (multipart/form-data), almacenamiento persistente, extracción y vectorización.
   * Protegido por RAG_DOCUMENTOS_ADMINISTRAR y CSRF.
   */
  router.post(
    "/documentos",
    requireAuth,
    permisoAdmin,
    upload.single("archivo"),
    csrfProtection,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const file = req.file;
        if (!file) {
          const err = new Error("No se ha enviado ningún archivo en la solicitud. Debe seleccionar un archivo PDF.");
          (err as any).statusCode = 400;
          (err as any).codigo = "ARCHIVO_REQUERIDO";
          return next(err);
        }

        const { codigo, titulo, version, descripcion, fecha_vigencia } = req.body;

        if (!codigo || typeof codigo !== "string" || !codigo.trim()) {
          const err = new Error("El campo 'codigo' documental es obligatorio (ej. DTH-REG-001).");
          (err as any).statusCode = 400;
          (err as any).codigo = "CODIGO_DOCUMENTO_REQUERIDO";
          return next(err);
        }

        if (!titulo || typeof titulo !== "string" || !titulo.trim()) {
          const err = new Error("El campo 'titulo' del documento es obligatorio.");
          (err as any).statusCode = 400;
          (err as any).codigo = "TITULO_DOCUMENTO_REQUERIDO";
          return next(err);
        }

        if (!version || typeof version !== "string" || !version.trim()) {
          const err = new Error("El campo 'version' es obligatorio (ej. 1.0, 2.0).");
          (err as any).statusCode = 400;
          (err as any).codigo = "VERSION_DOCUMENTO_REQUERIDA";
          return next(err);
        }

        // Validación y normalización estricta de fecha_vigencia
        const fechaVigenciaNormalizada = validarYNormalizarFechaVigencia(fecha_vigencia);

        const actor = (req as any).usuario;

        const docProcesado = await procesamientoService.procesarDocumento({
          buffer: file.buffer,
          nombreOriginal: file.originalname || "documento.pdf",
          codigo: codigo.trim().toUpperCase(),
          titulo: titulo.trim(),
          version: version.trim(),
          descripcion: descripcion?.trim(),
          fechaVigencia: fechaVigenciaNormalizada || undefined,
          actor: {
            id: actor.id,
            rol: actor.rol,
            ip: req.ip,
            userAgent: req.headers["user-agent"],
          },
        });

        res.status(201).json({
          exito: true,
          mensaje: `Documento '${docProcesado.codigo}' v${docProcesado.version} procesado exitosamente (${docProcesado.total_fragmentos} fragmentos indexados). Permanece inactivo hasta su aprobación.`,
          datos: docProcesado,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/admin/rag/documentos/:id
   * Consulta el detalle y metadatos de un documento por su ID.
   * Protegido por RAG_DOCUMENTOS_ADMINISTRAR.
   */
  router.get(
    "/documentos/:id",
    requireAuth,
    permisoAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const doc = await ragRepo.obtenerDocumentoPorId(req.params.id);
        if (!doc) {
          const err = new Error("Documento no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "DOCUMENTO_NO_ENCONTRADO";
          return next(err);
        }

        res.json({
          exito: true,
          datos: doc,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/admin/rag/documentos/:id/estado
   * Consulta el estado de procesamiento del documento (RECIBIDO, PROCESANDO, LISTO, ERROR).
   * Protegido por RAG_DOCUMENTOS_ADMINISTRAR.
   */
  router.get(
    "/documentos/:id/estado",
    requireAuth,
    permisoAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const doc = await ragRepo.obtenerDocumentoPorId(req.params.id);
        if (!doc) {
          const err = new Error("Documento no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "DOCUMENTO_NO_ENCONTRADO";
          return next(err);
        }

        res.json({
          exito: true,
          datos: {
            id: doc.id,
            codigo: doc.codigo,
            version: doc.version,
            estado_procesamiento: doc.estado_procesamiento,
            error_mensaje: doc.error_mensaje,
            total_fragmentos: doc.total_fragmentos,
            total_paginas: doc.total_paginas,
            activo: doc.activo,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * PATCH /api/admin/rag/documentos/:id/activar
   * Activa la versión del documento para que participe en consultas RAG.
   * Desactiva automáticamente cualquier otra versión previa del mismo código documental.
   * Protegido por RAG_DOCUMENTOS_ADMINISTRAR y CSRF.
   */
  router.patch(
    "/documentos/:id/activar",
    requireAuth,
    permisoAdmin,
    csrfProtection,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const actor = (req as any).usuario;
        const docActivado = await ragRepo.activarDocumentoTransaccional(req.params.id, actor.id);

        if (auditoriaRepo) {
          await auditoriaRepo.registrarEvento({
            actor_usuario_id: actor.id,
            rol_actor: actor.rol,
            accion: "ACTIVAR_DOCUMENTO_RAG",
            entidad_tipo: "rag_documentos",
            entidad_id: docActivado.id,
            motivo: `Activación formal de versión '${docActivado.codigo}' v${docActivado.version} para consultas RAG`,
            valor_nuevo: {
              id: docActivado.id,
              codigo: docActivado.codigo,
              version: docActivado.version,
              activo: true,
              activado_en: docActivado.activado_en,
            },
            ip_origen: req.ip,
            user_agent: req.headers["user-agent"],
          }).catch((e) => console.warn("[Auditoria] Error:", e));
        }

        res.json({
          exito: true,
          mensaje: `Documento '${docActivado.codigo}' v${docActivado.version} activado exitosamente. Ahora está disponible para consultas de políticas.`,
          datos: docActivado,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * PATCH /api/admin/rag/documentos/:id/desactivar
   * Desactiva el documento para excluirlo inmediatamente de las consultas RAG.
   * Protegido por RAG_DOCUMENTOS_ADMINISTRAR y CSRF.
   */
  router.patch(
    "/documentos/:id/desactivar",
    requireAuth,
    permisoAdmin,
    csrfProtection,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const actor = (req as any).usuario;
        const docDesactivado = await ragRepo.desactivarDocumento(req.params.id, actor.id);

        if (auditoriaRepo) {
          await auditoriaRepo.registrarEvento({
            actor_usuario_id: actor.id,
            rol_actor: actor.rol,
            accion: "DESACTIVAR_DOCUMENTO_RAG",
            entidad_tipo: "rag_documentos",
            entidad_id: docDesactivado.id,
            motivo: `Desactivación de versión '${docDesactivado.codigo}' v${docDesactivado.version} (excluida de consultas RAG)`,
            valor_nuevo: {
              id: docDesactivado.id,
              codigo: docDesactivado.codigo,
              version: docDesactivado.version,
              activo: false,
            },
            ip_origen: req.ip,
            user_agent: req.headers["user-agent"],
          }).catch((e) => console.warn("[Auditoria] Error:", e));
        }

        res.json({
          exito: true,
          mensaje: `Documento '${docDesactivado.codigo}' v${docDesactivado.version} desactivado exitosamente. No participará en recuperación semántica.`,
          datos: docDesactivado,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/admin/rag/documentos/:id/descargar
   * Descarga privada y autenticada del archivo PDF original persistido.
   * Si el archivo no existe en el almacenamiento, devuelve ARCHIVO_ORIGINAL_NO_DISPONIBLE.
   * Protegido por RAG_DOCUMENTOS_ADMINISTRAR.
   */
  router.get(
    "/documentos/:id/descargar",
    requireAuth,
    permisoAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const doc = await ragRepo.obtenerDocumentoPorId(req.params.id);
        if (!doc) {
          const err = new Error("Documento no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "DOCUMENTO_NO_ENCONTRADO";
          return next(err);
        }

        if (!doc.ruta_almacenamiento) {
          const err = new Error("El archivo original no se encuentra disponible en el almacenamiento persistente. Este documento fue indexado como parte del corpus inicial sin binario original.");
          (err as any).statusCode = 404;
          (err as any).codigo = "ARCHIVO_ORIGINAL_NO_DISPONIBLE";
          return next(err);
        }

        const existe = await storageService.existeArchivo(doc.ruta_almacenamiento);
        if (!existe) {
          const err = new Error("El archivo original no se encuentra disponible en el almacenamiento persistente. Este documento fue indexado como parte del corpus inicial sin binario original.");
          (err as any).statusCode = 404;
          (err as any).codigo = "ARCHIVO_ORIGINAL_NO_DISPONIBLE";
          return next(err);
        }

        const buffer = await storageService.obtenerArchivo(doc.ruta_almacenamiento);

        const nombreDescarga = doc.nombre_archivo_original || `${doc.codigo}_v${doc.version}.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(nombreDescarga)}"`);
        res.setHeader("Content-Length", buffer.length);
        res.send(buffer);
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/admin/rag/documentos/:id/asociar-archivo
   * Permite asociar posteriormente el archivo PDF original a un documento legado (ej. DTH-REG-001)
   * sin reindexar ni alterar los fragmentos vectorizados existentes ni su estado de activación.
   * Protegido por RAG_DOCUMENTOS_ADMINISTRAR y CSRF.
   */
  router.post(
    "/documentos/:id/asociar-archivo",
    requireAuth,
    permisoAdmin,
    upload.single("archivo"),
    csrfProtection,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const file = req.file;
        if (!file) {
          const err = new Error("Debe seleccionar un archivo PDF para asociar.");
          (err as any).statusCode = 400;
          (err as any).codigo = "ARCHIVO_REQUERIDO";
          return next(err);
        }

        const doc = await ragRepo.obtenerDocumentoPorId(req.params.id);
        if (!doc) {
          const err = new Error("Documento no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "DOCUMENTO_NO_ENCONTRADO";
          return next(err);
        }

        // Validar integridad estructural del PDF
        procesamientoService.validarArchivoPdf(file.buffer, file.originalname || "documento.pdf");

        // Almacenar físicamente en persistencia
        const guardadoStorage = await storageService.guardarArchivo({
          buffer: file.buffer,
          codigo: doc.codigo,
          version: doc.version,
          nombreOriginal: file.originalname || `${doc.codigo}_v${doc.version}.pdf`,
        });

        // Actualizar metadatos del documento SIN tocar fragmentos ni estado activo
        const docActualizado = await ragRepo.actualizarDocumento(doc.id, {
          ruta_almacenamiento: guardadoStorage.rutaAlmacenamiento,
          hash_archivo: guardadoStorage.hash,
          nombre_archivo_original: file.originalname || `${doc.codigo}_v${doc.version}.pdf`,
          tamano_bytes: guardadoStorage.tamanoBytes,
        });

        const actor = (req as any).usuario;
        if (auditoriaRepo) {
          await auditoriaRepo.registrarEvento({
            actor_usuario_id: actor.id,
            rol_actor: actor.rol,
            accion: "ASOCIAR_ARCHIVO_ORIGINAL_RAG",
            entidad_tipo: "rag_documentos",
            entidad_id: doc.id,
            motivo: `Asociación de archivo PDF original '${file.originalname}' a versión '${doc.codigo}' v${doc.version}`,
            valor_nuevo: {
              ruta_almacenamiento: guardadoStorage.rutaAlmacenamiento,
              hash_archivo: guardadoStorage.hash,
              tamano_bytes: guardadoStorage.tamanoBytes,
            },
            ip_origen: req.ip,
            user_agent: req.headers["user-agent"],
          }).catch((e) => console.warn("[Auditoria] Error:", e));
        }

        res.json({
          exito: true,
          mensaje: `Archivo original asociado exitosamente al documento '${doc.codigo}' v${doc.version}.`,
          datos: docActualizado,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * DELETE /api/admin/rag/documentos/:id
   * Eliminación controlada de una versión específica de documento.
   * Reglas estrictas:
   * 1. No permite eliminar documentos ACTIVO (debe desactivarse primero).
   * 2. Exige motivo explícito de eliminación.
   * 3. Retira fragmentos asociados de la base de datos.
   * 4. Elimina archivo físico únicamente si no está compartido con otra versión.
   * 5. Registra auditoría inmutable.
   * Protegido por RAG_DOCUMENTOS_ADMINISTRAR y CSRF.
   */
  router.delete(
    "/documentos/:id",
    requireAuth,
    permisoAdmin,
    csrfProtection,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { motivo } = req.body || {};
        if (!motivo || typeof motivo !== "string" || !motivo.trim()) {
          const err = new Error("Debe proporcionar un motivo o justificación explícita para la eliminación del documento.");
          (err as any).statusCode = 400;
          (err as any).codigo = "MOTIVO_ELIMINACION_REQUERIDO";
          return next(err);
        }

        const doc = await ragRepo.obtenerDocumentoPorId(req.params.id);
        if (!doc) {
          const err = new Error("Documento no encontrado.");
          (err as any).statusCode = 404;
          (err as any).codigo = "DOCUMENTO_NO_ENCONTRADO";
          return next(err);
        }

        if (doc.activo === true) {
          const err = new Error(`El documento '${doc.codigo}' v${doc.version} se encuentra actualmente ACTIVO en consultas RAG. Debe desactivarlo antes de poder eliminarlo.`);
          (err as any).statusCode = 400;
          (err as any).codigo = "DOCUMENTO_ACTIVO_NO_ELIMINABLE";
          return next(err);
        }

        // Eliminar transaccionalmente en PostgreSQL (documento y fragmentos)
        await ragRepo.eliminarDocumentoTransaccional(doc.id);

        // Si tiene archivo en almacenamiento físico, verificar si alguna otra versión lo comparte
        let archivoFisicoEliminado = false;
        if (doc.ruta_almacenamiento) {
          try {
            const compartido = await ragRepo.archivoOriginalCompartido(doc.ruta_almacenamiento, doc.id);
            if (!compartido) {
              archivoFisicoEliminado = await storageService.eliminarArchivo(doc.ruta_almacenamiento);
            }
          } catch (storageErr) {
            console.warn(`[AdminRAG] Error no fatal al limpiar archivo físico ${doc.ruta_almacenamiento}:`, storageErr);
          }
        }

        const actor = (req as any).usuario;
        if (auditoriaRepo) {
          await auditoriaRepo.registrarEvento({
            actor_usuario_id: actor.id,
            rol_actor: actor.rol,
            accion: "ELIMINAR_DOCUMENTO_RAG",
            entidad_tipo: "rag_documentos",
            entidad_id: doc.id,
            motivo: motivo.trim(),
            valor_anterior: {
              id: doc.id,
              codigo: doc.codigo,
              version: doc.version,
              titulo: doc.titulo,
              estado_procesamiento: doc.estado_procesamiento,
              activo: doc.activo,
              total_fragmentos: doc.total_fragmentos,
              ruta_almacenamiento: doc.ruta_almacenamiento,
              hash_archivo: doc.hash_archivo,
              archivo_fisico_eliminado: archivoFisicoEliminado,
            },
            ip_origen: req.ip,
            user_agent: req.headers["user-agent"],
          }).catch((e) => console.warn("[Auditoria] Error:", e));
        }

        res.json({
          exito: true,
          mensaje: `Versión '${doc.codigo}' v${doc.version} eliminada exitosamente del sistema.`,
          datos: {
            id: doc.id,
            codigo: doc.codigo,
            version: doc.version,
            archivo_fisico_eliminado: archivoFisicoEliminado,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
