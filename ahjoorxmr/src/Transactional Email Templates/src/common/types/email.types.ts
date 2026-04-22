export enum NotificationType {
  ROUND_OPENED = 'ROUND_OPENED',
  PAYOUT_RECEIVED = 'PAYOUT_RECEIVED',
  PAYMENT_REMINDER = 'PAYMENT_REMINDER',
}

export interface EmailMetadata {
  recipientEmail: string;
  recipientName: string;
  [key: string]: any;
}

export interface RoundOpenedMetadata extends EmailMetadata {
  roundName: string;
  roundDescription: string;
  startDate: string;
  endDate: string;
  applicationDeadline: string;
  roundUrl: string;
}

export interface PayoutReceivedMetadata extends EmailMetadata {
  payoutAmount: number;
  currency: string;
  transactionId: string;
  projectName: string;
  projectUrl: string;
  expectedDate: string;
}

export interface PaymentReminderMetadata extends EmailMetadata {
  dueDate: string;
  amount: number;
  currency: string;
  invoiceNumber: string;
  paymentUrl: string;
  overdueDays?: number;
}

export interface EmailJob {
  notificationType: NotificationType;
  metadata: EmailMetadata;
  timestamp: number;
}
