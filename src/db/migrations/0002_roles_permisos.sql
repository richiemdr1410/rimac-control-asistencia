-- ====================================================================
-- FASE 3.2B: MIGRACIÓN FORMAL DE PERMISOS Y ROLES_PERMISOS
-- Agroquímica Industrial RIMAC S.A.
-- ====================================================================

-- 1. Tabla: permisos
CREATE TABLE IF NOT EXISTS permisos (
  codigo VARCHAR(60) PRIMARY KEY,
  modulo VARCHAR(40) NOT NULL,
  descripcion TEXT NOT NULL,
  critico BOOLEAN NOT NULL DEFAULT false,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabla: roles_permisos
CREATE TABLE IF NOT EXISTS roles_permisos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rol VARCHAR(30) NOT NULL,
  permiso_codigo VARCHAR(60) NOT NULL REFERENCES permisos(codigo) ON DELETE CASCADE,
  activo BOOLEAN NOT NULL DEFAULT true,
  actualizado_por_usuario_id UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_roles_permisos_rol_canonico CHECK (
    rol IN ('ADMINISTRADOR', 'TALENTO_HUMANO', 'SUPERVISOR_SEGURIDAD', 'SEGURIDAD', 'EMPLEADO')
  ),
  CONSTRAINT uq_roles_permisos_rol_codigo UNIQUE (rol, permiso_codigo)
);

CREATE INDEX IF NOT EXISTS idx_roles_permisos_rol_activo ON roles_permisos (rol, activo);

-- 3. Catálogo Inicial de Permisos
INSERT INTO permisos (codigo, modulo, descripcion, critico) VALUES
  -- Autoservicio
  ('AUTOSERVICIO_MARCAJE', 'Autoservicio', 'Registrar marcas de entrada, salida y descansos en autoservicio', false),
  ('AUTOSERVICIO_SOLICITUDES_CREAR', 'Autoservicio', 'Crear solicitudes personales de permisos, vacaciones o justificaciones', false),
  ('AUTOSERVICIO_SOLICITUDES_VER', 'Autoservicio', 'Consultar el historial y estado de solicitudes personales', false),
  -- Garita
  ('GARITA_OPERAR', 'Garita', 'Buscar colaboradores y registrar marcas físicas en terminal de garita', false),
  -- Solicitudes
  ('SOLICITUDES_BANDEJA_VER', 'Solicitudes', 'Visualizar la bandeja de solicitudes pendientes de aprobación', false),
  ('SOLICITUDES_APROBAR_JEFATURA', 'Solicitudes', 'Aprobar o rechazar solicitudes en nivel 1 sujeto a relación ABAC de jefatura', false),
  ('SOLICITUDES_APROBAR_TH', 'Solicitudes', 'Aprobar o rechazar solicitudes en nivel institucional de Talento Humano', false),
  ('SOLICITUDES_POLITICAS_VER', 'Solicitudes', 'Consultar las políticas y niveles requeridos por tipo de solicitud', false),
  -- Feriados
  ('FERIADOS_VER', 'Feriados', 'Consultar el calendario y estado de días feriados oficiales', false),
  ('FERIADOS_ADMINISTRAR', 'Feriados', 'Crear, modificar y activar/desactivar días feriados en el catálogo', false),
  -- RAG
  ('RAG_CONSULTAR', 'RAG', 'Consultar en lenguaje natural sobre el Reglamento Interno de Trabajo', false),
  ('RAG_ESTADO_VER', 'RAG', 'Consultar métricas y estado del corpus documental indexado', false),
  ('RAG_DOCUMENTOS_ADMINISTRAR', 'RAG', 'Reindexar, cargar y administrar documentos del corpus RAG', false),
  -- Jornadas
  ('JORNADAS_TIEMPO_EXTRA_APROBAR', 'Jornadas', 'Aprobar horas y tiempo adicional de colaboradores subordinados', false),
  -- Auditoría / Configuración
  ('AUDITORIA_VER', 'Auditoría', 'Consultar la bitácora de auditoría y trazabilidad de eventos', false),
  ('CONFIGURACION_ADMINISTRAR', 'Configuración', 'Gestionar parámetros operativos globales del sistema', false),
  -- Organización
  ('EMPLEADOS_VER', 'Organización', 'Consultar nómina y expedientes de colaboradores', false),
  ('EMPLEADOS_ADMINISTRAR', 'Organización', 'Crear, editar y dar de baja expedientes de colaboradores', false),
  ('ORGANIZACION_ADMINISTRAR', 'Organización', 'Gestionar catálogo de departamentos y puestos de trabajo', false),
  ('HORARIOS_VER', 'Horarios', 'Consultar catálogo de horarios laborales y turnos semanales', false),
  ('HORARIOS_ADMINISTRAR', 'Horarios', 'Configurar turnos, tolerancias y asignaciones de horario', false),
  ('JEFATURAS_ADMINISTRAR', 'Organización', 'Asignar y desasignar relaciones jerárquicas de jefatura', false),
  -- Seguridad
  ('USUARIOS_ADMINISTRAR', 'Seguridad', 'Gestionar cuentas de usuario, contraseñas y asignación de roles', true),
  ('ROLES_PERMISOS_ADMINISTRAR', 'Seguridad', 'Gestionar y modificar la matriz de permisos asociados a cada rol', true)
