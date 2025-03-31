# MikroServe

**Minimalistic, ready-to-use API, built on Node.js primitives**.

[![npm version](https://img.shields.io/npm/v/mikroserve.svg)](https://www.npmjs.com/package/mikroserve)

[![bundle size](https://img.shields.io/bundlephobia/minzip/mikroserve)](https://bundlephobia.com/package/mikroserve)

![Build Status](https://github.com/mikaelvesavuori/mikroserve/workflows/main/badge.svg)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

- Native Node.js [http](https://nodejs.org/api/http.html)/[https](https://nodejs.org/api/https.html)/[http2](https://nodejs.org/api/http2.html) implementation, meaning maximum performance
- [Hono](https://hono.dev)-style API semantics for GET, POST, PATCH, PUT, DELETE operations
- Supports being exposed over HTTP, HTTPS, and HTTP2
- Supports custom middlewares
- Out-of-the-box CORS support
- Built-in customizable rate limiter
- Tiny (~5kb gzipped)
- Only a single dependency: [MikroConf](https://github.com/mikaelvesavuori/mikroconf)

## Installation

```bash
npm install mikroserve -S
```

## Usage

### Quick Start

A minimum example of a tiny MikroServe API could look like the below.

```typescript
import { MikroServe, type Context } from 'mikroserve';

// Create an instance of MikroServe using only default values
const api = new MikroServe();

// Add any routes that should be exposed

// This will expose a GET route on the root of the API, responding with plain text
api.get('/', async (c: Context) => c.text('Hello world!'));

// JSON responses are as easy as...
api.get('/users/:userId', async (c: Context) => c.json({ name: 'Sam Person', id: 'abc123', createdAt: 1743323168 }));

// Example POST request with JSON response and custom status code
api.post('/users/:userId', async (c: Context) => {
  const { name } = c.body; // Body is ready to use, no need for parsing
  const userId = c.params.userId;

  // Do your things...

  return c.json({ success: true }, 201);
});

// MikroServe supports raw, binary, text, form, json, html, redirect response types

// Start the server
api.start();

// The API is ready – go ahead and curl it in your command line of choice
// HTTP: curl 0.0.0.0:3000
// HTTPS or HTTP2: curl -k 0.0.0.0:3000
// The response should be "Hello world!"
```

### Bigger example

```typescript
import { MikroServe } from 'mikroserve';

// Create a new API instance
const api = new MikroServe({
  // These are the default values
  port: 3000,
  host: '0.0.0.0',
  useHttps: false,
  useHttp2: false,
  sslCert: '',
  sslKey: '',
  sslCa: '',
  debug: false,
  rateLimit: {
    requestsPerMinute: 100,
    enabled: true
  },
  allowedDomains: ['*']
});

// Define a global middleware for logging
api.use(async (c, next) => {
  console.log(`Request received: ${c.req.method} ${c.path}`);
  const start = Date.now();
  const response = await next();
  const duration = Date.now() - start;
  console.log(`Request completed in ${duration}ms with status ${response.statusCode}`);
  return response;
});

// Define a auth middleware
const requireAuth = async (c, next) => {
  const token = c.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return c.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  // Validate token logic would go here
  // For this example, we'll just check if it's "valid-token"
  if (token !== 'valid-token') {
    return c.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid authentication token'
    });
  }

  // Set user on context for downstream handlers
  c.user = { id: '123', name: 'Example User' };

  return next();
};

// Basic routes
api.get('/', (c) => c.text('Hello, World!'));

api.get('/json', (c) => c.json({ message: 'This is JSON' }));

// Route with URL parameters
api.get('/users/:id', (c) => {
  return c.json({
    userId: c.params.id,
    message: `User details for ${c.params.id}`
  });
});

// Route with query parameters
api.get('/search', (c) => {
  const query = c.query.q || '';
  const page = Number.parseInt(c.query.page || '1');

  return c.json({
    query,
    page,
    results: [`Result 1 for "${query}"`, `Result 2 for "${query}"`]
  });
});

// POST route with body parsing
api.post('/echo', (c) =>
  c.json({
    message: 'Echo response',
    body: c.body,
    contentType: c.req.headers['content-type']
  })
);

// Route with middleware
api.get('/protected', requireAuth, (c) => {
  return c.json({
    message: 'This is protected content',
    user: c.user
  });
});

// Route with custom status code
api.get('/not-found', (c) =>
  c.status(404).json({
    error: 'Not Found',
    message: 'This resource was not found'
  })
);

// Route with redirection
api.get('/redirect', (c) => c.redirect('/redirected-to'));
api.get('/redirected-to', (c) => c.text('You have been redirected'));

// Error handling example
api.get('/error', () => {
  throw new Error('This is a test error');
});

api.start();
```

## Configuration

All of the settings already presented in the above examples can be provided in multiple ways.

- They can be provided via the CLI, e.g. `node app.js --port 1234`.
- Certain values can be provided via environment variables.
  - Port: `process.env.PORT` - number
  - Host: `process.env.HOST` - string
  - Debug: `process.env.DEBUG` - boolean
- Programmatically/directly via scripting, e.g. `new MikroServe({ port: 1234 })`.
- They can be placed in a configuration file named `mikroserve.config.json` (plain JSON), which will be automatically applied on load.

### Options

| CLI argument | CLI value                   | JSON (config file) value    | Environment variable |
|--------------|-----------------------------|-----------------------------|----------------------|
| --port       | `<number>`                  | port                        | PORT                 |
| --host       | `<string>`                  | host                        | HOST                 |
| --https      | none (is flag)              | useHttps                    |                      |
| --http2      | none (is flag)              | useHttp2                    |                      |
| --cert       | `<string>`                  | sslCert                     |                      |
| --key        | `<string>`                  | sslKey                      |                      |
| --ca         | `<string>`                  | sslCa                       |                      |
| --ratelimit  | none (is flag)              | rateLimit.enabled           |                      |
| --rps        | `<number>`                  | rateLimit.requestsPerMinute |                      |
| --allowed    | `<comma-separated strings>` | allowedDomains              |                      |
| --debug      | none (is flag)              | debug                       | DEBUG                |

### Order of application

As per [MikroConf](https://github.com/mikaelvesavuori/mikroconf) behavior, the configuration sources are applied in this order:

1. Command line arguments (highest priority)
2. Programmatically provided config
3. Config file (JSON)
4. Default values (lowest priority)

## Create self-signed HTTPS certificates

On Mac and Linux, run:

```sh
openssl req -x509 -newkey rsa:2048 -keyout local-key.pem -out local-cert.pem -days 365 -nodes -subj "/CN=localhost"
```

Feel free to change the key and cert names as you wish.

## License

MIT. See the `LICENSE` file.
