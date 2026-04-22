# Email Template System

A comprehensive NestJS-based email templating system with BullMQ job queue integration, Handlebars templating, and development-only preview endpoints.

## Features

✅ **Handlebars Email Templates** - Three professional HTML email templates for different notification types
✅ **BullMQ Integration** - Asynchronous email processing with job queue management
✅ **Template Rendering** - Safe template compilation with metadata validation
✅ **Development Preview** - Dev-only endpoint for previewing emails (production-safe)
✅ **Graceful Error Handling** - Malformed metadata handled gracefully without crashes
✅ **Bulk Email Support** - Send emails to multiple recipients with success/failure tracking
✅ **Comprehensive Tests** - Unit tests for services, controllers, and error scenarios

## Project Structure

```
src/
├── common/
│   └── types/
│       └── email.types.ts           # Type definitions and enums
├── mail/
│   ├── controllers/
│   │   ├── mail.controller.ts       # Preview and template listing endpoints
│   │   └── mail.controller.spec.ts  # Controller tests
│   ├── services/
│   │   ├── template.service.ts      # Template loading and rendering
│   │   ├── template.service.spec.ts # Template service tests
│   │   ├── mail.service.ts          # Email sending service
│   │   ├── mail.service.spec.ts     # Mail service tests
│   │   └── email-queue.service.ts   # Email queue management
│   └── mail.module.ts               # Mail module definition
├── bullmq/
│   └── email.processor.ts           # BullMQ job processor
├── app.module.ts                    # Application module
└── main.ts                          # Application bootstrap
templates/
├── round-opened.hbs                 # ROUND_OPENED notification template
├── payout-received.hbs              # PAYOUT_RECEIVED notification template
└── payment-reminder.hbs             # PAYMENT_REMINDER notification template
```

## Notification Types

### 1. ROUND_OPENED

New funding round announcement

- **Template**: `templates/round-opened.hbs`
- **Required Fields**:
  - `recipientEmail`: Email address
  - `recipientName`: Display name
  - `roundName`: Name of the funding round
  - `roundDescription`: Description of the opportunity
  - `startDate`: Round start date
  - `endDate`: Round end date
  - `applicationDeadline`: Application deadline
  - `roundUrl`: Link to the round

### 2. PAYOUT_RECEIVED

Payout notification for successful fund transfer

- **Template**: `templates/payout-received.hbs`
- **Required Fields**:
  - `recipientEmail`: Email address
  - `recipientName`: Display name
  - `payoutAmount`: Amount of payout (number)
  - `currency`: Currency code (e.g., USD, EUR)
  - `transactionId`: Unique transaction identifier
  - `projectName`: Name of the project
  - `projectUrl`: Link to project details
  - `expectedDate`: Expected arrival date

### 3. PAYMENT_REMINDER

Payment due reminder with optional overdue alert

- **Template**: `templates/payment-reminder.hbs`
- **Required Fields**:
  - `recipientEmail`: Email address
  - `recipientName`: Display name
  - `dueDate`: Payment due date
  - `amount`: Amount due (number)
  - `currency`: Currency code
  - `invoiceNumber`: Invoice identifier
  - `paymentUrl`: Link to payment portal
- **Optional Fields**:
  - `overdueDays`: Number of days overdue (displays special warning if set)

## Setup & Installation

### Prerequisites

- Node.js 18+
- Redis (for BullMQ queue)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Update .env with your configuration
# (SMTP credentials, Redis connection, etc.)
```

### Environment Variables

See `.env.example` for all available options:

- `NODE_ENV`: Set to 'development' or 'production'
- `PORT`: API server port (default: 3000)
- `REDIS_HOST` & `REDIS_PORT`: Redis connection details
- `SMTP_*`: Email service configuration
- `MAILTRAP_*`: Development email service (Mailtrap)
- `ENABLE_EMAIL_PROCESSOR`: Enable/disable email job processor

## Running the Application

### Development

```bash
# Start in watch mode with hot reload
npm run dev
```

The server will start on `http://localhost:3000`

### Production

```bash
# Build
npm run build

# Start
npm start
```

## API Endpoints

### Preview Email Template (Development Only)

```
GET /api/v1/mail/preview/:type
```

**Parameters:**

- `type`: Notification type (ROUND_OPENED, PAYOUT_RECEIVED, or PAYMENT_REMINDER)

**Response:**

```json
{
  "html": "<html>...</html>",
  "type": "ROUND_OPENED"
}
```

**Examples:**

```
GET /api/v1/mail/preview/ROUND_OPENED
GET /api/v1/mail/preview/PAYOUT_RECEIVED
GET /api/v1/mail/preview/PAYMENT_REMINDER
```

### List Available Templates

```
GET /api/v1/mail/templates
```

**Response:**

```json
{
  "types": ["ROUND_OPENED", "PAYOUT_RECEIVED", "PAYMENT_REMINDER"]
}
```

## Usage Examples

### Send Email Directly

```typescript
import { MailService } from "@/mail/services/mail.service";
import { NotificationType } from "@/common/types/email.types";

export class MyService {
  constructor(private readonly mailService: MailService) {}

  async notifyFunding() {
    const metadata = {
      recipientEmail: "founder@example.com",
      recipientName: "Jane Founder",
      roundName: "Series A Funding",
      roundDescription: "Funding for startups",
      startDate: "2026-04-01",
      endDate: "2026-06-30",
      applicationDeadline: "2026-06-15",
      roundUrl: "https://platform.com/rounds/series-a",
    };

    try {
      const messageId = await this.mailService.sendEmail(
        NotificationType.ROUND_OPENED,
        metadata,
      );
      console.log("Email sent:", messageId);
    } catch (error) {
      console.error("Email failed:", error.message);
    }
  }
}
```

