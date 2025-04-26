import { Consumer, Kafka, KafkaMessage } from 'kafkajs';

import { consumer, producer } from '../kafka/kafka';
import { DeadLetterQueueHandler } from './DeadLetterQueue';
import { OrderUpdateEventProcessor } from './OrderEventProcessor';
import { ProductEventProcessor } from './ProductEventProcessor';
import { RecommendationEventProcessor } from './RecommendationEventProcessor';
import { UserUpdateEventProcessor } from './UserEventProcessor';

interface MessageMetadata {
  topic: string;
  partition: number;
  offset: string;
}

interface NotificationEvent {
  type: string;
  userId: string;
  data: Record<string, unknown>;
}

export class NotificationProcessorService {
  private kafka: Kafka;
  private deadLetterQueueHandler: DeadLetterQueueHandler;
  private userUpdateEventProcessor: UserUpdateEventProcessor;
  private orderUpdateEventProcessor: OrderUpdateEventProcessor;
  private productEventProcessor: ProductEventProcessor;
  private recommendationEventProcessor: RecommendationEventProcessor;

  private highPriorityConsumer: Consumer;
  private standardPriorityConsumer: Consumer;
  static createNotificationForEvent: (event: NotificationEvent) => Promise<void>;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'notifications',
      brokers: (process.env['KAFKA_BROKERS'] || '').split(','),
      retry: {
        retries: 5,
        factor: 2,
        initialRetryTime: 1000,
      },
    });

    this.deadLetterQueueHandler = new DeadLetterQueueHandler();

    this.userUpdateEventProcessor = new UserUpdateEventProcessor(this.deadLetterQueueHandler);
    this.orderUpdateEventProcessor = new OrderUpdateEventProcessor(this.deadLetterQueueHandler);
    this.productEventProcessor = new ProductEventProcessor(this.deadLetterQueueHandler);
    this.recommendationEventProcessor = new RecommendationEventProcessor(
      this.deadLetterQueueHandler
    );

    this.highPriorityConsumer = this.kafka.consumer({
      groupId: 'priority1-notification-group',
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      maxInFlightRequests: 1,
    });

    this.standardPriorityConsumer = this.kafka.consumer({
      groupId: 'priority2-notification-group',
      sessionTimeout: 45000,
      heartbeatInterval: 5000,
      maxInFlightRequests: 1,
    });
  }

  async initializePriorityEventConsumer(): Promise<void> {
    try {
      await this.setupHighPriorityConsumer();
      await this.setupStandardPriorityConsumer();

      console.log('Kafka Priority Consumers Started Successfully', {
        highPriorityTopics: ['user-events', 'order-events'],
        standardPriorityTopics: ['product-events', 'recommendation-events'],
      });
    } catch (setupError) {
      console.error('Kafka Consumers Setup Failed:', setupError);
      throw setupError;
    }
  }

  private async setupHighPriorityConsumer(): Promise<void> {
    await this.highPriorityConsumer.connect();
    await this.highPriorityConsumer.subscribe({
      topics: ['user-events', 'order-events'],
      fromBeginning: false,
    });

    await this.highPriorityConsumer.run({
      eachMessage: async ({ topic, message, partition }) => {
        await this.processHighPriorityMessage(topic, message, partition);
      },
    });
  }

  private async setupStandardPriorityConsumer(): Promise<void> {
    await this.standardPriorityConsumer.connect();
    await this.standardPriorityConsumer.subscribe({
      topics: ['product-events', 'recommendation-events'],
      fromBeginning: false,
    });

    await this.standardPriorityConsumer.run({
      eachMessage: async ({ topic, message, partition }) => {
        await this.processStandardPriorityMessage(topic, message, partition);
      },
    });
  }

  private async processHighPriorityMessage(
    topic: string,
    message: KafkaMessage,
    partition: number
  ): Promise<void> {
    if (!message.value) {
      console.error('Received null message value');
      return;
    }

    const event = JSON.parse(message.value.toString());
    console.log(`Processing High Priority Event: ${topic}`, {
      eventType: event.type,
      userId: event.userId,
    });

    const metadata: MessageMetadata = { topic, partition, offset: message.offset };
    let processingResult = false;

    try {
      if (topic === 'user-events') {
        processingResult = await this.userUpdateEventProcessor.processUserUpdateEventWithRetry(
          event,
          metadata
        );
      } else if (topic === 'order-events') {
        processingResult = await this.orderUpdateEventProcessor.processOrderUpdateEventWithRetry(
          event,
          metadata
        );
      }

      await this.handleFailedProcessing(
        processingResult,
        topic,
        message.value,
        metadata,
        'High Priority Event Processing Failed'
      );
    } catch (error) {
      await this.handleProcessingError(error as Error, topic, message.value, metadata);
    }
  }

  private async processStandardPriorityMessage(
    topic: string,
    message: KafkaMessage,
    partition: number
  ): Promise<void> {
    if (!message.value) {
      console.error('Received null message value');
      return;
    }

    const event = JSON.parse(message.value.toString());
    console.log(`Processing Standard Priority Event: ${topic}`, {
      eventType: event.type,
      userId: event.userId,
    });

    const metadata: MessageMetadata = { topic, partition, offset: message.offset };
    let processingResult = false;

    try {
      if (topic === 'product-events') {
        processingResult = await this.productEventProcessor.processProductEventWithRetry(
          event,
          metadata
        );
      } else if (topic === 'recommendation-events') {
        processingResult = await this.recommendationEventProcessor.processRecommendationEvent(
          event,
          metadata
        );
      }

      await this.handleFailedProcessing(
        processingResult,
        topic,
        message.value,
        metadata,
        'Standard Priority Event Processing Failed'
      );
    } catch (error) {
      await this.handleProcessingError(error as Error, topic, message.value, metadata);
    }
  }

  private async handleFailedProcessing(
    processingResult: boolean,
    topic: string,
    messageValue: Buffer,
    metadata: MessageMetadata,
    reason: string
  ): Promise<void> {
    if (!processingResult) {
      await this.deadLetterQueueHandler.queueFailedMessage(topic, messageValue, {
        originalTopic: metadata.topic,
        partition: metadata.partition,
        offset: metadata.offset,
        reason,
      });
    }
  }

  private async handleProcessingError(
    error: Error,
    topic: string,
    messageValue: Buffer,
    metadata: MessageMetadata
  ): Promise<void> {
    console.error(`Event Processing Error: ${topic}`, {
      error: error.message,
      topic,
      stack: error.stack,
    });

    await this.deadLetterQueueHandler.queueFailedMessage(topic, messageValue, {
      originalTopic: metadata.topic,
      partition: metadata.partition,
      offset: metadata.offset,
      reason: error.message,
    });
  }

  async shutdown(): Promise<void> {
    try {
      await Promise.all([
        this.highPriorityConsumer.disconnect(),
        this.standardPriorityConsumer.disconnect(),
        consumer.disconnect(),
        producer.disconnect(),
      ]);
      console.log('Notification processor service shut down successfully');
    } catch (error) {
      console.error('Error during notification processor shutdown:', error);
    }
  }
}

export const notificationProcessorService = new NotificationProcessorService();
