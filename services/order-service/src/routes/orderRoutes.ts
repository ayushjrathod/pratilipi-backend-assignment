import express from 'express';
import { createOrder, getAllOrders, getOrderById } from '../controllers/orderController';
import { middleware } from '../utils/middleware';
import { schemas } from '../utils/validation';

const router = express.Router();

router.post('/', middleware.validateBody(schemas.orderCreation), createOrder);
router.get('/:id', middleware.validateParams(schemas.orderIdParam), getOrderById);
router.get('/', getAllOrders);

export default router;
