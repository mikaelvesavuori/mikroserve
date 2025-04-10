import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { URLSearchParams } from 'node:url';

import { afterEach, describe, expect, test, vi } from 'vitest';

import type { MikroServeOptions, ServerType } from '../../src/interfaces/index.js';

import { MikroServe } from '../../src/MikroServe.js';
import { generateTestCertificates } from '../utils/generateTestCertificates.js';
import { makeHttp2Request, makeRequest } from '../utils/request.js';

generateTestCertificates();

const getTestConfig = (overrides = {}): MikroServeOptions => ({
  port: 0, // Use 0 to get a random available port
  host: 'localhost',
  useHttps: false,
  useHttp2: false,
  sslCert: path.join(__dirname, '../test-certs/cert.pem'),
  sslKey: path.join(__dirname, '../test-certs/key.pem'),
  sslCa: '',
  debug: false,
  rateLimit: {
    requestsPerMinute: 1000,
    enabled: true
  },
  allowedDomains: ['*'],
  ...overrides
});

const getServerUrl = (server: ServerType): string => {
  if (!server.listening) throw new Error('Cannot get URL for server that is not listening');

  const address = server.address() as AddressInfo;
  if (!address) throw new Error('Server address is null, server might not be fully started');

  const protocol = server instanceof https.Server ? 'https' : 'http';
  return `${protocol}://localhost:${address.port}`;
};

const activeServers: Array<ServerType> = [];

const createTestServer = (
  config: MikroServeOptions = getTestConfig()
): Promise<{
  server: ServerType;
  url: string;
}> => {
  return new Promise((resolve) => {
    const app = new MikroServe(config);

    app.get('/test', (c: any) => c.json({ message: 'GET success' }));
    app.post('/test', (c: any) => c.json({ message: 'POST success', body: c.req.body }));
    app.put('/test', (c: any) => c.json({ message: 'PUT success', body: c.req.body }));
    app.delete('/test', (c: any) => c.json({ message: 'DELETE success' }));
    app.patch('/test', (c: any) => c.json({ message: 'PATCH success', body: c.req.body }));
    app.options('/test', (c: any) => c.json({ message: 'OPTIONS success' }));

    app.get('/error', () => {
      throw new Error('Test error');
    });

    app.get(
      '/middleware-test',
      async (c, next) => {
        c.state = { middlewareRan: true };
        return next();
      },
      (c: any) => c.json({ middlewareRan: c.state?.middlewareRan })
    );

    const server = app.start();
    activeServers.push(server);

    if (server.listening) {
      // If already listening (rare but possible), resolve immediately
      resolve({
        server,
        url: getServerUrl(server)
      });
    } else {
      server.on('listening', () => {
        resolve({
          server,
          url: getServerUrl(server)
        });
      });
    }
  });
};

