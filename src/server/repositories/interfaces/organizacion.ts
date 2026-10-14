export interface DepartamentoEntity {
  id: string; // UUID
  codigo: string;
  nombre: string;
  activo: boolean;
  creado_en: string;
}

export interface PuestoEntity {
  id: string; // UUID
  departamento_id: string;
  departamento_nombre?: string;
  departamento_codigo?: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  creado_en: string;
}

export interface IOrganizacionRepository {
  // Departamentos
  listarDepartamentos(soloActivos?: boolean): Promise<DepartamentoEntity[]>;
  obtenerDepartamentoPorId(id: string): Promise<DepartamentoEntity | null>;
  obtenerDepartamentoPorCodigo(codigo: string): Promise<DepartamentoEntity | null>;
  crearDepartamento(depto: { codigo: string; nombre: string; activo?: boolean }): Promise<DepartamentoEntity>;
  actualizarDepartamento(id: string, datos: { nombre?: string; activo?: boolean }): Promise<DepartamentoEntity>;
  cambiarEstadoDepartamento(id: string, activo: boolean): Promise<DepartamentoEntity>;
  contarDependenciasActivasDepartamento(id: string): Promise<{ puestosActivos: number; empleadosActivos: number }>;
  eliminarDepartamento(id: string): Promise<void>;

  // Puestos
  listarPuestos(departamentoId?: string, soloActivos?: boolean): Promise<PuestoEntity[]>;
  obtenerPuestoPorId(id: string): Promise<PuestoEntity | null>;
  obtenerPuestoPorCodigo(codigo: string): Promise<PuestoEntity | null>;
  crearPuesto(puesto: { departamento_id: string; codigo: string; nombre: string; activo?: boolean }): Promise<PuestoEntity>;
  actualizarPuesto(id: string, datos: { departamento_id?: string; nombre?: string; activo?: boolean }): Promise<PuestoEntity>;
  cambiarEstadoPuesto(id: string, activo: boolean): Promise<PuestoEntity>;
  contarEmpleadosActivosPuesto(id: string): Promise<number>;
  eliminarPuesto(id: string): Promise<void>;
}
