import { config } from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import client from 'prom-client';
import app from './app';
import { consumer, producer } from './kafka/kafka';

config();

// Metrics setup
const setupMetrics = () => {
  const register = new client.Registry();
  register.setDefaultLabels({ app: 'order-service' });
  client.collectDefaultMetrics({ register });
  return register;
};

// Metrics server setup
const setupMetricsServer = (register: client.Registry) => {
  const metricsApp = express();
  metricsApp.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });
  return metricsApp;
};

// Database and Kafka connection
const initializeServices = async () => {
  const mongoUrl = process.env.MONGO_URI;
  if (!mongoUrl) {
    throw new Error('MONGO_URI is not defined');
  }
  await mongoose.connect(mongoUrl);
  await producer.connect();
};

// Main application startup
const startApplication = async () => {
  try {
    await initializeServices();

    // Start main application server
    app.listen(process.env['ORDERS_SERVICE_PORT'], () => {
      console.log(`Orders service is running on port ${process.env['ORDERS_SERVICE_PORT']}`);
    });

    // Start metrics server
    const register = setupMetrics();
    const metricsApp = setupMetricsServer(register);
    metricsApp.listen(process.env.METRICS_PORT, () => {
      console.log(`Metrics available at http://localhost:${process.env.METRICS_PORT}/metrics`);
    });
  } catch (error) {
    console.error(error);
    await producer.disconnect();
    await consumer.disconnect();
    process.exit(1);
  }
};

startApplication();