const closeAllServers = async (): Promise<void> => {
  const promises = activeServers.map((server) => {
    return new Promise<void>((resolve) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
  });

  await Promise.all(promises);
  activeServers.length = 0;
};

afterEach(async () => await closeAllServers());

const createServerWithMiddleware = async () => {
  return new Promise<{ server: ServerType; url: string }>((resolve) => {
    const config = getTestConfig();
    const app = new MikroServe(config);

    app.use(async (c, next) => {
      c.res.setHeader('X-Test-Header', 'test-value');
      return next();
    });

    app.get('/test', (c: any) => c.json({ success: true }));

    const server = app.start();
    activeServers.push(server);

    server.on('listening', () => {
      resolve({
        server,
        url: getServerUrl(server)
      });
    });
  });
};

describe('Initialization', () => {
  test('It should create a MikroServe instance with default config', () => {
    const app = new MikroServe(getTestConfig());
    expect(app).toBeInstanceOf(MikroServe);
  });

  test('It should create a MikroServe instance with rate limiting disabled', () => {
    const config = getTestConfig({
      rateLimit: { enabled: false, requestsPerMinute: 10 }
    });
    const app = new MikroServe(config);
    expect(app).toBeInstanceOf(MikroServe);
  });
});

describe('Server creation', () => {
  test('It should create an HTTP server', () => {
    const app = new MikroServe(getTestConfig());
    const server = app.createServer();
    expect(server).toBeInstanceOf(http.Server);
  });

  test('It should throw an error when creating HTTPS server without certificates', () => {
    const config = getTestConfig({ useHttps: true, sslCert: '', sslKey: '' });
    const app = new MikroServe(config);
    expect(() => app.createServer()).toThrow('SSL certificate and key paths are required');
  });

  test('It should create an HTTPS server with valid certificates', async () => {
    const config = getTestConfig({
      useHttps: true
    });

    const app = new MikroServe(config);
    const server = app.createServer();
    expect(server).toBeInstanceOf(https.Server);

    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('It should set HSTS header for HTTPS', async () => {
    const config = getTestConfig({ useHttps: true });
    const { url } = await createTestServer(config);

    // Need to configure options to accept self-signed certs for this test
    const response = await makeRequest(`${url}/test`, {
      rejectUnauthorized: false
    });

    expect(response.headers['strict-transport-security']).toBeTruthy();
  });
});

describe('Server start and stop', () => {
  test('It should start an HTTP server and listen on a port', async () => {
    const { server } = await createTestServer();
    expect(server.listening).toBe(true);
    const address = server.address() as AddressInfo;
    expect(address.port).toBeGreaterThan(0);
  });

  test('It should close the server properly', async () => {
    const { server } = await createTestServer();
    expect(server.listening).toBe(true);

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    expect(server.listening).toBe(false);
  });
});

describe('Request handling', () => {
  test('It should handle GET requests', async () => {
    const { url } = await createTestServer();
    const response = await makeRequest(`${url}/test`);
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ message: 'GET success' });
  });

  test('It should handle POST requests with JSON body', async () => {
    const { url } = await createTestServer();
    const testData = { foo: 'bar' };
    const response = await makeRequest(
      `${url}/test`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      testData
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual({
      message: 'POST success',
      body: testData
    });
  });

  test('It should handle PUT requests', async () => {
    const { url } = await createTestServer();
    const testData = { foo: 'updated' };
    const response = await makeRequest(
      `${url}/test`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' }
      },
      testData
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual({
      message: 'PUT success',
      body: testData
    });
  });

  test('It should handle DELETE requests', async () => {
    const { url } = await createTestServer();
    const response = await makeRequest(`${url}/test`, { method: 'DELETE' });
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ message: 'DELETE success' });
  });

  test('It should handle PATCH requests', async () => {
    const { url } = await createTestServer();
    const testData = { foo: 'patched' };
    const response = await makeRequest(
      `${url}/test`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }
      },
      testData
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual({
      message: 'PATCH success',
      body: testData
    });
  });

  test('It should register a route that responds to any HTTP method', async () => {
    const config = getTestConfig();
    const app = new MikroServe(config);

    app.any('/any-method', (c: any) => c.json({ method: c.req.method }));

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);

    const getResponse = await makeRequest(`${url}/any-method`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.data).toEqual({ method: 'GET' });

    const postResponse = await makeRequest(`${url}/any-method`, { method: 'POST' });
    expect(postResponse.status).toBe(200);
    expect(postResponse.data).toEqual({ method: 'POST' });

    const putResponse = await makeRequest(`${url}/any-method`, { method: 'PUT' });
    expect(putResponse.status).toBe(200);
    expect(putResponse.data).toEqual({ method: 'PUT' });

    const deleteResponse = await makeRequest(`${url}/any-method`, { method: 'DELETE' });
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.data).toEqual({ method: 'DELETE' });

    const patchResponse = await makeRequest(`${url}/any-method`, { method: 'PATCH' });
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.data).toEqual({ method: 'PATCH' });
  });

  test('It should handle middleware with any() method', async () => {
    const config = getTestConfig();
    const app = new MikroServe(config);
    const middleware = vi.fn().mockImplementation(async (c, next) => {
      c.state = { middlewareRan: true };
      return next();
    });

    app.any('/any-with-middleware', middleware, (c: any) =>
      c.json({ middlewareRan: c.state?.middlewareRan, method: c.req.method })
    );

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);

    const getResponse = await makeRequest(`${url}/any-with-middleware`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.data).toEqual({ middlewareRan: true, method: 'GET' });

    const postResponse = await makeRequest(`${url}/any-with-middleware`, { method: 'POST' });
    expect(postResponse.status).toBe(200);
    expect(postResponse.data).toEqual({ middlewareRan: true, method: 'POST' });
  });

  describe('Wildcard pattern matching', () => {
    test('It should match wildcard paths', async () => {
      const config = getTestConfig();
      const app = new MikroServe(config);

      app.get('/wildcard/*', (c: any) =>
        c.json({
          wildcard: c.params.wildcard,
          success: true
        })
      );

      const server = app.start();
      activeServers.push(server);

      await new Promise<void>((resolve) => {
        if (server.listening) resolve();
        else server.on('listening', () => resolve());
      });

      const url = getServerUrl(server);

      const simpleResponse = await makeRequest(`${url}/wildcard/simple`);
      expect(simpleResponse.status).toBe(200);
      expect(simpleResponse.data).toEqual({ wildcard: 'simple', success: true });

      const nestedResponse = await makeRequest(`${url}/wildcard/nested/path/test`);
      expect(nestedResponse.status).toBe(200);
      expect(nestedResponse.data).toEqual({ wildcard: 'nested/path/test', success: true });

      const queryResponse = await makeRequest(`${url}/wildcard/query?param=value`);
      expect(queryResponse.status).toBe(200);
      expect(queryResponse.data).toEqual({ wildcard: 'query', success: true });
    });

    test('It should match exact root of wildcard path', async () => {
      const config = getTestConfig();
      const app = new MikroServe(config);

      app.get('/api/*', (c: any) =>
        c.json({
          wildcard: c.params.wildcard || 'root',
          success: true
        })
      );

      const server = app.start();
      activeServers.push(server);

      await new Promise<void>((resolve) => {
        if (server.listening) resolve();
        else server.on('listening', () => resolve());
      });

      const url = getServerUrl(server);

      const rootResponse = await makeRequest(`${url}/api/`);
      expect(rootResponse.status).toBe(200);
      expect(rootResponse.data).toEqual({ wildcard: 'root', success: true });

      const exactResponse = await makeRequest(`${url}/api`);
      expect(exactResponse.status).toBe(200);
      expect(exactResponse.data).toEqual({ wildcard: 'root', success: true });
    });

    test('It should support parameters and wildcard in the same path', async () => {
      const config = getTestConfig();
      const app = new MikroServe(config);

      app.get('/users/:userId/files/*', (c: any) =>
        c.json({
          userId: c.params.userId,
          filePath: c.params.wildcard,
          success: true
        })
      );

      const server = app.start();
      activeServers.push(server);

      await new Promise<void>((resolve) => {
        if (server.listening) resolve();
        else server.on('listening', () => resolve());
      });

      const url = getServerUrl(server);

      const response = await makeRequest(`${url}/users/123/files/documents/report.pdf`);
      expect(response.status).toBe(200);
      expect(response.data).toEqual({
        userId: '123',
        filePath: 'documents/report.pdf',
        success: true
      });
    });
  });

  test('It should handle form-urlencoded requests', async () => {
    const { url } = await createTestServer();
    const params = new URLSearchParams();
    params.append('foo', 'bar');

    const response = await makeRequest(
      `${url}/test`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      },
      params
    );

    expect(response.status).toBe(200);
    expect(response.data.body).toEqual({ foo: 'bar' });
  });

  test('It should return 404 for non-existent routes', async () => {
    const { url } = await createTestServer();
    try {
      await makeRequest(`${url}/nonexistent`);
      expect.fail('Should have thrown a 404 error');
    } catch (error: any) {
      expect(error.status).toBe(404);
      expect(error.data).toHaveProperty('error', 'Not Found');
    }
  });

  test('It should handle errors and return 500', async () => {
    const { url } = await createTestServer();
    try {
      await makeRequest(`${url}/error`);
      expect.fail('Should have thrown a 500 error');
    } catch (error: any) {
      expect(error.status).toBe(500);
      expect(error.data).toHaveProperty('error', 'Internal Server Error');
    }
  });

  test('It should include detailed error messages when debug is true', async () => {
    const config = getTestConfig({ debug: true });
    const { url } = await createTestServer(config);

    try {
      await makeRequest(`${url}/error`);
      expect.fail('Should have thrown a 500 error');
    } catch (error: any) {
      expect(error.status).toBe(500);
      expect(error.data.message).toBe('Test error');
    }
  });

  test('It should hide detailed error messages when debug is false', async () => {
    const config = getTestConfig({ debug: false });
    const { url } = await createTestServer(config);

    try {
      await makeRequest(`${url}/error`);
      expect.fail('Should have thrown a 500 error');
    } catch (error: any) {
      expect(error.status).toBe(500);
      expect(error.data.message).toBe('An unexpected error occurred');
    }
  });
});

