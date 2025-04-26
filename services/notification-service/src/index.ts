import { config } from 'dotenv';
import mongoose from 'mongoose';
import app from './app';
import { NotificationProcessorService } from './EventProcessor/NotificationEventProcessor';
import { connectConsumer, connectProducer, consumer, producer } from './kafka/kafka';

config();

type RequiredEnvVars = {
  MONGO_URI: string;
  KAFKA_BROKERS: string;
  USERS_SERVICE_URL: string;
  SMTP_HOST: string;
  SMTP_USER: string;
  SMTP_PASS: string;
  NOTIFICATIONS_SERVICE_PORT: string;
};

class NotificationServiceBootstrap {
  private static async validateEnvironment(): Promise<void> {
    const required: (keyof RequiredEnvVars)[] = [
      'MONGO_URI',
      'KAFKA_BROKERS',
      'USERS_SERVICE_URL',
      'SMTP_HOST',
      'SMTP_USER',
      'SMTP_PASS',
    ];

    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  private static async connectToMongoDB(): Promise<void> {
    try {
      await mongoose.connect(process.env.MONGO_URI!, {
        retryWrites: true,
        w: 'majority',
      });
      console.log('MongoDB Connected Successfully');
    } catch (error) {
      console.error('MongoDB connection failed:', error);
      throw error;
    }
  }

  private static async setupKafka(): Promise<void> {
    try {
      await connectProducer();
      await connectConsumer();
      console.log('Kafka setup completed successfully');
    } catch (error) {
      console.error('Kafka setup failed:', error);
      throw error;
    }
  }

  private static async initializeNotificationProcessor(): Promise<void> {
    try {
      const notificationProcessor = new NotificationProcessorService();
      await notificationProcessor.initializePriorityEventConsumer();
      console.log('Notification processor initialized');
    } catch (error) {
      console.error('Notification processor initialization failed:', error);
      throw error;
    }
  }

  private static async startExpressServer(): Promise<void> {
    const port = process.env.NOTIFICATIONS_SERVICE_PORT!;
    app.listen(port, () => {
      console.log(`Notifications service running on port ${port}`);
    });
  }

  public static async shutdown(): Promise<void> {
    console.log('Initiating graceful shutdown...');
    try {
      await Promise.allSettled([
        mongoose.connection.close(),
        producer.disconnect(),
        consumer.disconnect(),
      ]);
      console.log('Cleanup completed successfully');
    } catch (error) {
      console.error('Error during shutdown:', error);
    } finally {
      process.exit(0);
    }
  }

  public static async start(): Promise<void> {
    try {
      await this.validateEnvironment();
      await this.connectToMongoDB();
      await this.setupKafka();
      await this.initializeNotificationProcessor();
      await this.startExpressServer();
    } catch (error) {
      console.error('Notification Service Initialization Failed:', error);
      await this.shutdown();
      process.exit(1);
    }
  }
}

process.on('SIGTERM', NotificationServiceBootstrap.shutdown);
process.on('SIGINT', NotificationServiceBootstrap.shutdown);

NotificationServiceBootstrap.start().catch(console.error);
