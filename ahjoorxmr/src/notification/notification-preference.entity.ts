import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { NotificationType } from './notification-type.enum';

export interface ChannelPreference {
  inApp: boolean;
  email: boolean;
  push: boolean;
}

export type PreferencesMap = Partial<Record<NotificationType, ChannelPreference>>;

export const DEFAULT_CHANNEL: ChannelPreference = { inApp: true, email: true, push: true };

export function buildDefaultPreferences(): PreferencesMap {
  return Object.values(NotificationType).reduce<PreferencesMap>((acc, type) => {
    acc[type] = { ...DEFAULT_CHANNEL };
    return acc;
  }, {});
}

@Entity('notification_preferences')
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index({ unique: true })
  userId: string;

  @Column({ type: 'jsonb' })
  preferences: PreferencesMap;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
