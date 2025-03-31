#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function generateTestCertificates() {
  const certDir = path.join(__dirname, '../test-certs');
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');

  if (!fs.existsSync(certDir)) {
    console.log(`Creating directory: ${certDir}`);
    fs.mkdirSync(certDir, { recursive: true });
  }

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.log('Generating self-signed certificates for HTTPS tests...');

    try {
      execSync(
        `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost"`,
        { stdio: 'inherit' }
      );

      console.log('Self-signed certificates generated successfully at:');
      console.log(`Key: ${keyPath}`);
      console.log(`Certificate: ${certPath}`);
    } catch (error: any) {
      console.error('Failed to generate certificates:', error.message);
      console.error('Make sure OpenSSL is installed on your system.');
      process.exit(1);
    }
  } else {
    console.log('Certificates already exist:');
    console.log(`Key: ${keyPath}`);
    console.log(`Certificate: ${certPath}`);
  }

  return {
    certDir,
    keyPath,
    certPath
  };
}
