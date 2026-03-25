import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationPayload, NotificationType } from './notification.types';
import { Notification } from './notification.entity';
import { User } from '../users/user.entity';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Send a notification to all admin users
   */
  async notifyAdmins(payload: NotificationPayload): Promise<void> {
    try {
      // Get all users with admin role
      const admins = await this.userRepository.find({
        where: { role: 'admin' },
      });

      if (admins.length === 0) {
        this.logger.warn('No admin users found for notification');
        return;
      }

      // Create a notification for each admin
      const notifications = admins.map((admin) =>
        this.notificationRepository.create({
          userId: admin.id,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          severity: payload.severity,
          metadata: payload.metadata,
          read: false,
          createdAt: new Date(),
        }),
      );

      await this.notificationRepository.save(notifications);

      this.logger.debug(
        `Notification sent to ${admins.length} admin(s): ${payload.title}`,
      );
    } catch (error) {
      this.logger.error(
        `Error sending admin notifications: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Send a notification to a specific user
   */
  async notifyUser(
    userId: string,
    payload: NotificationPayload,
  ): Promise<Notification> {
    try {
      const notification = this.notificationRepository.create({
        userId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        severity: payload.severity,
        metadata: payload.metadata,
        read: false,
        createdAt: new Date(),
      });

      const saved = await this.notificationRepository.save(notification);
      this.logger.debug(`Notification sent to user ${userId}`);

      return saved;
    } catch (error) {
      this.logger.error(
        `Error sending user notification: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(
    userId: string,
    unreadOnly: boolean = false,
  ): Promise<Notification[]> {
    const query = this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId })
      .orderBy('notification.createdAt', 'DESC')
      .limit(50);

    if (unreadOnly) {
      query.andWhere('notification.read = :read', { read: false });
    }

    return query.getMany();
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new Error(`Notification not found: ${notificationId}`);
    }

    notification.read = true;
    return this.notificationRepository.save(notification);
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepository.update(
      { userId, read: false },
      { read: true },
    );
  }
}
