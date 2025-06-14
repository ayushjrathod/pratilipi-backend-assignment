import axios from 'axios';
import { producer } from '../kafka/kafka';
import { createError } from '../utils/errorHandler';

interface OrderProductInput {
  _id: string;
  quantity: number;
}

interface Product {
  _id: string;
  name: string;
  category: string;
  price: number;
  quantity: number;
}

export const orderService = {
  async validateUser(userId: string) {
    return axios.get(`${process.env.USERS_SERVICE_URL}/${userId}`);
  },

  async processProduct({ _id, quantity }: OrderProductInput) {
    const response = await axios.get<{ result: Product }>(
      `${process.env.PRODUCTS_SERVICE_URL}/id/${_id}`
    );
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