### Queue Email Job (Async)

```typescript
import { EmailQueueService } from "@/mail/services/email-queue.service";
import { NotificationType } from "@/common/types/email.types";

export class MyService {
  constructor(private readonly emailQueue: EmailQueueService) {}

  async queuePayoutNotification() {
    const metadata = {
      recipientEmail: "founder@example.com",
      recipientName: "Jane Founder",
      payoutAmount: 50000,
      currency: "USD",
      transactionId: "TXN-2026-12345",
      projectName: "My Project",
      projectUrl: "https://platform.com/projects/my-project",
      expectedDate: "2026-03-28",
    };

    try {
      const jobId = await this.emailQueue.addEmailJob(
        NotificationType.PAYOUT_RECEIVED,
        metadata,
        { delay: 5000 }, // Delay 5 seconds before sending
      );
      console.log("Job queued:", jobId);
    } catch (error) {
      console.error("Queue failed:", error.message);
    }
  }
}
```

### Send Bulk Emails

```typescript
import { MailService } from '@/mail/services/mail.service';
import { NotificationType } from '@/common/types/email.types';

async sendBulkReminders(recipients) {
  const metadata = recipients.map(r => ({
    recipientEmail: r.email,
    recipientName: r.name,
    dueDate: '2026-04-15',
    amount: 5000,
    currency: 'USD',
    invoiceNumber: `INV-${r.id}`,
    paymentUrl: `https://platform.com/pay/${r.id}`,
  }));

  const result = await this.mailService.sendBulkEmails(
    NotificationType.PAYMENT_REMINDER,
    metadata,
  );

  console.log('Sent to:', result.successful);
  console.log('Failed:', result.failed);
}
```

## Error Handling

### Graceful Fallback

The system handles errors gracefully:

1. **Missing Fields**: Returns helpful error message listing missing required fields
2. **Template Not Found**: Returns appropriate error with available types
3. **Rendering Errors**: Logs error and throws with description
4. **Email Send Failures**: Retries configurable attempts with exponential backoff
5. **Invalid Metadata**: Caught before sending, prevents malformed emails

### Example Error Responses

```typescript
// Missing required fields
throw new BadRequestException("Missing required fields: roundName, roundUrl");

// Invalid notification type
throw new BadRequestException(
  "Invalid notification type. Allowed values: ROUND_OPENED, PAYOUT_RECEIVED, PAYMENT_REMINDER",
);

// Template rendering error
throw new BadRequestException(
  "Failed to render template: Error rendering template",
);
```

## Testing

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Generate Coverage Report

```bash
npm run test:cov
```

### Test Coverage

The project includes comprehensive tests for:

- ✅ Template rendering with various metadata
- ✅ Email sending and subject selection
- ✅ Bulk email operations
- ✅ Preview endpoint access control (dev-only)
- ✅ Error scenarios and graceful fallback
- ✅ Type validation and conditional field handling

## Database & Queue

### Redis Configuration

The system uses Redis for BullMQ job queue persistence:

```bash
# Start Redis locally
redis-server

# Or use Docker
docker run -d -p 6379:6379 redis:latest
```

### Queue Management

Monitor queue status:

```typescript
const stats = await emailQueueService.getQueueStats();
console.log(stats);
// Output: { active: 2, waiting: 15, completed: 342, failed: 3 }
```

## Production Deployment

### Security Checklist

- ✅ Preview endpoints disabled (NODE_ENV=production)
- ✅ Proper SMTP credentials configured
- ✅ Redis secured with authentication
- ✅ Email templates validated before deployment
- ✅ Error logging configured
- ✅ Rate limiting implemented

### Recommended Settings

```env
NODE_ENV=production
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASSWORD=<your_sendgrid_key>
MAIL_FROM=noreply@yourdomain.com
ENABLE_EMAIL_PROCESSOR=true
```

## Development Notes

### Adding New Email Templates

1. Create new template file in `templates/` directory:

   ```
   templates/new-notification.hbs
   ```

2. Add notification type to `NotificationType` enum:

   ```typescript
   export enum NotificationType {
     // ... existing types
     NEW_NOTIFICATION = "NEW_NOTIFICATION",
   }
   ```

3. Define metadata interface in `email.types.ts`

4. Add to `TemplateService.loadTemplates()` mapping

5. Update sample metadata in `mail.controller.ts`

6. Create tests in `mail.controller.spec.ts`

### Template Syntax

Templates use Handlebars syntax:

```handlebars
<p>Hello {{recipientName}},</p>

{{#if overdueDays}}
  <p>This payment is {{overdueDays}} days overdue!</p>
{{/if}}

<p>Amount: {{amount}} {{currency}}</p>
```

## Troubleshooting

### Templates Not Loading

Check that:

- Template files exist in `templates/` directory
- File names match the mapping in `TemplateService`
- File permissions allow reading

```bash
ls -la templates/
```

### Redis Connection Failed

Ensure Redis is running:

```bash
redis-cli ping
# Should return: PONG
```

### Email Not Sending

Check:

- SMTP credentials in `.env`
- Email service credentials are valid
- Network connectivity to SMTP server
- Check logs for detailed error messages

## License

MIT

## Support

For issues, questions, or contributions, please refer to project documentation or contact the development team.
