import { Kafka, logLevel } from 'kafkajs';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || '').split(' ');
console.log('KAFKA_BROKERS:', KAFKA_BROKERS);
if (!KAFKA_BROKERS) {
  throw new Error('KAFKA_BROKERS environment variable is not set');
}

const kafka = new Kafka({
  clientId: 'products',
  brokers: KAFKA_BROKERS,
  logLevel: logLevel.ERROR,
});

const consumer = kafka.consumer({ groupId: 'products' });
const producer = kafka.producer();

export { consumer, producer };
