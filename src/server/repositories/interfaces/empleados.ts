export interface EmpleadoEntity {
  id: string; // UUIDv4
  cedula: string;
  nombre_completo: string;
  correo_laboral?: string;
  telefono?: string;
  referencia_foto?: string;
  departamento_id: string;
  departamento_nombre?: string;
  departamento_codigo?: string;
  puesto_id: string;
  puesto_nombre?: string;
  puesto_codigo?: string;
  usuario_id?: string;
  tiene_usuario?: boolean;
  estado: "ACTIVO" | "INACTIVO";
  horario_vigente?: {
    id: string;
    codigo: string;
    nombre: string;
    fecha_inicio: string;
  } | null;
  jefatura_vigente?: {
    id: string;
    jefatura_empleado_id: string;
    nombre_completo: string;
    cedula: string;
    fecha_inicio: string;
    fecha_fin?: string | null;
    estado?: string;
  } | null;
  creado_en: string; // ISO 8601
  actualizado_en?: string;
}

export interface EmpleadoDetalleCompleto extends EmpleadoEntity {
  historial_horarios: Array<{
    id: string;
    horario_id: string;
    codigo: string;
    nombre: string;
    fecha_inicio: string;
    fecha_fin: string | null;
    usuario_asigno_id: string;
    creado_en: string;
  }>;
  historial_jefaturas: Array<{
    id: string;
    jefatura_empleado_id: string;
    nombre_jefatura: string;
    cedula_jefatura: string;
    fecha_inicio: string;
    fecha_fin: string | null;
    estado: string;
    creado_en: string;
  }>;
  usuario: {
    id: string;
    identificador: string;
    rol: string;
    estado: string;
  } | null;
}

export interface IEmpleadosRepository {
  obtenerPorId(id: string): Promise<EmpleadoEntity | null>;
  obtenerPorIdConRelaciones(id: string): Promise<EmpleadoDetalleCompleto | null>;
  obtenerPorCedula(cedula: string): Promise<EmpleadoEntity | null>;
  obtenerPorCorreo(correo: string): Promise<EmpleadoEntity | null>;
  listar(filtros?: {
    departamento_id?: string;
    estado?: string;
    termino?: string;
  }): Promise<EmpleadoEntity[]>;
  listarActivos(): Promise<EmpleadoEntity[]>;
  crear(empleado: {
    id?: string;
    cedula: string;
    nombre_completo: string;
    correo_laboral?: string;
    telefono?: string;
    departamento_id: string;
    puesto_id: string;
    referencia_foto?: string;
    estado?: "ACTIVO" | "INACTIVO";
  }): Promise<EmpleadoEntity>;
  actualizar(
    id: string,
    datos: {
      nombre_completo?: string;
      correo_laboral?: string;
      telefono?: string;
      departamento_id?: string;
      puesto_id?: string;
      referencia_foto?: string;
    }
  ): Promise<EmpleadoEntity>;
  cambiarEstado(
    id: string,
    estado: "ACTIVO" | "INACTIVO"
  ): Promise<{ empleado: EmpleadoEntity; tieneUsuarioAsociado: boolean }>;
  desactivarEmpleadoTransaccional(id: string): Promise<{
    empleado: EmpleadoEntity;
    usuarioDesactivadoId?: string;
    sesionesRevocadasCount?: number;
  }>;
  reactivarEmpleado(id: string): Promise<EmpleadoEntity>;
  crearCompuesto(params: {
    empleado: {
      id?: string;
      cedula: string;
      nombre_completo: string;
      correo_laboral?: string;
      telefono?: string;
      departamento_id: string;
      puesto_id: string;
    };
    horario?: {
      horario_id: string;
      fecha_inicio: string;
      fecha_fin?: string;
      usuario_asigno_id: string;
    };
    jefatura?: {
      jefatura_empleado_id: string;
      fecha_inicio: string;
      fecha_fin?: string;
    };
  }): Promise<EmpleadoEntity>;
  crearOActualizar(empleado: EmpleadoEntity): Promise<void>;
}
