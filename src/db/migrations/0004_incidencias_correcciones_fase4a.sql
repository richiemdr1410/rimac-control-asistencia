-- Migración 0004: Incidencias, Salidas Omitidas y Correcciones de Marcas (Fase 4A)

-- 1. Ampliar catálogo de permisos RBAC para Fase 4A
INSERT INTO permisos (codigo, modulo, descripcion, critico, creado_en)
VALUES
  ('INCIDENCIAS_VER', 'Incidencias', 'Consultar catálogo, alertas y estado de incidencias laborales', false, NOW()),
  ('INCIDENCIAS_GESTIONAR', 'Incidencias', 'Resolver, justificar o descartar incidencias de jornada', false, NOW()),
  ('CORRECCIONES_MARCAS_SOLICITAR', 'Jornadas', 'Solicitar corrección administrativa de marcas físicas', false, NOW()),
  ('CORRECCIONES_MARCAS_APROBAR', 'Jornadas', 'Aprobar o rechazar correcciones administrativas de marcas con control ABAC', false, NOW()),
  ('JORNADAS_REGULARIZAR', 'Jornadas', 'Regularizar salidas omitidas y marcas de jornada con cálculo oficial', false, NOW())
ON CONFLICT (codigo) DO UPDATE SET
  modulo = EXCLUDED.modulo,
  descripcion = EXCLUDED.descripcion;

-- Asignar nuevos permisos a roles según matriz de gobierno
-- ADMINISTRADOR y TALENTO_HUMANO reciben todos los permisos operativos
INSERT INTO roles_permisos (rol, permiso_codigo, activo)
VALUES
  ('ADMINISTRADOR', 'INCIDENCIAS_VER', true),
  ('ADMINISTRADOR', 'INCIDENCIAS_GESTIONAR', true),
  ('ADMINISTRADOR', 'CORRECCIONES_MARCAS_SOLICITAR', true),
  ('ADMINISTRADOR', 'CORRECCIONES_MARCAS_APROBAR', true),
  ('ADMINISTRADOR', 'JORNADAS_REGULARIZAR', true),

  ('TALENTO_HUMANO', 'INCIDENCIAS_VER', true),
  ('TALENTO_HUMANO', 'INCIDENCIAS_GESTIONAR', true),
  ('TALENTO_HUMANO', 'CORRECCIONES_MARCAS_SOLICITAR', true),
  ('TALENTO_HUMANO', 'CORRECCIONES_MARCAS_APROBAR', true),
  ('TALENTO_HUMANO', 'JORNADAS_REGULARIZAR', true),

  ('SUPERVISOR_SEGURIDAD', 'INCIDENCIAS_VER', true),
  ('SUPERVISOR_SEGURIDAD', 'CORRECCIONES_MARCAS_SOLICITAR', true),
  ('SUPERVISOR_SEGURIDAD', 'CORRECCIONES_MARCAS_APROBAR', true),
  ('SUPERVISOR_SEGURIDAD', 'JORNADAS_REGULARIZAR', true),

  ('EMPLEADO', 'INCIDENCIAS_VER', true),
  ('EMPLEADO', 'CORRECCIONES_MARCAS_SOLICITAR', true)
ON CONFLICT (rol, permiso_codigo) DO NOTHING;

-- 2. Ampliar tipos de incidencias en tabla incidencias
ALTER TABLE incidencias DROP CONSTRAINT IF EXISTS incidencias_tipo_incidencia_check;
ALTER TABLE incidencias ADD CONSTRAINT incidencias_tipo_incidencia_check CHECK (
  tipo_incidencia IN (
    'SALIDA_OMITIDA',
    'ENTRADA_OMITIDA',
    'SECUENCIA_ANORMAL',
    'MARCA_DUPLICADA',
    'PAUSA_SIN_CIERRE',
    'DURACION_ANOMALA',
    'INCONSISTENCIA_HORARIO',
    'NUEVA_ENTRADA_CON_JORNADA_ABIERTA',
    'EXCESO_DESAYUNO',
    'EXCESO_ALMUERZO',
    'EXCESO_CAFE',
    'TIEMPO_ADICIONAL_PENDIENTE',
    'AUSENCIA_INJUSTIFICADA'
  )
);

-- 3. Evitar incidencias abiertas duplicadas del mismo tipo en una misma jornada
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidencia_abierta_jornada_tipo
  ON incidencias (jornada_id, tipo_incidencia)
  WHERE estado = 'ABIERTA';

-- 4. Evitar múltiples correcciones pendientes sobre una misma marca física
CREATE UNIQUE INDEX IF NOT EXISTS uq_correccion_marca_pendiente
  ON correcciones_marcas (marca_original_id)
  WHERE estado = 'PENDIENTE';
