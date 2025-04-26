import axios from 'axios';
import { RedisClientType } from 'redis';
import { producer } from '../kafka/kafka';
import { Product, ProductsByCategoryResponse, RecommendationFeedback } from '../types/types';

const CACHE_TTL = 3600; // 1 hour
const MAX_RETRIES = 3;
const RATE_LIMIT_WINDOW = 60; // 1 minute
const RATE_LIMIT_MAX = 100;

export class RecommendationProcessor {
  private defaultCategory = 'Electronics';
  private defaultProducts: Product[] = [
    {
      _id: 'default1',
      name: 'Standard Product 1',
      price: 19.99,
      quantity: 100,
      category: 'Default',
    },
    {
      _id: 'default2',
      name: 'Standard Product 2',
      price: 29.99,
      quantity: 100,
      category: 'Default',
    },
    {
      _id: 'default3',
      name: 'Standard Product 3',
      price: 39.99,
      quantity: 100,
      category: 'Default',
    },
  ];

  constructor(private redisClient: RedisClientType<any>) {}

  async generateRecommendations(userId: string): Promise<void> {
    try {
      if (!(await this.checkRateLimit(userId))) {
        console.warn(`Rate limit exceeded for user ${userId}`);
        return;
      }

      const cacheKey = `recommendations:${userId}`;
      const cached = await this.redisClient.get(cacheKey);
      if (cached) {
        await this.sendRecommendationEvent(userId, JSON.parse(cached));
        return;
      }

      const purchaseHistory = await this.getUserPurchaseHistory(userId);
      if (!purchaseHistory.length) {
        await this.sendDefaultRecommendations(userId);
        return;
      }

      const recommendedProducts = await this.findRecommendedProducts(purchaseHistory);
      await this.redisClient
        .multi()
        .set(cacheKey, JSON.stringify(recommendedProducts))
        .expire(cacheKey, CACHE_TTL)
        .exec();

      await this.sendRecommendationEvent(userId, recommendedProducts);
    } catch (error) {
      console.error(`Failed to generate recommendations for user ${userId}:`, error);
      await this.sendDefaultRecommendations(userId);
    }
  }

  private async checkRateLimit(userId: string): Promise<boolean> {
    const rateLimitKey = `rateLimit:${userId}`;
    const count = await this.redisClient.incr(rateLimitKey);

    if (count === 1) {
      await this.redisClient.expire(rateLimitKey, RATE_LIMIT_WINDOW);
    }

    return count <= RATE_LIMIT_MAX;
  }

  private async getUserPurchaseHistory(userId: string): Promise<any[]> {
    const userPurchaseHistoryKey = `user:${userId}:purchaseHistory`;
    try {
      const purchaseHistoryItems = await this.redisClient.lRange(userPurchaseHistoryKey, 0, -1);
      return purchaseHistoryItems.map((item) => JSON.parse(item));
    } catch (error) {
      console.error(`Failed to fetch purchase history for user ${userId}:`, error);
      return [];
    }
  }

  private async findRecommendedProducts(purchaseHistory: any[]): Promise<Product[]> {
    const categoryCount = this.getCategoryCount(purchaseHistory);
    const sortedCategories = Object.entries(categoryCount)
      .sort(([, a], [, b]) => b - a)
      .map(([category]) => category);

    const productsServiceUrl = process.env.PRODUCTS_SERVICE_URL?.replace(/\/+$/, '') || '';
    const purchasedProductIds = new Set(purchaseHistory.map((p) => p.productId));

    let recommendations: Product[] = [];
    for (let attempt = 0; attempt < MAX_RETRIES && recommendations.length === 0; attempt++) {
      recommendations = await this.tryGetRecommendations(
        sortedCategories,
        productsServiceUrl,
        purchasedProductIds,
        attempt
      );
    }

    return recommendations.length > 0 ? recommendations : this.defaultProducts.slice(0, 3);
  }

  private async tryGetRecommendations(
    categories: string[],
    productsServiceUrl: string,
    purchasedProductIds: Set<string>,
    attempt: number
  ): Promise<Product[]> {
    try {
      if (attempt === 0) {
        const primary = await this.getPrimaryRecommendations(
          categories,
          productsServiceUrl,
          purchasedProductIds
        );
        if (primary.length > 0) return primary;
      }

      if (attempt === 1) {
        const default_ = await this.getDefaultCategoryRecommendations(
          productsServiceUrl,
          purchasedProductIds
        );
        if (default_.length > 0) return default_;
      }

      return [];
    } catch (error) {
      console.error(`Recommendation attempt ${attempt} failed:`, error);
      return [];
    }
  }

  // Count the number of purchases in each category
  private getCategoryCount(purchaseHistory: any[]): Record<string, number> {
    return purchaseHistory.reduce((acc: Record<string, number>, purchase) => {
      const category = purchase.category;
      if (category && category !== 'Unknown') {
        acc[category] = (acc[category] || 0) + purchase.quantity;
      }
      return acc;
    }, {});
  }

  private async getPrimaryRecommendations(
    categories: string[],
    productsServiceUrl: string,
    purchasedProductIds: Set<string>
  ): Promise<Product[]> {
    const cacheKey = `recommendations:categories:${categories.join(',')}`;
    try {
      const cached = await this.redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      for (const category of categories) {
        const products = await this.fetchProductsByCategory(productsServiceUrl, category);
        const recommendations = products.filter(
          (product) => !purchasedProductIds.has(product._id) && product.quantity > 0
        );

        if (recommendations.length > 0) {
          const result = await this.rankProductsByFeedback(recommendations);
          await this.redisClient
            .multi()
            .set(cacheKey, JSON.stringify(result))
            .expire(cacheKey, CACHE_TTL)
            .exec();
          return result.slice(0, 3);
        }
      }
    } catch (error) {
      console.error('Failed to get primary recommendations:', error);
    }
    return [];
  }

