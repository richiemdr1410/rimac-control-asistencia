export interface AuditoriaEventoEntity {
  id?: number;
  actor_usuario_id: string | null;
  rol_actor: string;
  accion: string;
  entidad_tipo: string;
  entidad_id: string;
  timestamp_evento?: string;
  motivo?: string | null;
  valor_anterior?: any;
  valor_nuevo?: any;
  ip_origen?: string | null;
  user_agent?: string | null;
}

export interface IAuditoriaRepository {
  registrarEvento(evento: AuditoriaEventoEntity): Promise<void>;
  listarEventos(filtros?: { entidad_tipo?: string; entidad_id?: string; limit?: number }): Promise<AuditoriaEventoEntity[]>;
}
