import type http from 'node:http';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { Context, Middleware, RouteHandler } from '../../src/interfaces/index.js';

import { Router } from '../../src/Router.js';

describe('Router', () => {
  let router: Router;
  let mockReq: Partial<http.IncomingMessage>;
  let mockRes: Partial<http.ServerResponse>;

  beforeEach(() => {
    router = new Router();

    mockReq = {
      method: 'GET',
      url: '/test',
      headers: {
        host: 'localhost:3000'
      },
      on: vi.fn()
    };

    mockRes = {
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      writeHead: vi.fn(),
      write: vi.fn(),
      end: vi.fn()
    };
  });

  describe('Route Registration', () => {
    test('It should register GET routes', async () => {
      const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });
      router.get('/test', handler);

      const result = await router.handle(
        mockReq as http.IncomingMessage,
        mockRes as http.ServerResponse
      );

      expect(handler).toHaveBeenCalled();
      expect(result).toEqual({ statusCode: 200, body: { success: true } });
    });

    test('It should register POST routes', async () => {
      const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });
      router.post('/test', handler);

      mockReq.method = 'POST';
      const result = await router.handle(
        mockReq as http.IncomingMessage,
        mockRes as http.ServerResponse
      );

      expect(handler).toHaveBeenCalled();
      expect(result).toEqual({ statusCode: 200, body: { success: true } });
    });

    test('It should register PUT routes', async () => {
      const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });
      router.put('/test', handler);

      mockReq.method = 'PUT';
      const result = await router.handle(
        mockReq as http.IncomingMessage,
        mockRes as http.ServerResponse
      );

      expect(handler).toHaveBeenCalled();
      expect(result).toEqual({ statusCode: 200, body: { success: true } });
    });

    test('It should register DELETE routes', async () => {
      const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });
      router.delete('/test', handler);

      mockReq.method = 'DELETE';
      const result = await router.handle(
        mockReq as http.IncomingMessage,
        mockRes as http.ServerResponse
      );

      expect(handler).toHaveBeenCalled();
      expect(result).toEqual({ statusCode: 200, body: { success: true } });
    });

    test('It should register PATCH routes', async () => {
      const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });
      router.patch('/test', handler);

      mockReq.method = 'PATCH';
      const result = await router.handle(
        mockReq as http.IncomingMessage,
        mockRes as http.ServerResponse
      );

      expect(handler).toHaveBeenCalled();
      expect(result).toEqual({ statusCode: 200, body: { success: true } });
    });

    test('It should register OPTIONS routes', async () => {
      const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });
      router.options('/test', handler);

      mockReq.method = 'OPTIONS';
      const result = await router.handle(
        mockReq as http.IncomingMessage,
        mockRes as http.ServerResponse
      );

      expect(handler).toHaveBeenCalled();
      expect(result).toEqual({ statusCode: 200, body: { success: true } });
    });

    describe('Any method', () => {
      test('It should register a route that responds to any HTTP method', async () => {
        const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });
        router.any('/any-method', handler);

        const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];

        for (const method of methods) {
          mockReq.method = method;
          mockReq.url = '/any-method';

          await router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse);

          expect(handler).toHaveBeenCalled();
          handler.mockClear();
        }
      });

      test('It should execute middleware with any() method', async () => {
        const middleware = vi.fn().mockImplementation((_ctx, next) => next());
        const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });

        router.any('/any-with-middleware', middleware, handler);

        const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];

        for (const method of methods) {
          mockReq.method = method;
          mockReq.url = '/any-with-middleware';

          await router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse);

          expect(middleware).toHaveBeenCalled();
          expect(handler).toHaveBeenCalled();

          middleware.mockClear();
          handler.mockClear();
        }
      });
    });

    test('It should return null when no route matches', async () => {
      const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });
      router.get('/other-path', handler);

      mockReq.url = '/non-existent';
      const result = await router.handle(
        mockReq as http.IncomingMessage,
        mockRes as http.ServerResponse
      );

      expect(handler).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('Path Matching', () => {
    test('It should match exact paths', async () => {
      const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });
      router.get('/exact-path', handler);

      mockReq.url = '/exact-path';
      await router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse);

      expect(handler).toHaveBeenCalled();
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ path: '/exact-path' }));
    });

    test('It should match paths with parameters', async () => {
      const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });
      router.get('/users/:id', handler);

      mockReq.url = '/users/123';
      await router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { id: '123' },
          path: '/users/123'
        })
      );
    });

    test('It should match paths with multiple parameters', async () => {
      const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });
      router.get('/users/:userId/posts/:postId', handler);

      mockReq.url = '/users/123/posts/456';
      await router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { userId: '123', postId: '456' },
          path: '/users/123/posts/456'
        })
      );
    });

    test('It should match paths with query parameters', async () => {
      const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });
      router.get('/search', handler);

      mockReq.url = '/search?q=test&limit=10';
      await router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { q: 'test', limit: '10' },
          path: '/search'
        })
      );
    });

    test('It should match the correct method', async () => {
      const getHandler = vi.fn().mockReturnValue({ statusCode: 200, body: { method: 'GET' } });
      const postHandler = vi.fn().mockReturnValue({ statusCode: 200, body: { method: 'POST' } });

      router.get('/method-test', getHandler);
      router.post('/method-test', postHandler);

      mockReq.method = 'GET';
      mockReq.url = '/method-test';
      await router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse);

      expect(getHandler).toHaveBeenCalled();
      expect(postHandler).not.toHaveBeenCalled();

      getHandler.mockClear();
      postHandler.mockClear();

      mockReq.method = 'POST';
      mockReq.url = '/method-test';
      await router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse);

      expect(getHandler).not.toHaveBeenCalled();
      expect(postHandler).toHaveBeenCalled();
    });

    describe('Wildcard pattern matching', () => {
      test('It should match wildcard paths', async () => {
        const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });
        router.get('/api/files/*', handler);

        mockReq.url = '/api/files/documents/report.pdf';
        await router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse);

        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            params: { wildcard: 'documents/report.pdf' },
            path: '/api/files/documents/report.pdf'
          })
        );
      });

      test('It should match the exact wildcard path', async () => {
        const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });
        router.get('/api/resources/*', handler);

        mockReq.url = '/api/resources/';
        await router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse);

        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            params: { wildcard: '' },
            path: '/api/resources/'
          })
        );

        // Also test without trailing slash
        mockReq.url = '/api/resources';
        await router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse);

        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            params: { wildcard: '' },
            path: '/api/resources'
          })
        );
      });
    });
  });

  describe('Response Helpers', () => {
    let context: Context;

    beforeEach(() => {
      router.get('/helpers-test', (ctx: any) => {
        context = ctx;
        return ctx.json({ success: true });
      });

      mockReq.url = '/helpers-test';
      return router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse);
    });

    test('It should provide text helper', () => {
      const response = context.text('Hello, world!', 201);

      expect(response).toEqual({
        statusCode: 201,
        body: 'Hello, world!',
        headers: { 'Content-Type': 'text/plain' }
      });
    });

    test('It should provide json helper', () => {
      const response = context.json({ message: 'Hello, world!' }, 201);

      expect(response).toEqual({
        statusCode: 201,
        body: { message: 'Hello, world!' },
        headers: { 'Content-Type': 'application/json' }
      });
    });

    test('It should provide html helper', () => {
      const response = context.html('<h1>Hello, world!</h1>', 201);

      expect(response).toEqual({
        statusCode: 201,
        body: '<h1>Hello, world!</h1>',
        headers: { 'Content-Type': 'text/html' }
      });
    });

    test('It should provide redirect helper', () => {
      const response = context.redirect('/new-location', 301);

      expect(response).toEqual({
        statusCode: 301,
        body: null,
        headers: { Location: '/new-location' }
      });
    });

    test('It should provide status chaining helper', () => {
      const createdJsonResponse = context.status(201).json({ created: true });
      const notFoundTextResponse = context.status(404).text('Not Found');

      expect(createdJsonResponse).toEqual({
        statusCode: 201,
        body: { created: true },
        headers: { 'Content-Type': 'application/json' }
      });

      expect(notFoundTextResponse).toEqual({
        statusCode: 404,
        body: 'Not Found',
        headers: { 'Content-Type': 'text/plain' }
      });
    });
  });

  describe('Middleware Processing', () => {
    test('It should execute global middleware', async () => {
      const middleware = vi.fn().mockImplementation((_ctx, next) => next());
      const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });

      router.use(middleware);
      router.get('/middleware-test', handler);

      mockReq.url = '/middleware-test';
      await router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse);

      expect(middleware).toHaveBeenCalled();
      expect(handler).toHaveBeenCalled();
    });

    test('It should execute route-specific middleware', async () => {
      const middleware = vi.fn().mockImplementation((_ctx, next) => next());
      const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });

      router.get('/route-middleware', middleware, handler);

      mockReq.url = '/route-middleware';
      await router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse);

      expect(middleware).toHaveBeenCalled();
      expect(handler).toHaveBeenCalled();
    });

    test('It should execute multiple middleware in correct order', async () => {
      const executionOrder: string[] = [];

      const globalMiddleware = vi.fn().mockImplementation((_ctx, next) => {
        executionOrder.push('global');
        return next();
      });

      const routeMiddleware1 = vi.fn().mockImplementation((_ctx, next) => {
        executionOrder.push('route1');
        return next();
      });

      const routeMiddleware2 = vi.fn().mockImplementation((_ctx, next) => {
        executionOrder.push('route2');
        return next();
      });

      const handler = vi.fn().mockImplementation((ctx) => {
        executionOrder.push('handler');
        return ctx.json({ success: true });
      });

      router.use(globalMiddleware);
      router.get('/middleware-order', routeMiddleware1, routeMiddleware2, handler);

      mockReq.url = '/middleware-order';
      await router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse);

      expect(executionOrder).toEqual(['global', 'route1', 'route2', 'handler']);
    });

    test('It should allow middleware to modify context', async () => {
      const middleware: Middleware = async (ctx, next) => {
        ctx.body = { modified: true };
        return next();
      };

      const handler = vi.fn().mockImplementation((ctx) => {
        return ctx.json(ctx.body);
      });

      router.get('/modify-context', middleware, handler);

      mockReq.url = '/modify-context';
      const result = await router.handle(
        mockReq as http.IncomingMessage,
        mockRes as http.ServerResponse
      );

      expect(result).toEqual({
        statusCode: 200,
        body: { modified: true },
        headers: { 'Content-Type': 'application/json' }
      });
    });

    test('It should allow middleware to short-circuit the chain', async () => {
      const middleware: Middleware = async () => {
        return { statusCode: 401, body: { error: 'Unauthorized' } };
      };

      const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });

      router.get('/short-circuit', middleware, handler);

      mockReq.url = '/short-circuit';
      const result = await router.handle(
        mockReq as http.IncomingMessage,
        mockRes as http.ServerResponse
      );

      expect(handler).not.toHaveBeenCalled();
      expect(result).toEqual({ statusCode: 401, body: { error: 'Unauthorized' } });
    });
  });

  describe('Error Handling', () => {
    test('It should handle errors thrown in handlers', async () => {
      const handler: RouteHandler = () => {
        throw new Error('Test error');
      };

      router.get('/error-path', handler);

      mockReq.url = '/error-path';
      await expect(
        router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse)
      ).rejects.toThrow('Test error');
    });

    test('It should handle errors thrown in middleware', async () => {
      const middleware: Middleware = () => {
        throw new Error('Middleware error');
      };

      const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });

      router.get('/middleware-error', middleware, handler);

      mockReq.url = '/middleware-error';
      await expect(
        router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse)
      ).rejects.toThrow('Middleware error');
    });

    test('It should handle async errors in handlers', async () => {
      const handler: RouteHandler = async () => {
        throw new Error('Async error');
      };

      router.get('/async-error', handler);

      mockReq.url = '/async-error';
      await expect(
        router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse)
      ).rejects.toThrow('Async error');
    });
  });

  describe('Path Pattern Matching', () => {
    test('It should match paths with parameters in different positions', async () => {
      const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });
      router.get('/:category/items/:id', handler);

      mockReq.url = '/electronics/items/123';
      await router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { category: 'electronics', id: '123' }
        })
      );
    });

    test('It should handle paths with both parameters and query string', async () => {
      const handler = vi.fn().mockReturnValue({ statusCode: 200, body: { success: true } });
      router.get('/products/:id', handler);

      mockReq.url = '/products/123?color=red&size=large';
      await router.handle(mockReq as http.IncomingMessage, mockRes as http.ServerResponse);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { id: '123' },
          query: { color: 'red', size: 'large' }
        })
      );
    });

    test('It should match the most specific route when multiple routes match', async () => {
      const specificHandler = vi
        .fn()
        .mockReturnValue({ statusCode: 200, body: { route: 'specific' } });
      const paramHandler = vi.fn().mockReturnValue({ statusCode: 200, body: { route: 'param' } });

      router.get('/:any', paramHandler);
      router.get('/specific', specificHandler);

      mockReq.url = '/specific';
      const result = await router.handle(
        mockReq as http.IncomingMessage,
        mockRes as http.ServerResponse
      );

      expect(result?.body).toEqual({ route: 'param' });
      expect(paramHandler).toHaveBeenCalled();
      expect(specificHandler).not.toHaveBeenCalled();
    });
  });
});
