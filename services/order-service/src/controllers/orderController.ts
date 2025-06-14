import { Request, Response } from 'express';
import { Order } from '../models/order';
import { orderService } from '../services/orderService';
import { createError } from '../utils/errorHandler';

export const createOrder = async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      throw createError(401, 'UNAUTHORIZED', 'User authentication required');
    }

    await orderService.validateUser(userId).catch(() => {
      throw createError(401, 'INVALID_USER', 'User not found or invalid');
    });

    const enrichedProducts = await Promise.all(req.body.products.map(orderService.processProduct));

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
};

export const getOrderById = async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      throw createError(404, 'ORDER_NOT_FOUND', 'Order not found');
    }
    res.status(200).json({ result: order });
  } catch (error: any) {
    res.status(error.status || 500).json({
      code: error.code || 'FETCH_ORDER_FAILED',
      message: error.message || 'Unexpected error occurred',
      details: error.details || {},
    });
  }
};

export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const orders = await Order.find({});
    res.status(200).json({ result: orders });
  } catch (error: any) {
    res.status(500).json({
      code: 'FETCH_ORDERS_FAILED',
      message: error.message || 'Unexpected error occurred',
    });
  }
};
