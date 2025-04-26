import axios from 'axios';
import { RedisClientType } from 'redis';
import { Order, Product } from '../types/types';

const CACHE_TTL = 86400; // 24 hours
const BATCH_SIZE = 50;

export class OrderProcessor {
  constructor(private redisClient: RedisClientType) {}

  async processOrders(orders: Order[]): Promise<string[]> {
    const userIds = new Set<string>();
    const chunks = this.chunkArray(orders, BATCH_SIZE);

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (order) => {
          try {
            await Promise.all([
              this.updateLocalOrderData(order),
              this.updateUserPurchaseHistory(order),
            ]);
            userIds.add(order.userId);
          } catch (error) {
            console.error(`Failed to process order ${order._id}:`, error);
          }
        })
      );
    }

    return Array.from(userIds);
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private async updateLocalOrderData(order: Order) {
    const orderKey = `order:${order._id}`;
    const orderDataToStore = {
      userId: order.userId,
      orderId: order._id,
      products: order.products.map((product: Product) => ({
        productId: product._id,
        quantity: product.quantity,
        name: product.name || 'Unknown Product',
        category: product.category || 'Unknown',
        price: product.price || 0,
      })),
      date: new Date().toISOString(),
    };

    try {
      await this.redisClient
        .multi()
        .hSet(orderKey, {
          userId: orderDataToStore.userId,
          orderId: orderDataToStore.orderId,
          products: JSON.stringify(orderDataToStore.products),
          date: orderDataToStore.date,
        })
        .expire(orderKey, CACHE_TTL)
        .exec();
    } catch (error) {
      console.error(`Failed to update local order data for ${order._id}:`, error);
      throw error;
    }
  }

  private async updateUserPurchaseHistory(order: Order) {
    const userPurchaseHistoryKey = `user:${order.userId}:purchaseHistory`;
    const productsServiceUrl = process.env.PRODUCTS_SERVICE_URL || '';

    try {
      const productDetails = await Promise.all(
        order.products.map((product) => this.getProductDetails(product, productsServiceUrl))
      );

      const purchaseRecords = productDetails.map((details, index) => ({
        productId: order.products[index]._id,
        category: details.category,
        quantity: order.products[index].quantity,
        price: details.price,
        name: details.name,
        date: new Date().toISOString(),
      }));

      if (purchaseRecords.length > 0) {
        await this.redisClient
          .multi()
          // @ts-expect-error: temp fix
          .rPush(userPurchaseHistoryKey, ...purchaseRecords.map((record) => JSON.stringify(record)))
          .expire(userPurchaseHistoryKey, CACHE_TTL)
          .exec();
      }
    } catch (error) {
      console.error(`Failed to update purchase history for user ${order.userId}:`, error);
      throw error;
    }
  }

  private async getProductDetails(product: Product, productsServiceUrl: string) {
    if (product.category && product.price && product.name) {
      return {
        category: product.category,
        price: product.price,
        name: product.name,
      };
    }

    const cacheKey = `product:${product._id}:details`;
    try {
      const cached = await this.redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const response = await axios.get(`${productsServiceUrl}/id/${product._id}`);
      const productData = response.data.data.product;
      const details = {
        category: productData.category,
        price: productData.price,
        name: productData.name,
      };

      await this.redisClient
        .multi()
        .set(cacheKey, JSON.stringify(details))
        .expire(cacheKey, CACHE_TTL)
        .exec();

      return details;
    } catch (err) {
      console.error(`Failed to fetch product details for ${product._id}:`, err);
      return {
        category: 'Unknown',
        price: 0,
        name: `Product ${product._id}`,
      };
    }
  }
}