describe('Middleware functionality', () => {
  test('It should execute global middleware', async () => {
    const { url } = await createServerWithMiddleware();
    const response = await makeRequest(`${url}/test`);
    expect(response.headers['x-test-header']).toBe('test-value');
  });

  test('It should execute route-specific middleware', async () => {
    const { url } = await createTestServer();
    const response = await makeRequest(`${url}/middleware-test`);
    expect(response.data).toEqual({ middlewareRan: true });
  });
});

describe('Security headers', () => {
  test('It should set CORS headers', async () => {
    const { url } = await createTestServer();
    const response = await makeRequest(`${url}/test`);

    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-methods']).toContain('GET');
    expect(response.headers['access-control-allow-headers']).toContain('Content-Type');
  });

  test('It should set security headers', async () => {
    const { url } = await createTestServer();
    const response = await makeRequest(`${url}/test`);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['content-security-policy']).toBeTruthy();
    expect(response.headers['x-xss-protection']).toBe('1; mode=block');
  });

  test('It should set HSTS header for HTTPS', async () => {
    const config = getTestConfig({ useHttps: true });
    const { url } = await createTestServer(config);

    // Need to configure options to accept self-signed certs for this test
    const response = await makeRequest(`${url}/test`, {
      rejectUnauthorized: false
    });

    expect(response.headers['strict-transport-security']).toBeTruthy();
  });
});

