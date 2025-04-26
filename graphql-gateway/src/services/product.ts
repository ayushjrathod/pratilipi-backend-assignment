import Axios from 'axios';
import { verify } from 'jsonwebtoken';
import { axios } from '../infrastructure/http';
import { cacheClient } from '../infrastructure/redis';
import { Context } from '../types/types';

interface Product {
  _id: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
}

interface CreateProductInput {
  name: string;
  price: number;
  quantity: number;
  category: string;
}

interface ServiceResponse<T> {
  result: T;
}

const productClient = Axios.create({
  ...axios.defaults,
  baseURL: process.env['PRODUCTS_SERVICE_URL'],
});

class ProductServiceError extends Error {
  constructor(
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'ProductServiceError';
  }
}

const ProductService = {
  async fetchAllProducts(): Promise<Product[]> {
    try {
      const cacheKey = 'products/';
      const cached = await cacheClient.get(cacheKey);

      if (cached) {
        console.log(`${cacheKey} cache hit`);
        return JSON.parse(cached);
      }

      const {
        data: { result },
      } = await productClient.get<ServiceResponse<Product[]>>('/');
      await cacheClient.set(cacheKey, JSON.stringify(result));
      return result;
    } catch (error) {
      console.error('Error fetching all products:', error);
      throw new ProductServiceError(
        'Unable to fetch products.',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  },

  async fetchProductById({ id }: { id: string }): Promise<Product> {
    try {
      const {
        data: { result },
      } = await productClient.get<ServiceResponse<Product>>(`/id/${id}`);
      return result;
    } catch (error) {
      console.error(`Error fetching product with ID ${id}:`, error);
      throw new ProductServiceError(
        `Unable to fetch product with ID: ${id}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  },

  async addProduct({ input }: { input: CreateProductInput }, context: Context): Promise<Product> {
    try {
      const authorization = context.headers['authorization'];
      if (!authorization) {
        throw new ProductServiceError('Authorization header is missing.');
      }

      const token = authorization.split('Bearer ')[1];
      if (!token) {
        throw new ProductServiceError('Invalid authorization token.');
      }

      const secret = process.env.API_SECRET;
      if (!secret) {
        throw new ProductServiceError('API secret is missing.');
      }

      const { userId } = verify(token, secret) as { userId: string };
      const {
        data: { result },
      } = await productClient.post<ServiceResponse<Product>>('/', input, {
        headers: { 'x-user-id': userId },
      });

      if (!result) {
        throw new ProductServiceError("Unexpected response structure: Missing 'result'");
      }

      return result;
    } catch (error) {
      console.error('Error adding product:', error);
      if (error instanceof ProductServiceError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new ProductServiceError(error.message, error);
      }

      if (typeof error === 'object' && error !== null && 'response' in error) {
        const axiosError = error as { response?: { data?: { message?: string } } };
        throw new ProductServiceError(
          axiosError.response?.data?.message || 'Unable to add product.',
          new Error(JSON.stringify(error))
        );
      }

      throw new ProductServiceError('Unable to add product.', new Error(String(error)));
    }
  },
} as const;

export { CreateProductInput, Product, ProductService, ProductServiceError };
