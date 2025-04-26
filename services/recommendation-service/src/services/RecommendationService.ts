import dotenv from 'dotenv';
import cron from 'node-cron';
import { createClient, RedisClientType } from 'redis';

import { App } from '../app';

dotenv.config();

interface ServiceConfig {
  redisUrl: string;
  cronSchedule: string;
  timezone: string;
  maxRetries: number;
}

export class RecommendationService {
  private redisClient: RedisClientType;
  private cronJob!: cron.ScheduledTask;
  public app: App;
  private isRunning: boolean = false;
  private config: ServiceConfig;

  constructor(config?: Partial<ServiceConfig>) {
    this.config = {
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      cronSchedule: '*/5 * * * *',
      timezone: 'UTC',
      maxRetries: 3,
      ...config,
    };

    this.redisClient = createClient({
      url: this.config.redisUrl,
    });

    this.redisClient.on('error', this.handleRedisError.bind(this));
    this.redisClient.on('connect', () => console.log('Redis connected successfully'));
    this.app = new App(this.redisClient);
  }

  private handleRedisError(err: Error): void {
    console.error('Redis Client Error:', err);
    if (this.isRunning) {
      this.attemptReconnection();
    }
  }

  private async attemptReconnection(retries = 0): Promise<void> {
    if (retries >= this.config.maxRetries) {
      console.error('Max reconnection attempts reached');
      await this.stop();
      return;
    }

    try {
      await this.redisClient.connect();
    } catch (error) {
      console.error(`Reconnection attempt ${retries + 1} failed:`, error);
      setTimeout(() => this.attemptReconnection(retries + 1), 5000 * (retries + 1));
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    try {
      await this.redisClient.connect();
      this.initializeCronJob();
      this.isRunning = true;
      console.log('Recommendation Service started successfully');
    } catch (error) {
      console.error('Failed to start Recommendation Service:', error);
      throw error;
    }
  }

  private initializeCronJob(): void {
    this.cronJob = cron.schedule(
      this.config.cronSchedule,
      async () => {
        console.log('Starting scheduled order processing:', new Date().toISOString());
        try {
          await this.app.processAllOrders();
        } catch (error) {
          console.error('Error during scheduled order processing:', error);
        }
      },
      {
        scheduled: true,
        timezone: this.config.timezone,
      }
    );
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.cronJob?.stop();
      await this.redisClient.disconnect();
      this.isRunning = false;
      console.log('Recommendation Service stopped successfully');
    } catch (error) {
      console.error('Error during service shutdown:', error);
      throw error;
    }
  }

  async processOrdersManually(): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Service is not running');
    }
    return this.app.processAllOrders();
  }

  async processFeedback(feedback: {
    userId: string;
    productId: string;
    isPositive: boolean;
    timestamp: string;
  }): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Service is not running');
    }
    await this.app.processFeedback(feedback);
  }

  async healthCheck(): Promise<{ status: string; redis: boolean }> {
    const redisConnected = this.redisClient.isOpen;
    return {
      status: this.isRunning ? 'running' : 'stopped',
      redis: redisConnected,
    };
  }
}
