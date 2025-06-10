import { NextFunction, Request, Response } from 'express';
import { ProductRequestBody } from '../types/types';

// Validation utilities
const validateProduct = (body: Record<string, unknown>): ProductRequestBody => {
  const { name, price, quantity, category } = body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new Error('Product name is required and must be a non-empty string');
  }
  if (typeof price !== 'number' || price <= 0) {
    throw new Error('Price must be a positive number');
  }
  const quantityNum = Number(quantity);
  if (!Number.isInteger(quantityNum) || quantityNum < 0) {
    throw new Error('Quantity must be a non-negative integer');
  }
  if (!category || typeof category !== 'string' || category.trim() === '') {
    throw new Error('Category is required and must be a non-empty string');
  }

  return {
    name: name.trim(),
    price,
    quantity: quantityNum,
    category: category.trim(),
  };
};

// Middleware
export const validateRequestBody =
  (validator: (body: Record<string, unknown>) => ProductRequestBody) =>
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = validator(req.body);
      next();
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid request body' });
    }
  };

// Export validation function
export { validateProduct };
