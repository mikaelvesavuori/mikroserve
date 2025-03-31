import type { MikroServeConfiguration } from '../interfaces/index.js';

export const configDefaults = () => {
  return {
    port: Number(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0',
    useHttps: false,
    useHttp2: false,
    sslCert: '',
    sslKey: '',
    sslCa: '',
    debug: getTruthyValue(process.env.DEBUG) || false,
    rateLimit: {
      enabled: true,
      requestsPerMinute: 100
    },
    allowedDomains: ['*']
  } as MikroServeConfiguration;
};

export const getDefaultConfig = () => {
  const defaults = configDefaults();

  return {
    port: defaults.port,
    host: defaults.host,
    useHttps: defaults.useHttps,
    useHttp2: defaults.useHttp2,
    sslCert: defaults.sslCert,
    sslKey: defaults.sslKey,
    sslCa: defaults.sslCa,
    debug: defaults.debug,
    rateLimit: {
      enabled: defaults.rateLimit.enabled,
      requestsPerMinute: defaults.rateLimit.requestsPerMinute
    },
    allowedDomains: defaults.allowedDomains
  };
};

/**
 * @description Check if a value is a boolean or stringly "true".
 */
function getTruthyValue(value: string | boolean | undefined) {
  if (value === 'true' || value === true) return true;
  return false;
}
