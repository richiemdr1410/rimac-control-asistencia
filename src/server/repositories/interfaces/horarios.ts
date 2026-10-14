export interface HorarioDetalleDia {
  dia_semana: number; // 1=Lunes, 7=Domingo
  es_laborable: boolean;
  hora_entrada?: string; // "HH:mm"
  hora_salida?: string;  // "HH:mm"
  cruza_medianoche: boolean;
  minutos_esperados: number;
}

export interface HorarioEntity {
  id: string; // UUIDv4
  codigo: string;
  nombre: string;
  tolerancia_entrada_minutos: number;
  minutos_semanales_referencia?: number;
  minutos_desayuno_max?: number;
  minutos_almuerzo_max?: number;
  minutos_cafe_max?: number;
  estado: "ACTIVO" | "INACTIVO";
  creado_en?: string;
  detalles_dia: HorarioDetalleDia[];
}

export interface AsignacionHorarioEntity {
  id: string;
  empleado_id: string;
  horario_id: string;
  fecha_inicio: string; // YYYY-MM-DD
  fecha_fin?: string;   // YYYY-MM-DD
  usuario_asigno_id: string;
  creado_en: string;
}

export interface AsignacionHorarioDetallada extends AsignacionHorarioEntity {
  horario_codigo: string;
  horario_nombre: string;
}

export interface IHorariosRepository {
  listar(soloActivos?: boolean): Promise<HorarioEntity[]>;
  obtenerHorarioPorId(id: string): Promise<HorarioEntity | null>;
  obtenerHorarioPorCodigo(codigo: string): Promise<HorarioEntity | null>;
  obtenerHorarioVigenteEmpleado(
    empleado_id: string,
    fecha: string
  ): Promise<{ horario: HorarioEntity; detalleDia: HorarioDetalleDia } | null>;
  guardarHorario(horario: HorarioEntity): Promise<void>;
  crearHorario(
    horario: {
      codigo: string;
      nombre: string;
      tolerancia_entrada_minutos?: number;
      minutos_semanales_referencia?: number;
      minutos_desayuno_max?: number;
      minutos_almuerzo_max?: number;
      minutos_cafe_max?: number;
      estado?: "ACTIVO" | "INACTIVO";
    },
    detalles_dia: HorarioDetalleDia[]
  ): Promise<HorarioEntity>;
  actualizarHorario(
    id: string,
    datos: {
      nombre?: string;
      tolerancia_entrada_minutos?: number;
      minutos_semanales_referencia?: number;
      minutos_desayuno_max?: number;
      minutos_almuerzo_max?: number;
      minutos_cafe_max?: number;
      estado?: "ACTIVO" | "INACTIVO";
    },
    detalles_dia?: HorarioDetalleDia[]
  ): Promise<HorarioEntity>;
  cambiarEstadoHorario(id: string, estado: "ACTIVO" | "INACTIVO"): Promise<HorarioEntity>;
  eliminarHorario(id: string): Promise<void>;
  asignarHorarioEmpleado(asignacion: AsignacionHorarioEntity): Promise<void>;
  asignarHorarioConCierrePrevio(params: {
    empleado_id: string;
    horario_id: string;
    fecha_inicio: string;
    fecha_fin?: string;
    usuario_asigno_id: string;
  }): Promise<AsignacionHorarioDetallada>;
  obtenerHistorialAsignaciones(empleado_id: string): Promise<AsignacionHorarioDetallada[]>;
}
