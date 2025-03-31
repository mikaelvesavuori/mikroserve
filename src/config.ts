import { parsers } from 'mikroconf';

import type { MikroServeOptions } from './interfaces/index.js';

import { configDefaults } from './utils/configDefaults.js';

const defaults = configDefaults();

export const baseConfig = (options: MikroServeOptions) => ({
  configFilePath: 'mikroserve.config.json',
  args: process.argv,
  options: [
    { flag: '--port', path: 'port', defaultValue: defaults.port },
    { flag: '--host', path: 'host', defaultValue: defaults.host },
    { flag: '--https', path: 'useHttps', defaultValue: defaults.useHttps, isFlag: true },
    { flag: '--http2', path: 'useHttp2', defaultValue: defaults.useHttp2, isFlag: true },
    { flag: '--cert', path: 'sslCert', defaultValue: defaults.sslCert },
    { flag: '--key', path: 'sslKey', defaultValue: defaults.sslKey },
    { flag: '--ca', path: 'sslCa', defaultValue: defaults.sslCa },
    {
      flag: '--ratelimit',
      path: 'rateLimit.enabled',
      defaultValue: defaults.rateLimit.enabled,
      isFlag: true
    },
    {
      flag: '--rps',
      path: 'rateLimit.requestsPerMinute',
      defaultValue: defaults.rateLimit.requestsPerMinute
    },
    {
      flag: '--allowed',
      path: 'allowedDomains',
      defaultValue: defaults.allowedDomains,
      parser: parsers.array
    },
    { flag: '--debug', path: 'debug', defaultValue: defaults.debug, isFlag: true }
  ],
  config: options
});
