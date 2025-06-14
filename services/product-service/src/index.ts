import { config } from 'dotenv';
import express, { Application } from 'express';
import mongoose from 'mongoose';
import client from 'prom-client';
import app from './app';
import { consumer, producer } from './kafka/kafka';
import { Product } from './models/product';
import { initializePromotionalEvents } from './services/promotionalEventService';
import { OrderEventPayload } from './types/types';

config();

const ptrStr = process.env.PRODUCTS_SERVICE_PORT || '8000';
const PRODUCTS_PORT = Number.isNaN(parseInt(ptrStr, 10)) ? 8000 : parseInt(ptrStr, 10);
const metricsPortStr = process.env.METRICS_PORT || '9203';
const METRICS_PORT = Number.isNaN(parseInt(metricsPortStr, 10))
  ? 9203
  : parseInt(metricsPortStr, 10);

const setupMetrics = (): client.Registry => {
  const register = new client.Registry();
  register.setDefaultLabels({ app: 'product-service' });
  client.collectDefaultMetrics({ register });
  return register;
};

const setupMetricsServer = (register: client.Registry): Application => {
  const metricsApp = express();
  metricsApp.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  return metricsApp;
};

const handleOrderEvent = async (value: OrderEventPayload): Promise<void> => {
  if (value.type === 'order-placed') {
    for (const product of value.payload.products) {
      const existingProduct = await Product.findById(product._id);
      if (existingProduct) {
        existingProduct.quantity -= product.quantity;
        await existingProduct.save();

        await producer.send({
          topic: 'inventory-events',
          messages: [
            {
              value: JSON.stringify({ type: 'product-updated', payload: product }),
            },
          ],
        });
      }
    }
  }
};

const setupKafkaConsumer = async (): Promise<void> => {
  await consumer.subscribe({ topic: 'order-events' });

  consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) {
        console.error('Received message with null value');
        return;
      }

      const value = JSON.parse(message.value.toString()) as OrderEventPayload;
      console.log(`[TOPIC]: [${topic}] | PART: ${partition} | EVENT: ${value.type}`);
      await handleOrderEvent(value);
    },
  });
};

const handleShutdown = async (error?: Error): Promise<void> => {
  if (error) {
    console.error('Fatal error:', error);
  }
  try {
    await Promise.all([consumer.disconnect(), producer.disconnect(), mongoose.disconnect()]);
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
  process.exit(error ? 1 : 0);
};

const setupConnections = async (): Promise<void> => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('Environment variable is missing: MONGO_URI');
  }
  await Promise.all([mongoose.connect(mongoUri), producer.connect(), consumer.connect()]);
};

const startServer = async (): Promise<void> => {
  try {
    await setupConnections();

    initializePromotionalEvents(producer, setupMetrics());
    await setupKafkaConsumer();

    app.listen(PRODUCTS_PORT, '0.0.0.0', () => {
      console.log(`Products service is running on port ${PRODUCTS_PORT}`);
    });

    const metricsApp = setupMetricsServer(setupMetrics());
    metricsApp.listen(METRICS_PORT, '0.0.0.0', () => {
      console.log(`Metrics available at ${METRICS_PORT}/metrics`);
    });
  } catch (error) {
    await handleShutdown(error as Error);
  }
};

process.on('unhandledRejection', handleShutdown);
process.on('uncaughtException', handleShutdown);
process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

startServer();
