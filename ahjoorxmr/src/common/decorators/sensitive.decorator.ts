import 'reflect-metadata';

export const SENSITIVE_METADATA_KEY = 'pii:sensitive';

/**
 * Marks a DTO property as containing PII.
 * The PiiScrubber will replace its value with [REDACTED] in logs
 * and with an HMAC hash in audit oldValue/newValue columns.
 */
export function Sensitive(): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const existing: string[] =
      Reflect.getMetadata(SENSITIVE_METADATA_KEY, target.constructor) ?? [];
    Reflect.defineMetadata(
      SENSITIVE_METADATA_KEY,
      [...existing, propertyKey as string],
      target.constructor,
    );
  };
}

/**
 * Returns the list of @Sensitive()-annotated field names for a given class.
 */
export function getSensitiveFields(target: Function): string[] {
  return Reflect.getMetadata(SENSITIVE_METADATA_KEY, target) ?? [];
}
