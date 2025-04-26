import axios from 'axios';
import cron from 'node-cron';
import { Notification, NotificationPriority, NotificationType } from '../models/notification';
import { sendEmail } from '../services/emailService';
import { NotificationPayload, User } from '../types/types';
import { DeadLetterQueueHandler } from './DeadLetterQueue';

interface ProductEventContext {
  topic: string;
  partition: number;
  offset: string;
}

interface ProductEvent {
  userId: string;
  email: string;
  eventType: string;
  details?: {
    message?: string;
    name?: string;
  };
  metadata?: {
    batchId?: string;
  };
}

export class ProductEventProcessor {
  private static readonly MAX_RETRIES = 5;
  private static readonly BASE_DELAY = 500;
  private static readonly CRON_SCHEDULE = '*/5 * * * *';
  private static readonly RANDOM_USERS_COUNT = 10;
  private static readonly REQUEST_TIMEOUT = 5000;

  constructor(private readonly deadLetterQueueHandler: DeadLetterQueueHandler) {
    this.initializeCronJob();
  }

  private static isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private initializeCronJob(): void {
    cron.schedule(ProductEventProcessor.CRON_SCHEDULE, async () => {
      try {
        await this.sendRandomUserNotifications();
      } catch (error) {
        console.error('[ProductEventProcessor] Scheduled notification process failed:', error);
      }
    });
  }

  private async getRandomUsers(count: number): Promise<User[]> {
    if (!process.env.USERS_SERVICE_URL) {
      throw new Error('[ProductEventProcessor] Users Service URL is not configured');
    }

    try {
      const response = await axios.get(process.env.USERS_SERVICE_URL, {
        timeout: ProductEventProcessor.REQUEST_TIMEOUT,
      });

      return (response.data?.result || [])
        .filter(
          (user: User) =>
            ProductEventProcessor.isValidEmail(user.email) && user.preferences?.promotions !== false
        )
        .sort(() => 0.5 - Math.random())
        .slice(0, count);
    } catch (error) {
      console.error('[ProductEventProcessor] Failed to fetch users:', error);
      throw new Error(`Failed to retrieve users: ${(error as Error).message}`);
    }
  }

  private async sendPromotionalEmail(
    userId: string,
    content: { name: string; message: string }
  ): Promise<void> {
    await sendEmail(
      userId,
      `🎉 Special Promotion Just for You, ${content.name}!`,
      NotificationType.PROMOTION,
      {
        subject: `🎉 Special Promotion Just for You, ${content.name}!`,
        html: `<html>
            <body>
              <h2>Hey ${content.name}, 🎁</h2>
              <p>${content.message}</p>
              <p>✨ Don't miss out—grab this special offer while it lasts!</p>
              <p>Best Regards, <br><strong>Your Favorite Store</strong></p>
            </body>
          </html>`,
      }
    );
  }

  private async createNotificationForEvent(params: NotificationPayload): Promise<Notification> {
    try {
      const notification = await Notification.create({
        userId: params.userId,
        email: params.email,
        type: params.type,
        content: params.content,
        priority: params.priority,
        metadata: params.metadata || {},
        sentAt: new Date(),
        read: false,
      });

      if (params.type === NotificationType.PROMOTION) {
        try {
          await this.sendPromotionalEmail(params.userId, params.content);
        } catch (emailError) {
          console.error('[ProductEventProcessor] Email Sending Failed:', {
            email: params.email,
            error: (emailError as Error).message,
          });
        }
      }

      return notification as unknown as Notification;
    } catch (error) {
      console.error('[ProductEventProcessor] Notification Processing Error:', {
        message: (error as Error).message,
      });
      throw error;
    }
  }

  private async sendRandomUserNotifications(): Promise<void> {
    try {
      const randomUsers = await this.getRandomUsers(ProductEventProcessor.RANDOM_USERS_COUNT);
      if (!randomUsers.length) return;

      const promotionalContent = {
        message: 'Check out our latest promotions! Limited time offers await you.',
        eventType: 'PROMOTIONAL_CAMPAIGN',
      };

      const notifications = randomUsers.map((user) =>
        this.createNotificationForEvent({
          userId: user._id,
          email: user.email,
          type: NotificationType.PROMOTION,
          content: { ...promotionalContent, name: user.name },
          priority: NotificationPriority.STANDARD,
          metadata: {
            batchId: `PROMO_${Date.now()}`,
            isAutomated: true,
            userPreferences: user.preferences,
          },
        })
      );

      await Promise.all(notifications);
    } catch (error) {
      console.error('[ProductEventProcessor] Failed to process random user notifications:', error);
      throw error;
    }
  }

  async processProductEventWithRetry(
    event: ProductEvent,
    context: ProductEventContext,
    retryCount = 0
  ): Promise<boolean> {
    try {
      await this.createNotificationForEvent({
        userId: event.userId,
        email: event.email,
        type: NotificationType.PROMOTION,
        content: {
          message: event.details?.message || 'Promotional event processed',
          eventType: event.eventType,
          name: event.details?.name || 'Valued Customer',
        },
        priority: NotificationPriority.STANDARD,
        metadata: {
          batchId: event.metadata?.batchId || `RETRY_${Date.now()}`,
          isAutomated: true,
          retryCount,
        },
      });
      return true;
    } catch (error) {
      if (retryCount < ProductEventProcessor.MAX_RETRIES) {
        const delay = Math.pow(2, retryCount) * ProductEventProcessor.BASE_DELAY;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.processProductEventWithRetry(event, context, retryCount + 1);
      }

      // Convert ProductEvent to Record<string, unknown>
      const eventAsRecord: Record<string, unknown> = {
        userId: event.userId,
        email: event.email,
        eventType: event.eventType,
        details: event.details,
        metadata: event.metadata,
      };

      await this.deadLetterQueueHandler.handleFailedMessage(
        context.topic,
        eventAsRecord,
        error as Error,
        {
          partition: context.partition,
          offset: context.offset,
        }
      );
      return false;
    }
  }
}
