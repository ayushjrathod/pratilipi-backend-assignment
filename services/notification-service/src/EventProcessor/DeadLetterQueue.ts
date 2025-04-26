import { producer } from '../kafka/kafka';

interface DLQMetadata {
  originalTopic: string;
  partition: number;
  offset: string;
  reason: string;
}

export class DeadLetterQueueHandler {
  private readonly DLQ_TOPIC = 'dead-letter-queue';

  async handleFailedMessage<T extends Record<string, unknown>>(
    topic: string,
    event: T,
    error: Error,
    metadata: { partition: number; offset: string }
  ): Promise<void> {
    const reason = error.message || 'Unknown error';
    const dlqMetadata: DLQMetadata = {
      originalTopic: topic,
      partition: metadata.partition,
      offset: metadata.offset,
      reason,
    };

    try {
      const originalMessage = Buffer.from(JSON.stringify(event));
      console.error('Handling Failed Message:', {
        originalTopic: topic,
        error: reason,
        metadata: dlqMetadata,
      });

      await this.queueFailedMessage(topic, originalMessage, dlqMetadata);
    } catch (queueError) {
      console.error('Failed to handle message and send to DLQ:', {
        topic,
        originalEvent: event,
        initialError: error.message,
        dlqError: queueError instanceof Error ? queueError.message : String(queueError),
      });
    }
  }

  public async queueFailedMessage(
    originalTopic: string,
    originalMessage: Buffer,
    metadata: DLQMetadata
  ): Promise<void> {
    const messageKey = `${originalTopic}-${metadata.partition}-${metadata.offset}`;
    const timestamp = new Date().toISOString();

    try {
      await producer.send({
        topic: this.DLQ_TOPIC,
        messages: [
          {
            key: messageKey,
            value: JSON.stringify({
              originalMessage: originalMessage.toString('base64'),
              metadata,
              timestamp,
            }),
          },
        ],
      });

      console.log('Message sent to Dead Letter Queue:', {
        originalTopic: metadata.originalTopic,
        reason: metadata.reason,
        timestamp,
        messageKey,
      });
    } catch (error) {
      console.error(
        'Failed to send message to Dead Letter Queue:',
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }
}
