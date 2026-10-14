import type {
  IRagRepository,
  FragmentoDocumento,
  ResultadoBusquedaFragmento,
  RagDocumentoEntity,
} from "../domain/rag.types.js";
import { getPool } from "../../../db/index.js";
import type pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { documentStorage } from "../storage/document-storage.js";

function calcularSimilitudCoseno(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let productoPunto = 0;
  let normaA = 0;
  let normaB = 0;

  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i];
    const b = vecB[i];
    productoPunto += a * b;
    normaA += a * a;
    normaB += b * b;
  }

  if (normaA === 0 || normaB === 0) return 0;
  return productoPunto / (Math.sqrt(normaA) * Math.sqrt(normaB));
}

const CACHE_FILE_PATH = path.resolve(process.cwd(), ".rag_embeddings_cache.json");

export class PostgresRagRepository implements IRagRepository {
  private pool: pg.Pool;
  private static cacheFragmentos: FragmentoDocumento[] | null = null;
  private static memoriaEmbeddings: Map<string, number[]> = new Map();

  constructor(customPool?: pg.Pool) {
    this.pool = customPool || getPool();
    PostgresRagRepository.cargarCacheEmbeddings();
  }

  public static invalidarCache(): void {
    PostgresRagRepository.cacheFragmentos = null;
  }

