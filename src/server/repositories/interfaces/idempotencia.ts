export interface RegistroIdempotenciaEntity {
  id: string; // Hash único de usuario_id + ruta_endpoint + idempotency_key
  usuario_id: string;
  ruta_endpoint: string;
  idempotency_key: string;
  payload_hash: string;
  status_code: number;
  response_body: any;
  creado_en: string;
}

export interface IIdempotenciaRepository {
  obtener(
    usuario_id: string,
    ruta_endpoint: string,
    idempotency_key: string
  ): Promise<RegistroIdempotenciaEntity | null>;
  guardar(registro: RegistroIdempotenciaEntity): Promise<void>;
  calcularIdDocumento(
    usuario_id: string,
    ruta_endpoint: string,
    idempotency_key: string
  ): string;
}
