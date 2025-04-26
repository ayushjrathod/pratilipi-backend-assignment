import { Kafka, logLevel } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'users',
  brokers: (process.env['KAFKA_BROKERS'] || '').split(' '),
  logLevel: logLevel.ERROR,
});

const consumer = kafka.consumer({ groupId: 'users' });
const producer = kafka.producer();

export { consumer, producer };
