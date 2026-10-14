/**
 * Corpus Documental Oficial y Autorizado:
 * DTH-REG-001 — REGLAMENTO INTERNO DE TRABAJO RIMAC S.A.
 * Versión: 1 | Vigencia desde: Enero - 2022
 * Aprobado por: Eugenia Lara Povedano (Sub-Gerente General)
 * Revisado por: Elmerson Vividea Castellón (Jefe de Talento Humano)
 * Elaborado por: Luis Carlos Rojas (Abogado Outsourcing)
 */

import type { FragmentoDocumento } from "../domain/rag.types.js";

export const CHUNKS_REGLAMENTO_INTERNO: Omit<FragmentoDocumento, "embedding">[] = [
  // PÁGINA 1: PORTADA Y APROBACIÓN
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "PORTADA Y DATOS DE APROBACIÓN",
    articulo: "APROBACIÓN INSTITUCIONAL",
    pagina: 1,
    chunk_id: "DTH-REG-001-PORTADA",
    contenido:
      "REGLAMENTO INTERNO DE TRABAJO - AGROQUÍMICA INDUSTRIAL RIMAC S.A. Código: DTH-REG-001. Versión: 1. Vigencia desde: Enero - 2022. Elaborado por: Luis Carlos Rojas (Abogado Outsourcing, Marzo 2019). Revisado por: Elmerson Vividea Castellón (Jefe de Talento Humano, Enero 2022). Aprobado por: Eugenia Lara Povedano (Sub-Gerente General, Enero 2022).",
  },

  // PÁGINA 2: TITULO I - DISPOSICIONES GENERALES
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO I - DISPOSICIONES GENERALES",
    articulo: "ARTICULO 1",
    pagina: 2,
    chunk_id: "DTH-REG-001-ART-01",
    contenido:
      "TITULO I - DISPOSICIONES GENERALES. ARTICULO 1: Se establece este Reglamento Interno de Trabajo, que en lo sucesivo se denominará 'Reglamento', para normar las relaciones internas entre Agroquímica Industrial Rimac S.A. y sus colaboradores con ocasión o por consecuencia del trabajo, de conformidad con lo prescrito en los artículos 66, 67 y 68 del Código de Trabajo; 29 inciso e) y 31 de la Ley Orgánica del Ministerio de Trabajo y Seguridad Social; y lo establecido en el Decreto Nº 36946 del 29 de julio de 2011 y sus reformas, Reglamento para el Trámite de Revisión y Aprobación de los Reglamentos Internos de Trabajo.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO I - DISPOSICIONES GENERALES",
    articulo: "ARTÍCULO 2",
    pagina: 2,
    chunk_id: "DTH-REG-001-ART-02-P1",
    contenido:
      "TITULO I - DISPOSICIONES GENERALES. ARTÍCULO 2: Para los efectos de este reglamento, se entiende por: A. PERSONA EMPLEADORA: AGROQUIMICA INDUSTRIAL RIMAC, S.A., cuyo centro de trabajo se encuentra ubicado en Cartago, San Nicolás, La Lima, de la plaza de fútbol 300 metros oeste y 100 metros norte y dedicada a formulación y comercialización de productos Agroquímicos. En este reglamento se podrá abreviar como RIMAC S.A. B. REPRESENTANTES DE LA PERSONA EMPLEADORA: El presidente de la Junta Directiva, el Gerente General y en general todas aquellas personas que debidamente autorizadas por ellos ejerzan dentro de RIMAC S.A. funciones de dirección, administración dentro de la empresa. Los representantes patronales obligan a la persona empleadora, en las relaciones que tengan con las personas trabajadoras de RIMAC S.A. como si éstas personalmente hubieran realizado el acto o actos de que se trate.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO I - DISPOSICIONES GENERALES",
    articulo: "ARTÍCULO 2",
    pagina: 3,
    chunk_id: "DTH-REG-001-ART-02-P2",
    contenido:
      "TITULO I - DISPOSICIONES GENERALES. ARTÍCULO 2 (Continuación): C. PERSONA TRABAJADORA: Las personas físicas que prestan a RIMAC S.A. sus servicios materiales y/o intelectuales o en forma subordinada y a cambio de una retribución o salario, sea en forma permanente o transitoria, y como consecuencia de una relación laboral o de un contrato de trabajo, verbal o escrito, expreso o tácito, individual o colectivo.",
  },

  // PÁGINA 3: TITULO II - CONTRATOS DE TRABAJO
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO II - CONTRATOS DE TRABAJO",
    articulo: "ARTÍCULO 3",
    pagina: 3,
    chunk_id: "DTH-REG-001-ART-03",
    contenido:
      "TITULO II - CONTRATOS DE TRABAJO. ARTÍCULO 3: Toda persona que trabaje en RIMAC S.A., está amparada por un contrato de trabajo escrito, que contiene, en términos amplios, las cláusulas y estipulaciones particulares que regulen la prestación de servicios. Este contrato puede ser complementado por Acciones de Personal debidamente firmadas por los representantes patronales y el trabajador dando las partes enteradas de las disposiciones legales establecidas en el código de trabajo. Las condiciones de las personas trabajadoras adolescentes mayores de quince años, pero menores de dieciocho años, se regirán por lo dispuesto en el Código de la Niñez y la Adolescencia en lo que sea aplicable y demás normativa relacionada o conexa.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO II - CONTRATOS DE TRABAJO",
    articulo: "ARTÍCULO 4 y 5",
    pagina: 3,
    chunk_id: "DTH-REG-001-ART-04-05",
    contenido:
      "TITULO II - CONTRATOS DE TRABAJO. ARTÍCULO 4: Tiene la condición de Contrato de Trabajo, la Acción de Personal, en la que se consigna las condiciones de contratación y la firma de la persona que trabaja. ARTICULO 5: Pese a lo dispuesto en los artículos anteriores, se presume la existencia del contrato de trabajo entre RIMAC S.A. y quienes le presten sus servicios personales, en forma subordinada y a cambio de una retribución o salario de cualquier clase o forma.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO II - CONTRATOS DE TRABAJO",
    articulo: "ARTÍCULO 6 y 7",
    pagina: 4,
    chunk_id: "DTH-REG-001-ART-06-07",
    contenido:
      "TITULO II - CONTRATOS DE TRABAJO. ARTÍCULO 6: Además de los contratos por tiempo indefinido, en RIMAC S.A. se suscribirán contratos a plazo fijo, de temporada, ocasionales y eventuales, los cuales se regirán por los principios legales y doctrinarios que los sustentan. ARTÍCULO 7: Al inicio de todo contrato o relación de trabajo por tiempo indefinido, así como en los casos de ascensos o de traslados, hay un período de prueba de tres meses, salvo que se convenga un plazo menor. Durante el período de prueba y sin aviso previo, cualquiera de las partes puede dar por terminado el contrato o relación laboral que los une, sin responsabilidad.",
  },

  // PÁGINA 4-7: TITULO III - JORNADA Y HORARIO DE TRABAJO
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO III - JORNADA Y HORARIO DE TRABAJO",
    articulo: "ARTÍCULO 8",
    pagina: 4,
    chunk_id: "DTH-REG-001-ART-08",
    contenido:
      "TITULO III - JORNADA Y HORARIO DE TRABAJO. ARTÍCULO 8: La jornada de trabajo se desarrolla en Cartago, San Nicolás, La Lima, de la plaza de fútbol 300 metros oeste y 100 metros norte o en cualquier otro sitio que RIMAC S.A. ocupe en el futuro. El cambio de lugar de trabajo será puesto en conocimiento de las personas trabajadoras con 30 días de antelación de acuerdo con la normativa del Ius Variandi.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO III - JORNADA Y HORARIO DE TRABAJO",
    articulo: "ARTÍCULO 9 (Jornada Diurna Acumulativa y Turnos)",
    pagina: 4,
    chunk_id: "DTH-REG-001-ART-09-P1",
    contenido:
      "TITULO III - JORNADA Y HORARIO DE TRABAJO. ARTÍCULO 9: En RIMAC S.A. se labora en jornada Diurna y Mixta, según necesidades imperantes en el mercado se podrá realizar la apertura de jornada nocturna. En el caso de la jornada Diurna se trabaja jornada acumulativa. Asimismo, rigen los siguientes horarios, en forma: JORNADA DIURNA ACUMULATIVA: - Lunes: de 7:30 a.m., a 5:30 p.m. - Martes a viernes: de 7:30 a.m., a 5:00 p.m. - Los contratos de trabajo para personal operativo se realizarán con jornadas variables (diurna, mixta y nocturna), esto de acuerdo con la necesidad de la operación de la compañía.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO III - JORNADA Y HORARIO DE TRABAJO",
    articulo: "ARTÍCULO 9 (Descansos: Almuerzo, Desayuno y Café)",
    pagina: 5,
    chunk_id: "DTH-REG-001-ART-09-P2",
    contenido:
      "TITULO III - JORNADA Y HORARIO DE TRABAJO. ARTÍCULO 9 (Descansos y Alimentación): DESCANSOS: - Entre 12:00 PM y 1:30 P.M. se disfrutará 30 minutos para horario de almuerzo. - Entre 8:30 a.m., a 10:00 a.m. quedará a discreción de RIMAC S.A, y en coordinación con la jefatura inmediata un tiempo de 15 min para ingerir alimentos (Desayuno). - Entre 3:00 p.m., a 3:30 p.m. quedará a discreción de RIMAC S.A, y en coordinación con la jefatura inmediata un tiempo de 15 min para ingerir alimentos (Café). Por la naturaleza de la actividad los trabajadores en plantas de producción y otros que por sus funciones se exponen al contacto de materias primas, dispondrán de 5 minutos adicionales antes de cada tiempo de alimentación y de 10 minutos antes de la hora de salida para su aseo personal, todo de conformidad con el protocolo de salud ocupacional.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO III - JORNADA Y HORARIO DE TRABAJO",
    articulo: "ARTICULO 10",
    pagina: 5,
    chunk_id: "DTH-REG-001-ART-10",
    contenido:
      "TITULO III - JORNADA Y HORARIO DE TRABAJO. ARTICULO 10: De acuerdo con el artículo 143 del Código de Trabajo, el Presidente, los y las Gerentes, Subgerentes, y todos aquellos empleados que trabajan sin fiscalización superior inmediata; los trabajadores que ocupan puesto de confianza; y empleados similares que no cumplan su cometido en el local del establecimiento; los que desempeñan funciones discontinuas o que requieran su sola presencia; y las personas que realizan labores que por su indudable naturaleza no están sometidas a jornada de trabajo, así como impulsadoras y promotores, quedan excluidos de las limitaciones de las jornadas ordinarias anteriormente reguladas, ya que para ellos ésta podría ser hasta de doce horas diarias, con una hora y media como mínimo de descanso para alimentación, que debe ser tomada a la mitad de la jornada. Estas personas trabajadoras no podrán laborar jornada extraordinaria.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO III - JORNADA Y HORARIO DE TRABAJO",
    articulo: "ARTICULO 11 y 12",
    pagina: 6,
    chunk_id: "DTH-REG-001-ART-11-12",
    contenido:
      "TITULO III - JORNADA Y HORARIO DE TRABAJO. ARTICULO 11: Se considera tiempo efectivo de trabajo aquél en que las personas trabajadoras permanezcan bajo las órdenes o dirección inmediata o delegada de la persona empleadora. ARTÍCULO 12: RIMAC S.A., podrá modificar transitoriamente los horarios establecidos en este reglamento, siempre que circunstancias especiales así lo exijan y no se cause grave perjuicio a las personas trabajadoras. El cambio será comunicado a todas las personas trabajadoras afectadas con un mínimo de tres días de anticipación. La modificación definitiva de los horarios se someterá al trámite de aprobación de la Dirección de Asuntos Jurídicos del Ministerio de Trabajo y Seguridad Social.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO III - JORNADA Y HORARIO DE TRABAJO",
    articulo: "ARTICULO 13",
    pagina: 6,
    chunk_id: "DTH-REG-001-ART-13",
    contenido:
      "TITULO III - JORNADA Y HORARIO DE TRABAJO. ARTICULO 13: Cuando necesidades imperiosas de RIMAC S.A. lo requieran, las personas trabajadoras tienen la ineludible obligación de laborar en horas extraordinarias, salvo impedimento grave, hasta por el máximo de horas permitido por la Ley; sea que la jornada ordinaria sumada a la extraordinaria no podrá exceder de doce horas diarias. En cada caso concreto la persona empleadora comunicará a las personas trabajadoras, al menos con tres días de anticipación, la jornada extraordinaria que deben laborar, pudiendo tenerse la negativa injustificada a hacerlo, como falta grave, para efectos de sanción. Si no se otorgan al menos esos tres días de anticipación, la persona trabajadora puede negarse válidamente a laborar la jornada extraordinaria. Para el personal técnico o de apoyo, la realización de horas extraordinarias se debe dar SOLAMENTE a solicitud del supervisor directo de las personas trabajadoras; es decir que un colaborador o colaboradora no puede decidir por su cuenta que es necesario hacer horas extra. No es permitida la jornada extraordinaria permanente.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO III - JORNADA Y HORARIO DE TRABAJO",
    articulo: "ARTICULO 14 y 15",
    pagina: 7,
    chunk_id: "DTH-REG-001-ART-14-15",
    contenido:
      "TITULO III - JORNADA Y HORARIO DE TRABAJO. ARTICULO 14: Cuando necesidades imperiosas de RIMAC lo exijan, toda persona trabajadora podrá ser requerida por sus superiores para realizar temporalmente cualquier otra labor adicional o diferente, compatible con sus fuerzas, aptitudes, estado o condición, que sea del mismo género de las que forman el objeto de la relación laboral y para la que fue contratado, siempre que la misma no exceda de un mes. ARTICULO 15: Excepto que las personas trabajadoras permanezcan en el centro de labores, bajo las órdenes de la persona empleadora, no se considerará tiempo efectivo de trabajo aquél durante el cual se suspendan las labores por motivos de fuerza mayor o caso fortuito, siempre que dicha suspensión no exceda de un día. RIMAC S.A. podrá convenir con las personas trabajadoras y en reponer las horas perdidas, con el propósito de completar la jornada ordinaria semanal, siempre y cuando tal prestación de servicios se lleve a cabo dentro de la misma semana en que ocurrió el hecho.",
  },

  // PÁGINA 7-8: TITULO IV - SALARIOS
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO IV - SALARIOS",
    articulo: "ARTICULO 16",
    pagina: 7,
    chunk_id: "DTH-REG-001-ART-16",
    contenido:
      "TITULO IV - SALARIOS. ARTICULO 16: RIMAC S.A. paga salarios Mensuales, con adelantos quincenales pagaderos los días 14 y 28 de cada mes en su local, ubicado en Cartago, San Nicolás, La Lima, de la plaza de fútbol 300 metros oeste y 100 norte, el día hábil inmediato anterior si aquél coincide con un día feriado o no laborable, y fines de semana, mediante transferencia bancaria, si el empleado no dispone de la cuenta respectiva se pagara mediante cheque adjuntándose el comprobante correspondiente a cada trabajador, y realizando su incorporación a la banca electrónica del banco en uso.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO IV - SALARIOS",
    articulo: "ARTÍCULO 17 y 18",
    pagina: 8,
    chunk_id: "DTH-REG-001-ART-17-18",
    contenido:
      "TITULO IV - SALARIOS. ARTÍCULO 17: Cuando se acuerde un recargo total de funciones, la persona trabajadora sustituta tiene derecho a recibir un reconocimiento salarial adicional al salario base del puesto de la categoría superior, previa autorización de la Gerencia General. ARTICULO 18: Los reclamos que se originen en materia de pago de salarios deben presentarse para su rápida revisión y corrección, caso de que proceda, en forma escrita ante la Oficina de Contabilidad o bajo aceptación de esta en forma oral, en el plazo de 8 días hábiles contados a partir de la fecha en que se efectuó el pago. Sin embargo, todos los reclamos podrán ser interpuestos en cualquier momento mientras esté vigente el contrato de trabajo y hasta un año después de su conclusión, de conformidad con el artículo 602 y 607 del Código de Trabajo.",
  },

  // PÁGINA 8-9: TITULO V - VACACIONES
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO V - VACACIONES",
    articulo: "ARTICULO 19",
    pagina: 8,
    chunk_id: "DTH-REG-001-ART-19",
    contenido:
      "TITULO V - VACACIONES. ARTICULO 19: Todas las personas trabajadoras de RIMAC S.A. tienen derecho a disfrutar, como mínimo, de dos semanas en concepto de vacaciones anuales remuneradas, después de cada cincuenta semanas de servicios prestados en forma continua. En caso de terminación del contrato o relación de trabajo antes de que la persona trabajadora cumpla ese período de cincuenta semanas, tendrá derecho, como mínimo, a un día de vacaciones por cada mes completo de trabajo, las mismas se pagarán como máximo en un mes después de terminada la relación laboral. Rimac S.A. por el giro del negocio podrá otorgar el disfrute de vacaciones a partir del mes diciembre de cada año, independientemente de la antigüedad y fecha de ingreso del funcionario. Cualquier funcionario que tenga menos de 50 semanas laborar y se le otorguen vacaciones que como mínimo establece la legislación por el trabajo continuo de 50 semanas, gozará de dicho beneficio quedando su saldo vacacional en cero para el siguiente período.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO V - VACACIONES",
    articulo: "ARTÍCULO 20",
    pagina: 9,
    chunk_id: "DTH-REG-001-ART-20",
    contenido:
      "TITULO V - VACACIONES. ARTÍCULO 20: El pago de las vacaciones se hace con base en el promedio de los salarios ordinarios y extraordinarios devengados por la persona trabajadora durante las cincuenta semanas de trabajo, o durante el tiempo que les dé derecho proporcional a ellas. La negativa injustificada de la persona trabajadora a firmar la constancia de haber recibido sus vacaciones anuales se tendrá como falta grave al contrato o relación de trabajo, para los efectos de su sanción. Para los demás aspectos de esta materia, no regulados en este título, se aplicarán las disposiciones de los artículos 153 a 161 del Código de Trabajo.",
  },

  // PÁGINA 9: TITULO VI - DESCANSO SEMANAL
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO VI - DESCANSO SEMANAL",
    articulo: "ARTÍCULO 21",
    pagina: 9,
    chunk_id: "DTH-REG-001-ART-21",
    contenido:
      "TITULO VI - DESCANSO SEMANAL. ARTÍCULO 21: Todas las personas trabajadoras de RIMAC S.A., tienen derecho a disfrutar de un día fijo de descanso absoluto, después de cada semana o de cada seis días de trabajo continuo, que es con goce de salario por aplicarse modalidad de pago mensual.",
  },

  // PÁGINA 9-10: TITULO VII - DIAS FERIADOS
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO VII - DIAS FERIADOS",
    articulo: "ARTÍCULO 22 y 23",
    pagina: 9,
    chunk_id: "DTH-REG-001-ART-22-23",
    contenido:
      "TITULO VII - DIAS FERIADOS. ARTÍCULO 22: Los días feriados no son hábiles para el trabajo. Sin embargo, puede trabajarse en tales días siempre y cuando ello sea posible, al tenor de las excepciones contenidas en los artículos 150 y 151 del Código de Trabajo. ARTICULO 23: En virtud de tener modalidad de pago MENSUAL, y por dedicarse al comercio y conforme a lo estipulado en el párrafo final del artículo 150 del Código de Trabajo, RIMAC S.A. paga a sus personas trabajadoras todos los feriados a que se refiere el artículo 148 del Código de Trabajo, que son: 1º de enero, 11 de abril, Jueves y Viernes Santos, 1º de mayo, 25 de julio, 2 y 15 de agosto, 15 de setiembre, 12 de octubre y 25 de diciembre; los cuales quedan remunerados con el salario que perciben, de manera que a cualquier persona trabajadora que labore un feriado, se le abonará un salario adicional sencillo, para completar el pago doble que establece la ley. Cuando el 12 de octubre sean martes, miércoles, jueves o viernes, la persona empleadora deberá disponer que ese día se trabaje y el disfrute se traslade al lunes siguiente.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO VII - DIAS FERIADOS",
    articulo: "ARTÍCULO 24",
    pagina: 10,
    chunk_id: "DTH-REG-001-ART-24",
    contenido:
      "TITULO VII - DIAS FERIADOS. ARTICULO 24: RIMAC S.A. otorgará a las personas trabajadoras que profesan religiones distintas a la Católica, además de los once feriados de ley, cuando así lo soliciten, hasta cuatro días libres al año, para celebrar sus festejos religiosos, siempre que tales días se encuentren debidamente registrados en el Ministerio de Relaciones Exteriores y Culto, o se ajusten a los requisitos que señala el Decreto Nº 25570-TSS de 7 de octubre de 1996, y sean repuestos posteriormente o deducidos del período de vacaciones, según se convenga con la persona trabajadora interesada.",
  },

  // PÁGINA 11: TITULO VIII - AGUINALDO Y TITULO IX - MUJERES Y MENORES
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO VIII - AGUINALDO",
    articulo: "ARTICULO 25",
    pagina: 11,
    chunk_id: "DTH-REG-001-ART-25",
    contenido:
      "TITULO VIII - AGUINALDO. ARTICULO 25: Todas las personas trabajadoras de RIMAC S.A. de cualquier clase que sean, y cualquiera que sea la forma en que desempeñen sus labores y en que se les pague su salario, tienen derecho al aguinaldo anual, que será igual al promedio mensual de los salarios ordinarios y extraordinarios devengados en los doce meses anteriores al primero de diciembre de cada año, o tiempo menor que hayan laborado. Dicho beneficio será pagado dentro de los primeros veinte días del mes de diciembre de cada año, salvo terminación del contrato o relación de trabajo antes del vencimiento del período respectivo, caso en el cual se les pagará proporcionalmente como máximo en un mes.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO IX - TRABAJO DE LAS MUJERES Y MENORES DE EDAD",
    articulo: "ARTICULO 26",
    pagina: 11,
    chunk_id: "DTH-REG-001-ART-26",
    contenido:
      "TITULO IX - TRABAJO DE LAS MUJERES Y DE LAS PERSONAS MENORES DE EDAD. ARTICULO 26: El trabajo de las mujeres y de las personas menores de edad, caso de que los haya, se regirá por lo que al efecto establecen el Código de Trabajo, el Código de la Niñez y de la Adolescencia y por lo dispuesto en este Reglamento, en lo que les sea aplicable.",
  },

  // PÁGINAS 11-12: TITULO X - USO DE LAS HERRAMIENTAS INFORMATICAS
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO X - USO DE LAS HERRAMIENTAS INFORMATICAS",
    articulo: "ARTÍCULO 27, 28 y 29",
    pagina: 11,
    chunk_id: "DTH-REG-001-ART-27-29",
    contenido:
      "TITULO X - USO DE LAS HERRAMIENTAS INFORMATICAS. ARTÍCULO 27: El acceso a internet en horario de trabajo y desde equipos de propiedad de RIMAC S.A. será moderado, no afectando en ningún caso la productividad de los trabajadores. ARTÍCULO 28: La cuenta de correo corporativa que proporciona RIMAC S.A. se destinará a uso laboral exclusivamente, no pudiéndose utilizar para fines particulares como por ejemplo envío de documentación e información personal. ARTICULO 29: Cualquier trabajador que realice un mal uso de las herramientas informáticas que le han sido asignadas, será formalmente sancionado por escrito y dicha sanción será anexada a su expediente, además se entiende por mal uso la utilización para fines distintos a las laborales por ejemplo redes sociales, juegos, música y videos en línea, redacción, búsqueda e impresión de material ajenos a las labores asignadas. RIMAC S.A. podrá valerse del uso de cámaras de vigilancia en la medida en que éstas no lesionen el derecho a la intimidad de las personas. Los abusos cotidianos o persistentes se tendrán en consideración como una infracción laboral grave y puede dar lugar a sanciones mayores.",
  },

  // PÁGINAS 12-14: TITULO XI - OBLIGACIONES DE LAS PERSONAS TRABAJADORAS
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XI - OBLIGACIONES DE LAS PERSONAS TRABAJADORAS",
    articulo: "ARTÍCULO 30 (Incisos A al H)",
    pagina: 12,
    chunk_id: "DTH-REG-001-ART-30-P1",
    contenido:
      "TITULO XI - OBLIGACIONES DE LAS PERSONAS TRABAJADORAS. ARTÍCULO 30: Además de las que expresamente regula el Código de Trabajo, son obligaciones de las personas trabajadoras: A. Prestar los servicios personalmente, en forma regular y continua, de acuerdo con el respectivo contrato o relación laboral, dentro de la jornada de trabajo, bajo la dirección de la persona empleadora, o de sus representantes, a cuya autoridad están sujetos en todo lo concerniente al trabajo. B. Ejecutar las labores que se les encomienden, siempre que sean compatibles con sus aptitudes, estado y condición, con la intensidad, cuidado, dedicación y esmero apropiados, en forma, tiempo y lugar convenidos, concentrando la atención en la labor que está realizando, a fin de que la misma resulte de la mejor calidad posible. C. Observar durante el trabajo buenas costumbres y disciplina. D. Vestir en forma correcta y acorde con las labores que desempeña, o con el uniforme de RIMAC S.A. en su caso o de conformidad con la Políticas dispuestas por la empresa, según la Política de Vestimenta (anexo #1). Los uniformes serán costeados totalmente por la empresa salvo acuerdo escrito. E. Guardar al público, en las relaciones con él, motivadas por el trabajo, la consideración debida, de modo que no se origine queja justificada por mal servicio, maltrato o falta de atención. F. Restituir a la persona empleadora los materiales no usados, y conservar en buen estado los instrumentos, útiles, herramientas, maquinaria, etc. G. Responder económicamente de los daños que causen intencionalmente o que se deban a negligencia o descuido manifiesto (artículo 36 del Código de Trabajo). H. Guardar los secretos técnicos, comerciales, de fabricación (anexo #2 contrato de confidencialidad).",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XI - OBLIGACIONES DE LAS PERSONAS TRABAJADORAS",
    articulo: "ARTÍCULO 30 (Incisos I al P)",
    pagina: 13,
    chunk_id: "DTH-REG-001-ART-30-P2",
    contenido:
      "TITULO XI - OBLIGACIONES DE LAS PERSONAS TRABAJADORAS. ARTÍCULO 30 (Continuación): I. Reportar a la GERENCIA, ADMINISTRACION, JEFATURA SUPERIOR INMEDIATA, etc. los daños o imprudencias que otros compañeros causen en perjuicio de RIMAC, su no notificación se presumirá como co-participante del hecho. J. Rendir los informes por escrito que se les soliciten por las autoridades superiores. K. Observar rigurosamente las medidas preventivas de salud ocupacional. L. Tomar pedidos o mensajes por escrito en forma clara y completa. M. Firmar facturas y documentos de pedidos despachados o ventas realizadas siguiendo los sistemas de RIMAC con autorización por escrito. N. Utilizar en forma racional los suministros y equipo entregado para sus funciones. O. Cumplir con las políticas de Rimac necesarias para el correcto funcionamiento de las actividades laborales. P. Asistir a todos los cursos y entrenamientos que la EMPRESA les indique para obtener una mayor eficacia y rendimiento.",
  },

  // PÁGINAS 14-16: TITULO XII - PROHIBICIONES A LAS PERSONAS TRABAJADORAS
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XII - PROHIBICIONES A LAS PERSONAS TRABAJADORAS",
    articulo: "ARTÍCULO 31 (Incisos A al N)",
    pagina: 14,
    chunk_id: "DTH-REG-001-ART-31-P1",
    contenido:
      "TITULO XII - PROHIBICIONES A LAS PERSONAS TRABAJADORAS. ARTÍCULO 31: Queda absolutamente prohibido a las personas trabajadoras: A. Ocupar tiempo, dentro de la jornada de trabajo, para asuntos ajenos a las labores que les han sido encomendadas. B. Trabajar en estado de embriaguez o bajo cualquier otra condición análoga. C. Ingerir licor o utilizar drogas ilegales durante la jornada de trabajo. Recibir visitas de carácter personal en horas de trabajo, salvo casos urgentes o con previa autorización. D. Distraer con cualquier clase de juegos o bromas a sus compañeros de trabajo, o quebrantar la cordialidad y mutuo respeto. E. Mantener conversaciones innecesarias con compañeros o con terceras personas en perjuicio o con demora de las labores. F. Utilizar radios, novelas, teléfonos celulares u objetos similares para usarlos durante la jornada de trabajo. G. Proferir insultos o usar vocabulario vulgar o grosero. H. Usar utensilios, máquinas, útiles, materiales y herramientas propiedad de RIMAC S.A. para fines ajenos al trabajo. I. Hacer negocios personales dentro del centro de trabajo. J. Introducir o sacar paquetes personales sin mostrar su contenido a quien designe la empresa. K. Portar armas de cualquier clase durante las horas de labor (salvo autorizados o instrumentos propios de la labor). L. Tratar de resolver por medio de la violencia las dificultades que surjan. M. Intervenir oficiosamente cuando un superior llame la atención a un subalterno. N. Burlarse de un cliente o hacer bromas ofensivas.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XII - PROHIBICIONES A LAS PERSONAS TRABAJADORAS",
    articulo: "ARTÍCULO 31 (Incisos O al X)",
    pagina: 15,
    chunk_id: "DTH-REG-001-ART-31-P2",
    contenido:
      "TITULO XII - PROHIBICIONES A LAS PERSONAS TRABAJADORAS. ARTÍCULO 31 (Continuación): O. Prestar servicios similares a los que ha estado prestando a esta empresa en otro establecimiento similar durante vacaciones o descansos; así como realizar trabajos que signifiquen competencia para la empresa. P. Dañar, destruir, remover o alterar los avisos o advertencias sobre condiciones de seguridad e higiene, y equipos de protección personal o negarse a usarlos. Q. Fumar dentro de las instalaciones de la empresa o sus anexos (parqueos, zonas verdes) durante la jornada de trabajo o fuera de ella. R. Vender mercaderías al crédito, recibir devoluciones o tramitar reclamos sin previa autorización. S. Tomar acciones producto de cualquier tipo de discriminación. T. No acatar medidas de Salud y Seguridad Ocupacional o no colaborar con simulacros. U. No utilizar del todo o usar de manera incorrecta los equipos de Protección Personal. V. Ingresar a diferentes áreas sin la vestimenta y equipamiento adecuado. W. No cumplimiento de normas y políticas notificadas. X. Hacer durante el trabajo propaganda político electoral o contraria a instituciones democráticas.",
  },

  // PÁGINAS 16-18: TITULO XIII - PROHIBICIONES HERRAMIENTAS INFORMATICAS
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XIII - PROHIBICIONES HERRAMIENTAS INFORMATICAS",
    articulo: "ARTICULO 32 y 33",
    pagina: 16,
    chunk_id: "DTH-REG-001-ART-32-33",
    contenido:
      "TITULO XIII - PROHIBICIONES SOBRE EL USO DE LAS HERRAMIENTAS INFORMATICAS DURANTE LA JORNADA DE TRABAJO. ARTICULO 32: Respecto al uso de Internet está prohibido: A. El acceso a páginas de contenido ilícito, terrorismo, xenofobia, racismo, o sexual. B. La participación en chats o foros de discusión para uso personal durante la jornada de trabajo. C. La descarga de archivos o software no autorizado o que contravenga propiedad intelectual o ponga en riesgo la red por virus/malware. D. Instalar software no autorizado en su ordenador. ARTÍCULO 33: Respecto al uso del correo electrónico corporativo está prohibido: A. Suscripción a servicios de noticias no laborales. B. Usar la cuenta de correo para trámites personales. C. Usar correo corporativo con fines comerciales o financieros personales. D. Envío de cadenas de correo. E. Fines políticos, religiosos, sentimentales, sexuales, comerciales o juegos. F. Distribuir mensajes con contenidos ofensivos. G. Reenviar información confidencial sin autorización. H. El reenvío o réplicas de correo corporativo hacia cuentas de correo personal. I. Entrar a revisar la información dirigida a otra persona.",
  },

  // PÁGINAS 18-26: TITULO XIV - ACOSO Y HOSTIGAMIENTO SEXUAL
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XIV - ACOSO Y HOSTIGAMIENTO SEXUAL",
    articulo: "ARTICULO 34, 35 y 36",
    pagina: 18,
    chunk_id: "DTH-REG-001-ART-34-36",
    contenido:
      "TITULO XIV - ACOSO Y HOSTIGAMIENTO SEXUAL. ARTICULO 34: De conformidad con la Ley No. 7476 y sus reformas, en RIMAC S.A. se prohíbe y sanciona el acoso y hostigamiento sexual como práctica discriminatoria por razón de sexo contra la dignidad de mujeres y hombres. Aplica en relaciones jerárquicas, entre pares, subordinado a jefe y con clientes/usuarios. ARTÍCULO 35: Se entiende por acoso y hostigamiento sexual toda conducta sexual indeseada, reiterada o que habiendo ocurrido una sola vez perjudique gravemente a la víctima en condiciones de empleo, desempeño o bienestar. ARTÍCULO 36: Se manifiesta por requerimientos de favores sexuales con promesas de trato preferencial o amenazas, uso de palabras o escritos hostiles u ofensivos de naturaleza sexual, o acercamientos corporales y señales físicas indeseadas.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XIV - ACOSO Y HOSTIGAMIENTO SEXUAL",
    articulo: "ARTICULO 42 y 43 (Comisión Investigadora y Denuncias)",
    pagina: 20,
    chunk_id: "DTH-REG-001-ART-42-43",
    contenido:
      "TITULO XIV - ACOSO Y HOSTIGAMIENTO SEXUAL. ARTICULO 42: Las denuncias serán presentadas ante una Comisión Investigadora Permanente integrada por tres personas propietarias y tres suplentes elegidas por la persona empleadora, con representación de ambos sexos y conocimientos en hostigamiento sexual y régimen disciplinario. Los nombres de los integrantes se comunicarán mediante circular visible. Si la denuncia es contra el jerarca máximo o dueño, se tramitará ante la Inspección de Trabajo o Tribunales. ARTICULO 43: La denuncia se presenta en forma verbal o escrita ante la Comisión ofreciendo prueba. Personas entre 15 y 18 años están legitimadas para denunciar personalmente.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XIV - ACOSO Y HOSTIGAMIENTO SEXUAL",
    articulo: "ARTÍCULO 44 al 53 (Procedimiento, Plazos y Medidas Cautelares)",
    pagina: 21,
    chunk_id: "DTH-REG-001-ART-44-53",
    contenido:
      "TITULO XIV - ACOSO Y HOSTIGAMIENTO SEXUAL. Procedimiento y Plazos: ARTÍCULO 44: La Comisión citará a audiencia en un plazo máximo de tres días. No puede haber conciliación (art. 31 Ley 7476). La tramitación del procedimiento disciplinario no podrá exceder de tres meses. ARTÍCULO 47: Medidas cautelares: abstención de perturbar, reubicación laboral, permuta del cargo, o separación temporal con goce de salario. ARTICULO 49: Concluida la prueba testimonial, la Comisión resolverá en un plazo máximo de ocho días hábiles. Sanciones recomendadas: amonestación, suspensión hasta por ocho días sin goce, o despido sin responsabilidad patronal. ARTICULO 50: El plazo para interponer la denuncia es de dos años a partir del último hecho o de que cesó la causa que impidió denunciar. ARTICULO 53: La persona empleadora comunicará las resultas dentro de un plazo no mayor de 15 días hábiles tras recibir el informe final.",
  },

  // PÁGINAS 26-28: TITULO XV - SANCIONES DISCIPLINARIAS
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XV - SANCIONES DISCIPLINARIAS",
    articulo: "ARTÍCULO 57",
    pagina: 26,
    chunk_id: "DTH-REG-001-ART-57",
    contenido:
      "TITULO XV - SANCIONES DISCIPLINARIAS. ARTÍCULO 57: Las faltas en que incurran las personas trabajadoras serán sancionadas con las siguientes medidas disciplinarias: A. Amonestación verbal; B. Apercibimiento escrito; C. Suspensión del trabajo sin goce de salario, hasta por ocho días; D. Despido sin responsabilidad patronal. Tales sanciones se aplicarán atendiendo a la gravedad de la falta y a la reglamentación en cada caso.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XV - SANCIONES DISCIPLINARIAS",
    articulo: "ARTÍCULO 58 y 59",
    pagina: 26,
    chunk_id: "DTH-REG-001-ART-58-59",
    contenido:
      "TITULO XV - SANCIONES DISCIPLINARIAS. ARTÍCULO 58: La amonestación verbal se aplicará cuando la persona cometa alguna falta leve a las obligaciones impuestas por el contrato o este Reglamento, y en los casos previstos. ARTÍCULO 59: El apercibimiento escrito se aplicará una vez oído al interesado en casos de: reincidencia en falta leve habiendo sido amonestado verbalmente, incumplimiento de obligaciones del artículo 71 del Código de Trabajo que no dé mérito para sanción mayor, o cuando las leyes exijan amonestación escrita antes del despido.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XV - SANCIONES DISCIPLINARIAS",
    articulo: "ARTÍCULO 60, 61 y 62",
    pagina: 27,
    chunk_id: "DTH-REG-001-ART-60-62",
    contenido:
      "TITULO XV - SANCIONES DISCIPLINARIAS. ARTÍCULO 60: La suspensión del trabajo sin goce de salario se aplicará hasta por ocho días: a. Cuando reincida dentro de tres meses en la falta que motivó amonestación escrita; b. Cuando viole prohibiciones del artículo 72 del Código de Trabajo o del artículo 29 y prohibiciones de este reglamento; c. Faltas de cierta gravedad que no ameriten despido. ARTÍCULO 61: El despido sin responsabilidad patronal se efectuará: a. Por incurrir en causal para una segunda suspensión dentro de un período de tres meses; b. Casos especialmente previstos en este reglamento; c. Causales del artículo 81 del Código de Trabajo. ARTÍCULO 62: Todas las sanciones disciplinarias deberán imponerse dentro del mes posterior al día en que se cometió la falta o en que los representantes patronales la conocieron.",
  },

  // PÁGINAS 28-30: TITULO XVI - REGISTRO DE ASISTENCIA (CRUCIAL PARA RAG-03)
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XVI - REGISTRO DE ASISTENCIA",
    articulo: "ARTICULO 63 y 64",
    pagina: 28,
    chunk_id: "DTH-REG-001-ART-63-64",
    contenido:
      "TITULO XVI - REGISTRO DE ASISTENCIA. ARTICULO 63: El registro de asistencia y puntualidad al trabajo se hará, para todos y todas las personas trabajadoras de Rimac por medio de tarjetas individuales o marcas en el reloj eléctrico que para ese fin se encuentra instalado a la entrada del centro de labores. ARTICULO 64: Cada tarjeta será marcada por la persona trabajadora a quien corresponda, con cuidado, de manera que quede impresa con claridad. Las marcas defectuosas, manchadas o confusas que no se deban a desperfectos del reloj, se tendrán por no hechas para efectos de sanción.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XVI - REGISTRO DE ASISTENCIA",
    articulo: "ARTICULO 65 (Omisión de Marcas)",
    pagina: 28,
    chunk_id: "DTH-REG-001-ART-65",
    contenido:
      "TITULO XVI - REGISTRO DE ASISTENCIA. ARTICULO 65: Salvo los casos previstos en este Reglamento, la omisión de una marca en la tarjeta a cualesquiera de las horas de entrada o de salida, hará presumir la inasistencia a la correspondiente fracción de jornada, siempre y cuando la persona trabajadora no la justifique a más tardar en la fracción de jornada siguiente a aquella en que sucedió el hecho.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XVI - REGISTRO DE ASISTENCIA",
    articulo: "ARTICULO 66 y 67 (Marca Ajena y Error)",
    pagina: 28,
    chunk_id: "DTH-REG-001-ART-66-67",
    contenido:
      "TITULO XVI - REGISTRO DE ASISTENCIA. ARTICULO 66: La persona trabajadora que por dolo o complacencia marque una tarjeta que no le corresponda, incurrirá en falta grave a sus obligaciones laborales y se hará acreedor a: a. Suspensión hasta por ocho días, la primera vez; y b. Despido sin responsabilidad patronal, la segunda vez. Incurrirá en la misma falta, y se aplicará igual sanción a la persona trabajadora que se le compruebe haber consentido para que otra persona le marque su tarjeta. Estas faltas se computarán, para efectos de reincidencia, en un lapso de tres meses. ARTICULO 67: No obstante, lo dispuesto en el artículo anterior, dejará de imponerse la sanción disciplinaria si la persona trabajadora que, por error marcó otra tarjeta o aquél a quien le marcaron la suya, informa del hecho a quien corresponda a más tardar en el curso de la jornada de trabajo siguiente a aquélla en que sucedió el hecho.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XVI - REGISTRO DE ASISTENCIA",
    articulo: "ARTICULO 68 (Licencias Médicas y Asistencias CCSS/INS)",
    pagina: 29,
    chunk_id: "DTH-REG-001-ART-68",
    contenido:
      "TITULO XVI - REGISTRO DE ASISTENCIA. ARTICULO 68: Las asistencias al Seguro Social (CCSS), al Instituto Nacional de Seguros (INS), médico de empresa u otra instancia gubernamental debidamente documentada, cuando sean en horas laborales, se considerarán como licencias con goce de salario. El trabajador deberá marcar el ingreso y salida de la empresa según será el caso.",
  },

  // PÁGINAS 29-30: TITULO XVII - AUSENCIAS (CRUCIAL PARA RAG-05)
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XVII - AUSENCIAS",
    articulo: "ARTÍCULO 69 y 70",
    pagina: 29,
    chunk_id: "DTH-REG-001-ART-69-70",
    contenido:
      "TITULO XVII - AUSENCIAS. ARTÍCULO 69: Se considera ausencia la inasistencia a un día completo de trabajo. La falta a una fracción de la jornada se computará como la mitad de una ausencia. Dos mitades de una ausencia, para efectos de este reglamento, se computarán como una ausencia. Rimac S.A. no estará obligada a pagar el salario que corresponda a las ausencias, excepción hecha de los casos señalados por la Ley y este Reglamento. ARTÍCULO 70: Las ausencias injustificadas, computables al final de un mismo mes calendario, se sancionarán en la siguiente forma: a. Por media ausencia: amonestación escrita; b. Por una ausencia completa o dos medias ausencias: suspensión hasta por dos días; c. Por tres medias ausencias alternas: suspensión hasta por seis días; d. Por una y media ausencia consecutiva o dos ausencias alternas: suspensión hasta por ocho días; y Por dos ausencias consecutivas o más de dos ausencias alternas: despido sin responsabilidad patronal.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XVII - AUSENCIAS",
    articulo: "ARTICULO 71 y 72 (Plazo y Justificación de Ausencias)",
    pagina: 30,
    chunk_id: "DTH-REG-001-ART-71-72",
    contenido:
      "TITULO XVII - AUSENCIAS. ARTÍCULO 71: Las ausencias por enfermedad deberán ser comprobadas, preferentemente, mediante dictamen médico expedido por la Caja Costarricense del Seguro Social, el Instituto Nacional de Seguros o por cualquier otro medio idóneo legal. ARTICULO 72: Las ausencias deberán justificarse por escrito con un documento que respalde dicha justificación a más tardar 3 días hábiles después de la misma, ya que, de no presentarse en el plazo establecido, se considerará como ausencia injustificada. La presentación de documentación falsa para justificar ausencias será causal de despido sin responsabilidad patronal.",
  },

  // PÁGINAS 30-31: TITULO XVIII - LLEGADAS TARDIAS (CRUCIAL PARA RAG-04 Y DISCREPANCIA)
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XVIII - LLEGADAS TARDIAS",
    articulo: "ARTICULO 73 (Definición de Llegada Tardía - 5 minutos)",
    pagina: 30,
    chunk_id: "DTH-REG-001-ART-73",
    contenido:
      "TITULO XVIII - LLEGADAS TARDIAS. ARTICULO 73: Se considera llegada tardía cinco minutos después de la hora exacta para el inicio de las labores, en caso de superar este tiempo se deducirá la correspondiente fracción de la jornada. Sin embargo, en casos muy calificados, a juicio del Gerente respectivo se justificarán las llegadas tardías, a efecto de no aplicar la sanción correspondiente.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XVIII - LLEGADAS TARDIAS",
    articulo: "ARTÍCULO 74 (Escala de Sanciones por Llegadas Tardías)",
    pagina: 30,
    chunk_id: "DTH-REG-001-ART-74",
    contenido:
      "TITULO XVIII - LLEGADAS TARDIAS. ARTÍCULO 74: Las llegadas tardías injustificadas, computables al final de un mismo mes calendario, se sancionarán en la forma siguiente: a. Por dos: Amonestación verbal. b. Por tres: Amonestación escrita. c. Por cuatro: Suspensión hasta por dos días. d. Por cinco: Suspensión hasta por seis días. e. Por seis: Suspensión hasta por ocho días. f. Por más de seis: Despido sin responsabilidad patronal.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XVIII - LLEGADAS TARDIAS",
    articulo: "ARTICULO 75 (Llegada Tardía Superior a 15 Minutos)",
    pagina: 31,
    chunk_id: "DTH-REG-001-ART-75",
    contenido:
      "TITULO XVIII - LLEGADAS TARDIAS. ARTICULO 75: Cuando se produzca una llegada tardía superior a quince minutos, contados a partir de la hora de entrada, la persona trabajadora no debe permanecer laborando durante esa fracción de jornada, la cual se calificará y computará como media ausencia, para efectos de sanción y no pago del salario.",
  },

  // PÁGINA 31-32: TITULO XIX - ABANDONO DEL TRABAJO
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XIX - ABANDONO DEL TRABAJO",
    articulo: "ARTICULO 76 y 77",
    pagina: 31,
    chunk_id: "DTH-REG-001-ART-76-77",
    contenido:
      "TITULO XIX - ABANDONO DEL TRABAJO. ARTICULO 76: Se considera abandono del trabajo, dejar de hacer, dentro de la jornada de trabajo, la labor objeto del contrato o relación laboral. Para efectos de calificar el abandono no es necesario que la persona trabajadora salga del lugar donde presta sus servicios, sino que basta que de modo evidente abandone la labor encomendada. Se considera abandono de trabajo utilizar el teléfono celular personal durante la jornada sin autorización, igualmente el uso de Internet o correo electrónico para asuntos personales sin autorización. ARTICULO 77: El abandono del trabajo sin causa justificada o sin permiso del superior inmediato se sancionará: a. Amonestación escrita la primera vez; y b. Despido sin responsabilidad patronal la segunda vez. Se computarán en un lapso de tres meses para reincidencia.",
  },

  // PÁGINAS 32-36: TITULO XX - SALUD OCUPACIONAL Y RIESGOS DE TRABAJO
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XX - SALUD OCUPACIONAL Y RIESGOS DE TRABAJO",
    articulo: "ARTICULO 78 al 82 (Riesgos y Accidentes)",
    pagina: 32,
    chunk_id: "DTH-REG-001-ART-78-82",
    contenido:
      "TITULO XX - SOBRE LA SALUD OCUPACIONAL Y LOS RIESGOS DE TRABAJO. ARTICULO 78: En RIMAC S.A. se promoverá y mantendrá el más alto nivel de bienestar físico, mental y social previniendo daños causados por condiciones de trabajo o materias primas. Se establecerán comisiones de salud ocupacional (art. 288 Código de Trabajo). ARTÍCULO 79: Póliza contra riesgos del trabajo mediante el INS (art. 193 Código de Trabajo). ARTICULO 80 y 81: Definición de accidente de trabajo (art. 196 Código de Trabajo), incluyendo accidentes en el trayecto usual de domicilio al trabajo y viceversa cuando el patrono pague o provea transporte o existan peligros especiales, así como en cumplimiento de órdenes o interrupciones de trabajo. ARTICULO 82: Enfermedad del trabajo como estado patológico resultante de la labor.",
  },
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XX - SALUD OCUPACIONAL Y RIESGOS DE TRABAJO",
    articulo: "ARTÍCULO 83 al 86 (Obligaciones, EPP y Exámenes Médicos)",
    pagina: 34,
    chunk_id: "DTH-REG-001-ART-83-86",
    contenido:
      "TITULO XX - SOBRE LA SALUD OCUPACIONAL Y LOS RIESGOS DE TRABAJO. ARTÍCULO 83: Obligaciones de RIMAC S.A.: colocación de avisos legales, capacitación en salud ocupacional, y suministrar equipo de protección personal (EPP). ARTÍCULO 84: Obligaciones del colaborador: someterse a exámenes médicos, colaborar en programas y comisiones, y utilizar y cuidar el EPP suministrado. ARTÍCULO 85: Prohibiciones: alterar resguardos de máquinas o EPP, destruir avisos preventivos, o hacer bromas peligrosas. ARTÍCULO 86: Exámenes rutinarios solicitados por autoridades reguladoras son de cumplimiento obligatorio; no cumplirlos es falta grave (art. 81 Código de Trabajo). Dichos exámenes serán costeados por Rimac.",
  },

  // PÁGINAS 36-37: TITULO XXI - RECLAMOS Y LICENCIAS EN GENERAL
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XXI - RECLAMOS Y LICENCIAS EN GENERAL",
    articulo: "ARTÍCULO 87, 88 y 89",
    pagina: 35,
    chunk_id: "DTH-REG-001-ART-87-89",
    contenido:
      "TITULO XXI - RECLAMOS Y LICENCIAS EN GENERAL. ARTÍCULO 87: Los reclamos y las solicitudes de licencias, permisos, etc., deben hacerse por escrito al Gerente del Departamento, quien los resolverá dentro de los dos días siguientes y en la misma forma. Los asuntos urgentes pueden gestionarse oralmente y deben resolverse de inmediato. ARTICULO 88: Todas las licencias son sin goce de salario salvo ley o reglamento. ARTICULO 89: En caso de que la persona trabajadora contraiga matrimonio, o le sobrevenga el fallecimiento de alguno de sus padres, hijos, hermanos o cónyuge y para el trabajador en caso de nacimiento de hijos e hijas, RIMAC le concederá licencia con goce de salario de uno a tres días hábiles de acuerdo con lo que estime conveniente la Gerencia respectiva.",
  },

  // PÁGINAS 37-38: TITULO XXII - DISPOSICIONES FINALES
  {
    documento: "Reglamento Interno de Trabajo RIMAC S.A.",
    codigo_documento: "DTH-REG-001",
    version: "1",
    titulo: "TITULO XXII - DISPOSICIONES FINALES",
    articulo: "ARTÍCULO 90 al 93",
    pagina: 36,
    chunk_id: "DTH-REG-001-ART-90-93",
    contenido:
      "TITULO XXII - DISPOSICIONES FINALES. ARTÍCULO 90: Este reglamento es de observancia obligatoria para todos los colaboradores de RIMAC S.A. ARTÍCULO 91: Las modificaciones deben someterse a la Dirección de Asuntos Jurídicos del MTSS. ARTÍCULO 92: Entra en vigencia 15 días hábiles después de su comunicación a los colaboradores. ARTÍCULO 93: Se interpretará conforme a leyes imperativas del país, teniendo como supletorio el Código de Trabajo y normativa conexa de Costa Rica.",
  },
];
