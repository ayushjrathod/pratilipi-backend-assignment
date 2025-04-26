import type { AxiosError, AxiosInstance } from 'axios';
import axios from 'axios';
import { verify } from 'jsonwebtoken';

import { axios as httpClient } from '../infrastructure/http';
import { Context } from '../types/types';

const client: AxiosInstance = axios.create({
  ...httpClient.defaults,
  baseURL: process.env['ORDERS_SERVICE_URL'],
});

interface OrderProductInput {
  _id: string;
  quantity: number;
}

interface Order {
  _id: string;
  userId: string;
  products: Array<{
    _id: string;
    quantity: number;
    name?: string;
    category?: string;
    price?: number;
  }>;
}

class OrderServiceError extends Error {
  constructor(
    message: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'OrderServiceError';
    console.error(`${this.name}: ${message}`, originalError);
  }
}

const OrderService = {
  async getAll() {
    try {
      const response = await client.get<{ result: Order[] }>('/');
      return response.data.result.map((order) => ({
        ...order,
        products: order.products.map((product) => ({
          ...product,
          name: product.name || `Product ${product._id}`,
        })),
      }));
    } catch (error) {
      throw new OrderServiceError('Unable to fetch orders', error);
    }
  },

  async getById({ id }: { id: string }) {
    try {
      const response = await client.get<{ result: Order }>(`/${id}`);

      return {
        ...response.data.result,
        products: response.data.result.products.map((product) => ({
          ...product,
          name: product.name || `Product ${product._id}`,
        })),
      };
    } catch (error) {
      throw new OrderServiceError(`Unable to fetch order with ID: ${id}`, error);
    }
  },

  async post({ products }: { products: OrderProductInput[] }, context: Context) {
    try {
      const authorization = context.headers['authorization'];
      if (!authorization) throw new OrderServiceError('Authorization header is missing');

      const token = authorization.split('Bearer ')[1];
      if (!token) throw new OrderServiceError('Invalid authorization token');

      const secret = process.env.API_SECRET;
      if (!secret) throw new OrderServiceError('API secret is missing');

      const payload = verify(token, secret) as { userId: string };
      const userId = payload.userId;

      const response = await client.post<{ result: Order }>(
        '/',
        { products },
        { headers: { 'x-user-id': userId } }
      );

      if (!response.data?.result) {
        throw new OrderServiceError('Invalid response structure: Missing result');
      }

      return response.data.result;
    } catch (error: unknown) {
      if (error instanceof OrderServiceError) {
        throw error;
      }
      const axiosError = error as AxiosError<{ message: string }>;
      if (axiosError.response?.data?.message) {
        throw new OrderServiceError(axiosError.response.data.message, error);
      }
      throw new OrderServiceError('Unable to create order', error);
    }
  },

  async update({ id, input }: { id: string; input: Partial<Order> }) {
    try {
      const response = await client.put<{ result: Order }>(`/${id}`, input);
      return response.data.result;
    } catch (error) {
      throw new OrderServiceError(`Unable to update order with ID: ${id}`, error);
    }
  },
} as const;

export { Order, OrderProductInput, OrderService, OrderServiceError };
