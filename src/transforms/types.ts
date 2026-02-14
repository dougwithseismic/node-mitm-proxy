export interface ProxyRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export type TransformAction =
  | { action: 'block'; statusCode?: number }
  | { action: 'drop' }
  | { action: 'redirect'; url: string };

export type RequestTransformFn = (
  req: ProxyRequest,
) => ProxyRequest | TransformAction | Promise<ProxyRequest | TransformAction>;

export type ResponseTransformFn = (
  res: ProxyResponse,
  req: ProxyRequest,
) => ProxyResponse | TransformAction | Promise<ProxyResponse | TransformAction>;

export interface TransformModule {
  onRequest?: RequestTransformFn;
  onResponse?: ResponseTransformFn;
}