describe('Rate limiting', () => {
  test('It should apply rate limiting headers', async () => {
    const { url } = await createTestServer();
    const response = await makeRequest(`${url}/test`);

    expect(response.headers['x-ratelimit-limit']).toBeTruthy();
    expect(response.headers['x-ratelimit-remaining']).toBeTruthy();
    expect(response.headers['x-ratelimit-reset']).toBeTruthy();
  });

  test('It should enforce rate limits', async () => {
    const config = getTestConfig({
      rateLimit: { enabled: true, requestsPerMinute: 1 }
    });

    const { url } = await createTestServer(config);

    await makeRequest(`${url}/test`);

    try {
      await makeRequest(`${url}/test`);
      expect.fail('Should have thrown a 429 error');
    } catch (error: any) {
      expect(error.status).toBe(429);
      expect(error.data).toHaveProperty('error', 'Too Many Requests');
    }
  });

  test('It should not enforce rate limits when disabled', async () => {
    const config = getTestConfig({
      rateLimit: { enabled: false, requestsPerMinute: 1 }
    });

    const { url } = await createTestServer(config);

    await makeRequest(`${url}/test`);
    const response = await makeRequest(`${url}/test`);

    expect(response.status).toBe(200);
  });
});

describe('Helper functions', () => {
  test('It should create a MikroServe app with start()', () => {
    const app = new MikroServe(getTestConfig());
    expect(app).toBeInstanceOf(MikroServe);
  });
});

