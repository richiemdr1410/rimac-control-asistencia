import { GoogleGenAI } from "@google/genai";
import type { IGenAiProvider } from "../domain/rag.types.js";

export class GeminiGenAiProvider implements IGenAiProvider {
  private ai: GoogleGenAI;
  public readonly modeloGenerativo = "gemini-3.8-flash";
  public readonly modeloEmbedding = "gemini-embedding-2-preview";

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("[GeminiProvider] GEMINI_API_KEY no detectada en process.env. Las llamadas fallarán si no se provee clave.");
    }
    this.ai = new GoogleGenAI({ apiKey: apiKey || "" });
  }

  /**
   * Genera el vector de embedding semántico usando gemini-embedding-2-preview.
   */
  async generarEmbedding(texto: string): Promise<number[]> {
    let ultimoError: any = null;

    for (let intento = 1; intento <= 3; intento++) {
      try {
        const respuesta = await this.ai.models.embedContent({
          model: this.modeloEmbedding,
          contents: texto,
        });

        // La respuesta puede contener embeddings en formato plural
        const values = respuesta.embeddings?.[0]?.values;
        if (!values || values.length === 0) {
          throw new Error("La API de embeddings no retornó valores de vector válidos.");
        }

        return values;
      } catch (err: any) {
        ultimoError = err;
        const reintentable =
          err?.status === 503 ||
          err?.status === 429 ||
          err?.message?.includes("high demand") ||
          err?.message?.includes("RESOURCE_EXHAUSTED") ||
          err?.code === 503 ||
          err?.code === 429;

        if (intento < 3 && reintentable) {
          console.warn(`[GeminiProvider] Reintento ${intento}/3 para embedding tras sobrecarga/cuota (${err?.status || err?.code})...`);
          await new Promise((res) => setTimeout(res, 1500 * intento));
        } else {
          break;
        }
      }
    }

    throw new Error(`Error generando embedding: ${ultimoError?.message || ultimoError}`);
  }

  /**
   * Genera la respuesta fundamentada usando gemini-3.8-flash con fallback en caso de 503/429.
   */
  async generarRespuesta(params: {
    systemPrompt: string;
    promptUsuario: string;
    temperatura?: number;
  }): Promise<{
    texto: string;
    tokensEntrada?: number;
    tokensSalida?: number;
    tokensTotales?: number;
    modeloUsado?: string;
  }> {
    const modelosIntentar = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
    let ultimoError: any = null;

    for (const modelo of modelosIntentar) {
      for (let intento = 1; intento <= 2; intento++) {
        try {
          const respuesta = await this.ai.models.generateContent({
            model: modelo,
            contents: params.promptUsuario,
            config: {
              systemInstruction: params.systemPrompt,
              temperature: params.temperatura ?? 0.1, // Temperatura baja para estricta fidelidad documental
            },
          });

          const texto = respuesta.text || "";
          const usage = respuesta.usageMetadata;

          return {
            texto,
            tokensEntrada: usage?.promptTokenCount,
            tokensSalida: usage?.candidatesTokenCount,
            tokensTotales: usage?.totalTokenCount,
            modeloUsado: modelo,
          };
        } catch (err: any) {
          ultimoError = err;
          const esReintentable =
            err?.status === 503 ||
            err?.status === 429 ||
            err?.message?.includes("503") ||
            err?.message?.includes("429") ||
            err?.message?.includes("high demand") ||
            err?.message?.includes("RESOURCE_EXHAUSTED") ||
            err?.code === 503 ||
            err?.code === 429;

          if (esReintentable) {
            console.warn(`[GeminiProvider] Modelo ${modelo} temporalmente no disponible, intento ${intento}/2. Esperando...`);
            await new Promise((res) => setTimeout(res, 1500 * intento));
          } else {
            break;
          }
        }
      }
    }

    throw new Error(`Error en modelo generativo Gemini tras agotar reintentos y modelos alternativos: ${ultimoError?.message || ultimoError}`);
  }
}
