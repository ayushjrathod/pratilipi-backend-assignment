import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import client from 'prom-client';
import { z } from 'zod';

import { producer } from './kafka/kafka';
import { RecommendationService } from './services/RecommendationService';

dotenv.config();

// Create a Registry and configure default labels
const register = new client.Registry();
register.setDefaultLabels({
  app: 'recommendation-service',
});

// Define service metrics
const metrics = {
  orderProcessingDuration: new client.Histogram({
    name: 'order_processing_duration_seconds',
    help: 'Duration of order processing in seconds',
    buckets: [1, 2, 5, 10, 20, 30, 60],
  }),

  recommendationsGenerated: new client.Counter({
    name: 'recommendations_generated_total',
    help: 'Total number of recommendations generated',
  }),

  processingErrors: new client.Counter({
    name: 'processing_errors_total',
    help: 'Total number of processing errors',
    labelNames: ['error_type'],
  }),

  redisConnectionStatus: new client.Gauge({
    name: 'redis_connection_status',
    help: 'Status of Redis connection (1 for connected, 0 for disconnected)',
  }),

  kafkaConnectionStatus: new client.Gauge({
    name: 'kafka_connection_status',
    help: 'Status of Kafka connection (1 for connected, 0 for disconnected)',
  }),
};

// Register all metrics
Object.values(metrics).forEach((metric) => register.registerMetric(metric));

client.collectDefaultMetrics({ register });

// Initialize Express app and recommendation service
const app = express();
const recommendationService = new RecommendationService();

// Rate limiter middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

app.use(express.json());
app.use(limiter);

// Input validation schema
const FeedbackSchema = z.object({
  userId: z.string().min(1),
  productId: z.string().min(1),
  isPositive: z.boolean(),
});

// Error handler middleware
const errorHandler = (
  err: Error,
  req: express.Request,
  res: express.Response,
  _next: express.NextFunction
) => {
  console.error('Error:', err);
  metrics.processingErrors.inc({ error_type: err.name || 'unknown' });
  res.status(500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
};

// Metrics endpoint
app.get(
  '/metrics',
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (error) {
      next(error);
    }
  }
);

// Manual trigger endpoint (for testing)
app.post(
  '/process',
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): Promise<void> => {
    try {
      await recommendationService.processOrdersManually();
      res.json({ status: 'success' });
    } catch (error) {
      next(error);
    }
  }
);

// Feedback endpoint
app.post(
  '/feedback',
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): Promise<void> => {
    try {
      const validatedData = FeedbackSchema.parse(req.body);

      const feedback = {
        ...validatedData,
        timestamp: new Date().toISOString(),
      };

      await recommendationService.processFeedback(feedback);
      metrics.recommendationsGenerated.inc();

      res.json({
        status: 'success',
        data: feedback,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          status: 'error',
          message: 'Validation error',
          errors: error.errors,
        });
        return;
      }
      next(error);
    }
  }
);

// Global error handling middleware
app.use(errorHandler);

// Service startup sequence
async function startServices(): Promise<void> {
  try {
    await producer.connect();
    metrics.kafkaConnectionStatus.set(1);
    console.log('Kafka Producer connected successfully');

    // Start recommendation service
    await recommendationService.start();
    metrics.redisConnectionStatus.set(1);
    console.log('Recommendation Service started successfully');

    // Start HTTP server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start services:', error);
    metrics.processingErrors.inc({ error_type: 'startup' });
    process.exit(1);
  }
}

// Graceful shutdown handler
async function shutdownGracefully(): Promise<never> {
  console.log('Initiating graceful shutdown...');

  // Set maximum shutdown timeout
  const shutdownTimeout = setTimeout(() => {
    console.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000); // 10 seconds timeout

  try {
    await Promise.race([
      recommendationService.stop(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Service stop timeout')), 5000)),
    ]);
    metrics.redisConnectionStatus.set(0);

    await Promise.race([
      producer.disconnect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Kafka disconnect timeout')), 5000)
      ),
    ]);
    metrics.kafkaConnectionStatus.set(0);

    clearTimeout(shutdownTimeout);
    console.log('All services stopped successfully');
    process.exit(0);
  } catch (error) {
    clearTimeout(shutdownTimeout);
    console.error('Error during shutdown:', error);
    metrics.processingErrors.inc({ error_type: 'shutdown' });
    process.exit(1);
  }
}

process.on('SIGTERM', shutdownGracefully);
process.on('SIGINT', shutdownGracefully);

if (require.main === module) {
  startServices();
}

export { app, metrics, register };