describe('Body parsing', () => {
  test('It should parse JSON request bodies', async () => {
    const config = getTestConfig();
    const app = new MikroServe(config);

    app.post('/json', (c: any) =>
      c.json({
        received: c.req.body,
        contentType: c.req.headers['content-type']
      })
    );

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);
    const testData = { foo: 'bar', nested: { value: 42 } };

    const response = await makeRequest(
      `${url}/json`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      testData
    );

    expect(response.data.received).toEqual(testData);
    expect(response.data.contentType).toContain('application/json');
  });

  test('It should parse form-urlencoded request bodies', async () => {
    const config = getTestConfig();
    const app = new MikroServe(config);

    app.post('/form', (c: any) =>
      c.form({
        received: c.req.body,
        contentType: c.req.headers['content-type']
      })
    );

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);
    const formData = new URLSearchParams();
    formData.append('name', 'Test User');
    formData.append('email', 'test@example.com');

    const response = await makeRequest(
      `${url}/form`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      },
      formData
    );

    expect(response.data.received).toEqual({
      name: 'Test User',
      email: 'test@example.com'
    });
    expect(response.data.contentType).toContain('application/x-www-form-urlencoded');
  });

  test('It should handle raw text request bodies', async () => {
    const config = getTestConfig();
    const app = new MikroServe(config);

    app.post('/text', (c: any) =>
      c.text({
        received: c.req.body
      })
    );

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) {
        resolve();
      } else {
        server.on('listening', () => resolve());
      }
    });

    const url = getServerUrl(server);
    const textData = 'Hello, world!';

    const response = await makeRequest(
      `${url}/text`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }
      },
      textData
    );

    expect(response.data.received).toBe(textData);
  });

  test('It should reject oversized request bodies', async () => {
    const config = getTestConfig({ debug: true });
    const app = new MikroServe(config);

    app.post('/large', (c: any) => c.json({ success: true }));

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);

    // Create a large payload (slightly over the 1MB limit)
    const largeData = 'X'.repeat(1024 * 1024 + 500);

    try {
      await makeRequest(
        `${url}/large`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            // Explicitly set Content-Length to ensure server sees the full size
            'Content-Length': Buffer.byteLength(largeData).toString()
          },
          rawBody: true
        },
        largeData
      );
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.status).toBe(400);
      expect(error.data.error).toBe('Bad Request');
      expect(error.data.message).toContain('Request body too large');
    }
  });

  test('It should handle invalid JSON gracefully', async () => {
    const config = getTestConfig();
    const app = new MikroServe(config);

    app.post('/invalid-json', (c: any) => c.json({ success: true }));

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) {
        resolve();
      } else {
        server.on('listening', () => resolve());
      }
    });

    const url = getServerUrl(server);
    const invalidJson = '{ "name": "Test", "invalid": ';

    try {
      await makeRequest(
        `${url}/invalid-json`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          rawBody: true // Use the raw body option to prevent JSON.stringify
        },
        invalidJson
      );
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.status).toBe(400);
      expect(error.data.error).toBe('Bad Request');
      expect(error.data.message).toContain(
        'Invalid JSON in request body: Unexpected end of JSON input'
      );
    }
  });

  test('It should handle empty request bodies', async () => {
    const config = getTestConfig();
    const app = new MikroServe(config);

    app.post('/empty', (c: any) =>
      c.json({
        body: c.req.body,
        isEmpty: Object.keys(c.req.body).length === 0
      })
    );

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);

    const response = await makeRequest(`${url}/empty`, {
      method: 'POST'
    });

    expect(response.data.isEmpty).toBe(true);
  });
});

describe('Error handling', () => {
  test('It should catch and handle synchronous errors in routes', async () => {
    const config = getTestConfig();
    const app = new MikroServe(config);

    app.get('/sync-error', () => {
      throw new Error('Synchronous error');
    });

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);

    try {
      await makeRequest(`${url}/sync-error`);
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.status).toBe(500);
      expect(error.data.error).toBe('Internal Server Error');
    }
  });

  test('It should catch and handle asynchronous errors in routes', async () => {
    const config = getTestConfig();
    const app = new MikroServe(config);

    // @ts-ignore
    app.get('/async-error', async () => {
      return new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Asynchronous error')), 10);
      });
    });

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);

    try {
      await makeRequest(`${url}/async-error`);
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.status).toBe(500);
      expect(error.data.error).toBe('Internal Server Error');
    }
  });

  test('It should catch and handle errors in middleware', async () => {
    const config = getTestConfig();
    const app = new MikroServe(config);

    app.use(async () => {
      throw new Error('Middleware error');
    });

    app.get('/middleware-error', (c: any) => c.json({ success: true }));

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);

    try {
      await makeRequest(`${url}/middleware-error`);
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.status).toBe(500);
      expect(error.data.error).toBe('Internal Server Error');
    }
  });
});

