import axios from 'axios';
import { RedisClientType } from 'redis';
import { OrderProcessor } from './processor/orderProcessor';
import { RecommendationProcessor } from './processor/recommendationProcessor';
import { OrdersResponse } from './types/types';

export class App {
  private orderProcessor: OrderProcessor;
  private recommendationProcessor: RecommendationProcessor;
  private readonly ordersServiceUrl: string;

  constructor(redisClient: RedisClientType) {
    this.orderProcessor = new OrderProcessor(redisClient);
    this.recommendationProcessor = new RecommendationProcessor(redisClient);
    this.ordersServiceUrl = process.env.ORDERS_SERVICE_URL || '';
  }

  private async fetchOrders(): Promise<OrdersResponse['result']> {
    try {
      const response = await axios.get<OrdersResponse>(this.ordersServiceUrl);
      return response.data.result;
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      throw error;
    }
  }

  private async processRecommendationsForUser(userId: string): Promise<void> {
    try {
      await this.recommendationProcessor.generateRecommendations(userId);
    } catch (error) {
      console.error('Failed to generate recommendations for user:', { userId, error });
    }
  }

  async processFeedback(feedback: {
    userId: string;
    productId: string;
    isPositive: boolean;
    timestamp: string;
  }): Promise<void> {
    try {
      // Store the feedback in Redis
      await this.recommendationProcessor.processFeedback(feedback);

      // Generate new recommendations based on the feedback
      await this.processRecommendationsForUser(feedback.userId);

      console.info('Successfully processed user feedback', {
        userId: feedback.userId,
        productId: feedback.productId,
      });
    } catch (error) {
      console.error('Failed to process feedback:', error);
      throw error;
    }
  }

  async processAllOrders(): Promise<void> {
    try {
      const orders = await this.fetchOrders();

      if (!orders?.length) {
        return;
      }

      const userIds = await this.orderProcessor.processOrders(orders);
      await Promise.all(userIds.map((userId) => this.processRecommendationsForUser(userId)));
    } catch (error) {
      console.error('Failed to process orders:', error);
      throw error;
    }
  }
}
