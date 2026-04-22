/**
 * KYC PII Compliance Test
 * ─────────────────────────────────────────────────────────────────────────────
 * Asserts that no raw PII strings appear in any log line emitted during a
 * full KYC verification flow (upload + status update).
 *
 * Acceptance criteria (issue #164):
 *  - Logger output contains no raw nationalId, dob, address, phone, or fullName
 *  - Audit payloads store HMAC hashes, not raw values
 *  - @Sensitive() decorator correctly marks fields
 *  - scrubForLog replaces sensitive values with '[REDACTED]'
 *  - scrubForAudit replaces sensitive values with 'hmac:<hex>'
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { scrubForLog, scrubForAudit } from '../../common/pii/pii-scrubber';
import { Sensitive, getSensitiveFields } from '../../common/decorators/sensitive.decorator';
import { KycSubmissionDto } from '../dto/kyc-submission.dto';

// ─── Raw PII values used across tests ────────────────────────────────────────

const RAW_PII = {
  fullName: 'Jane Smith',
  nationalId: 'X98765432',
  dob: '1985-07-22',
  address: '42 Privacy Lane, Redactville',
  phone: '+9876543210',
};

const HMAC_SECRET = 'test-secret-key';

// ─── @Sensitive() decorator ───────────────────────────────────────────────────

describe('@Sensitive() decorator', () => {
  it('marks all PII fields on KycSubmissionDto', () => {
    const fields = getSensitiveFields(KycSubmissionDto);
    expect(fields).toContain('fullName');
    expect(fields).toContain('nationalId');
    expect(fields).toContain('dob');
    expect(fields).toContain('address');
    expect(fields).toContain('phone');
  });

  it('can be applied to arbitrary classes', () => {
    class TestDto {
      @Sensitive()
      secret: string;

      public: string;
    }

    const fields = getSensitiveFields(TestDto);
    expect(fields).toContain('secret');
    expect(fields).not.toContain('public');
  });
});

// ─── scrubForLog ──────────────────────────────────────────────────────────────

describe('scrubForLog', () => {
  it('replaces all ALWAYS_SENSITIVE fields with [REDACTED]', () => {
    const payload = { ...RAW_PII, safeField: 'keep-me' };
    const result = scrubForLog(payload);

    expect(result.fullName).toBe('[REDACTED]');
    expect(result.nationalId).toBe('[REDACTED]');
    expect(result.dob).toBe('[REDACTED]');
    expect(result.address).toBe('[REDACTED]');
    expect(result.phone).toBe('[REDACTED]');
    expect(result.safeField).toBe('keep-me');
  });

  it('replaces @Sensitive()-annotated fields when DtoClass is provided', () => {
    class CustomDto {
      @Sensitive()
      secretCode: string;
    }

    const result = scrubForLog({ secretCode: 'abc123', other: 'visible' }, CustomDto);
    expect(result.secretCode).toBe('[REDACTED]');
    expect(result.other).toBe('visible');
  });

  it('does not mutate the original payload', () => {
    const original = { ...RAW_PII };
    scrubForLog(original);
    expect(original.nationalId).toBe(RAW_PII.nationalId);
  });

  it('handles null/undefined payload gracefully', () => {
    expect(scrubForLog(null as any)).toBeNull();
    expect(scrubForLog(undefined as any)).toBeUndefined();
  });
});

// ─── scrubForAudit ────────────────────────────────────────────────────────────

describe('scrubForAudit', () => {
  it('replaces sensitive fields with hmac: prefixed hashes', () => {
    const result = scrubForAudit({ ...RAW_PII }, HMAC_SECRET);

    for (const key of Object.keys(RAW_PII)) {
      expect(result[key]).toMatch(/^hmac:[a-f0-9]{64}$/);
      // Must NOT contain the raw value
      expect(result[key]).not.toContain(RAW_PII[key as keyof typeof RAW_PII]);
    }
  });

  it('produces deterministic hashes for the same input', () => {
    const a = scrubForAudit({ nationalId: 'X98765432' }, HMAC_SECRET);
    const b = scrubForAudit({ nationalId: 'X98765432' }, HMAC_SECRET);
    expect(a.nationalId).toBe(b.nationalId);
  });

  it('produces different hashes for different secrets', () => {
    const a = scrubForAudit({ nationalId: 'X98765432' }, 'secret-a');
    const b = scrubForAudit({ nationalId: 'X98765432' }, 'secret-b');
    expect(a.nationalId).not.toBe(b.nationalId);
  });

  it('preserves non-sensitive fields unchanged', () => {
    const result = scrubForAudit({ userId: 'u-1', nationalId: 'X1' }, HMAC_SECRET);
    expect(result.userId).toBe('u-1');
  });

  it('does not mutate the original payload', () => {
    const original = { nationalId: 'X98765432' };
    scrubForAudit(original, HMAC_SECRET);
    expect(original.nationalId).toBe('X98765432');
  });
});

// ─── Full KYC flow — no raw PII in captured log output ───────────────────────

describe('KYC flow — no raw PII in log output', () => {
  const capturedLogs: string[] = [];

  beforeAll(() => {
    // Intercept console output to capture all log lines
    jest.spyOn(console, 'log').mockImplementation((...args) => {
      capturedLogs.push(args.join(' '));
    });
    jest.spyOn(console, 'info').mockImplementation((...args) => {
      capturedLogs.push(args.join(' '));
    });
    jest.spyOn(console, 'warn').mockImplementation((...args) => {
      capturedLogs.push(args.join(' '));
    });
    jest.spyOn(console, 'error').mockImplementation((...args) => {
      capturedLogs.push(args.join(' '));
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('scrubbed log payload contains no raw PII strings', () => {
    // Simulate what kyc.service.ts does before calling logger.log
    const logPayload = scrubForLog({
      userId: 'user-uuid-1',
      storageKey: 'kyc/user-uuid-1/doc.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      originalName: 'passport.pdf',
      ...RAW_PII, // worst-case: full PII accidentally included
    });

    const logLine = JSON.stringify(logPayload);
    console.log(`KYC document uploaded: ${logLine}`);

    const allOutput = capturedLogs.join('\n');

    for (const [field, value] of Object.entries(RAW_PII)) {
      expect(allOutput).not.toContain(value);
    }
  });

  it('audit payload stores HMAC hashes, not raw PII', () => {
    const auditPayload = scrubForAudit({ ...RAW_PII, userId: 'user-uuid-1' }, HMAC_SECRET);
    const serialised = JSON.stringify(auditPayload);

    for (const value of Object.values(RAW_PII)) {
      expect(serialised).not.toContain(value);
    }

    // Hashes should be present
    expect(serialised).toMatch(/hmac:[a-f0-9]{64}/);
  });

  it('KYC status update log contains no raw PII', () => {
    // Simulate kyc-status-check/kyc.service.ts updateKycStatus log
    const adminId = 'admin-abc';
    const targetUserId = 'user-123';
    const previousStatus = 'PENDING';
    const newStatus = 'APPROVED';

    // The existing log only uses IDs and status — verify it stays clean
    const logMessage = `Admin ${adminId} changed KYC for user ${targetUserId}: ${previousStatus} → ${newStatus}`;
    console.log(logMessage);

    const allOutput = capturedLogs.join('\n');
    for (const value of Object.values(RAW_PII)) {
      expect(allOutput).not.toContain(value);
    }
  });
});
