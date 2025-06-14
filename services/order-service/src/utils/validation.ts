import { z } from 'zod';

export const schemas = {
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
