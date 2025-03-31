import type http from 'node:http';
import type http2 from 'node:http2';
import type https from 'node:https';

/**
 * @description Server configuration options.
 */
export type MikroServeConfiguration = {
  /**
   * The port to expose.
   * @default process.env.PORT
   * @default 3000
   */
  port: number;

  /**
   * The host name to use.
   * @default process.env.HOST
   * @default '0.0.0.0'
   */
  host: string;

  /**
   * Should the server use HTTPS?
   * @default false
   */
  useHttps: boolean;

  /**
   * Should the server use HTTP2?
   * @default false
   */
  useHttp2: boolean;

  /**
   * The path to the SSL certificate.
   * @default '''
   */
  sslCert: string;

  /**
   * The path to the SSL key.
   * @default ''
   */
  sslKey: string;

  /**
   * The path to the SSL CA file.
   * @default ''
   */
  sslCa: string;

  /**
   * Use debug mode?
   * @default process.env.DEBUG
   * @default false
   */
  debug: boolean;

  /**
   * Rate limiter settings.
   */
  rateLimit: {
    /**
     * Should the rate limiter be active?
     * @default true
     */
    enabled: boolean;

    /**
     * What is the maximum requests per minute from a given IP address?
     * @default 100
     */
    requestsPerMinute: number;
  };

  /**
   * List of allowed domains.
   * @default ["*"]
   */
  allowedDomains: string[];
};

/**
 * @description Server configuration options.
 */
export type MikroServeOptions = Partial<MikroServeConfiguration>;

/**
 * @description Response utilities for handlers.
 */
export interface ResponseHelpers {
  raw: () => ResponseType;
  binary: (content: Buffer, contentType?: string) => HandlerResponse;
  text(content: string, status?: number): HandlerResponse;
  json(data: any, status?: number): HandlerResponse;
  html(content: string, status?: number): HandlerResponse;
  form(content: any, status?: number): HandlerResponse;
  redirect(url: string, status?: 301 | 302 | 307 | 308): HandlerResponse;
  status(code: number): ResponseHelpers;
}

/**
 * @description Context object passed to route handlers.
 */
export interface Context extends ResponseHelpers {
  req: http.IncomingMessage | http2.Http2ServerRequest;
  res: http.ServerResponse | http2.Http2ServerResponse;
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
  headers: http.IncomingHttpHeaders | http2.IncomingHttpHeaders;
  path: string;
  state: Record<string, any>;
}

/**
 * @description Handler response object.
 */
export interface HandlerResponse {
  statusCode: number;
  body: any;
  headers?: Record<string, string>;
  _handled?: boolean;
}

/**
 * @description Route handler function signature.
 */
export type RouteHandler = (context: Context) => Promise<HandlerResponse> | HandlerResponse;

/**
 * @description Middleware function signature.
 */
export type Middleware = (
  context: Context,
  next: () => Promise<HandlerResponse>
) => Promise<HandlerResponse> | HandlerResponse;

/**
 * @description Route definition.
 */
export interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
  middlewares: Middleware[];
}

/**
 * @description Path pattern parameter extraction.
 */
export interface PathPattern {
  pattern: RegExp;
  paramNames: string[];
}

export type ServerType = http.Server | https.Server | http2.Http2Server | http2.Http2SecureServer;
export type RequestType = http.IncomingMessage | http2.Http2ServerRequest;
export type ResponseType =
  | http.ServerResponse
  | http2.Http2ServerResponse
  | {
      setHeader: (name: string, value: string) => void;
      getHeaders?: () => Record<string, string | string[] | number>;
      writeHead: (statusCode: number, headers: Record<string, string | string[] | number>) => void;
      statusCode?: number;
    };
