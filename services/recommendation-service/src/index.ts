import { config } from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import client from 'prom-client';
import { z } from 'zod';

import { producer } from './kafka/kafka';
import { RecommendationService } from './services/RecommendationService';

config();

const portStr = process.env.USERS_SERVICE_PORT || '8000';
const PORT = Number.isNaN(parseInt(portStr, 10)) ? 8000 : parseInt(portStr, 10);
const metricsPortStr = process.env.METRICS_PORT || '9204';
const METRICS_PORT = Number.isNaN(parseInt(metricsPortStr, 10))
  ? 9204
  : parseInt(metricsPortStr, 10);

const setupMetrics = (): client.Registry => {
  const register = new client.Registry();
  register.setDefaultLabels({ app: 'recommendation-service' });
  client.collectDefaultMetrics({ register });
  return register;
};

const setupMetricsServer = (register: client.Registry): express.Application => {
  const metricsApp = express();
  metricsApp.get('/metrics', async (req: express.Request, res: express.Response) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });
  return metricsApp;
};

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

// Service startup sequence
async function setupConnections(): Promise<void> {
  try {
    await producer.connect();
    await recommendationService.start();
  } catch (error) {
    console.error('Failed to start services:', error);
    process.exit(1);
  }
}

// Graceful shutdown handler
const handleShutdown = async (error?: Error): Promise<never> => {
  if (error) {
    console.error('Fatal error during shutdown:', error);
  }

  try {
    await recommendationService.stop();
    await producer.disconnect();
  } catch (err) {
    console.error('Error during shutdown:', err);
  }
  process.exit(error ? 1 : 0);
};

const startServer = async (): Promise<void> => {
  try {
    await setupConnections();

    // Start HTTP server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
    // Start metrics server
    const metrics = setupMetricsServer(setupMetrics());
    metrics.listen(METRICS_PORT, '0.0.0.0', () => {
      console.log(`Metrics available at http://localhost:${METRICS_PORT}`);
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
