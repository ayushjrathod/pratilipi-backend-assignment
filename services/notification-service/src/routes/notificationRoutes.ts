import express from 'express';
import { NotificationController } from '../controllers/notificationController';
import { validateNotificationPayload } from '../middleware/validation';

const router = express.Router();

router.post('/', validateNotificationPayload, NotificationController.createNotification);
router.get('/user/:userId', NotificationController.getUserNotifications);
router.patch('/user/:userId/read', NotificationController.markNotificationsAsRead);
router.get('/track/:trackingId', NotificationController.trackEmailOpen);

export default router;
