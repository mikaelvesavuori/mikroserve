import { readFileSync } from 'node:fs';
import http from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { MikroConf } from 'mikroconf';

import type {
  Middleware,
  MikroServeConfiguration,
  MikroServeOptions,
  RequestType,
  ResponseType,
  RouteHandler,
  ServerType
} from './interfaces/index.js';

import { RateLimiter } from './RateLimiter.js';
import { Router } from './Router.js';

import { baseConfig } from './config.js';
import { configDefaults } from './utils/configDefaults.js';

/**
 * @description MikroServe manages HTTP server operations with routing.
 */
export class MikroServe {
  private config: MikroServeConfiguration;
  private rateLimiter: RateLimiter;
  private router: Router;

  /**
   * @description Creates a new MikroServe instance.
   */
  constructor(options?: MikroServeOptions) {
    const config = new MikroConf(baseConfig(options || {})).get<MikroServeConfiguration>();

    if (config.debug) console.log('Using configuration:', config);

    this.config = config;
    this.router = new Router();

    const requestsPerMinute =
      config.rateLimit.requestsPerMinute || configDefaults().rateLimit.requestsPerMinute;
    this.rateLimiter = new RateLimiter(requestsPerMinute, 60);

    if (config.rateLimit.enabled === true) this.use(this.rateLimitMiddleware.bind(this));
  }

  /**
   * @description Register a global middleware.
   */
  public use(middleware: Middleware): this {
    this.router.use(middleware);
    return this;
  }

  /**
   * @description Register a GET route.
   */
  public get(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    this.router.get(path, ...handlers);
    return this;
  }

  /**
   * @description Register a POST route.
   */
  public post(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    this.router.post(path, ...handlers);
    return this;
  }

  /**
   * @description Register a PUT route.
   */
  public put(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    this.router.put(path, ...handlers);
    return this;
  }

  /**
   * @description Register a DELETE route.
   */
  public delete(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    this.router.delete(path, ...handlers);
    return this;
  }

  /**
   * @description Register a PATCH route.
   */
  public patch(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    this.router.patch(path, ...handlers);
    return this;
  }

  /**
   * @description Register a route that responds to any HTTP method.
   */
  public any(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    this.router.any(path, ...handlers);
    return this;
  }

  /**
   * @description Register an OPTIONS route.
   */
  public options(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    this.router.options(path, ...handlers);
    return this;
  }

  /**
   * @description Creates an HTTP/HTTPS server, sets up graceful shutdown, and starts listening.
   */
  public start(): ServerType {
    const server = this.createServer();
    const { port, host } = this.config;

    this.setupGracefulShutdown(server);

    server.listen(port, host, () => {
      const address = server.address() as AddressInfo;
      const protocol = this.config.useHttps || this.config.useHttp2 ? 'https' : 'http';
      console.log(
        `MikroServe running at ${protocol}://${address.address !== '::' ? address.address : 'localhost'}:${address.port}`
      );
    });

    return server;
  }

  /**
   * @description Creates and configures a server instance without starting it.
   */
  public createServer(): ServerType {
    const boundRequestHandler = this.requestHandler.bind(this);

    if (this.config.useHttp2) {
      if (!this.config.sslCert || !this.config.sslKey)
        throw new Error('SSL certificate and key paths are required when useHttp2 is true');

      try {
        const httpsOptions = {
          key: readFileSync(this.config.sslKey),
          cert: readFileSync(this.config.sslCert),
          ...(this.config.sslCa ? { ca: readFileSync(this.config.sslCa) } : {})
        };

        return http2.createSecureServer(httpsOptions, boundRequestHandler);
      } catch (error: any) {
        if (error.message.includes('key values mismatch'))
          throw new Error(`SSL certificate and key do not match: ${error.message}`);

        throw error;
      }
    } else if (this.config.useHttps) {
      if (!this.config.sslCert || !this.config.sslKey)
        throw new Error('SSL certificate and key paths are required when useHttps is true');

      try {
        const httpsOptions = {
          key: readFileSync(this.config.sslKey),
          cert: readFileSync(this.config.sslCert),
          ...(this.config.sslCa ? { ca: readFileSync(this.config.sslCa) } : {})
        };

        return https.createServer(httpsOptions, boundRequestHandler);
      } catch (error: any) {
        if (error.message.includes('key values mismatch'))
          throw new Error(`SSL certificate and key do not match: ${error.message}`);

        throw error;
      }
    }

    return http.createServer(boundRequestHandler);
  }

