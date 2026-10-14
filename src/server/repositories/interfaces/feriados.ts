export interface FeriadoEntity {
  id: string;
  fecha: string; // YYYY-MM-DD
  descripcion: string;
  tipo_feriado: string;
  activo: boolean;
  creado_en?: string;
}

export interface IFeriadosRepository {
  listar(soloActivos?: boolean): Promise<FeriadoEntity[]>;
  obtenerPorId(id: string): Promise<FeriadoEntity | null>;
  obtenerPorFecha(fecha: string): Promise<FeriadoEntity | null>;
  crear(feriado: FeriadoEntity): Promise<FeriadoEntity>;
  actualizar(id: string, datos: Partial<FeriadoEntity>): Promise<FeriadoEntity | null>;
  esFeriadoActivo(fecha: string): Promise<boolean>;
}
