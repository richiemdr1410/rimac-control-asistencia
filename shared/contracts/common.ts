export interface ApiSuccessResponse<T> {
  exito: true;
  datos: T;
  meta?: {
    total?: number;
    pagina?: number;
    limite?: number;
    timestamp: string;
  };
}

export interface ApiErrorResponse {
  exito: false;
  error: {
    codigo: string;
    mensaje: string;
    detalles?: Record<string, string[]>;
    timestamp: string;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
