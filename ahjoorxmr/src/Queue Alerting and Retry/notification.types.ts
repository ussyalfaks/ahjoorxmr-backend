export enum NotificationType {
  SYSTEM_ALERT = 'SYSTEM_ALERT',
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS',
}

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  metadata?: Record<string, any>;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  metadata?: Record<string, any>;
  read: boolean;
  createdAt: Date;
}
