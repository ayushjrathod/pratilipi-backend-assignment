import { config } from 'dotenv';
import express, { Application } from 'express';
import mongoose from 'mongoose';
import client from 'prom-client';
import app from './app';
import { producer } from './kafka/kafka';

config();

const portStr = process.env.USERS_SERVICE_PORT || '8000';
const PORT = Number.isNaN(parseInt(portStr, 10)) ? 8000 : parseInt(portStr, 10);
const METRICS_PORT = process.env.METRICS_PORT;

// Setup Prometheus metrics
const setupMetrics = (): Application => {
  const register = new client.Registry();
  register.setDefaultLabels({ app: 'user-service' });
  client.collectDefaultMetrics({ register });

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
    throw new Error('Missing Environment variable: MONGO_URI');
  }
  await mongoose.connect(mongoUrl);
  await producer.connect();
};

// Graceful shutdown handler
const handleShutdown = async (error?: Error): Promise<never> => {
  if (error) {
    console.error('Fatal error:', error);
  }
  try {
    await producer.disconnect();
    await mongoose.disconnect();
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
    const metricsApp = setupMetrics();
    metricsApp.listen(METRICS_PORT, () => {
      console.log(`Metrics available at http://localhost:${METRICS_PORT}/metrics`);
    });
  } catch (error) {
    await handleShutdown(error as Error);
  }
};

// Handle unexpected errors
process.on('unhandledRejection', handleShutdown);
process.on('uncaughtException', handleShutdown);

startServer();
