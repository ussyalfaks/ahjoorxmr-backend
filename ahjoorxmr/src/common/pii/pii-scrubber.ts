import * as crypto from 'crypto';
import { getSensitiveFields } from '../decorators/sensitive.decorator';

// Fallback field names that are always treated as sensitive regardless of decorator
const ALWAYS_SENSITIVE = [
  'nationalId',
  'dob',
  'address',
  'phone',
  'fullName',
  'password',
  'passwordHash',
  'refreshToken',
  'refreshTokenHash',
  'resetToken',
  'secretKey',
  'apiKey',
  'token',
  'secret',
];

/**
 * Scrubs PII from a plain object for use in logs.
 * Fields annotated with @Sensitive() or in the ALWAYS_SENSITIVE list
 * are replaced with '[REDACTED]'.
 *
 * @param payload  - The object to scrub (not mutated).
 * @param DtoClass - Optional DTO class to read @Sensitive() metadata from.
 */
export function scrubForLog(
  payload: Record<string, any>,
  DtoClass?: Function,
): Record<string, any> {
  if (!payload || typeof payload !== 'object') return payload;

  const decoratedFields = DtoClass ? getSensitiveFields(DtoClass) : [];
  const sensitiveFields = new Set([...ALWAYS_SENSITIVE, ...decoratedFields]);

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    result[key] = sensitiveFields.has(key) ? '[REDACTED]' : value;
  }
  return result;
}

/**
 * Scrubs PII from a plain object for audit storage.
 * Sensitive field values are replaced with their HMAC-SHA256 digest
 * (keyed by PII_HMAC_SECRET) so changes can still be detected without
 * storing raw PII.
 *
 * @param payload  - The object to scrub (not mutated).
 * @param secret   - HMAC secret from environment config.
 * @param DtoClass - Optional DTO class to read @Sensitive() metadata from.
 */
export function scrubForAudit(
  payload: Record<string, any>,
  secret: string,
  DtoClass?: Function,
): Record<string, any> {
  if (!payload || typeof payload !== 'object') return payload;

  const decoratedFields = DtoClass ? getSensitiveFields(DtoClass) : [];
  const sensitiveFields = new Set([...ALWAYS_SENSITIVE, ...decoratedFields]);

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (sensitiveFields.has(key) && value != null) {
      result[key] = hmac(String(value), secret);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function hmac(value: string, secret: string): string {
  return `hmac:${crypto.createHmac('sha256', secret).update(value).digest('hex')}`;
}

const SENSITIVE_KEY_SET = new Set(
  ALWAYS_SENSITIVE.map((k) => k.toLowerCase()),
);

/**
 * Recursively redacts sensitive keys in arbitrary objects (arrays, nested plain objects).
 * Used by Winston so string-assembled log metadata cannot leak PII.
 */
export function deepScrubForLog(value: unknown, depth = 0): unknown {
  if (depth > 20) {
    return '[REDACTED_DEPTH]';
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => deepScrubForLog(v, depth + 1));
  }
  if (typeof value === 'object' && value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_SET.has(k.toLowerCase())) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = deepScrubForLog(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}
