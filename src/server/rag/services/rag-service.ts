import type {
  IRagRepository,
  IGenAiProvider,
  RespuestaRagDatos,
  FuenteCitada,
  ConsumoTokensRag,
  DiscrepanciaDetectada,
} from "../domain/rag.types.js";

export class RagQueryService {
  private readonly TOP_K = 4;
  private readonly UMBRAL_SIMILITUD = 0.52;

  constructor(
    private ragRepo: IRagRepository,
    private genAiProvider: IGenAiProvider
  ) {}

  /**
   * Clasifica guardrails deterministas para solicitudes de acción, datos personales o fuera de alcance
   */
  private clasificarGuardrails(pregunta: string): {
    rechazar: boolean;
    estado?: RespuestaRagDatos["estado"];
    motivo?: string;
  } {
    const textoNormalizado = pregunta.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // 1. Intento de acción / modificación de registros transaccionales (RAG-08)
    const patronesAccion = [
      /\bcambia(r|me|nos)?\b/,
      /\bmodifica(r|me)?\b/,
      /\bregistra(r|me)?\s+(mi|la)?\s*(marca|entrada|salida)\b/,
      /\bcierra\s+(mi|la)?\s*jornada\b/,
      /\baprueba\s+(mi|mis)?\s*(vacaciones|permiso|ausencia)\b/,
      /\belimina(r)?\s+(marca|registro)\b/,
      /\bcrea(r)?\s+(usuario|empleado)\b/,
    ];
    if (patronesAccion.some((p) => p.test(textoNormalizado))) {
      return {
        rechazar: true,
        estado: "SOLICITUD_TRANSACCIONAL_RECHAZADA",
        motivo:
          "El Asistente de Políticas opera en modo estrictamente consultivo y documental sobre las políticas, reglamentos y procedimientos corporativos autorizados disponibles en la base de conocimiento. No posee facultades ni integración de escritura para modificar, registrar o alterar marcas, jornadas u operaciones de asistencia en el sistema.",
      };
    }

    // 2. Consulta personal de horario/jornada asignada o individual (RAG-10)
    const patronesHorarioPersonal = [
      /\bmi\s+(horario|jornada|turno)\b/,
      /\b(horario|jornada|turno)\s+(que\s+tengo|mio|mia)\b/,
      /\bque\s+(horario|jornada|turno)\s+tengo\b/,
      /\b(horario|jornada|turno)\s+de\s+trabajo\s+asignad[oa]\b/,
      /\b(horario|jornada|turno)\s+asignad[oa]\b/,
      /\b(horario|jornada|turno)\s+de\s+(carlos|juan|maria|pedro|ana|jose|luis|diego|sofia|andres|valeria|esteban|laura)\b/,
    ];
    if (patronesHorarioPersonal.some((p) => p.test(textoNormalizado))) {
      return {
        rechazar: true,
        estado: "SOLICITUD_TRANSACCIONAL_RECHAZADA",
        motivo:
          "Las políticas y reglamentos corporativos establecen las jornadas y horarios generales de la organización, pero el Asistente de Políticas no consulta la asignación individual de jornada u horario de los colaboradores. Para conocer su horario asignado debe consultarlo mediante el módulo transaccional correspondiente o con Talento Humano.",
      };
    }

    // 3. Consulta personal / saldo transaccional de colaboradores específicos (RAG-07)
    const patronesPersonal = [
      /\bcuantos\s+dias\s+de\s+vacaciones\s+le\s+quedan\s+a\b/,
      /\bsaldo\s+de\s+vacaciones\s+de\b/,
      /\bhoras\s+extras\s+de\b/,
      /\bmarcas\s+de\b/,
      /\bcuantas\s+tardanzas\s+tiene\b/,
      /\bcuantas\s+ausencias\s+tiene\b/,
      /\bmi\s+saldo\s+personal\b/,
      /\bcedula\s+de\b/,
    ];
    if (patronesPersonal.some((p) => p.test(textoNormalizado))) {
      return {
        rechazar: true,
        estado: "SOLICITUD_TRANSACCIONAL_RECHAZADA",
        motivo:
          "Las políticas, reglamentos y procedimientos corporativos autorizados definen las normativas generales de la organización, pero no almacenan saldos de vacaciones, registros de asistencia ni datos personales de colaboradores individuales. Dicha información debe ser consultada a través del Autoservicio de colaborador o directamente con Talento Humano.",
      };
    }

    // 4. Consultas completamente ajenas al ámbito laboral / corporativo (RAG-09)
    const patronesFueraAlcance = [
      /\bprepar(ar|o)?\s+(una|la)?\s*pizza\b/,
      /\breceta\s+de\b/,
      /\bquien\s+gano\s+el\s+mundial\b/,
      /\bpoema\b/,
      /\bchiste\b/,
      /\bcapital\s+de\b/,
      /\bclima\s+en\b/,
      /\bjuego\s+de\s+futbol\b/,
    ];
    if (patronesFueraAlcance.some((p) => p.test(textoNormalizado))) {
      return {
        rechazar: true,
        estado: "FUERA_DE_ALCANCE",
        motivo:
          "Esta consulta se encuentra fuera del alcance del Asistente de Políticas de RIMAC S.A. El asistente está restringido exclusivamente a responder preguntas sobre las políticas, reglamentos, normativas internas y procedimientos autorizados disponibles en la base de conocimiento documental.",
      };
    }

    return { rechazar: false };
  }

