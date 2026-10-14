import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface GuardarArchivoInput {
  buffer: Buffer;
  codigo: string;
  version: string;
  nombreOriginal: string;
}

export interface GuardarArchivoOutput {
  hash: string;
  rutaAlmacenamiento: string;
  tamanoBytes: number;
}

export interface IDocumentStorageService {
  guardarArchivo(input: GuardarArchivoInput): Promise<GuardarArchivoOutput>;
  obtenerArchivo(rutaRelativa: string): Promise<Buffer>;
  existeArchivo(rutaRelativa: string): Promise<boolean>;
  eliminarArchivo(rutaRelativa: string): Promise<boolean>;
  calcularHash(buffer: Buffer): string;
}

/**
 * Adaptador de almacenamiento persistente local en disco.
 * Almacena los archivos originales fuera de PostgreSQL y fuera de las carpetas públicas/estáticas.
 * Por defecto en ./storage/rag_docs o la variable RAG_STORAGE_PATH.
 */
export class LocalDocumentStorageService implements IDocumentStorageService {
  private baseDir: string;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || process.env.RAG_STORAGE_PATH || path.resolve(process.cwd(), "storage/rag_docs");
    this.asegurarDirectorio(this.baseDir);
  }

  private asegurarDirectorio(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  calcularHash(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  private sanitizarSegmento(valor: string): string {
    return valor.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  async guardarArchivo(input: GuardarArchivoInput): Promise<GuardarArchivoOutput> {
    const hash = this.calcularHash(input.buffer);
    const codSanitizado = this.sanitizarSegmento(input.codigo);
    const verSanitizada = this.sanitizarSegmento(input.version);

    // Estructura de carpetas: storage/rag_docs/{codigo}/{version}/
    const subDirRelativo = path.join(codSanitizado, verSanitizada);
    const targetDirAbsoluto = path.join(this.baseDir, subDirRelativo);
    this.asegurarDirectorio(targetDirAbsoluto);

    // Nombre privado con hash inmutable
    const nombreArchivo = `${hash}.pdf`;
    const rutaAbsoluta = path.join(targetDirAbsoluto, nombreArchivo);
    const rutaRelativa = path.join("storage/rag_docs", subDirRelativo, nombreArchivo);

    fs.writeFileSync(rutaAbsoluta, input.buffer);

    return {
      hash,
      rutaAlmacenamiento: rutaRelativa,
      tamanoBytes: input.buffer.length,
    };
  }

  async obtenerArchivo(rutaAlmacenamiento: string): Promise<Buffer> {
    // Normalizar ruta para evitar path traversal
    let rutaAbsoluta: string;
    if (rutaAlmacenamiento.startsWith("storage/rag_docs/")) {
      const relativa = rutaAlmacenamiento.replace(/^storage\/rag_docs\//, "");
      rutaAbsoluta = path.join(this.baseDir, relativa);
    } else {
      rutaAbsoluta = path.resolve(this.baseDir, path.basename(rutaAlmacenamiento));
    }

    if (!fs.existsSync(rutaAbsoluta)) {
      throw new Error(`El archivo original no fue encontrado en la ruta de almacenamiento persistente: ${rutaAlmacenamiento}`);
    }

    return fs.readFileSync(rutaAbsoluta);
  }

  async existeArchivo(rutaAlmacenamiento: string): Promise<boolean> {
    try {
      let rutaAbsoluta: string;
      if (rutaAlmacenamiento.startsWith("storage/rag_docs/")) {
        const relativa = rutaAlmacenamiento.replace(/^storage\/rag_docs\//, "");
        rutaAbsoluta = path.join(this.baseDir, relativa);
      } else {
        rutaAbsoluta = path.resolve(this.baseDir, path.basename(rutaAlmacenamiento));
      }
      return fs.existsSync(rutaAbsoluta);
    } catch {
      return false;
    }
  }

  async eliminarArchivo(rutaAlmacenamiento: string): Promise<boolean> {
    try {
      let rutaAbsoluta: string;
      if (rutaAlmacenamiento.startsWith("storage/rag_docs/")) {
        const relativa = rutaAlmacenamiento.replace(/^storage\/rag_docs\//, "");
        rutaAbsoluta = path.join(this.baseDir, relativa);
      } else {
        rutaAbsoluta = path.resolve(this.baseDir, path.basename(rutaAlmacenamiento));
      }
      if (fs.existsSync(rutaAbsoluta)) {
        fs.unlinkSync(rutaAbsoluta);
        return true;
      }
      return false;
    } catch (e) {
      console.warn("[LocalDocumentStorageService] Error eliminando archivo físico:", e);
      return false;
    }
  }
}

// Instancia singleton por defecto
export const documentStorage = new LocalDocumentStorageService();
