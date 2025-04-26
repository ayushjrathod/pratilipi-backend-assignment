import { Document, model, Schema } from 'mongoose';

// Notification Types represent different categories of notifications
export enum NotificationType {
  USER_UPDATE = 'USER_UPDATE',
  ORDER_UPDATE = 'ORDER_UPDATE',
  PROMOTION = 'PROMOTION',
  EMAIL = 'EMAIL',
  RECOMMENDATION = 'RECOMMENDATION', // Adding the missing type
}

// Priority levels for notifications
export enum NotificationPriority {
  CRITICAL = 'critical',
  STANDARD = 'standard',
}

// Interface for the content of email notifications
export interface EmailContent {
  [key: string]: string | number | boolean | object;
}

// Data required to create a new notification
export interface NotificationData {
  userId: string;
  type: NotificationType;
  content: EmailContent;
  timestamp?: Date;
}

// Interface representing a notification document in MongoDB
export interface INotification extends Document {
  userId: string;
  email?: string;
  type: NotificationType;
  priority: NotificationPriority;
  content: EmailContent;
  sentAt: Date;
  read: boolean;
  metadata: Record<string, string | number | boolean | object>;
  emailSent: boolean;
  lastEmailAttempt?: Date;
  emailError?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Schema definition for the Notification model
const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: false,
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true,
    },
    priority: {
      type: String,
      enum: Object.values(NotificationPriority),
      default: NotificationPriority.STANDARD,
    },
    content: {
      type: Schema.Types.Mixed,
      required: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    emailSent: {
      type: Boolean,
      default: false,
    },
    lastEmailAttempt: Date,
    emailError: String,
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  }
);

// Text index for content searching
NotificationSchema.index({ content: 'text' });

// Export the Notification model with proper typing
export const Notification = model<INotification>('Notification', NotificationSchema);