  private static cargarCacheEmbeddings(): void {
    if (PostgresRagRepository.memoriaEmbeddings.size > 0) return;
    try {
      if (fs.existsSync(CACHE_FILE_PATH)) {
        const data = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, "utf-8"));
        for (const [id, emb] of Object.entries(data)) {
          if (Array.isArray(emb)) {
            PostgresRagRepository.memoriaEmbeddings.set(id, emb as number[]);
          }
        }
      }
    } catch (e) {
      console.warn("[PostgresRagRepository] No se pudo leer cache de embeddings:", e);
    }
  }

  private static guardarCacheEmbeddings(): void {
    try {
      const obj: Record<string, number[]> = {};
      for (const [id, emb] of PostgresRagRepository.memoriaEmbeddings.entries()) {
        obj[id] = emb;
      }
      fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(obj));
    } catch (e) {
      console.warn("[PostgresRagRepository] No se pudo escribir cache de embeddings:", e);
    }
  }

  async guardarFragmentos(fragmentos: FragmentoDocumento[]): Promise<number> {
    if (fragmentos.length === 0) return 0;
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN;");

      // 1. Asegurar documento principal en rag_documentos (código + versión)
      const primer = fragmentos[0];
      const docRes = await client.query(
        `INSERT INTO rag_documentos (codigo, titulo, version, total_paginas, activo, estado_procesamiento)
         VALUES ($1, $2, $3, $4, true, 'LISTO')
         ON CONFLICT (codigo, version) DO UPDATE SET
           titulo = EXCLUDED.titulo,
           activo = true,
           estado_procesamiento = 'LISTO'
         RETURNING id;`,
        [
          primer.codigo_documento || "DTH-REG-001",
          primer.documento || "Reglamento Interno de Trabajo RIMAC S.A.",
          primer.version || "1.0",
          38,
        ]
      );
      const documentoId = docRes.rows[0].id;

      // 2. Insertar fragmentos en rag_chunks
      let guardados = 0;
      for (const frag of fragmentos) {
        await client.query(
          `INSERT INTO rag_chunks (
            documento_id, chunk_codigo, titulo_seccion, articulo, pagina, contenido, vector_referencia_id, creado_en
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (documento_id, chunk_codigo) DO UPDATE SET
            titulo_seccion = EXCLUDED.titulo_seccion,
            articulo = EXCLUDED.articulo,
            pagina = EXCLUDED.pagina,
            contenido = EXCLUDED.contenido;`,
          [
            documentoId,
            frag.chunk_id,
            frag.titulo,
            frag.articulo,
            frag.pagina,
            frag.contenido,
            frag.chunk_id,
          ]
        );

        if (frag.embedding && frag.embedding.length > 0) {
          PostgresRagRepository.memoriaEmbeddings.set(frag.chunk_id, frag.embedding);
        }
        guardados++;
      }

      await client.query(
        `UPDATE rag_documentos SET total_fragmentos = $1, actualizado_en = NOW() WHERE id = $2;`,
        [guardados, documentoId]
      );

      await client.query("COMMIT;");
      PostgresRagRepository.guardarCacheEmbeddings();
      PostgresRagRepository.cacheFragmentos = null;
      return guardados;
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async guardarFragmentosDeDocumento(documentoId: string, fragmentos: FragmentoDocumento[]): Promise<number> {
    if (fragmentos.length === 0) return 0;
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN;");

      // Limpiar fragmentos anteriores si reindexa
      await client.query("DELETE FROM rag_chunks WHERE documento_id = $1;", [documentoId]);

      let guardados = 0;
      for (const frag of fragmentos) {
        await client.query(
          `INSERT INTO rag_chunks (
            documento_id, chunk_codigo, titulo_seccion, articulo, pagina, contenido, vector_referencia_id, creado_en
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW());`,
          [
            documentoId,
            frag.chunk_id,
            frag.titulo,
            frag.articulo,
            frag.pagina,
            frag.contenido,
            frag.chunk_id,
          ]
        );

        if (frag.embedding && frag.embedding.length > 0) {
          PostgresRagRepository.memoriaEmbeddings.set(frag.chunk_id, frag.embedding);
        }
        guardados++;
      }

      await client.query(
        `UPDATE rag_documentos 
         SET total_fragmentos = $1, estado_procesamiento = 'LISTO', error_mensaje = NULL, actualizado_en = NOW() 
         WHERE id = $2;`,
        [guardados, documentoId]
      );

      await client.query("COMMIT;");
      PostgresRagRepository.guardarCacheEmbeddings();
      PostgresRagRepository.cacheFragmentos = null;
      return guardados;
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async limpiarFragmentosDeDocumento(documentoId: string): Promise<void> {
    await this.pool.query("DELETE FROM rag_chunks WHERE documento_id = $1;", [documentoId]);
    PostgresRagRepository.cacheFragmentos = null;
  }

  async listarFragmentos(soloActivos: boolean = true): Promise<FragmentoDocumento[]> {
    // Si consulta solo activos y tenemos cache en memoria, usarlo
    if (soloActivos && PostgresRagRepository.cacheFragmentos && PostgresRagRepository.cacheFragmentos.length > 0) {
      return PostgresRagRepository.cacheFragmentos;
    }

    const whereClause = soloActivos 
      ? "WHERE d.activo = true AND d.estado_procesamiento = 'LISTO' AND (d.fecha_vigencia IS NULL OR d.fecha_vigencia <= CURRENT_DATE)" 
      : "";

    const res = await this.pool.query(`
      SELECT c.*, d.codigo as codigo_documento, d.titulo as nombre_documento, d.version
      FROM rag_chunks c
      JOIN rag_documentos d ON c.documento_id = d.id
      ${whereClause}
      ORDER BY c.pagina ASC, c.chunk_codigo ASC;
    `);

    const lista: FragmentoDocumento[] = res.rows.map((row) => ({
      documento: row.nombre_documento,
      codigo_documento: row.codigo_documento,
      version: row.version,
      titulo: row.titulo_seccion,
      articulo: row.articulo,
      pagina: row.pagina,
      chunk_id: row.chunk_codigo,
      contenido: row.contenido,
      embedding: PostgresRagRepository.memoriaEmbeddings.get(row.chunk_codigo) || [],
    }));

    if (soloActivos) {
      PostgresRagRepository.cacheFragmentos = lista;
    }
    return lista;
  }

  async contarFragmentos(soloActivos: boolean = true): Promise<number> {
    if (soloActivos && PostgresRagRepository.cacheFragmentos) {
      return PostgresRagRepository.cacheFragmentos.length;
    }

    const whereClause = soloActivos 
      ? "JOIN rag_documentos d ON c.documento_id = d.id WHERE d.activo = true AND d.estado_procesamiento = 'LISTO' AND (d.fecha_vigencia IS NULL OR d.fecha_vigencia <= CURRENT_DATE)" 
      : "";

    const res = await this.pool.query(`SELECT COUNT(*) as total FROM rag_chunks c ${whereClause};`);
    return parseInt(res.rows[0].total) || 0;
  }

  async buscarSimilares(vectorConsulta: number[], topK: number = 4): Promise<ResultadoBusquedaFragmento[]> {
    // Estricta regla de gobernanza RAG: solo fragmentos de documentos ACTIVOS y LISTOS
    const todos = await this.listarFragmentos(true);
    if (todos.length === 0) return [];

    const conSimilitud: ResultadoBusquedaFragmento[] = [];
    for (const f of todos) {
      const emb = f.embedding && f.embedding.length > 0 
        ? f.embedding 
        : PostgresRagRepository.memoriaEmbeddings.get(f.chunk_id);

      if (emb && emb.length > 0) {
        const sim = calcularSimilitudCoseno(vectorConsulta, emb);
        conSimilitud.push({ fragmento: f, similitud: sim });
      }
    }

    conSimilitud.sort((a, b) => b.similitud - a.similitud);
    return conSimilitud.slice(0, topK);
  }

  // =========================================================================
  // GESTIÓN DE DOCUMENTOS (ADMINISTRACIÓN RAG)
  // =========================================================================

  private mapRowToDocumento(row: any): RagDocumentoEntity {
    return {
      id: row.id,
      codigo: row.codigo,
      titulo: row.titulo,
      version: row.version,
      descripcion: row.descripcion,
      fecha_vigencia: row.fecha_vigencia ? (row.fecha_vigencia instanceof Date ? row.fecha_vigencia.toISOString().split("T")[0] : String(row.fecha_vigencia).split("T")[0]) : null,
      estado_procesamiento: row.estado_procesamiento,
      error_mensaje: row.error_mensaje,
      hash_archivo: row.hash_archivo,
      nombre_archivo_original: row.nombre_archivo_original,
      ruta_almacenamiento: row.ruta_almacenamiento,
      tamano_bytes: row.tamano_bytes,
      mime_type: row.mime_type,
      total_paginas: row.total_paginas || 0,
      total_fragmentos: row.total_fragmentos || 0,
      creado_por_id: row.creado_por_id,
      creado_por_nombre: row.creado_por_nombre || null,
      activo: Boolean(row.activo),
      activado_en: row.activado_en ? new Date(row.activado_en).toISOString() : null,
      activado_por_id: row.activado_por_id,
      activado_por_nombre: row.activado_por_nombre || null,
      creado_en: new Date(row.creado_en).toISOString(),
      actualizado_en: new Date(row.actualizado_en).toISOString(),
    };
  }

  async listarDocumentos(filtros?: { codigo?: string; soloActivos?: boolean }): Promise<RagDocumentoEntity[]> {
    const condiciones: string[] = [];
    const params: any[] = [];

    if (filtros?.codigo) {
      params.push(filtros.codigo);
      condiciones.push(`d.codigo = $${params.length}`);
    }

    if (filtros?.soloActivos) {
      condiciones.push("d.activo = true");
    }

    const whereSql = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

    const query = `
      SELECT 
        d.*,
        uc.nombre_completo as creado_por_nombre,
        ua.nombre_completo as activado_por_nombre
      FROM rag_documentos d
      LEFT JOIN usuarios uc ON d.creado_por_id = uc.id
      LEFT JOIN usuarios ua ON d.activado_por_id = ua.id
      ${whereSql}
      ORDER BY d.codigo ASC, d.creado_en DESC;
    `;

    const res = await this.pool.query(query, params);
    const mapped = await Promise.all(
      res.rows.map(async (r) => {
        const doc = this.mapRowToDocumento(r);
        doc.archivo_disponible = r.ruta_almacenamiento ? await documentStorage.existeArchivo(r.ruta_almacenamiento) : false;
        return doc;
      })
    );
    return mapped;
  }

  async obtenerDocumentoPorId(id: string): Promise<RagDocumentoEntity | null> {
    const query = `
      SELECT 
        d.*,
        uc.nombre_completo as creado_por_nombre,
        ua.nombre_completo as activado_por_nombre
      FROM rag_documentos d
      LEFT JOIN usuarios uc ON d.creado_por_id = uc.id
      LEFT JOIN usuarios ua ON d.activado_por_id = ua.id
      WHERE d.id = $1;
    `;
    const res = await this.pool.query(query, [id]);
    if (res.rows.length === 0) return null;
    const doc = this.mapRowToDocumento(res.rows[0]);
    doc.archivo_disponible = res.rows[0].ruta_almacenamiento ? await documentStorage.existeArchivo(res.rows[0].ruta_almacenamiento) : false;
    return doc;
  }

  async obtenerDocumentoPorCodigoYVersion(codigo: string, version: string): Promise<RagDocumentoEntity | null> {
    const query = `
      SELECT 
        d.*,
        uc.nombre_completo as creado_por_nombre,
        ua.nombre_completo as activado_por_nombre
      FROM rag_documentos d
      LEFT JOIN usuarios uc ON d.creado_por_id = uc.id
      LEFT JOIN usuarios ua ON d.activado_por_id = ua.id
      WHERE d.codigo = $1 AND d.version = $2;
    `;
    const res = await this.pool.query(query, [codigo, version]);
    if (res.rows.length === 0) return null;
    const doc = this.mapRowToDocumento(res.rows[0]);
    doc.archivo_disponible = res.rows[0].ruta_almacenamiento ? await documentStorage.existeArchivo(res.rows[0].ruta_almacenamiento) : false;
    return doc;
  }

  async crearDocumento(doc: Omit<RagDocumentoEntity, "id" | "creado_en" | "actualizado_en">): Promise<RagDocumentoEntity> {
    const query = `
      INSERT INTO rag_documentos (
        codigo, titulo, version, descripcion, fecha_vigencia,
        estado_procesamiento, error_mensaje, hash_archivo, nombre_archivo_original,
        ruta_almacenamiento, tamano_bytes, mime_type, total_paginas, total_fragmentos,
        creado_por_id, activo, creado_en, actualizado_en
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13, $14,
        $15, $16, NOW(), NOW()
      ) RETURNING id;
    `;

    const res = await this.pool.query(query, [
      doc.codigo,
      doc.titulo,
      doc.version,
      doc.descripcion || null,
      doc.fecha_vigencia || null,
      doc.estado_procesamiento,
      doc.error_mensaje || null,
      doc.hash_archivo || null,
      doc.nombre_archivo_original || null,
      doc.ruta_almacenamiento || null,
      doc.tamano_bytes || null,
      doc.mime_type || "application/pdf",
      doc.total_paginas || 0,
      doc.total_fragmentos || 0,
      doc.creado_por_id || null,
      doc.activo ?? false,
    ]);

    const nuevoId = res.rows[0].id;
    return (await this.obtenerDocumentoPorId(nuevoId))!;
  }

  async actualizarDocumento(id: string, parcial: Partial<RagDocumentoEntity>): Promise<RagDocumentoEntity> {
    const campos: string[] = [];
    const valores: any[] = [];

    if (parcial.titulo !== undefined) {
      valores.push(parcial.titulo);
      campos.push(`titulo = $${valores.length}`);
    }
    if (parcial.descripcion !== undefined) {
      valores.push(parcial.descripcion);
      campos.push(`descripcion = $${valores.length}`);
    }
    if (parcial.fecha_vigencia !== undefined) {
      valores.push(parcial.fecha_vigencia);
      campos.push(`fecha_vigencia = $${valores.length}`);
    }
    if (parcial.estado_procesamiento !== undefined) {
      valores.push(parcial.estado_procesamiento);
      campos.push(`estado_procesamiento = $${valores.length}`);
    }
    if (parcial.error_mensaje !== undefined) {
      valores.push(parcial.error_mensaje);
      campos.push(`error_mensaje = $${valores.length}`);
    }
    if (parcial.hash_archivo !== undefined) {
      valores.push(parcial.hash_archivo);
      campos.push(`hash_archivo = $${valores.length}`);
    }
    if (parcial.nombre_archivo_original !== undefined) {
      valores.push(parcial.nombre_archivo_original);
      campos.push(`nombre_archivo_original = $${valores.length}`);
    }
    if (parcial.ruta_almacenamiento !== undefined) {
      valores.push(parcial.ruta_almacenamiento);
      campos.push(`ruta_almacenamiento = $${valores.length}`);
    }
    if (parcial.tamano_bytes !== undefined) {
      valores.push(parcial.tamano_bytes);
      campos.push(`tamano_bytes = $${valores.length}`);
    }
    if (parcial.total_paginas !== undefined) {
      valores.push(parcial.total_paginas);
      campos.push(`total_paginas = $${valores.length}`);
    }
    if (parcial.total_fragmentos !== undefined) {
      valores.push(parcial.total_fragmentos);
      campos.push(`total_fragmentos = $${valores.length}`);
    }
    if (parcial.activo !== undefined) {
      valores.push(parcial.activo);
      campos.push(`activo = $${valores.length}`);
    }

    campos.push("actualizado_en = NOW()");
    valores.push(id);

    const sql = `UPDATE rag_documentos SET ${campos.join(", ")} WHERE id = $${valores.length};`;
    await this.pool.query(sql, valores);
    PostgresRagRepository.cacheFragmentos = null;

    return (await this.obtenerDocumentoPorId(id))!;
  }

  async activarDocumentoTransaccional(id: string, usuarioId: string): Promise<RagDocumentoEntity> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      // 1. Obtener documento y validar que esté en estado LISTO
      const docRes = await client.query("SELECT * FROM rag_documentos WHERE id = $1 FOR UPDATE;", [id]);
      if (docRes.rows.length === 0) {
        throw new Error("El documento especificado no existe.");
      }
      const doc = docRes.rows[0];

      if (doc.estado_procesamiento !== "LISTO") {
        const err = new Error(`El documento no puede activarse porque su estado de procesamiento es '${doc.estado_procesamiento}'. Debe estar en estado 'LISTO'.`);
        (err as any).statusCode = 400;
        (err as any).codigo = "DOCUMENTO_NO_LISTO";
        throw err;
      }

      // 2. Desactivar transaccionalmente cualquier otra versión activa del mismo código documental
      await client.query(
        `UPDATE rag_documentos 
         SET activo = false, actualizado_en = NOW() 
         WHERE codigo = $1 AND id <> $2;`,
        [doc.codigo, id]
      );

      // 3. Activar este documento
      await client.query(
        `UPDATE rag_documentos 
         SET activo = true, activado_en = NOW(), activado_por_id = $1, actualizado_en = NOW() 
         WHERE id = $2;`,
        [usuarioId, id]
      );

      await client.query("COMMIT;");
      PostgresRagRepository.cacheFragmentos = null;
      return (await this.obtenerDocumentoPorId(id))!;
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async desactivarDocumento(id: string, _usuarioId: string): Promise<RagDocumentoEntity> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");
      const docRes = await client.query("SELECT * FROM rag_documentos WHERE id = $1 FOR UPDATE;", [id]);
      if (docRes.rows.length === 0) {
        const err = new Error("Documento no encontrado.");
        (err as any).statusCode = 404;
        (err as any).codigo = "DOCUMENTO_NO_ENCONTRADO";
        throw err;
      }

      await client.query(
        `UPDATE rag_documentos 
         SET activo = false, actualizado_en = NOW() 
         WHERE id = $1;`,
        [id]
      );

      await client.query("COMMIT;");
      PostgresRagRepository.cacheFragmentos = null;
      return (await this.obtenerDocumentoPorId(id))!;
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async eliminarDocumentoTransaccional(id: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      const docRes = await client.query("SELECT * FROM rag_documentos WHERE id = $1 FOR UPDATE;", [id]);
      if (docRes.rows.length === 0) {
        const err = new Error("Documento no encontrado.");
        (err as any).statusCode = 404;
        (err as any).codigo = "DOCUMENTO_NO_ENCONTRADO";
        throw err;
      }

      const doc = docRes.rows[0];
      if (doc.activo === true) {
        const err = new Error(`El documento '${doc.codigo}' v${doc.version} se encuentra actualmente ACTIVO en consultas RAG. Debe desactivarlo antes de eliminarlo.`);
        (err as any).statusCode = 400;
        (err as any).codigo = "DOCUMENTO_ACTIVO_NO_ELIMINABLE";
        throw err;
      }

      // Eliminar fragmentos y documento
      await client.query("DELETE FROM rag_chunks WHERE documento_id = $1;", [id]);
      const deleteRes = await client.query("DELETE FROM rag_documentos WHERE id = $1;", [id]);

      await client.query("COMMIT;");
      PostgresRagRepository.cacheFragmentos = null;
      return (deleteRes.rowCount ?? 0) > 0;
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async archivoOriginalCompartido(rutaAlmacenamiento: string, documentoIdExcluir: string): Promise<boolean> {
    const res = await this.pool.query(
      "SELECT COUNT(*) as total FROM rag_documentos WHERE ruta_almacenamiento = $1 AND id <> $2;",
      [rutaAlmacenamiento, documentoIdExcluir]
    );
    return (parseInt(res.rows[0]?.total || "0", 10)) > 0;
  }
}

