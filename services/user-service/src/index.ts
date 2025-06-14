import { config } from 'dotenv';
import express, { Application } from 'express';
import mongoose from 'mongoose';
import client from 'prom-client';
import app from './app';
import { producer } from './kafka/kafka';

config();

const portStr: string = process.env.USERS_SERVICE_PORT || '8000';
const PORT: number = Number.isNaN(parseInt(portStr, 10)) ? 8000 : parseInt(portStr, 10);
const metricsPortStr: string = process.env.METRICS_PORT || '9201';
const METRICS_PORT: number = Number.isNaN(parseInt(metricsPortStr, 10))
  ? 9201
  : parseInt(metricsPortStr, 10);

const setupMetrics = (): client.Registry => {
  const register = new client.Registry();
  register.setDefaultLabels({ app: 'user-service' });
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

// Database and Kafka connection
const setupConnections = async (): Promise<void> => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('Missing Environment variable: MONGO_URI');
  }
  await mongoose.connect(mongoUri);
  await producer.connect();
};

// Graceful shutdown handler
const handleShutdown = async (error?: Error): Promise<never> => {
  if (error) {
    console.error('Fatal error:', error);
  }
  try {
    await Promise.allSettled([mongoose.connection.close(), producer.disconnect()]);
  } catch (err) {
    console.error('Error during shutdown:', err);
  }
  process.exit(error ? 1 : 0);
};

// Start application
const startServer = async (): Promise<void> => {
  try {
    await setupConnections();

    // Start main application
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running on port ${PORT}`);
    });

    // Start metrics server
    const metricsApp = setupMetricsServer(setupMetrics());
    metricsApp.listen(METRICS_PORT, '0.0.0.0', () => {
      console.log(`Metrics available at port ${METRICS_PORT}/metrics`);
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