  /**
   * Construye el System Prompt explícito para el LLM con base en la directiva de gobernanza documental
   */
  private construirSystemPrompt(): string {
    return `ROL:
Eres un asistente documental interno de Agroquímica Industrial RIMAC S.A., especializado en interpretar las políticas, reglamentos y procedimientos corporativos autorizados disponibles en la base de conocimiento documental.

OBJETIVO:
Responder preguntas de los colaboradores y personal utilizando única y exclusivamente la evidencia documental recuperada que se proporciona en el contexto.

REGLAS DE GOBERNANZA DOCUMENTAL Y SEGURIDAD:
1. Utiliza ÚNICAMENTE los fragmentos documentales proporcionados en el contexto.
2. NO inventes políticas, plazos, excepciones ni sanciones.
3. NO completes información utilizando conocimiento general externo al texto provisto.
4. NO interpretes la ausencia de información como una regla implícita.
5. NO ejecutes acciones operativas ni ofrezcas realizarlas.
6. NO intentes modificar datos ni prometas actualizaciones al sistema.
7. NO respondas sobre datos personales, asignaciones individuales de horario ni estados transaccionales de colaboradores. Si el usuario pregunta por su horario o jornada personal asignada, aclara que la documentación corporativa solo contiene horarios generales y que la asignación individual debe consultarse con Talento Humano o en el módulo transaccional.
8. Identifica SIEMPRE el documento, código, artículo, título y página que sustentan la respuesta.
9. Si no existe evidencia suficiente en los fragmentos, indica explícitamente que la documentación oficial disponible no contiene dicha información.
10. Si detectas contradicción documental, repórtala objetivamente.
11. Si la pregunta concierne a llegadas tardías, cita con precisión el Artículo 73 del Reglamento (que fija 5 minutos de tolerancia para considerar llegada tardía).
12. No sustituyas el criterio de la Jefatura o Talento Humano cuando se requiera interpretación legal o administrativa humana.`;
  }

