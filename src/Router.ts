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
 * @description Router class to manage routes and middleware.
 */
export class Router {
  private routes: Route[] = [];
  private globalMiddlewares: Middleware[] = [];
  private pathPatterns: Map<string, PathPattern> = new Map();

  /**
   * @description Add a global middleware.
   */
  public use(middleware: Middleware): this {
    this.globalMiddlewares.push(middleware);
    return this;
  }

  /**
   * @description Register a GET route.
   */
  public get(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    const handler = handlers.pop() as RouteHandler;
    return this.register('GET', path, handler, handlers as Middleware[]);
  }

  /**
   * @description Register a POST route.
   */
  public post(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    const handler = handlers.pop() as RouteHandler;
    return this.register('POST', path, handler, handlers as Middleware[]);
  }

  /**
   * @description Register a PUT route.
   */
  public put(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    const handler = handlers.pop() as RouteHandler;
    return this.register('PUT', path, handler, handlers as Middleware[]);
  }

  /**
   * @description Register a DELETE route.
   */
  public delete(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    const handler = handlers.pop() as RouteHandler;
    return this.register('DELETE', path, handler, handlers as Middleware[]);
  }

  /**
   * @description Register a PATCH route.
   */
  public patch(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    const handler = handlers.pop() as RouteHandler;
    return this.register('PATCH', path, handler, handlers as Middleware[]);
  }

  /**
   * @description Register a route for any HTTP method.
   */
  public any(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    const handler = handlers.pop() as RouteHandler;
    const middlewares = handlers as Middleware[];

    this.register('GET', path, handler, middlewares);
    this.register('POST', path, handler, middlewares);
    this.register('PUT', path, handler, middlewares);
    this.register('DELETE', path, handler, middlewares);
    this.register('PATCH', path, handler, middlewares);
    this.register('OPTIONS', path, handler, middlewares);

    return this;
  }

  /**
   * @description Register an OPTIONS route.
   */
  public options(path: string, ...handlers: (RouteHandler | Middleware)[]): this {
    const handler = handlers.pop() as RouteHandler;
    return this.register('OPTIONS', path, handler, handlers as Middleware[]);
  }

  /**
   * @description Match a request to a route.
   */
  public match(
    method: string,
    path: string
  ): { route: Route; params: Record<string, string> } | null {
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
   * @description Handle a request and find the matching route.
   */
  public async handle(req: RequestType, res: ResponseType): Promise<HandlerResponse | null> {
    const method = req.method || 'GET';
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;

    const matched = this.match(method, path);

    if (!matched) return null;

    const { route, params } = matched;

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
      state: {},
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
   * @description Register a route with specified method.
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
   * @description Create a regex pattern for path matching.
   */
  private createPathPattern(path: string): PathPattern {
    const paramNames: string[] = [];

    let pattern = path.replace(/\/:[^/]+/g, (match) => {
      const paramName = match.slice(2);
      paramNames.push(paramName);
      return '/([^/]+)';
    });

    if (pattern.endsWith('/*')) {
      pattern = `${pattern.slice(0, -2)}(?:/(.*))?`;
      paramNames.push('wildcard');
    } else pattern = pattern.replace(/\/$/, '/?');

    return {
      pattern: new RegExp(`^${pattern}$`),
      paramNames
    };
  }

  /**
   * @description Execute middleware chain and final handler.
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
