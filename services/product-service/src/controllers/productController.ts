import { Request, Response } from 'express';
import { producer } from '../kafka/kafka';
import { Product } from '../models/product';

// Route handlers
export const addProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const product = await Product.create(req.body);
    await producer.send({
      topic: 'inventory-events',
      messages: [{ value: JSON.stringify({ type: 'product-added', payload: product }) }],
    });
    res.status(201).json({ result: product });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add product' });
  }
};

export const getProductById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    res.status(200).json({ result: product });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error occurred' });
  }
};

export const getAllProducts = async (_req: Request, res: Response): Promise<void> => {
  try {
    const products = await Product.find({});
    res.status(200).json({ result: products });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error occurred' });
  }
};

export const getProductsByCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category } = req.query;
    if (!category || typeof category !== 'string' || category.trim() === '') {
      res.status(400).json({ error: 'Category is required and must be a non-empty string' });
      return;
    }

    const products = await Product.find({ category: category.trim() });
    res.status(200).json({ data: { products } });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error occurred' });
  }
};

export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Only allow updating quantity for now, in future we can expand this
    // to allow other fields like name, price, etc.
    if ('quantity' in req.body && typeof req.body.quantity === 'number') {
      product.quantity = req.body.quantity;
      await product.save();

      await producer.send({
        topic: 'inventory-events',
        messages: [{ value: JSON.stringify({ type: 'product-updated', payload: product }) }],
      });

      res.status(200).json({ result: product });
    } else {
      res.status(400).json({ error: 'Only quantity updates are supported' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error occurred' });
  }
};
