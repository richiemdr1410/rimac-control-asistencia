import type { AsignacionJefaturaEntity } from "../../types.js";

export interface AsignacionJefaturaDetalle {
  id: string;
  jefatura_empleado_id: string;
  jefatura_nombre: string;
  jefatura_cedula: string;
  subordinado_empleado_id: string;
  subordinado_nombre: string;
  subordinado_cedula: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado: string;
  creado_en: string;
}

export interface IJefaturasRepository {
  guardarAsignacion(asignacion: AsignacionJefaturaEntity): Promise<void>;
  /**
   * Determina si `jefatura_empleado_id` ostentaba relación de jefatura directa
   * sobre `subordinado_empleado_id` para la fecha de jornada específica (YYYY-MM-DD).
   */
  esJefaturaValidaEnFecha(
    jefatura_empleado_id: string,
    subordinado_empleado_id: string,
    fecha_jornada: string
  ): Promise<boolean>;
  obtenerSubordinadosIds(jefatura_empleado_id: string): Promise<string[]>;
  listarTodasVigentes(): Promise<AsignacionJefaturaDetalle[]>;
  obtenerHistorialPorSubordinado(subordinado_empleado_id: string): Promise<AsignacionJefaturaDetalle[]>;
  obtenerJefaturaVigente(
    subordinado_empleado_id: string,
    fecha?: string
  ): Promise<AsignacionJefaturaDetalle | null>;
  asignarJefaturaDirecta(params: {
    subordinado_empleado_id: string;
    jefatura_empleado_id: string;
    fecha_inicio: string;
    fecha_fin?: string;
  }): Promise<AsignacionJefaturaDetalle>;
  finalizarAsignacionJefatura(id: string, fecha_fin?: string): Promise<AsignacionJefaturaDetalle>;
  eliminarAsignacionJefatura(id: string): Promise<void>;
}
