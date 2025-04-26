import express, { NextFunction, Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import morgan from 'morgan';
import { Notification, NotificationPriority, NotificationType } from './models/notification';

// Initialize express app
const app = express();

// Middleware
app.use(express.json());
app.use(morgan('common'));

// Types
interface NotificationRequest {
  userId: string;
  type: NotificationType;
  content: string;
  priority?: NotificationPriority;
  metadata?: Record<string, unknown>;
  trackingId?: string;
}

interface QueryParams {
  userId: string;
  priority?: NotificationPriority;
  read?: boolean;
  _id?: { $in: string[] };
}

// Utilities
const generateTrackingId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
};

const createTransparentPixel = (res: Response): void => {
  const transparentPixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );
  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Content-Length': transparentPixel.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  });
  res.end(transparentPixel);
};

// Middleware
const validateNotificationPayload = (
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

// Controllers
const createNotification = async (
  req: Request<Record<string, never>, unknown, NotificationRequest>,
  res: Response
): Promise<void> => {
  try {
    const { userId, type, content, priority, metadata = {} } = req.body;
    const trackingId = type === NotificationType.EMAIL ? generateTrackingId() : undefined;

    const notification = await new Notification({
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
    }).save();

    res.status(201).json({
      message: 'Notification created successfully',
      notification,
      ...(trackingId && {
        trackingUrl: `${process.env.API_BASE_URL}/notifications/track/${trackingId}`,
      }),
    });
  } catch (err) {
    console.error('Error creating notification:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unexpected error' });
  }
};

const getUserNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { priority, read, limit = 50, page = 1 } = req.query;

    const query: QueryParams = { userId };
    if (priority) query.priority = priority as NotificationPriority;
    if (read !== undefined) query.read = read === 'true';

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .sort({ 'metadata.createdAt': -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit)),
      Notification.countDocuments(query),
    ]);

    res.json({
      results: notifications,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unexpected error' });
  }
};

const markNotificationsAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { priority, notificationIds } = req.body;

    if (
      notificationIds &&
      (!Array.isArray(notificationIds) || !notificationIds.every(isValidObjectId))
    ) {
      res.status(400).json({ error: 'Invalid notification IDs provided' });
      return;
    }

    const query: QueryParams = { userId, read: false };
    if (priority) query.priority = priority as NotificationPriority;
    if (notificationIds?.length) query._id = { $in: notificationIds };

    const result = await Notification.updateMany(query, {
      $set: { read: true, 'metadata.readAt': new Date() },
    });

    res.json({
      message: 'Notifications marked as read',
      updatedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error('Error marking notifications as read:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unexpected error' });
  }
};

const trackEmailOpen = async (req: Request, res: Response): Promise<void> => {
  const { trackingId } = req.params;

  if (!trackingId) {
    res.status(400).send('Invalid tracking ID');
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
};

// Routes
app.post('/notifications', validateNotificationPayload, createNotification);
app.get('/notifications/user/:userId', getUserNotifications);
app.patch('/notifications/user/:userId/read', markNotificationsAsRead);
app.get('/notifications/track/:trackingId', trackEmailOpen);

export default app;
