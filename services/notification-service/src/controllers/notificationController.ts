import { Request, Response } from 'express';
import { NotificationType } from '../models/notification';
import { NotificationService } from '../services/notificationService';
import { NotificationRequest } from '../types/types';

export class NotificationController {
  static async createNotification(
    req: Request<Record<string, never>, unknown, NotificationRequest>,
    res: Response
  ): Promise<void> {
    try {
      const notification = await NotificationService.createNotification(req.body);
      const response: any = {
        message: 'Notification created successfully',
        notification,
      };
      if (notification.type === NotificationType.EMAIL && notification.metadata?.trackingId) {
        response.trackingUrl = `${process.env.API_BASE_URL}/notifications/track/${notification.metadata.trackingId}`;
      }
      res.status(201).json(response);
    } catch (err) {
      console.error('Error creating notification:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unexpected error' });
    }
  }

  static async getUserNotifications(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { priority, read, limit = 50, page = 1 } = req.query;
      const result = await NotificationService.getUserNotifications(
        userId,
        priority as any,
        read === 'true' || read === 'false' ? read === 'true' : undefined,
        Number(limit),
        Number(page)
      );
      res.json(result);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unexpected error' });
    }
  }

  static async markNotificationsAsRead(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { priority, notificationIds } = req.body;
      const result = await NotificationService.markNotificationsAsRead(
        userId,
        notificationIds,
        priority as any
      );
      res.json(result);
    } catch (err) {
      console.error('Error marking notifications as read:', err);
      if (err instanceof Error && err.message === 'Invalid notification IDs provided') {
        res.status(400).json({ error: err.message });
      } else {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unexpected error' });
      }
    }
  }

  static async trackEmailOpen(req: Request, res: Response): Promise<void> {
    try {
      const { trackingId } = req.params;
      await NotificationService.trackEmailOpen(trackingId, res);
    } catch (err) {
      // Error logging is handled in the service, response is handled by createTransparentPixel
      // If createTransparentPixel itself throws, it will be caught by the global error handler
    }
  }
}
