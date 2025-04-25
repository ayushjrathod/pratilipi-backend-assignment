import express from 'express';
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

const validateProduct = (body: any): ProductRequestBody => {
  const { name, price, quantity, category } = body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new Error('Product name is required and must be a non-empty string');
  }
  if (typeof price !== 'number' || price <= 0) {
    throw new Error('Price must be a positive number');
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error('Quantity must be a non-negative integer');
  }
  if (!category || typeof category !== 'string' || category.trim() === '') {
    throw new Error('Category is required and must be a non-empty string');
  }

  return {
    name: name.trim(),
    price,
    quantity,
    category: category.trim(),
  };
};

// Middleware
const validateRequestBody =
  (validator: (body: any) => any) =>
  (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    try {
      req.body = validator(req.body);
      next();
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid request body' });
    }
  };

// Route handlers
const addProduct = async (req: express.Request, res: express.Response): Promise<void> => {
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

const getProductById = async (req: express.Request, res: express.Response): Promise<void> => {
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

const getAllProducts = async (_req: express.Request, res: express.Response): Promise<void> => {
  try {
    const products = await Product.find({});
    res.json({ result: products });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error occurred' });
  }
};

const getProductsByCategory = async (
  req: express.Request,
  res: express.Response
): Promise<void> => {
  try {
    const { category } = req.query;
    if (!category || typeof category !== 'string' || category.trim() === '') {
      res.status(400).json({ error: 'Category is required and must be a non-empty string' });
      return;
    }

    const products = await Product.find({ category: category.trim() });
    if (!products.length) {
      res.status(404).json({ error: `No products found in category: ${category}` });
      return;
    }

    res.status(200).json({ result: products });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error occurred' });
  }
};

// Routes
app.post('/', validateRequestBody(validateProduct), addProduct);
app.get('/id/:id', getProductById);
app.get('/', getAllProducts);
app.get('/category', getProductsByCategory);

export default app;
