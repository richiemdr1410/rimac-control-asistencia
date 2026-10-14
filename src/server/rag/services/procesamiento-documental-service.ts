import { PDFParse } from "pdf-parse";
import type {
  IRagRepository,
  IGenAiProvider,
  FragmentoDocumento,
  RagDocumentoEntity,
} from "../domain/rag.types.js";
import type { IDocumentStorageService } from "../storage/document-storage.js";
import type { IAuditoriaRepository } from "../../repositories/interfaces/auditoria.js";

export interface CargarPdfInput {
  buffer: Buffer;
  nombreOriginal: string;
  codigo: string;
  titulo: string;
  version: string;
  descripcion?: string;
  fechaVigencia?: string;
  actor: {
    id: string;
    rol: string;
    ip?: string;
    userAgent?: string;
  };
}

export function validarYNormalizarFechaVigencia(fechaRaw?: string | null): string | null {
  if (
    !fechaRaw ||
    typeof fechaRaw !== "string" ||
    !fechaRaw.trim() ||
    fechaRaw.trim().toLowerCase() === "null" ||
    fechaRaw.trim().toLowerCase() === "undefined"
  ) {
    return null;
  }
  const clean = fechaRaw.trim();

  // Caso 1: YYYY-MM-DD o YYYY/MM/DD o YYYY.MM.DD (incluyendo ISO con timestamp ej. 2026-10-09T00:00:00.000Z)
  const matchYmd = clean.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (matchYmd) {
    const y = parseInt(matchYmd[1], 10);
    const m = parseInt(matchYmd[2], 10);
    const d = parseInt(matchYmd[3], 10);
    if (!esFechaCalendarioValida(y, m, d)) {
      const err = new Error(`La fecha de vigencia '${clean}' no es una fecha válida de calendario.`);
      (err as any).statusCode = 400;
      (err as any).codigo = "FECHA_VIGENCIA_INVALIDA";
      throw err;
    }
    return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
  }

  // Caso 2: DD/MM/YYYY, DD-MM-YYYY o DD.MM.YYYY (con soporte para MM/DD/YYYY si d > 12)
  const matchDmy = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (matchDmy) {
    let d = parseInt(matchDmy[1], 10);
    let m = parseInt(matchDmy[2], 10);
    const y = parseInt(matchDmy[3], 10);

    // Si m > 12 y d <= 12, el usuario ingresó MM/DD/YYYY
    if (m > 12 && d <= 12) {
      const temp = d;
      d = m;
      m = temp;
    }

    if (!esFechaCalendarioValida(y, m, d)) {
      const err = new Error(`La fecha de vigencia '${clean}' no es una fecha válida de calendario.`);
      (err as any).statusCode = 400;
      (err as any).codigo = "FECHA_VIGENCIA_INVALIDA";
      throw err;
    }
    return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
  }

  const err = new Error("El formato de fecha de vigencia no es válido. Utilice el formato AAAA-MM-DD o DD/MM/AAAA.");
  (err as any).statusCode = 400;
  (err as any).codigo = "FECHA_VIGENCIA_INVALIDA";
  throw err;
}