  /**
   * @description Rate limiting middleware.
   */
  private async rateLimitMiddleware(context: any, next: () => Promise<any>): Promise<any> {
    const ip = context.req.socket.remoteAddress || 'unknown';

    context.res.setHeader('X-RateLimit-Limit', this.rateLimiter.getLimit().toString());
    context.res.setHeader(
      'X-RateLimit-Remaining',
      this.rateLimiter.getRemainingRequests(ip).toString()
    );
    context.res.setHeader('X-RateLimit-Reset', this.rateLimiter.getResetTime(ip).toString());

    if (!this.rateLimiter.isAllowed(ip)) {
      return {
        statusCode: 429,
        body: {
          error: 'Too Many Requests',
          message: 'Rate limit exceeded, please try again later'
        },
        headers: { 'Content-Type': 'application/json' }
      };
    }

    return next();
  }

  /**
   * @description Request handler for HTTP and HTTPS servers.
   */
  private async requestHandler(req: RequestType, res: ResponseType) {
    const start = Date.now();
    const method = req.method || 'UNKNOWN';
    const url = req.url || '/unknown';

    const isDebug = this.config.debug;

    try {
      this.setCorsHeaders(res, req);
      this.setSecurityHeaders(res, this.config.useHttps);

      if (isDebug) console.log(`${method} ${url}`);

      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        if (res instanceof http.ServerResponse) {
          res.statusCode = 204;
          res.end();
        } else {
          const h2Res = res as http2.Http2ServerResponse;
          h2Res.writeHead(204);
          h2Res.end();
        }
        return;
      }

      try {
        // @ts-ignore
        req.body = await this.parseBody(req);
      } catch (error: any) {
        if (isDebug) console.error('Body parsing error:', error.message);

        return this.respond(res, {
          statusCode: 400,
          body: {
            error: 'Bad Request',
            message: error.message
          }
        });
      }

      const result = await this.router.handle(req, res);
      if (result) {
        if (result._handled) return;
        return this.respond(res, result);
      }

      return this.respond(res, {
        statusCode: 404,
        body: {
          error: 'Not Found',
          message: 'The requested endpoint does not exist'
        }
      });
    } catch (error: any) {
      console.error('Server error:', error);
      return this.respond(res, {
        statusCode: 500,
        body: {
          error: 'Internal Server Error',
          message: isDebug ? error.message : 'An unexpected error occurred'
        }
      });
    } finally {
      if (isDebug) this.logDuration(start, method, url);
    }
  }

  /**
   * @description Writes out a clean log to represent the duration of the request.
   */
  private logDuration(start: number, method: string, url: string) {
    const duration = Date.now() - start;
    console.log(`${method} ${url} completed in ${duration}ms`);
  }

  /**
   * @description Parses the request body based on content type.
   */
  private async parseBody(req: RequestType): Promise<any> {
    return new Promise((resolve, reject) => {
      const bodyChunks: Buffer[] = [];
      let bodySize = 0;
      const MAX_BODY_SIZE = 1024 * 1024; // 1MB limit

      let rejected = false;

      const isDebug = this.config.debug;

      const contentType = req.headers['content-type'] || '';
      if (isDebug) {
        console.log('Content-Type:', contentType);
      }

      req.on('data', (chunk: Buffer) => {
        bodySize += chunk.length;

        if (isDebug) console.log(`Received chunk: ${chunk.length} bytes, total size: ${bodySize}`);

        if (bodySize > MAX_BODY_SIZE && !rejected) {
          rejected = true;

          if (isDebug) console.log(`Body size exceeded limit: ${bodySize} > ${MAX_BODY_SIZE}`);

          reject(new Error('Request body too large'));
          return;
        }

        if (!rejected) bodyChunks.push(chunk);
      });

      req.on('end', () => {
        if (rejected) return;

        if (isDebug) console.log(`Request body complete: ${bodySize} bytes`);

        try {
          if (bodyChunks.length > 0) {
            const bodyString = Buffer.concat(bodyChunks).toString('utf8');

            if (contentType.includes('application/json')) {
              try {
                resolve(JSON.parse(bodyString));
              } catch (error: any) {
                reject(new Error(`Invalid JSON in request body: ${error.message}`));
              }
            } else if (contentType.includes('application/x-www-form-urlencoded')) {
              const formData: Record<string, string> = {};
              new URLSearchParams(bodyString).forEach((value, key) => {
                formData[key] = value;
              });
              resolve(formData);
            } else {
              // Default to raw text
              resolve(bodyString);
            }
          } else {
            resolve({});
          }
        } catch (error) {
          reject(new Error(`Invalid request body: ${error}`));
        }
      });

      req.on('error', (error: Error) => {
        // Don't reject if we've already rejected due to size
        if (!rejected) reject(new Error(`Error reading request body: ${error.message}`));
      });
    });
  }

  /**
   * @description CORS middleware.
   */
  private setCorsHeaders(res: ResponseType, req: RequestType): void {
    const origin = req.headers.origin;
    const { allowedDomains = ['*'] } = this.config;

    if (!origin || allowedDomains.length === 0) res.setHeader('Access-Control-Allow-Origin', '*');
    else if (allowedDomains.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
    else if (allowedDomains.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      // When sending specific origin, Vary header is necessary for correct caching
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  }

  /**
   * @description Set security headers.
   */
  private setSecurityHeaders(res: ResponseType, isHttps = false): void {
    const securityHeaders: Record<string, string> = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; object-src 'none'",
      'X-XSS-Protection': '1; mode=block'
    };

    if (isHttps || this.config.useHttp2)
      securityHeaders['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';

    if (res instanceof http.ServerResponse) {
      // HTTP/1.1 response
      Object.entries(securityHeaders).forEach(([name, value]) => {
        res.setHeader(name, value);
      });
    } else {
      // HTTP/2 response
      const h2Res = res as http2.Http2ServerResponse;
      Object.entries(securityHeaders).forEach(([name, value]) => {
        h2Res.setHeader(name, value);
      });
    }
  }

  /**
   * @description Sends a response with appropriate headers.
   */
  private respond(
    res: ResponseType,
    response: {
      statusCode: number;
      body: any;
      headers?: Record<string, string>;
      isRaw?: boolean;
    }
  ): void {
    const headers = {
      ...(response.headers || {})
    };

    const hasWriteHead = (
      res: any
    ): res is {
      writeHead: (statusCode: number, headers: any) => void;
      end: (chunk?: string | Buffer) => void;
    } => {
      return typeof res.writeHead === 'function' && typeof res.end === 'function';
    };

    if (hasWriteHead(res)) {
      res.writeHead(response.statusCode, headers);

      if (response.body === null || response.body === undefined) res.end();
      else if (response.isRaw) res.end(response.body);
      else if (typeof response.body === 'string') res.end(response.body);
      else res.end(JSON.stringify(response.body));
    } else {
      console.warn('Unexpected response object type without writeHead/end methods');

      (res as any).writeHead?.(response.statusCode, headers);

      if (response.body === null || response.body === undefined) (res as any).end?.();
      else if (response.isRaw) (res as any).end?.(response.body);
      else if (typeof response.body === 'string') (res as any).end?.(response.body);
      else (res as any).end?.(JSON.stringify(response.body));
    }
  }

  /**
   * @description Sets up graceful shutdown handlers for a server.
   */
  setupGracefulShutdown(server: ServerType): void {
    const shutdown = (error?: any) => {
      console.log('Shutting down MikroServe server...');

      if (error) console.error('Error:', error);

      server.close(() => {
        console.log('Server closed successfully');
        // Use setImmediate to ensure this completes before process exits
        setImmediate(() => process.exit(error ? 1 : 0));
      });
    };

    // Soft shutdown codes
    process.on('SIGINT', () => shutdown());
    process.on('SIGTERM', () => shutdown());

    // Hard shutdown codes
    process.on('uncaughtException', shutdown);
    process.on('unhandledRejection', shutdown);
  }
}
