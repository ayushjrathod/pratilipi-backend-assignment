import { config } from 'dotenv';
import express, { Application } from 'express';
import mongoose from 'mongoose';
import client from 'prom-client';
import app from './app';
import { consumer, producer } from './kafka/kafka';

config();

const portStr = process.env.ORDER_SERVICE_PORT || '8000';
const PORT = Number.isNaN(parseInt(portStr, 10)) ? 8000 : parseInt(portStr, 10);
const metricsPortStr = process.env.METRICS_PORT || '9202';
const METRICS_PORT = Number.isNaN(parseInt(metricsPortStr, 10))
  ? 9202
  : parseInt(metricsPortStr, 10);

// Metrics setup
const setupMetrics = (): client.Registry => {
  const register = new client.Registry();
  register.setDefaultLabels({ app: 'order-service' });
  client.collectDefaultMetrics({ register });
  return register;
};

// Metrics server setup
const setupMetricsServer = (register: client.Registry): Application => {
  const metricsApp = express();
  metricsApp.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });
  return metricsApp;
};

// Database and Kafka connection
const setupConnections = async (): Promise<void> => {
  const mongoUrl = process.env.MONGO_URI;
  if (!mongoUrl) {
    throw new Error('MONGO_URI environment variable is not set');
  }
  await Promise.all([mongoose.connect(mongoUrl), producer.connect()]);
};

const handleShutdown = async (error?: Error): Promise<never> => {
  if (error) {
    console.error('Fatal error:', error);
  }
  try {
    await Promise.all([consumer.disconnect(), producer.disconnect(), mongoose.disconnect()]);
  } catch (err) {
    console.error('Error during shutdown:', err);
  }
  process.exit(error ? 1 : 0);
};

// Main application startup
const startServer = async (): Promise<void> => {
  try {
    await setupConnections();

    // Start main application server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Orders service is running on port ${PORT}`);
    });

    // Start metrics server
    const metricsApp = setupMetricsServer(setupMetrics());
    metricsApp.listen(METRICS_PORT, '0.0.0.0', () => {
      console.log(`Metrics available on ${METRICS_PORT}/metrics`);
    });
  } catch (error) {
    await handleShutdown(error as Error);
  }
};

// Handle unexpected errors
process.on('unhandledRejection', handleShutdown);
process.on('uncaughtException', handleShutdown);
process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

startServer();
