import { Kafka, logLevel } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'notifications',
  brokers: (process.env['KAFKA_BROKERS'] || '').split(','),
  logLevel: logLevel.ERROR,
  retry: {
    initialRetryTime: 300,
    retries: 3,
  },
});

const producer = kafka.producer({
  allowAutoTopicCreation: true,
  transactionTimeout: 30000,
});

const consumer = kafka.consumer({
  groupId: 'notifications-consumer-group',
  sessionTimeout: 45000,
  heartbeatInterval: 3000,
  rebalanceTimeout: 60000,
});

const connectProducer = async () => {
  try {
    await producer.connect();
    console.log('Kafka Producer Connected');
  } catch (error) {
    console.error('Kafka Producer Connection Failed', error);
    throw error;
  }
};

const connectConsumer = async () => {
  try {
    await consumer.connect();
    console.log('Kafka Consumer Connected');
  } catch (error) {
    console.error('Kafka Consumer Connection Failed', error);
    throw error;
  }
};

export { connectConsumer, connectProducer, consumer, kafka, producer };
