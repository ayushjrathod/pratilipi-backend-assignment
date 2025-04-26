import axios from 'axios';
import express, { NextFunction, Request, Response } from 'express';
import morgan from 'morgan';
import { z } from 'zod';
import { producer } from './kafka/kafka';
import { Order } from './models/order';

// Schema definitions
const schemas = {
  orderCreation: z.object({
    products: z.array(
      z.object({
        _id: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid product ID'),
        quantity: z.number().min(1, 'Quantity must be at least 1'),
      })
    ),
  }),
  orderIdParam: z.object({
    id: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid order ID'),
  }),
};

// Types
interface OrderProductInput {
  _id: string;
  quantity: number;
}

// Error factory
type ErrorDetails = Record<string, unknown>;

const createError = (status: number, code: string, message: string, details?: ErrorDetails) => ({
  status,
  code,
  message,
  details,
});

// Middleware
const middleware = {
  validateBody: (schema: z.ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.errors });
      } else {
        res.status(400).json({ error: 'Invalid request body' });
      }
    }
  },
  validateParams: (schema: z.ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.errors });
      } else {
        res.status(400).json({ error: 'Invalid request parameters' });
      }
    }
  },
};

// Service functions
const orderService = {
  async validateUser(userId: string) {
    return axios.get(`${process.env.USERS_SERVICE_URL}/${userId}`);
  },

  async processProduct({ _id, quantity }: OrderProductInput) {
    const response = await axios.get(`${process.env.PRODUCTS_SERVICE_URL}/id/${_id}`);
    const product = response.data.result;

    if (!product || !product.name || !product.category || !product.price) {
      throw createError(400, 'PRODUCT_DATA_INCOMPLETE', `Product ${_id} has missing details`, {
        productId: _id,
        receivedData: product,
      });
    }

    if (product.quantity < quantity) {
      throw createError(400, 'INSUFFICIENT_QUANTITY', `Insufficient quantity for product ${_id}`, {
        productId: _id,
        requested: quantity,
        available: product.quantity,
      });
    }

    await axios.patch(`${process.env.PRODUCTS_SERVICE_URL}/${_id}`, {
      quantity: product.quantity - quantity,
    });

    return {
      _id: product._id,
      quantity,
      name: product.name,
      category: product.category,
      price: product.price,
    };
  },

  async emitOrderEvent(order: any, products: any[]) {
    await producer.send({
      topic: 'order-events',
      messages: [
        {
          value: JSON.stringify({
            userId: order.userId,
            orderId: order._id,
            eventType: 'order-placed',
            products,
          }),
        },
      ],
    });
  },
};

// Express app setup
const app = express();
app.use(express.json());
app.use(morgan('common'));

// Route handlers
app.post(
  '/',
  middleware.validateBody(schemas.orderCreation),
  async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        throw createError(401, 'UNAUTHORIZED', 'User authentication required');
      }

      await orderService.validateUser(userId).catch(() => {
        throw createError(401, 'INVALID_USER', 'User not found or invalid');
      });

      const enrichedProducts = await Promise.all(
        req.body.products.map(orderService.processProduct)
      );

      const order = await Order.create({
        products: enrichedProducts,
        userId,
      });

      await orderService.emitOrderEvent(order, enrichedProducts);

      res.status(201).json({ result: order });
    } catch (error: any) {
      console.error('Order creation failed:', error);
      res.status(error.status || 500).json({
        code: error.code || 'ORDER_CREATION_FAILED',
        message: error.message || 'Unexpected error occurred',
        details: error.details || {},
      });
    }
  }
);

app.get('/:id', middleware.validateParams(schemas.orderIdParam), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      throw createError(404, 'ORDER_NOT_FOUND', 'Order not found');
    }
    res.json({ result: order });
  } catch (error: any) {
    res.status(error.status || 500).json({
      code: error.code || 'FETCH_ORDER_FAILED',
      message: error.message || 'Unexpected error occurred',
      details: error.details || {},
    });
  }
});

app.get('/', async (req, res) => {
  try {
    const orders = await Order.find({});
    res.json({ result: orders });
  } catch (error: any) {
    res.status(500).json({
      code: 'FETCH_ORDERS_FAILED',
      message: error.message || 'Unexpected error occurred',
    });
  }
});

export default app;
