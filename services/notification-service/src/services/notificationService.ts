import { Response } from 'express';
import { isValidObjectId } from 'mongoose';
import {
  INotification,
  Notification,
  NotificationPriority,
  NotificationType,
} from '../models/notification';
import { NotificationRequest, QueryParams } from '../types/types';
import { createTransparentPixel, generateTrackingId } from '../utils/utils';

interface PaginationResult {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class NotificationService {
  static async createNotification(data: NotificationRequest): Promise<INotification> {
    const { userId, type, content, priority, metadata = {} } = data;
    const trackingId = type === NotificationType.EMAIL ? generateTrackingId() : undefined;

    const notification = new Notification({
      userId,
      type,
      content,
      priority: priority || NotificationPriority.STANDARD,
      metadata: {
        ...metadata,
        ...(trackingId && { trackingId }),
        createdAt: new Date(),
      },
      read: false,
    });
    return notification.save();
  }

  static async getUserNotifications(
    userId: string,
    priority?: NotificationPriority,
    read?: boolean,
    limit = 50,
    page = 1
  ): Promise<{ results: INotification[]; pagination: PaginationResult }> {
    const query: QueryParams = { userId };
    if (priority) query.priority = priority;
    if (read !== undefined) query.read = read;

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .sort({ 'metadata.createdAt': -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit)),
      Notification.countDocuments(query),
    ]);

    return {
      results: notifications,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  }

  static async markNotificationsAsRead(
    userId: string,
    notificationIds?: string[],
    priority?: NotificationPriority
  ): Promise<{ message: string; updatedCount: number }> {
    if (
      notificationIds &&
      (!Array.isArray(notificationIds) || !notificationIds.every(isValidObjectId))
    ) {
      throw new Error('Invalid notification IDs provided');
    }

    const query: QueryParams = { userId, read: false };
    if (priority) query.priority = priority as NotificationPriority;
    if (notificationIds?.length) query._id = { $in: notificationIds };

    const result = await Notification.updateMany(query, {
      $set: { read: true, 'metadata.readAt': new Date() },
    });

    return {
      message: 'Notifications marked as read',
      updatedCount: result.modifiedCount,
    };
  }

  static async trackEmailOpen(trackingId: string, res: Response): Promise<void> {
    if (!trackingId) {
      res.status(400).send('Invalid tracking ID'); // Send response and return
      return;
    }

    try {
      const result = await Notification.updateOne(
        { type: NotificationType.EMAIL, 'metadata.trackingId': trackingId },
        { $set: { read: true, 'metadata.readAt': new Date() } }
      );

      if (result.matchedCount === 0) {
        console.warn(`No notification found with tracking ID: ${trackingId}`);
      }
    } catch (err) {
      console.error('Error tracking email open:', err);
    }
    createTransparentPixel(res);
  }
}
