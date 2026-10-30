/**
 * Integration Security & Encryption — InfraPulse Phase 19
 *
 * Implements authenticated encryption (AES-256-GCM) for integration credentials,
 * constant-time HMAC validation, and deep secret redaction.
 */

import crypto from 'node:crypto';
import { config } from '../../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM

/**
 * Derives a consistent 32-byte (256-bit) buffer key from the configured key string.
 */
function getDerivedKey(keyOverride = null) {
  const secret = keyOverride || config.integrationEncryptionKey || 'infrapulse-aes256-default-key-32b!';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Encrypts integration credentials using AES-256-GCM.
 *
 * @param {Object} credentials - Plain credentials object
 * @param {Object} [options]
 * @param {number} [options.keyVersion=1]
 * @param {string} [options.keyOverride]
 * @returns {{ encryptedData: string, iv: string, authTag: string, keyVersion: number, redactedPreview: Object }}
 */
export function encryptCredentials(credentials, { keyVersion = 1, keyOverride = null } = {}) {
  if (!credentials || typeof credentials !== 'object') {
    throw new Error('Credentials must be a valid object.');
  }

  const key = getDerivedKey(keyOverride);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const jsonString = JSON.stringify(credentials);
  let encrypted = cipher.update(jsonString, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  const redactedPreview = redactSecrets(credentials);

  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag,
    keyVersion,
    redactedPreview
  };
}

/**
 * Decrypts integration credentials using AES-256-GCM and verifies authenticity tag.
 *
 * @param {Object} record
 * @param {string} record.encryptedData - Hex ciphertext
 * @param {string} record.iv - Hex IV
 * @param {string} record.authTag - Hex Auth Tag
 * @param {string} [keyOverride]
 * @returns {Object} Plain credentials object
 */
export function decryptCredentials({ encryptedData, iv, authTag }, keyOverride = null) {
  if (!encryptedData || !iv || !authTag) {
    throw new Error('Invalid encrypted payload: encryptedData, iv, and authTag are required.');
  }

  const key = getDerivedKey(keyOverride);
  const ivBuffer = Buffer.from(iv, 'hex');
  const authTagBuffer = Buffer.from(authTag, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(authTagBuffer);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}

/**
 * Deeply redacts secret fields from an object, leaving only safe prefixes/suffixes or mask indicators.
 *
 * @param {*} data
 * @returns {*} Sanitized data with secrets masked
 */
export function redactSecrets(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => redactSecrets(item));
  }

  const sensitiveKeys = ['secret', 'token', 'key', 'password', 'pass', 'webhook', 'auth', 'bearer', 'private'];
  const sanitized = {};

  for (const [k, v] of Object.entries(data)) {
    const isSensitive = sensitiveKeys.some(sk => k.toLowerCase().includes(sk));
    if (isSensitive && typeof v === 'string') {
      if (v.length > 8) {
        sanitized[k] = `${v.substring(0, 4)}****${v.substring(v.length - 4)}`;
      } else {
        sanitized[k] = '***REDACTED***';
      }
    } else if (v && typeof v === 'object') {
      sanitized[k] = redactSecrets(v);
    } else {
      sanitized[k] = v;
    }
  }

  return sanitized;
}

/**
 * Constant-time comparison for HMAC signatures to prevent timing attacks.
 *
 * @param {string} signature - Received signature
 * @param {string} expected - Calculated signature
 * @returns {boolean} True if signatures match identically
 */
export function constantTimeCompare(signature, expected) {
  if (!signature || !expected) return false;
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

