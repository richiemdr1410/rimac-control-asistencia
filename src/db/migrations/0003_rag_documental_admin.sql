-- Migración 0003: Administración Documental RAG y Carga de PDF (Fase 3.2E)

-- 1. Modificar tabla rag_documentos para soportar versionado, ciclo de vida y almacenamiento externo
ALTER TABLE rag_documentos DROP CONSTRAINT IF EXISTS rag_documentos_codigo_key;

-- Añadir columnas para versión, archivo y auditoría
ALTER TABLE rag_documentos
  ADD COLUMN IF NOT EXISTS descripcion TEXT,
  ADD COLUMN IF NOT EXISTS fecha_vigencia DATE,
  ADD COLUMN IF NOT EXISTS estado_procesamiento VARCHAR(30) DEFAULT 'LISTO' CHECK (estado_procesamiento IN ('RECIBIDO', 'PROCESANDO', 'LISTO', 'ERROR')),
  ADD COLUMN IF NOT EXISTS error_mensaje TEXT,
  ADD COLUMN IF NOT EXISTS hash_archivo VARCHAR(64),
  ADD COLUMN IF NOT EXISTS nombre_archivo_original VARCHAR(255),
  ADD COLUMN IF NOT EXISTS ruta_almacenamiento TEXT,
  ADD COLUMN IF NOT EXISTS tamano_bytes INTEGER,
  ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100) DEFAULT 'application/pdf',
  ADD COLUMN IF NOT EXISTS total_fragmentos INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS creado_por_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activado_por_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ DEFAULT NOW();

-- Actualizar documento existente (DTH-REG-001 v1) si existe (sin inventar ruta física)
UPDATE rag_documentos
SET 
  descripcion = 'Reglamento Interno de Trabajo oficial de Agroquímica Industrial RIMAC S.A.',
  estado_procesamiento = 'LISTO',
  activo = true,
  total_fragmentos = 25,
  nombre_archivo_original = 'Reglamento_Interno_RIMAC_DTH-REG-001.pdf',
  hash_archivo = NULL,
  ruta_almacenamiento = NULL,
  tamano_bytes = NULL,
  activado_en = NOW()
WHERE codigo = 'DTH-REG-001' AND version = '1';

-- Asegurar restricción única compuesta (codigo, version) para impedir duplicados exactos y permitir versionado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rag_documentos_codigo_version_key'
  ) THEN
    ALTER TABLE rag_documentos ADD CONSTRAINT rag_documentos_codigo_version_key UNIQUE (codigo, version);
  END IF;
END $$;

-- 2. Ajustar rag_chunks para permitir identificadores de fragmento por documento/versión
ALTER TABLE rag_chunks DROP CONSTRAINT IF EXISTS rag_chunks_chunk_codigo_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rag_chunks_documento_chunk_key'
  ) THEN
    ALTER TABLE rag_chunks ADD CONSTRAINT rag_chunks_documento_chunk_key UNIQUE (documento_id, chunk_codigo);
  END IF;
END $$;