describe('CORS support', () => {
  test('It should handle preflight OPTIONS requests', async () => {
    const config = getTestConfig();
    const app = new MikroServe(config);

    app.get('/cors-test', (c: any) => c.json({ success: true }));

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);

    const response = await makeRequest(`${url}/cors-test`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-methods']).toContain('GET');
    expect(response.headers['access-control-allow-headers']).toContain('Content-Type');
    expect(response.headers['access-control-max-age']).toBe('86400');
  });

  test('It should allow all origins when allowedDomains includes wildcard', async () => {
    const config = getTestConfig({
      allowedDomains: ['*']
    });
    const app = new MikroServe(config);

    app.get('/test', (c: any) => c.json({ success: true }));

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);

    const response = await makeRequest(`${url}/test`, {
      headers: {
        Origin: 'https://example.com'
      }
    });

    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers.vary).toBeUndefined();
  });

  test('It should allow specific origins when configured', async () => {
    const config = getTestConfig({
      allowedDomains: ['https://allowed-origin.com', 'https://another-allowed.com']
    });
    const app = new MikroServe(config);

    app.get('/test', (c: any) => c.json({ success: true }));

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);

    const responseAllowed = await makeRequest(`${url}/test`, {
      headers: {
        Origin: 'https://allowed-origin.com'
      }
    });

    expect(responseAllowed.headers['access-control-allow-origin']).toBe(
      'https://allowed-origin.com'
    );
    expect(responseAllowed.headers.vary).toBe('Origin');

    const responseNotAllowed = await makeRequest(`${url}/test`, {
      headers: {
        Origin: 'https://not-allowed.com'
      }
    });

    expect(responseNotAllowed.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('It should handle OPTIONS preflight requests with CORS checking', async () => {
    const config = getTestConfig({
      allowedDomains: ['https://allowed-origin.com']
    });
    const app = new MikroServe(config);

    app.get('/test', (c: any) => c.json({ success: true }));

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);

    const preflightAllowed = await makeRequest(`${url}/test`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://allowed-origin.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });

    expect(preflightAllowed.status).toBe(204);
    expect(preflightAllowed.headers['access-control-allow-origin']).toBe(
      'https://allowed-origin.com'
    );
    expect(preflightAllowed.headers['access-control-allow-methods']).toContain('GET');
    expect(preflightAllowed.headers.vary).toBe('Origin');

    const preflightNotAllowed = await makeRequest(`${url}/test`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://not-allowed.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });

    expect(preflightNotAllowed.status).toBe(204);
    expect(preflightNotAllowed.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('It should fall back to * when allowedDomains is empty', async () => {
    const config = getTestConfig({
      allowedDomains: []
    });
    const app = new MikroServe(config);

    app.get('/test', (c: any) => c.json({ success: true }));

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);

    const response = await makeRequest(`${url}/test`, {
      headers: {
        Origin: 'https://example.com'
      }
    });

    expect(response.headers['access-control-allow-origin']).toBe('*');
  });

  test('It should handle requests without Origin header', async () => {
    const config = getTestConfig({
      allowedDomains: ['https://allowed-origin.com']
    });
    const app = new MikroServe(config);

    app.get('/test', (c: any) => c.json({ success: true }));

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);

    const response = await makeRequest(`${url}/test`);

    expect(response.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('Response handling', () => {
  test('It should handle string responses', async () => {
    const config = getTestConfig();
    const app = new MikroServe(config);

    app.get('/string', (_c: any) => {
      return {
        statusCode: 200,
        body: 'Hello, world!',
        headers: { 'Content-Type': 'text/plain' }
      };
    });

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);

    const response = await makeRequest(`${url}/string`);
    expect(response.status).toBe(200);
    expect(response.data).toBe('Hello, world!');
    expect(response.headers['content-type']).toContain('text/plain');
  });

  test('It should handle custom status codes', async () => {
    const config = getTestConfig();
    const app = new MikroServe(config);

    app.get('/created', (_c: any) => {
      return {
        statusCode: 201,
        body: { id: 123, status: 'created' }
      };
    });

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);

    const response = await makeRequest(`${url}/created`);
    expect(response.status).toBe(201);
    expect(response.data).toEqual({ id: 123, status: 'created' });
  });

  test('It should handle custom headers', async () => {
    const config = getTestConfig();
    const app = new MikroServe(config);

    app.get('/custom-headers', (_c: any) => {
      return {
        statusCode: 200,
        body: { success: true },
        headers: {
          'X-Custom-Header': 'custom-value',
          'Cache-Control': 'max-age=3600'
        }
      };
    });

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);

    const response = await makeRequest(`${url}/custom-headers`);
    expect(response.headers['x-custom-header']).toBe('custom-value');
    expect(response.headers['cache-control']).toBe('max-age=3600');
  });

  test('It should handle null/undefined response bodies', async () => {
    const config = getTestConfig();
    const app = new MikroServe(config);

    app.get('/no-content', (_c: any) => {
      return {
        statusCode: 204,
        body: null
      };
    });

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);

    const response = await makeRequest(`${url}/no-content`);
    expect(response.status).toBe(204);
    expect(response.data).toBe('');
  });
});

describe('HTTP/2 Support', () => {
  test('It should create an HTTP/2 server with valid certificates', async () => {
    const config = getTestConfig({
      useHttp2: true,
      sslCert: path.join(__dirname, '../test-certs/cert.pem'),
      sslKey: path.join(__dirname, '../test-certs/key.pem')
    });

    const app = new MikroServe(config);
    const server = app.createServer();

    expect(server.constructor.name).toBe('Http2SecureServer');

    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('It should throw an error when creating HTTP/2 server without certificates', () => {
    const config = getTestConfig({ useHttp2: true, sslCert: '', sslKey: '' });
    const app = new MikroServe(config);
    expect(() => app.createServer()).toThrow(
      'SSL certificate and key paths are required when useHttp2 is true'
    );
  });

  test('It should start an HTTP/2 server and listen on a port', async () => {
    const config = getTestConfig({
      useHttp2: true,
      sslCert: path.join(__dirname, '../test-certs/cert.pem'),
      sslKey: path.join(__dirname, '../test-certs/key.pem')
    });

    const app = new MikroServe(config);
    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    expect(server.listening).toBe(true);
    expect(server.constructor.name).toBe('Http2SecureServer');

    const address = server.address();
    expect(address).not.toBeNull();
    expect(typeof address).toBe('object');
    expect((address as any).port).toBeGreaterThan(0);

    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('It should handle GET requests over HTTP/2', async () => {
    const config = getTestConfig({
      useHttp2: true,
      sslCert: path.join(__dirname, '../test-certs/cert.pem'),
      sslKey: path.join(__dirname, '../test-certs/key.pem')
    });

    const { url } = await createTestServer(config);

    console.log('url', url);

    const response = await makeHttp2Request(`${url}/test`, {
      method: 'GET',
      rejectUnauthorized: false
    });

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ message: 'GET success' });
  });

  test('It should handle POST requests over HTTP/2', async () => {
    const config = getTestConfig({
      useHttp2: true,
      sslCert: path.join(__dirname, '../test-certs/cert.pem'),
      sslKey: path.join(__dirname, '../test-certs/key.pem')
    });

    const { url } = await createTestServer(config);
    const testData = { foo: 'bar' };

    const response = await makeHttp2Request(`${url}/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rejectUnauthorized: false,
      data: testData
    });

    expect(response.status).toBe(200);
    expect(response.data).toEqual({
      message: 'POST success',
      body: testData
    });
  });

  test('It should set HSTS header for HTTP/2', async () => {
    const config = getTestConfig({
      useHttp2: true,
      sslCert: path.join(__dirname, '../test-certs/cert.pem'),
      sslKey: path.join(__dirname, '../test-certs/key.pem')
    });

    const { url } = await createTestServer(config);
    const httpsUrl = url.replace('http://', 'https://');

    try {
      const response = await makeHttp2Request(httpsUrl, {
        rejectUnauthorized: false
      });

      expect(response.headers['strict-transport-security']).toBeTruthy();
    } catch (error: any) {
      if (error.headers) {
        expect(error.headers['strict-transport-security']).toBeTruthy();
      } else {
        throw error;
      }
    }
  });

  test('It should handle middleware with HTTP/2', async () => {
    const config = getTestConfig({
      useHttp2: true,
      sslCert: path.join(__dirname, '../test-certs/cert.pem'),
      sslKey: path.join(__dirname, '../test-certs/key.pem')
    });

    const app = new MikroServe(config);

    app.use(async (c, next) => {
      c.res.setHeader('X-HTTP2-Test', 'http2-enabled');
      return next();
    });

    app.get('/test', (c: any) => c.json({ success: true }));

    const server = app.start();
    activeServers.push(server);

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.on('listening', () => resolve());
    });

    const url = getServerUrl(server);

    const response = await makeHttp2Request(`${url}/test`, {
      rejectUnauthorized: false
    });

    expect(response.headers['x-http2-test']).toBe('http2-enabled');
    expect(response.data).toEqual({ success: true });
  });
});
