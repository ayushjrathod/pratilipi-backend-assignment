import express, { NextFunction, Request, Response } from 'express';
import morgan from 'morgan';
import { producer } from './kafka/kafka';
import { Product } from './models/product';

const app = express();

// Middleware setup
app.use(express.json());
app.use(morgan('common'));

// Types
interface ProductRequestBody {
  name: string;
  price: number;
  quantity: number;
  category: string;
}

// Validation utilities
const isValidObjectId = (id: string): boolean => /^[a-fA-F0-9]{24}$/.test(id);

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
const validateRequestBody =
  (validator: (body: Record<string, unknown>) => ProductRequestBody) =>
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = validator(req.body);
      next();
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid request body' });
    }
  };

// Route handlers
const addProduct = async (req: Request, res: Response): Promise<void> => {
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

const getProductById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }

    const product = await Product.findById(id);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    res.json({ result: product });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error occurred' });
  }
};

const getAllProducts = async (_req: Request, res: Response): Promise<void> => {
  try {
    const products = await Product.find({});
    res.json({ result: products });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error occurred' });
  }
};

const getProductsByCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category } = req.query;
    if (!category || typeof category !== 'string' || category.trim() === '') {
      res.status(400).json({ error: 'Category is required and must be a non-empty string' });
      return;
    }

    const products = await Product.find({ category: category.trim() });
    res.status(200).json({ data: { products } }); // Changed to match expected response structure
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error occurred' });
  }
};

const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }

    const product = await Product.findById(id);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Only allow updating quantity for now
    if ('quantity' in req.body && typeof req.body.quantity === 'number') {
      product.quantity = req.body.quantity;
      await product.save();

      await producer.send({
        topic: 'inventory-events',
        messages: [{ value: JSON.stringify({ type: 'product-updated', payload: product }) }],
      });

      res.json({ result: product });
    } else {
      res.status(400).json({ error: 'Only quantity updates are supported' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error occurred' });
  }
};

// Routes
app.post('/', validateRequestBody(validateProduct), addProduct);
app.get('/id/:id', getProductById);
app.get('/', getAllProducts);
app.get('/category', getProductsByCategory);
app.patch('/:id', updateProduct);

export default app;
