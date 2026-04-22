# RBAC & PII Protection Policy

## Role-Based Access Control

Access to sensitive endpoints is enforced through a layered guard stack:

1. `JwtAuthGuard` — validates the JWT and populates `req.user` (applied globally via `APP_GUARD` in `AuthModule`).
2. `KycGuard` — blocks users whose `kycStatus` is not `APPROVED`. Applied per-controller or per-route with `@UseGuards(KycGuard)`.
3. `RolesGuard` (where present) — restricts admin endpoints to users with the `admin` role via the `@Roles()` decorator.

Routes that must remain public are decorated with `@Public()` to opt out of `JwtAuthGuard`.

---

## PII Protection in Logs and Audit Records (Issue #164 / GDPR Art. 32)

### Problem

KYC verification payloads — including national ID numbers, date of birth, address, and phone — were being logged in plaintext via Winston and stored as raw JSON in audit `requestPayload` columns, violating GDPR Article 32 and the principle of data minimisation.

### Solution

#### `@Sensitive()` Decorator

`src/common/decorators/sensitive.decorator.ts`

A property decorator that marks DTO fields containing PII. Annotated fields are detected at runtime via `reflect-metadata`.

```ts
export class KycSubmissionDto {
  @Sensitive() fullName?: string;
  @Sensitive() nationalId?: string;
  @Sensitive() dob?: string;
  @Sensitive() address?: string;
  @Sensitive() phone?: string;
}
```

#### PII Scrubber Utility

`src/common/pii/pii-scrubber.ts`

Two functions:

- `scrubForLog(payload, DtoClass?)` — replaces sensitive field values with `[REDACTED]`. Used in all `logger.log()` calls that may include user-supplied data.
- `scrubForAudit(payload, secret, DtoClass?)` — replaces sensitive field values with `hmac:<sha256-hex>` keyed by `PII_HMAC_SECRET`. Stored in `audit_logs.requestPayload`. Allows change detection without storing raw PII.

The HMAC secret is read from the `PII_HMAC_SECRET` environment variable. **This must be set to a strong random value in all environments.**

#### `PiiScrubbingInterceptor`

`src/common/interceptors/pii-scrubbing.interceptor.ts`

Registered globally as the first `APP_INTERCEPTOR` in `AppModule`. On every inbound request it:

1. Calls `scrubForLog(request.body)` and attaches the result to `req.__scrubbedBody`.
2. Strips PII from error response bodies before they propagate.

#### Audit Log Interceptor

`src/audit/interceptors/audit-log.interceptor.ts`

Updated to call `scrubForAudit(request.body, PII_HMAC_SECRET)` before persisting `requestPayload` to the database. Raw PII is never written to `audit_logs`.

#### KYC Service

`src/kyc/kyc.service.ts`

All `logger.log()` calls pass the payload through `scrubForLog()` before emission.

### Environment Variables

| Variable | Description |
|---|---|
| `PII_HMAC_SECRET` | HMAC-SHA256 key for audit log PII hashing. Must be a strong random string (≥32 chars). Rotate via key-versioning if compromised. |

### Compliance Test

`src/kyc/__tests__/kyc.pii-compliance.spec.ts`

Jest suite that:
- Verifies `@Sensitive()` annotates the correct fields on `KycSubmissionDto`.
- Asserts `scrubForLog` replaces all PII with `[REDACTED]`.
- Asserts `scrubForAudit` replaces all PII with deterministic HMAC hashes.
- Captures console output during a simulated KYC flow and asserts no raw PII string appears in any log line.

Run with:

```bash
npx jest --testPathPattern=kyc.pii-compliance --runInBand
```

### Always-Sensitive Fields

The following fields are scrubbed regardless of `@Sensitive()` annotation:

`nationalId`, `dob`, `address`, `phone`, `fullName`, `password`, `passwordHash`, `refreshToken`, `refreshTokenHash`, `resetToken`, `secretKey`, `apiKey`, `token`, `secret`
