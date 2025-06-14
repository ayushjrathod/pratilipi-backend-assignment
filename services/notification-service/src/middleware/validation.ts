import { NextFunction, Request, Response } from 'express';
import { NotificationPriority, NotificationType } from '../models/notification';
import { NotificationRequest } from '../types/types';

export const validateNotificationPayload = (
  req: Request<Record<string, never>, unknown, NotificationRequest>,
  res: Response,
  next: NextFunction
): void => {
  const { userId, type, content, priority } = req.body;
  const errors: string[] = [];

  if (!userId) errors.push('User ID is required');
  if (!Object.values(NotificationType).includes(type)) errors.push('Invalid notification type');
  if (!content?.trim()) errors.push('Notification content is required');
  if (priority && !Object.values(NotificationPriority).includes(priority)) {
    errors.push('Invalid notification priority');
  }

  if (errors.length > 0) {
    res.status(400).json({ errors });
    return;
  }
  next();
};