  private async fetchProductsByCategory(
    productsServiceUrl: string,
    category: string
  ): Promise<Product[]> {
    const cacheKey = `products:category:${category}`;
    try {
      const cached = await this.redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const response = await axios.get<ProductsByCategoryResponse>(
        `${productsServiceUrl}/category`,
        { params: { category } }
      );

      const products = response.data?.data?.products || [];
      await this.redisClient
        .multi()
        .set(cacheKey, JSON.stringify(products))
        .expire(cacheKey, CACHE_TTL)
        .exec();

      return products;
    } catch (error) {
      console.error(`Failed to fetch products for category ${category}:`, error);
      return [];
    }
  }

  private async rankProductsByFeedback(products: Product[]): Promise<Product[]> {
    const productsWithScores = await Promise.all(
      products.map(async (product) => {
        const stats = await this.getFeedbackStats(product._id);
        const score = this.calculateFeedbackScore(stats);
        return { product, score };
      })
    );

    return productsWithScores.sort((a, b) => b.score - a.score).map((item) => item.product);
  }

  private calculateFeedbackScore(stats: { positiveCount: number; negativeCount: number }): number {
    const total = stats.positiveCount + stats.negativeCount;
    if (total === 0) return 0;

    const positiveRatio = stats.positiveCount / total;
    const confidence = 1 - 1 / (1 + total);
    return positiveRatio * confidence;
  }

  // Fallback to default category if primary strategy fails
  private async getDefaultCategoryRecommendations(
    productsServiceUrl: string,
    purchasedProductIds: Set<string>
  ): Promise<Product[]> {
    try {
      const response = await axios.get<ProductsByCategoryResponse>(
        `${productsServiceUrl}/category`,
        { params: { category: this.defaultCategory } }
      );

      const products = response.data?.data?.products || [];
      return products.filter(
        (product) => !purchasedProductIds.has(product._id) && product.quantity > 0
      );
    } catch (error) {
      console.error(`Failed to fetch products from default category:`, error);
      return [];
    }
  }

  // Send default recommendations if user has no purchase history
  private async sendDefaultRecommendations(userId: string): Promise<void> {
    const productsServiceUrl = process.env.PRODUCTS_SERVICE_URL?.replace(/\/+$/, '') || '';
    try {
      const response = await axios.get<ProductsByCategoryResponse>(
        `${productsServiceUrl}/category`,
        { params: { category: this.defaultCategory } }
      );

      const products = response.data?.data?.products || [];
      const recommendations = products.filter((product) => product.quantity > 0).slice(0, 3);

      if (recommendations.length > 0) {
        await this.sendRecommendationEvent(userId, recommendations);
      }
    } catch (error) {
      console.error(`Failed to send default recommendations for user ${userId}:`, error);
    }
  }

  // Send product recommendations to the recommendation-events topic
  private async sendRecommendationEvent(userId: string, products: Product[]): Promise<void> {
    const event = {
      type: 'PRODUCT_RECOMMENDATIONS',
      userId,
      timestamp: new Date().toISOString(),
      recommendations: await Promise.all(
        products.map(async (product) => {
          const stats = await this.getFeedbackStats(product._id);
          return {
            productId: product._id,
            name: product.name,
            price: product.price,
            category: product.category,
            feedbackStats: stats,
          };
        })
      ),
    };

    await producer.send({
      topic: 'recommendation-events',
      messages: [{ key: userId, value: JSON.stringify(event) }],
    });
  }

  async processFeedback(feedback: RecommendationFeedback): Promise<void> {
    if (!this.isValidFeedback(feedback)) {
      throw new Error('Invalid feedback data');
    }

    const feedbackKey = `feedback:${feedback.productId}`;
    const userFeedbackKey = `user:${feedback.userId}:feedback`;

    try {
      await this.redisClient
        .multi()
        .hIncrBy(feedbackKey, feedback.isPositive ? 'positiveCount' : 'negativeCount', 1)
        .hSet(userFeedbackKey, feedback.productId, feedback.isPositive ? '1' : '0')
        .exec();

      // Invalidate related caches
      await this.invalidateRecommendationCaches(feedback.productId);
    } catch (error) {
      console.error(`Failed to process feedback:`, error);
      throw error;
    }
  }

  private isValidFeedback(feedback: RecommendationFeedback): boolean {
    return Boolean(
      feedback && feedback.userId && feedback.productId && typeof feedback.isPositive === 'boolean'
    );
  }

  private async invalidateRecommendationCaches(productId: string): Promise<void> {
    const product = await this.fetchProductDetails(productId);
    if (product?.category) {
      const cacheKey = `products:category:${product.category}`;
      await this.redisClient.del(cacheKey);
    }
  }

  private async fetchProductDetails(productId: string): Promise<Product | null> {
    try {
      const productsServiceUrl = process.env.PRODUCTS_SERVICE_URL?.replace(/\/+$/, '') || '';
      const response = await axios.get(`${productsServiceUrl}/id/${productId}`);
      return response.data?.data?.product || null;
    } catch (error) {
      console.error(`Failed to fetch product details for ${productId}:`, error);
      return null;
    }
  }

  private async getFeedbackStats(
    productId: string
  ): Promise<{ positiveCount: number; negativeCount: number }> {
    const feedbackKey = `feedback:${productId}`;
    const stats = await this.redisClient.hGetAll(feedbackKey);

    return {
      positiveCount: parseInt(stats.positiveCount || '0'),
      negativeCount: parseInt(stats.negativeCount || '0'),
    };
  }
}
