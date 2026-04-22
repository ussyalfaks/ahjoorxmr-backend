import { registerAs } from '@nestjs/config';

export interface ContributionSummaryConfig {
  /**
   * Cron expression that drives the reminder job.
   * Overridable via CONTRIBUTION_REMINDER_SCHEDULE env var.
   * Default: every day at 08:00 local time.
   */
  reminderSchedule: string;
}

export const contributionSummaryConfig = registerAs(
  'contributionSummary',
  (): ContributionSummaryConfig => ({
    reminderSchedule: process.env.CONTRIBUTION_REMINDER_SCHEDULE ?? '0 8 * * *',
  }),
);
