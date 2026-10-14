import { CHUNKS_REGLAMENTO_INTERNO } from "../corpus/reglamento-data.js";
import type { IRagRepository, IGenAiProvider, FragmentoDocumento } from "../domain/rag.types.js";

export class IngestaRagService {
  constructor(
    private ragRepo: IRagRepository,
    private genAiProvider: IGenAiProvider
  ) {}

  /**
   * Asegura que el corpus documental DTH-REG-001 esté indexado con sus embeddings semánticos en Firestore.
   */
  async asegurarCorpusIngestado(forzarReindexacion: boolean = false): Promise<{
    fragmentosIndexados: number;
    yaEstabaIndexado: boolean;
    dimensionesVector: number;
  }> {
    const totalExistente = await this.ragRepo.contarFragmentos();

    if (totalExistente >= CHUNKS_REGLAMENTO_INTERNO.length && !forzarReindexacion) {
      console.log(`[RAG Ingesta] Corpus documental DTH-REG-001 ya se encuentra indexado (${totalExistente} fragmentos).`);
      return {
        fragmentosIndexados: totalExistente,
        yaEstabaIndexado: true,
        dimensionesVector: 3072,
      };
    }

    console.log(`[RAG Ingesta] Iniciando generación de embeddings e indexación para ${CHUNKS_REGLAMENTO_INTERNO.length} fragmentos...`);
    const fragmentosConEmbeddings: FragmentoDocumento[] = [];

    for (let i = 0; i < CHUNKS_REGLAMENTO_INTERNO.length; i++) {
      const baseChunk = CHUNKS_REGLAMENTO_INTERNO[i];
      console.log(`[RAG Ingesta] Generando embedding ${i + 1}/${CHUNKS_REGLAMENTO_INTERNO.length}: ${baseChunk.chunk_id}...`);

      const embedding = await this.genAiProvider.generarEmbedding(
        `${baseChunk.titulo} - ${baseChunk.articulo}: ${baseChunk.contenido}`
      );

      fragmentosConEmbeddings.push({
        ...baseChunk,
        embedding,
      });

      // Pausa leve para evitar exceder rate limit de cuotas
      if (i < CHUNKS_REGLAMENTO_INTERNO.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }

    const guardados = await this.ragRepo.guardarFragmentos(fragmentosConEmbeddings);
    console.log(`[RAG Ingesta] Indexación exitosa de ${guardados} fragmentos con embeddings en Firestore.`);

    return {
      fragmentosIndexados: guardados,
      yaEstabaIndexado: false,
      dimensionesVector: fragmentosConEmbeddings[0]?.embedding?.length || 3072,
    };
  }
}
