import { URL } from 'node:url';

import type {
  Context,
  HandlerResponse,
  Middleware,
  PathPattern,
  RequestType,
  ResponseHelpers,
  ResponseType,
  Route,
  RouteHandler
} from './interfaces/index.js';

/**
 * Router class to manage routes and middleware
 */
export class Router {
  private routes: Route[] = [];
  private globalMiddlewares: Middleware[] = [];
  private pathPatterns: Map<string, PathPattern> = new Map();

  /**
   * Add a global middleware
   */
  use(middleware: Middleware): this {
    this.globalMiddlewares.push(middleware);
    return this;
  }

  /**
   * Register a route with specified method
   */
  private register(
    method: string,
    path: string,
    handler: RouteHandler,
    middlewares: Middleware[] = []
  ): this {
    this.routes.push({ method, path, handler, middlewares });
    this.pathPatterns.set(path, this.createPathPattern(path));
    return this;
  }

  /**
   * Register a GET route
   */
  get(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    const handler = handlers.pop() as RouteHandler;
    return this.register('GET', path, handler, handlers as Middleware[]);
  }

  /**
   * Register a POST route
   */
  post(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    const handler = handlers.pop() as RouteHandler;
    return this.register('POST', path, handler, handlers as Middleware[]);
  }

  /**
   * Register a PUT route
   */
  put(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    const handler = handlers.pop() as RouteHandler;
    return this.register('PUT', path, handler, handlers as Middleware[]);
  }

  /**
   * Register a DELETE route
   */
  delete(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    const handler = handlers.pop() as RouteHandler;
    return this.register('DELETE', path, handler, handlers as Middleware[]);
  }

  /**
   * Register a PATCH route
   */
  patch(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    const handler = handlers.pop() as RouteHandler;
    return this.register('PATCH', path, handler, handlers as Middleware[]);
  }

  /**
   * Register an OPTIONS route
   */
  options(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    const handler = handlers.pop() as RouteHandler;
    return this.register('OPTIONS', path, handler, handlers as Middleware[]);
  }

  /**
   * Match a request to a route
   */
  match(method: string, path: string): { route: Route; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method) continue;

      const pathPattern = this.pathPatterns.get(route.path);
      if (!pathPattern) continue;

      const match = pathPattern.pattern.exec(path);
      if (!match) continue;

      const params: Record<string, string> = {};
      pathPattern.paramNames.forEach((name, index) => {
        params[name] = match[index + 1] || '';
      });

      return { route, params };
    }

    return null;
  }

  /**
   * Create a regex pattern for path matching
   */
  private createPathPattern(path: string): PathPattern {
    const paramNames: string[] = [];

    // Convert path to regex pattern
    const pattern = path
      .replace(/\/:[^/]+/g, (match) => {
        const paramName = match.slice(2);
        paramNames.push(paramName);
        return '/([^/]+)';
      })
      // Handle optional trailing slash
      .replace(/\/$/, '/?');

    return {
      pattern: new RegExp(`^${pattern}$`),
      paramNames
    };
  }

  /**
   * Handle a request and find the matching route
   */
  async handle(req: RequestType, res: ResponseType): Promise<HandlerResponse | null> {
    const method = req.method || 'GET';
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;

    const matched = this.match(method, path);

    if (!matched) return null;

    const { route, params } = matched;

    // Parse query parameters
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    const context: Context = {
      req,
      res: res as any,
      params,
      query,
      // @ts-ignore
      body: req.body || {},
      headers: req.headers,
      path,
      state: {}, // Add the missing state property
      raw: () => res,
      binary: (content: Buffer, contentType = 'application/octet-stream', status = 200) => ({
        statusCode: status,
        body: content,
        headers: {
          'Content-Type': contentType,
          'Content-Length': content.length.toString()
        },
        isRaw: true
      }),
      text: (content: any, status = 200) => ({
        statusCode: status,
        body: content,
        headers: { 'Content-Type': 'text/plain' }
      }),
      form: (content: any, status = 200) => ({
        statusCode: status,
        body: content,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }),
      json: (content: any, status = 200) => ({
        statusCode: status,
        body: content,
        headers: { 'Content-Type': 'application/json' }
      }),
      html: (content: any, status = 200) => ({
        statusCode: status,
        body: content,
        headers: { 'Content-Type': 'text/html' }
      }),
      redirect: (url: string, status = 302) => ({
        statusCode: status,
        body: null,
        headers: { Location: url }
      }),
      status: function (code: number): ResponseHelpers {
        return {
          raw: () => res,
          binary: (content, contentType = 'application/octet-stream') => ({
            statusCode: code,
            body: content,
            headers: {
              'Content-Type': contentType,
              'Content-Length': content.length.toString()
            },
            isRaw: true
          }),
          text: (content) => ({
            statusCode: code,
            body: content,
            headers: { 'Content-Type': 'text/plain' }
          }),
          json: (data) => ({
            statusCode: code,
            body: data,
            headers: { 'Content-Type': 'application/json' }
          }),
          html: (content) => ({
            statusCode: code,
            body: content,
            headers: { 'Content-Type': 'text/html' }
          }),
          form: (content) => ({
            // Make sure form method is included here
            statusCode: code,
            body: content,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          }),
          redirect: (url, redirectStatus = 302) => ({
            statusCode: redirectStatus,
            body: null,
            headers: { Location: url }
          }),
          status: (updatedCode) => this.status(updatedCode)
        };
      }
    };

    // Combine global and route middlewares
    const middlewares = [...this.globalMiddlewares, ...route.middlewares];

    // Execute middleware chain
    return this.executeMiddlewareChain(context, middlewares, route.handler);
  }

  /**
   * Execute middleware chain and final handler
   */
  private async executeMiddlewareChain(
    context: Context,
    middlewares: Middleware[],
    finalHandler: RouteHandler
  ): Promise<HandlerResponse> {
    let currentIndex = 0;

    const next = async (): Promise<HandlerResponse> => {
      if (currentIndex < middlewares.length) {
        const middleware = middlewares[currentIndex++];
        return middleware(context, next);
      }

      return finalHandler(context);
    };

    return next();
  }
}
