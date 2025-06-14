import { config } from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import client from 'prom-client';
import app from './app';
import { NotificationProcessorService } from './EventProcessor/NotificationEventProcessor';
import { consumer, producer } from './kafka/kafka';

config();

const ENV = {
  MONGO_URI: process.env.MONGO_URI!,
  KAFKA_BROKERS: process.env.KAFKA_BROKERS!,
  USERS_SERVICE_URL: process.env.USERS_SERVICE_URL!,
  SMTP_HOST: process.env.SMTP_HOST!,
  SMTP_USER: process.env.SMTP_USER!,
  SMTP_PASS: process.env.SMTP_PASS!,
  NOTIFICATIONS_SERVICE_PORT: process.env.NOTIFICATIONS_SERVICE_PORT! || '8000',
  METRICS_PORT: process.env.METRICS_PORT || '9205',
};
const validateEnvironment = (): void => {
  Object.values(ENV).forEach((value) => {
    if (!value) {
      throw new Error(`Missing required environment variable`);
    }
  });
};
validateEnvironment();

const setupMetrics = (): client.Registry => {
  const register = new client.Registry();
  register.setDefaultLabels({ app: 'notification-service' });
  client.collectDefaultMetrics({ register });
  return register;
};
const setupMetricsServer = (register: client.Registry): express.Application => {
  const metricsApp = express();
  metricsApp.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });
  return metricsApp;
};


  const setupConnections = async (): Promise<void> => {
    const mongouri = ENV.MONGO_URI;
    await mongoose.connect(mongouri);
      await producer.connect();
      await consumer.connect();
  };

const initializeNotificationProcessor = async (): Promise<void> => {
    try {
      const notificationProcessor = new NotificationProcessorService();
      await notificationProcessor.initializePriorityEventConsumer();
      console.log('Notification processor initialized');
    } catch (error) {
      console.error('Notification processor initialization failed:', error);
      throw error;
    }
  };

  const handleShutdown = async (error?:Error): Promise<void> => {
    if(error){
      console.error('Error during shutdown:', error);
    }
    try {
        await Promise.allSettled([
          mongoose.connection.close(),
          producer.disconnect(),
          consumer.disconnect()
        ]);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(error ? 1 : 0);
    }
  };

const startServer = async (): Promise<void> => {
    try {

      await setupConnections();

      //main application
      app.listen(ENV.NOTIFICATIONS_SERVICE_PORT, '0.0.0.0', () => {
        console.log(`Notification service running on port ${ENV.NOTIFICATIONS_SERVICE_PORT}`);
      });
      // Start metrics server
      const metricsApp = setupMetricsServer(setupMetrics());
      metricsApp.listen(ENV.METRICS_PORT, '0.0.0.0', () => {
        console.log(`Metrics available at port ${ENV.METRICS_PORT}/metrics`);
      });
      // Initialize notification processor
      await initializeNotificationProcessor();
    } catch (error) {
      await handleShutdown(error as Error);
    }
  }

// Handle unexpected errors
process.on('unhandledRejection', handleShutdown);
process.on('uncaughtException', handleShutdown);
process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

startServer();
