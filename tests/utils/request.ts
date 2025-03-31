import http from 'node:http';
import http2, { type IncomingHttpHeaders, type IncomingHttpStatusHeader } from 'node:http2';
import https from 'node:https';
import { URLSearchParams } from 'node:url';

export const makeRequest = (
  url: string,
  options: http.RequestOptions & {
    rejectUnauthorized?: boolean;
    rawBody?: boolean;
  } = {},
  data?: any
): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  data: any;
}> => {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const lib = isHttps ? https : http;

    const urlObj = new URL(url);
    const reqOptions: http.RequestOptions & { rejectUnauthorized?: boolean } = {
      method: 'GET',
      headers: {},
      ...options,
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: `${urlObj.pathname}${urlObj.search}`
    };

    // @ts-ignore
    if (data && !reqOptions.headers['Content-Type'])
      // @ts-ignore
      reqOptions.headers['Content-Type'] = 'application/json';

    let requestBody: string | Buffer = '';
    if (data) {
      // @ts-ignore
      const contentType: string = (reqOptions.headers['Content-Type'] || '') as string;

      if (options.rawBody) requestBody = data.toString();
      else if (contentType.includes('application/json')) requestBody = JSON.stringify(data);
      else if (
        contentType.includes('application/x-www-form-urlencoded') &&
        data instanceof URLSearchParams
      )
        requestBody = data.toString();
      else requestBody = data.toString();

      // @ts-ignore
      reqOptions.headers['Content-Length'] = Buffer.byteLength(requestBody).toString();
    }

    const req = lib.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk) => chunks.push(chunk));

      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        let parsedBody: any;

        try {
          parsedBody = body ? JSON.parse(body) : '';
        } catch (_error: any) {
          parsedBody = body;
        }

        const response = {
          status: res.statusCode || 0,
          headers: res.headers,
          data: parsedBody
        };

        if (res.statusCode && res.statusCode >= 400) reject(response);
        else resolve(response);
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (requestBody) req.write(requestBody);

    req.end();
  });
};

export function makeHttp2Request(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    rejectUnauthorized?: boolean;
    data?: any;
    timeout?: number;
  } = {}
): Promise<{
  status: number;
  headers: Record<string, string>;
  data: any;
}> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const method = options.method || 'GET';
    const timeout = options.timeout || 5000;

    const timeoutId = setTimeout(() => {
      client.close();
      reject(new Error(`Request timed out after ${timeout}ms`));
    }, timeout);

    const client = http2.connect(`https://${urlObj.host}`, {
      rejectUnauthorized: options.rejectUnauthorized !== false
    });

    client.on('error', (err) => {
      clearTimeout(timeoutId);
      client.close();
      reject(err);
    });

    const headers: Record<string, any> = {
      ':method': method,
      ':path': urlObj.pathname + urlObj.search
    };

    // Add any custom headers
    if (options.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        if (key && value !== undefined) {
          headers[key] = value;
        }
      });
    }

    let requestBody: string | undefined;
    if (options.data) {
      if (
        options.headers?.['Content-Type']?.includes('application/json') ||
        !options.headers?.['Content-Type']
      ) {
        requestBody = JSON.stringify(options.data);
        headers['content-type'] = 'application/json';
      } else {
        requestBody = String(options.data);
      }
    }

    const req = client.request(headers);

    const chunks: Buffer[] = [];
    let responseHeaders: IncomingHttpHeaders & IncomingHttpStatusHeader = {};

    req.on('response', (headers) => {
      responseHeaders = headers;
    });

    req.on('data', (chunk) => {
      chunks.push(Buffer.from(chunk));
    });

    req.on('end', () => {
      clearTimeout(timeoutId);

      // Convert HTTP/2 headers to regular headers format
      const normalizedHeaders: Record<string, string> = {};

      for (const [key, value] of Object.entries(responseHeaders)) {
        if (key && key !== ':status' && value !== undefined) {
          normalizedHeaders[key.toLowerCase()] = value.toString();
        }
      }

      const body = Buffer.concat(chunks).toString();
      let parsedBody: any;

      try {
        parsedBody = body ? JSON.parse(body) : '';
      } catch (_error) {
        parsedBody = body;
      }

      const response = {
        status: Number.parseInt(responseHeaders[':status']?.toString() || '200', 10),
        headers: normalizedHeaders,
        data: parsedBody
      };

      client.close();

      if (response.status >= 400) {
        reject(response);
      } else {
        resolve(response);
      }
    });

    req.on('error', (err) => {
      clearTimeout(timeoutId);
      client.close();
      reject(err);
    });

    if (requestBody) {
      req.write(requestBody);
    }

    req.end();
  });
}
