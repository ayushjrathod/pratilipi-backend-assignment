import { config } from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import client from 'prom-client';

import app from './app';
import { consumer, producer } from './kafka/kafka';
import { Product } from './models/product';
import { initializePromotionalEvents } from './services/promotionalEventService';
import { OrderEventPayload } from './types/types';

config();

const METRICS_PORT = process.env.METRICS_PORT;
const register = new client.Registry();

const setupMetrics = () => {
  register.setDefaultLabels({ app: 'product-service' });
  client.collectDefaultMetrics({ register });

  const metricsApp = express();
  metricsApp.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  return metricsApp;
};

const handleOrderEvent = async (value: OrderEventPayload) => {
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

const setupKafkaConsumer = async () => {
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

const shutdown = async () => {
  try {
    await consumer.disconnect();
    await producer.disconnect();
    await mongoose.disconnect();
    console.log('Gracefully shut down');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

const main = async () => {
  const mongoUrl = process.env.MONGO_URI;
  if (!mongoUrl) {
    throw new Error('MONGO_URI is not defined in the environment variables');
  }

  try {
    await mongoose.connect(mongoUrl);
    await consumer.connect();
    await producer.connect();

    initializePromotionalEvents(producer, register);
    await setupKafkaConsumer();

    const metricsApp = setupMetrics();

    app.listen(process.env['PRODUCTS_SERVICE_PORT'], () => {
      console.log(`Products service is running on port ${process.env['PRODUCTS_SERVICE_PORT']}`);
    });

    metricsApp.listen(METRICS_PORT, () => {
      console.log(`Metrics available at http://localhost:${METRICS_PORT}/metrics`);
    });
  } catch (error) {
    console.error('Failed to start the application:', error);
    await shutdown();
  }
};

process.on('SIGTERM', shutdown);

main().catch(async (error) => {
  console.error('Unhandled error:', error);
  await shutdown();
});