ON CONFLICT (codigo) DO UPDATE SET
  modulo = EXCLUDED.modulo,
  descripcion = EXCLUDED.descripcion,
  critico = EXCLUDED.critico;

-- 4. Matriz Inicial Rol-Permiso
-- ADMINISTRADOR (21 permisos)
INSERT INTO roles_permisos (rol, permiso_codigo, activo)
SELECT 'ADMINISTRADOR', codigo, true
FROM permisos
WHERE codigo IN (
  'AUTOSERVICIO_MARCAJE',
  'AUTOSERVICIO_SOLICITUDES_CREAR',
  'AUTOSERVICIO_SOLICITUDES_VER',
  'SOLICITUDES_BANDEJA_VER',
  'SOLICITUDES_APROBAR_JEFATURA',
  'SOLICITUDES_APROBAR_TH',
  'SOLICITUDES_POLITICAS_VER',
  'FERIADOS_VER',
  'FERIADOS_ADMINISTRAR',
  'RAG_CONSULTAR',
  'RAG_ESTADO_VER',
  'RAG_DOCUMENTOS_ADMINISTRAR',
  'AUDITORIA_VER',
  'CONFIGURACION_ADMINISTRAR',
  'EMPLEADOS_VER',
  'EMPLEADOS_ADMINISTRAR',
  'ORGANIZACION_ADMINISTRAR',
  'HORARIOS_VER',
  'HORARIOS_ADMINISTRAR',
  'JEFATURAS_ADMINISTRAR',
  'USUARIOS_ADMINISTRAR',
  'ROLES_PERMISOS_ADMINISTRAR'
)
ON CONFLICT (rol, permiso_codigo) DO UPDATE SET activo = true;

-- TALENTO_HUMANO (20 permisos)
INSERT INTO roles_permisos (rol, permiso_codigo, activo)
SELECT 'TALENTO_HUMANO', codigo, true
FROM permisos
WHERE codigo IN (
  'AUTOSERVICIO_MARCAJE',
  'AUTOSERVICIO_SOLICITUDES_CREAR',
  'AUTOSERVICIO_SOLICITUDES_VER',
  'SOLICITUDES_BANDEJA_VER',
  'SOLICITUDES_APROBAR_JEFATURA',
  'SOLICITUDES_APROBAR_TH',
  'SOLICITUDES_POLITICAS_VER',
  'FERIADOS_VER',
  'FERIADOS_ADMINISTRAR',
  'RAG_CONSULTAR',
  'RAG_ESTADO_VER',
  'RAG_DOCUMENTOS_ADMINISTRAR',
  'JORNADAS_TIEMPO_EXTRA_APROBAR',
  'AUDITORIA_VER',
  'EMPLEADOS_VER',
  'EMPLEADOS_ADMINISTRAR',
  'ORGANIZACION_ADMINISTRAR',
  'HORARIOS_VER',
  'HORARIOS_ADMINISTRAR',
  'JEFATURAS_ADMINISTRAR'
)
ON CONFLICT (rol, permiso_codigo) DO UPDATE SET activo = true;

-- SUPERVISOR_SEGURIDAD (11 permisos)
INSERT INTO roles_permisos (rol, permiso_codigo, activo)
SELECT 'SUPERVISOR_SEGURIDAD', codigo, true
FROM permisos
WHERE codigo IN (
  'AUTOSERVICIO_MARCAJE',
  'AUTOSERVICIO_SOLICITUDES_CREAR',
  'AUTOSERVICIO_SOLICITUDES_VER',
  'GARITA_OPERAR',
  'SOLICITUDES_BANDEJA_VER',
  'SOLICITUDES_APROBAR_JEFATURA',
  'SOLICITUDES_POLITICAS_VER',
  'FERIADOS_VER',
  'HORARIOS_VER',
  'RAG_CONSULTAR',
  'RAG_ESTADO_VER',
  'JORNADAS_TIEMPO_EXTRA_APROBAR'
)
ON CONFLICT (rol, permiso_codigo) DO UPDATE SET activo = true;

-- SEGURIDAD (3 permisos)
INSERT INTO roles_permisos (rol, permiso_codigo, activo)
SELECT 'SEGURIDAD', codigo, true
FROM permisos
WHERE codigo IN (
  'GARITA_OPERAR',
  'FERIADOS_VER',
  'RAG_CONSULTAR'
)
ON CONFLICT (rol, permiso_codigo) DO UPDATE SET activo = true;

-- EMPLEADO (6 permisos)
INSERT INTO roles_permisos (rol, permiso_codigo, activo)
SELECT 'EMPLEADO', codigo, true
FROM permisos
WHERE codigo IN (
  'AUTOSERVICIO_MARCAJE',
  'AUTOSERVICIO_SOLICITUDES_CREAR',
  'AUTOSERVICIO_SOLICITUDES_VER',
  'SOLICITUDES_POLITICAS_VER',
  'FERIADOS_VER',
  'RAG_CONSULTAR'
)
ON CONFLICT (rol, permiso_codigo) DO UPDATE SET activo = true;
