import axios from 'axios';
import {
  Notification as DBNotification,
  INotification,
  NotificationPriority,
  NotificationType,
} from '../models/notification';
import { sendEmail } from '../services/emailService';
import { DeadLetterQueueHandler } from './DeadLetterQueue';

interface OrderEvent {
  userId: string;
  orderId: string;
  eventType: string;
  details?: {
    message: string;
    eventType: string;
    [key: string]: unknown;
  };
}

interface NotificationParams {
  userId: string;
  type: NotificationType;
  content: {
    orderId: string;
    eventDetails: {
      message: string;
      eventType: string;
      [key: string]: unknown;
    };
  };
  priority: NotificationPriority;
  metadata?: Record<string, unknown>;
}

export class OrderUpdateEventProcessor {
  private readonly MAX_RETRIES = 3;
  private deadLetterQueueHandler: DeadLetterQueueHandler;

  constructor(deadLetterQueueHandler: DeadLetterQueueHandler) {
    this.deadLetterQueueHandler = deadLetterQueueHandler;
  }

  async processOrderUpdateEventWithRetry(
    event: OrderEvent,
    context: { topic: string; partition: number; offset: string },
    retryCount = 0
  ): Promise<boolean> {
    try {
      await this.validateEvent(event);
      await this.processOrderEvent(event, retryCount);
      return true;
    } catch (error) {
      return await this.handleProcessingError(error as Error, event, context, retryCount);
    }
  }

  private async validateEvent(event: OrderEvent): Promise<void> {
    if (!event.userId) {
      throw new Error('Invalid Order Event - Missing userId');
    }
  }

  private async processOrderEvent(event: OrderEvent, retryCount: number): Promise<void> {
    await this.createNotificationForEvent({
      userId: event.userId,
      type: NotificationType.ORDER_UPDATE,
      content: {
        orderId: event.orderId,
        eventDetails: event.details || {
          message: 'Order event processed',
          eventType: event.eventType,
        },
      },
      priority: NotificationPriority.CRITICAL,
      metadata: { retryCount },
    });

    console.log('Order Event Processed Successfully:', {
      userId: event.userId,
      orderId: event.orderId,
    });
  }

  private async handleProcessingError(
    error: Error,
    event: OrderEvent,
    context: { topic: string; partition: number; offset: string },
    retryCount: number
  ): Promise<boolean> {
    console.error(`Order Event Processing Failed (Retry ${retryCount}):`, {
      error: error.message,
      event,
    });

    if (retryCount < this.MAX_RETRIES) {
      const backoffDelay = Math.pow(2, retryCount) * 1000;
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      return this.processOrderUpdateEventWithRetry(event, context, retryCount + 1);
    }

    // Convert OrderEvent to Record<string, unknown>
    const eventAsRecord: Record<string, unknown> = {
      userId: event.userId,
      orderId: event.orderId,
      eventType: event.eventType,
      details: event.details,
    };

    await this.deadLetterQueueHandler.handleFailedMessage(context.topic, eventAsRecord, error, {
      partition: context.partition,
      offset: context.offset,
    });

    return false;
  }

  private async createNotificationForEvent(params: NotificationParams): Promise<INotification> {
    try {
      this.logNotificationStart(params);
      const userEmail = await this.getUserEmail(params.userId);
      const notification = await this.saveNotification(params, userEmail);
      await this.handleEmailNotification(params);
      return notification;
    } catch (error) {
      this.logNotificationError(error as Error, params);
      throw new Error(`Notification processing failed: ${(error as Error).message}`);
    }
  }

  private logNotificationStart(params: NotificationParams): void {
    console.log('Processing Notification - Input:', {
      userId: params.userId,
      type: params.type,
      priority: params.priority,
    });
  }

  private async getUserEmail(userId: string): Promise<string> {
    if (!process.env.USERS_SERVICE_URL) {
      throw new Error('Users Service URL is not configured');
    }

    try {
      const response = await axios.get(`${process.env.USERS_SERVICE_URL}/${userId}`, {
        timeout: 5000,
      });
      const userEmail = response.data?.result?.email;

      if (!userEmail) {
        console.warn(`No email found for user ${userId}`);
        return '';
      }

      console.log('User Email Retrieved:', { userId, email: userEmail });
      return userEmail;
    } catch (error) {
      console.error('User Retrieval Error:', {
        message: (error as Error).message,
        url: `${process.env.USERS_SERVICE_URL}/${userId}`,
      });
      throw new Error(`Failed to retrieve user details: ${(error as Error).message}`);
    }
  }

  private async saveNotification(
    params: NotificationParams,
    userEmail: string
  ): Promise<INotification> {
    const notification = await DBNotification.create({
      userId: params.userId,
      email: userEmail,
      type: params.type,
      content: params.content,
      priority: params.priority,
      metadata: params.metadata || {},
      sentAt: new Date(),
      read: false,
    });

    console.log('Notification Record Created:', {
      userId: params.userId,
      type: params.type,
      priority: params.priority,
      notificationId: notification._id,
    });

    return notification;
  }

  private async handleEmailNotification(params: NotificationParams): Promise<void> {
    if (params.type === NotificationType.ORDER_UPDATE) {
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

  private logNotificationError(error: Error, params: NotificationParams): void {
    console.error('Comprehensive Notification Processing Error:', {
      message: error.message,
      stack: error.stack,
      input: params,
    });
  }
}