function esFechaCalendarioValida(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2150) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const diasPorMes = [31, esBisiesto(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= diasPorMes[month - 1];
}

function esBisiesto(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export class ProcesamientoDocumentalService {
  private readonly MAX_BYTES = 15 * 1024 * 1024; // 15 MB
  private readonly CHUNK_SIZE = 1000; // ~1000 caracteres por fragmento
  private readonly CHUNK_OVERLAP = 150; // solapamiento para coherencia semántica

  constructor(
    private ragRepo: IRagRepository,
    private genAiProvider: IGenAiProvider,
    private storageService: IDocumentStorageService,
    private auditoriaRepo?: IAuditoriaRepository
  ) {}

  /**
   * Valida estrictamente el archivo PDF (MIME, magic bytes, tamaño, no vacío, sin contenido ejecutable)
   */
  validarArchivoPdf(buffer: Buffer, nombreOriginal: string): void {
    if (!buffer || buffer.length === 0) {
      const err = new Error("El archivo cargado se encuentra vacío (0 bytes).");
      (err as any).statusCode = 400;
      (err as any).codigo = "ARCHIVO_VACIO";
      throw err;
    }

    if (buffer.length > this.MAX_BYTES) {
      const err = new Error(`El archivo excede el tamaño máximo permitido de ${Math.round(this.MAX_BYTES / 1024 / 1024)} MB.`);
      (err as any).statusCode = 400;
      (err as any).codigo = "ARCHIVO_DEMASIADO_GRANDE";
      throw err;
    }

    // Validación de extensión
    const ext = nombreOriginal.toLowerCase().slice(-4);
    if (ext !== ".pdf") {
      const err = new Error("Formato de archivo no permitido. Solo se admiten documentos con extensión .pdf.");
      (err as any).statusCode = 400;
      (err as any).codigo = "FORMATO_INVALIDO";
      throw err;
    }

    // Validación de contenido real / Magic Bytes (%PDF-)
    const magicBytes = buffer.subarray(0, 5).toString("ascii");
    if (magicBytes !== "%PDF-") {
      const err = new Error("El archivo no es un documento PDF válido. La cabecera o estructura binaria no corresponde a un archivo PDF legítimo.");
      (err as any).statusCode = 400;
      (err as any).codigo = "PDF_CORRUPTO_O_INVALIDO";
      throw err;
    }
  }

  /**
   * Extrae el texto legible y número de páginas de un buffer PDF usando pdf-parse.
   */
  async extraerTextoYPaginas(buffer: Buffer): Promise<{
    textoCompleto: string;
    totalPaginas: number;
    paginas: Array<{ numero: number; texto: string }>;
  }> {
    let parser: any;
    try {
      parser = new PDFParse({ data: buffer });
      await parser.load();
      const textResult = await parser.getText();
      const infoResult = await parser.getInfo();

      const textoCompleto = (textResult.text || "").trim();
      const totalPaginas = textResult.total || infoResult.total || 1;

      const paginas: Array<{ numero: number; texto: string }> = [];
      if (Array.isArray(textResult.pages) && textResult.pages.length > 0) {
        for (const p of textResult.pages) {
          paginas.push({
            numero: p.num || paginas.length + 1,
            texto: (p.text || "").trim(),
          });
        }
      } else {
        paginas.push({ numero: 1, texto: textoCompleto });
      }

      await parser.destroy();

      // Validación de texto extraíble (sin soporte OCR en esta fase)
      if (textoCompleto.length < 30) {
        const err = new Error("El archivo PDF no contiene texto digital extraíble (posible documento escaneado o imagen rasterizada). Esta fase no dispone de OCR.");
        (err as any).statusCode = 400;
        (err as any).codigo = "PDF_SIN_TEXTO_EXTRAIBLE";
        throw err;
      }

      return { textoCompleto, totalPaginas, paginas };
    } catch (err: any) {
      if (parser) {
        await parser.destroy().catch(() => {});
      }
      if (err.codigo) throw err;
      const parseErr = new Error(`No fue posible analizar la estructura del documento PDF: ${err.message || "Archivo dañado"}`);
      (parseErr as any).statusCode = 400;
      (parseErr as any).codigo = "PDF_CORRUPTO_O_INVALIDO";
      throw parseErr;
    }
  }

  /**
   * Fragmenta el texto respetando títulos, artículos y párrafos para optimizar la indexación RAG
   */
  fragmentarTexto(
    doc: { codigo: string; titulo: string; version: string },
    paginas: Array<{ numero: number; texto: string }>
  ): FragmentoDocumento[] {
    const fragmentos: FragmentoDocumento[] = [];
    let chunkIndex = 1;
    const versionClean = doc.version.replace(/[^a-zA-Z0-9]/g, "_");

    for (const pag of paginas) {
      const textoPagina = pag.texto;
      if (!textoPagina || textoPagina.length < 20) continue;

      // Intentar detectar artículos o secciones estructurales
      const parrafos = textoPagina.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
      let bufferTexto = "";
      let tituloSeccionActual = doc.titulo;
      let articuloActual = `Página ${pag.numero}`;

      for (const parrafo of parrafos) {
        // Detectar encabezados tipo ARTICULO o TITULO
        const matchArticulo = parrafo.match(/(?:ART[IÍ]CULO|ART\.)\s*([0-9]+(?:\s*[-–:]\s*[^\n.]+)?)/i);
        const matchTitulo = parrafo.match(/(?:T[IÍ]TULO|CAP[IÍ]TULO|SECCI[OÓ]N)\s*([IVXLCDM0-9]+(?:\s*[-–:]\s*[^\n.]+)?)/i);

        if (matchTitulo) {
          tituloSeccionActual = matchTitulo[0].trim();
        }
        if (matchArticulo) {
          articuloActual = matchArticulo[0].trim();
        }

        if (bufferTexto.length + parrafo.length > this.CHUNK_SIZE && bufferTexto.length > 100) {
          fragmentos.push({
            documento: doc.titulo,
            codigo_documento: doc.codigo,
            version: doc.version,
            titulo: tituloSeccionActual,
            articulo: articuloActual,
            pagina: pag.numero,
            chunk_id: `${doc.codigo}-V${versionClean}-CHUNK-${chunkIndex}`,
            contenido: bufferTexto.trim(),
          });
          chunkIndex++;
          // Conservar solapamiento final
          bufferTexto = bufferTexto.slice(-this.CHUNK_OVERLAP) + "\n" + parrafo;
        } else {
          bufferTexto += (bufferTexto ? "\n\n" : "") + parrafo;
        }
      }

      if (bufferTexto.trim().length >= 40) {
        fragmentos.push({
          documento: doc.titulo,
          codigo_documento: doc.codigo,
          version: doc.version,
          titulo: tituloSeccionActual,
          articulo: articuloActual,
          pagina: pag.numero,
          chunk_id: `${doc.codigo}-V${versionClean}-CHUNK-${chunkIndex}`,
          contenido: bufferTexto.trim(),
        });
        chunkIndex++;
      }
    }

    return fragmentos;
  }

  /**
   * Flujo principal: carga, almacena, extrae, indexa y deja el documento LISTO (sin activación automática)
   */
  async procesarDocumento(input: CargarPdfInput): Promise<RagDocumentoEntity> {
    const { buffer, nombreOriginal, codigo, titulo, version, descripcion, fechaVigencia, actor } = input;

    // 1. Validaciones de integridad y seguridad
    this.validarArchivoPdf(buffer, nombreOriginal);

    const fechaVigenciaNormalizada = validarYNormalizarFechaVigencia(fechaVigencia);
    const codNormalizado = codigo.trim().toUpperCase();
    const verNormalizada = version.trim();

    // 2. Verificar que no exista ya exactamente la misma versión para este código
    const existente = await this.ragRepo.obtenerDocumentoPorCodigoYVersion(codNormalizado, verNormalizada);
    if (existente) {
      const err = new Error(`Ya existe una versión '${verNormalizada}' registrada para el código documental '${codNormalizado}'. Utilice un identificador de versión diferente.`);
      (err as any).statusCode = 409;
      (err as any).codigo = "VERSION_YA_EXISTE";
      throw err;
    }

    // Comprobar si es primera versión o versión subsecuente para auditoría
    const versionesPrevias = await this.ragRepo.listarDocumentos({ codigo: codNormalizado });
    const esNuevaVersion = versionesPrevias.length > 0;

    // 3. Almacenamiento persistente del archivo original
    const guardadoStorage = await this.storageService.guardarArchivo({
      buffer,
      codigo: codNormalizado,
      version: verNormalizada,
      nombreOriginal,
    });

    // 4. Registro inicial en PostgreSQL con estado RECIBIDO
    const docCreado = await this.ragRepo.crearDocumento({
      codigo: codNormalizado,
      titulo: titulo.trim(),
      version: verNormalizada,
      descripcion: descripcion?.trim() || null,
      fecha_vigencia: fechaVigenciaNormalizada,
      estado_procesamiento: "RECIBIDO",
      error_mensaje: null,
      hash_archivo: guardadoStorage.hash,
      nombre_archivo_original: nombreOriginal,
      ruta_almacenamiento: guardadoStorage.rutaAlmacenamiento,
      tamano_bytes: guardadoStorage.tamanoBytes,
      mime_type: "application/pdf",
      total_paginas: 0,
      total_fragmentos: 0,
      creado_por_id: actor.id,
      activo: false, // REGLA: Nunca activar automáticamente al cargar
    });

    // Registrar auditoría de carga inicial
    if (this.auditoriaRepo) {
      await this.auditoriaRepo.registrarEvento({
        actor_usuario_id: actor.id,
        rol_actor: actor.rol,
        accion: esNuevaVersion ? "CARGAR_VERSION_DOCUMENTO_RAG" : "CARGAR_DOCUMENTO_RAG",
        entidad_tipo: "rag_documentos",
        entidad_id: docCreado.id,
        motivo: `Carga de ${esNuevaVersion ? "nueva versión" : "documento"} '${docCreado.codigo}' v${docCreado.version} (${nombreOriginal})`,
        valor_nuevo: {
          id: docCreado.id,
          codigo: docCreado.codigo,
          version: docCreado.version,
          hash_archivo: docCreado.hash_archivo,
          tamano_bytes: docCreado.tamano_bytes,
        },
        ip_origen: actor.ip,
        user_agent: actor.userAgent,
      }).catch((e) => console.warn("[Auditoria] Error registrando evento:", e));
    }

    // 5. Iniciar proceso de extracción, chunking y generación de embeddings
    try {
      await this.ragRepo.actualizarDocumento(docCreado.id, {
        estado_procesamiento: "PROCESANDO",
      });

      // Extracción de texto
      const { totalPaginas, paginas } = await this.extraerTextoYPaginas(buffer);

      // Fragmentación
      const fragmentos = this.fragmentarTexto(
        { codigo: docCreado.codigo, titulo: docCreado.titulo, version: docCreado.version },
        paginas
      );

      if (fragmentos.length === 0) {
        throw new Error("No se generaron fragmentos legibles tras procesar el texto del documento.");
      }

      // Generación de embeddings semánticos
      const fragmentosConEmbeddings: FragmentoDocumento[] = [];
      for (let i = 0; i < fragmentos.length; i++) {
        const frag = fragmentos[i];
        const textoVector = `${frag.titulo} - ${frag.articulo}: ${frag.contenido}`;
        let vector: number[] = [];
        try {
          vector = await this.genAiProvider.generarEmbedding(textoVector);
        } catch (embedErr: any) {
          console.warn(`[Procesamiento RAG] Advertencia al generar embedding ${frag.chunk_id}: ${embedErr.message}`);
          // Continuar o propagar según severidad
          throw new Error(`Fallo en el servicio de embeddings al procesar el fragmento ${i + 1}/${fragmentos.length}: ${embedErr.message}`);
        }

        fragmentosConEmbeddings.push({
          ...frag,
          embedding: vector,
        });

        // Pausa ligera para rate limits de Google GenAI
        if (i < fragmentos.length - 1) {
          await new Promise((res) => setTimeout(res, 80));
        }
      }

      // Persistencia atómica de fragmentos en rag_chunks
      await this.ragRepo.guardarFragmentosDeDocumento(docCreado.id, fragmentosConEmbeddings);

      // Documento pasa a estado LISTO
      const docListo = await this.ragRepo.actualizarDocumento(docCreado.id, {
        total_paginas: totalPaginas,
        total_fragmentos: fragmentosConEmbeddings.length,
        estado_procesamiento: "LISTO",
        error_mensaje: null,
      });

      if (this.auditoriaRepo) {
        await this.auditoriaRepo.registrarEvento({
          actor_usuario_id: actor.id,
          rol_actor: actor.rol,
          accion: "PROCESAR_DOCUMENTO_RAG",
          entidad_tipo: "rag_documentos",
          entidad_id: docListo.id,
          motivo: `Indexación exitosa de '${docListo.codigo}' v${docListo.version} con ${fragmentosConEmbeddings.length} fragmentos`,
          valor_nuevo: {
            estado_procesamiento: "LISTO",
            total_fragmentos: fragmentosConEmbeddings.length,
            total_paginas: totalPaginas,
          },
          ip_origen: actor.ip,
          user_agent: actor.userAgent,
        }).catch((e) => console.warn("[Auditoria] Error:", e));
      }

      return docListo;
    } catch (procErr: any) {
      console.error(`[Procesamiento RAG] Error procesando documento ${docCreado.id}:`, procErr.message);

      // Limpieza exhaustiva: eliminar fragmentos residuales para no dejar fragmentos utilizables
      await this.ragRepo.limpiarFragmentosDeDocumento(docCreado.id).catch(() => {});

      const mensajeErrorSeguro = procErr.message || "Error interno durante la vectorización del documento.";
      const docError = await this.ragRepo.actualizarDocumento(docCreado.id, {
        estado_procesamiento: "ERROR",
        error_mensaje: mensajeErrorSeguro,
        activo: false,
        total_fragmentos: 0,
      });

      if (this.auditoriaRepo) {
        await this.auditoriaRepo.registrarEvento({
          actor_usuario_id: actor.id,
          rol_actor: actor.rol,
          accion: "ERROR_PROCESAMIENTO_RAG",
          entidad_tipo: "rag_documentos",
          entidad_id: docError.id,
          motivo: `Fallo en el procesamiento de '${docError.codigo}' v${docError.version}: ${mensajeErrorSeguro}`,
          valor_nuevo: {
            estado_procesamiento: "ERROR",
            error_mensaje: mensajeErrorSeguro,
          },
          ip_origen: actor.ip,
          user_agent: actor.userAgent,
        }).catch((e) => console.warn("[Auditoria] Error:", e));
      }

      (procErr as any).statusCode = (procErr as any).statusCode || 400;
      (procErr as any).codigo = (procErr as any).codigo || "ERROR_PROCESAMIENTO_RAG";
      throw procErr;
    }
  }
}
