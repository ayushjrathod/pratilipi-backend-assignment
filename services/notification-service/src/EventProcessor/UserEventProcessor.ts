import axios from 'axios';
import { Notification, NotificationPriority, NotificationType } from '../models/notification';
import { sendEmail } from '../services/emailService';
import { NotificationDoc, NotificationPayload } from '../types/types';
import { DeadLetterQueueHandler } from './DeadLetterQueue';

interface UserEventContext {
  topic: string;
  partition: number;
  offset: string;
}

interface NotificationParams {
  userId: string;
  type: NotificationType;
  content: {
    message: string;
    eventType: string;
    name?: string;
  };
  priority: NotificationPriority;
  metadata?: {
    batchId?: string;
    isAutomated?: boolean;
    userPreferences?: Record<string, boolean>;
    retryCount?: number;
    [key: string]: unknown;
  };
}

export class UserUpdateEventProcessor {
  private readonly MAX_RETRIES = 5;
  private readonly BASE_DELAY = 500;
  private deadLetterQueueHandler: DeadLetterQueueHandler;

  constructor(deadLetterQueueHandler: DeadLetterQueueHandler) {
    this.deadLetterQueueHandler = deadLetterQueueHandler;
  }

  async processUserUpdateEventWithRetry(
    event: NotificationPayload,
    context: UserEventContext,
    retryCount: number = 0
  ): Promise<boolean> {
    try {
      await this.createNotificationForEvent({
        userId: event.userId,
        type: NotificationType.USER_UPDATE,
        content: event.details || {
          message: 'User event processed',
          eventType: event.eventType || 'user_update',
        },
        priority: NotificationPriority.CRITICAL,
        metadata: {
          updateType: event.updateType,
          retryCount,
        },
      });
      return true;
    } catch (error) {
      return this.handleProcessingError(error as Error, event, context, retryCount);
    }
  }

  private async handleProcessingError(
    error: Error,
    event: NotificationPayload,
    context: UserEventContext,
    retryCount: number
  ): Promise<boolean> {
    console.error(`User Update Event Processing Failed (Retry ${retryCount}):`, {
      error: error.message,
      event,
    });

    if (retryCount < this.MAX_RETRIES) {
      const backoffDelay = Math.pow(2, retryCount) * this.BASE_DELAY;
      await this.delay(backoffDelay);
      return this.processUserUpdateEventWithRetry(event, context, retryCount + 1);
    }

    // Convert NotificationPayload to Record<string, unknown>
    const eventAsRecord: Record<string, unknown> = {
      userId: event.userId,
      type: event.type,
      details: event.details,
      updateType: event.updateType,
      eventType: event.eventType,
    };

    await this.deadLetterQueueHandler.handleFailedMessage(context.topic, eventAsRecord, error, {
      partition: context.partition,
      offset: context.offset,
    });
    return false;
  }

  private async createNotificationForEvent(
    params: NotificationParams
  ): Promise<NotificationDoc | null> {
    try {
      this.logNotificationStart(params);
      const userEmail = await this.getUserEmail(params.userId);

      if (!userEmail) {
        console.warn(`No email found for user ${params.userId}`);
        return null;
      }

      const notification = await this.createNotificationRecord(params, userEmail);
      await this.handleCriticalNotification(params, notification);

      return notification;
    } catch (error) {
      this.logProcessingError(error as Error, params);
      throw new Error(`Notification processing failed: ${(error as Error).message}`);
    }
  }

  private async getUserEmail(userId: string): Promise<string | undefined> {
    if (!process.env.USERS_SERVICE_URL) {
      throw new Error('Users Service URL is not configured');
    }

    try {
      const response = await axios.get(`${process.env.USERS_SERVICE_URL}/${userId}`, {
        timeout: 5000,
      });

      console.log('User Email Retrieved:', {
        userId,
        email: response.data?.result?.email,
      });

      return response.data?.result?.email;
    } catch (error) {
      console.error('User Retrieval Error:', {
        message: (error as Error).message,
        url: `${process.env.USERS_SERVICE_URL}/${userId}`,
      });
      throw new Error(`Failed to retrieve user details: ${(error as Error).message}`);
    }
  }

  private async createNotificationRecord(
    params: NotificationParams,
    userEmail: string
  ): Promise<NotificationDoc> {
    const notification = await Notification.create({
      userId: params.userId,
      email: userEmail,
      type: params.type,
      content: params.content,
      priority: params.priority,
      metadata: params.metadata || {},
      sentAt: new Date(),
      read: false,
      emailSent: false,
    });

    console.log('Notification Record Created:', {
      userId: params.userId,
      type: params.type,
      priority: params.priority,
      notificationId: notification._id,
    });

    return notification as unknown as NotificationDoc;
  }

  private async handleCriticalNotification(
    params: NotificationParams,
    _notification: NotificationDoc
  ): Promise<void> {
    if (params.priority === NotificationPriority.CRITICAL) {
      try {
        await sendEmail(params.userId, `Notification: ${params.type}`, params.type, params.content);
        console.log('Email sent successfully', {
          userId: params.userId,
          type: params.type,
        });
      } catch (error) {
        console.error('Email Sending Failed:', {
          userId: params.userId,
          type: params.type,
          error: (error as Error).message,
        });
      }
    }
  }

  private logNotificationStart(params: NotificationParams): void {
    console.log('Processing Notification - Input:', {
      userId: params.userId,
      type: params.type,
      priority: params.priority,
    });
  }

  private logProcessingError(error: Error, params: NotificationParams): void {
    console.error('Comprehensive Notification Processing Error:', {
      message: error.message,
      stack: error.stack,
      input: params,
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