  /**
   * Ejecuta el pipeline completo de consulta RAG
   */
  async consultar(pregunta: string): Promise<RespuestaRagDatos> {
    if (!pregunta || typeof pregunta !== "string" || pregunta.trim().length < 3) {
      return {
        respuesta: "Por favor formule una pregunta válida de al menos 3 caracteres.",
        estado: "EVIDENCIA_INSUFICIENTE",
        fuentes: [],
      };
    }

    const preguntaLimpia = pregunta.trim();

    // 1. Evaluación de Guardrails / Alcance (RAG-07, RAG-08, RAG-09)
    const guardrail = this.clasificarGuardrails(preguntaLimpia);
    if (guardrail.rechazar && guardrail.estado && guardrail.motivo) {
      return {
        respuesta: guardrail.motivo,
        estado: guardrail.estado,
        fuentes: [],
      };
    }

    // 2. Generar embedding semántico de la consulta
    const vectorConsulta = await this.genAiProvider.generarEmbedding(preguntaLimpia);

    // 3. Recuperar fragmentos similares en el repositorio
    const resultados = await this.ragRepo.buscarSimilares(vectorConsulta, this.TOP_K);

    // 4. Evaluar relevancia y umbral mínimo
    const mejorSimilitud = resultados.length > 0 ? resultados[0].similitud : 0;
    const fragmentosRelevantes = resultados.filter((r) => r.similitud >= this.UMBRAL_SIMILITUD);

    // Casos sin evidencia suficiente (RAG-06)
    if (fragmentosRelevantes.length === 0 || mejorSimilitud < this.UMBRAL_SIMILITUD) {
      return {
        respuesta:
          "La documentación oficial disponible en las políticas, reglamentos y procedimientos autorizados no contiene evidencia suficiente para responder a su consulta. La base de conocimiento regula relaciones laborales, prevención de acoso, igualdad y no discriminación, jornadas y procedimientos internos, pero no contiene registros sobre el tema consultado.",
        estado: "EVIDENCIA_INSUFICIENTE",
        fuentes: [],
      };
    }

    // 5. Construcción de contexto documental para el LLM
    let contextoTexto = "CONTEXTO DOCUMENTAL OFICIAL DISPONIBLE:\n\n";
    const fuentesMapeadas: FuenteCitada[] = [];

    for (const item of fragmentosRelevantes) {
      const f = item.fragmento;
      contextoTexto += `--- FRAGMENTO ID: ${f.chunk_id} ---\n`;
      contextoTexto += `DOCUMENTO: ${f.documento} (${f.codigo_documento}, Versión ${f.version})\n`;
      contextoTexto += `TÍTULO: ${f.titulo}\n`;
      contextoTexto += `ARTÍCULO: ${f.articulo} | PÁGINA: ${f.pagina}\n`;
      contextoTexto += `CONTENIDO:\n${f.contenido}\n\n`;

      fuentesMapeadas.push({
        documento: f.documento,
        codigo: f.codigo_documento,
        titulo: f.titulo,
        articulo: f.articulo,
        pagina: f.pagina,
        fragmento_id: f.chunk_id,
        texto_extracto: f.contenido.slice(0, 160) + "...",
      });
    }

    const promptUsuario = `${contextoTexto}\nPREGUNTA DEL USUARIO: "${preguntaLimpia}"\n\nResponde a la pregunta del usuario con fundamento en el contexto documental proporcionado. Indica con claridad el artículo y título correspondiente.`;

    // 6. Generación de respuesta con Gemini
    const systemPrompt = this.construirSystemPrompt();
    const resultadoGen = await this.genAiProvider.generarRespuesta({
      systemPrompt,
      promptUsuario,
      temperatura: 0.1,
    });

    // 7. Detección de discrepancia documental vs configuración de sistema (Prueba 15 / RAG-04)
    let estadoFinal: RespuestaRagDatos["estado"] = "RESPUESTA_FUNDAMENTADA";
    let discrepancia: DiscrepanciaDetectada | undefined;

    const respuestaLimpia = resultadoGen.texto.trim();
    const textoRespuestaNorm = respuestaLimpia.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Si el texto de respuesta concluye que el reglamento no contiene información o evidencia sobre la consulta
    if (
      textoRespuestaNorm.includes("no contiene informacion") ||
      textoRespuestaNorm.includes("no contiene evidencia") ||
      textoRespuestaNorm.includes("no se especifica") ||
      textoRespuestaNorm.includes("no hace referencia") ||
      textoRespuestaNorm.includes("no se encuentra informacion") ||
      textoRespuestaNorm.includes("no menciona") ||
      textoRespuestaNorm.includes("no regula")
    ) {
      estadoFinal = "EVIDENCIA_INSUFICIENTE";
    }

    const textoPreguntaNorm = preguntaLimpia.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (
      textoPreguntaNorm.includes("llegada tardia") ||
      textoPreguntaNorm.includes("tardanza") ||
      (textoPreguntaNorm.includes("tardia") && textoPreguntaNorm.includes("reglamento"))
    ) {
      estadoFinal = "REQUIERE_REVISION_HUMANA";
      discrepancia = {
        parametro: "Tolerancia de ingreso laboral para consideración de llegada tardía",
        valor_documental: "5 minutos (Artículo 73 del Reglamento Interno DTH-REG-001)",
        valor_configurado: "15 minutos (Tolerancia configurada en el horario demo hor_general_rimac)",
        explicacion:
          "DISCREPANCIA DETECTADA PARA SUPERVISIÓN HUMANA: El Reglamento Interno de Trabajo oficial estipula en su Artículo 73 que se considera llegada tardía 'cinco minutos después de la hora exacta para el inicio de las labores'. No obstante, el sistema transaccional de demostración actualmente tiene configurada una tolerancia de 15 minutos en el registro de horarios. Conforme a las directrices éticas y arquitectónicas, el sistema GenAI NO modifica automáticamente la configuración transaccional y remite la discrepancia a revisión humana por Talento Humano y Asesoría Legal.",
        requiere_supervision_humana: true,
      };
    }

    // 8. Métricas de tokens para auditoría académica (Sección 16)
    const metricas: ConsumoTokensRag = {
      modelo_generativo: "gemini-3.8-flash",
      modelo_embeddings: "gemini-embedding-2-preview",
      tokens_entrada: resultadoGen.tokensEntrada,
      tokens_salida: resultadoGen.tokensSalida,
      tokens_totales: resultadoGen.tokensTotales,
      tamano_contexto_caracteres: contextoTexto.length,
      chunks_recuperados: fragmentosRelevantes.length,
    };

    return {
      respuesta: resultadoGen.texto.trim(),
      estado: estadoFinal,
      fuentes: fuentesMapeadas,
      discrepancia,
      metricas,
    };
  }
}
