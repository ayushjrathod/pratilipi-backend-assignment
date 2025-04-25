import { Kafka, logLevel } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'products',
  brokers: (process.env.KAFKA_BROKERS || '').split(' '),
  logLevel: logLevel.ERROR,
});

const consumer = kafka.consumer({ groupId: 'products' });
const producer = kafka.producer();

export { consumer, producer };
