import { NotificationPriority, NotificationType } from '../models/notification';

export interface NotificationDoc {
  _id: string;
  userId: string;
  email: string;
  type: NotificationType;
  content: {
    message: string;
    eventType: string;
    name?: string;
    [key: string]: unknown;
  };
  priority: NotificationPriority;
  metadata?: {
    batchId?: string;
    isAutomated?: boolean;
    userPreferences?: Record<string, boolean>;
    retryCount?: number;
    [key: string]: unknown;
  };
  emailSent: boolean;
  sentAt?: Date;
  read: boolean;
  save(): Promise<void>;
}

export interface User {
  _id: string;
  email: string;
  name: string;
  preferences?: {
    promotions?: boolean;
    orderUpdates?: boolean;
    recommendations?: boolean;
  };
}

export interface NotificationPayload {
  userId: string;
  email: string;
  type: NotificationType;
  content: {
    message: string;
    eventType: string;
    name: string;
  };
  details?: {
    message: string;
    eventType: string;
  };
  eventType?: string;
  updateType?: string;
  priority: NotificationPriority;
  metadata: {
    batchId: string;
    isAutomated: boolean;
    userPreferences?: Record<string, boolean>;
    retryCount?: number;
  };
}

export interface NotificationRequest {
  userId: string;
  type: NotificationType;
  content: string;
  priority?: NotificationPriority;
  metadata?: Record<string, unknown>;
  trackingId?: string;
}

export interface QueryParams {
  userId: string;
  priority?: NotificationPriority;
  read?: boolean;
  _id?: { $in: string[] };
}
