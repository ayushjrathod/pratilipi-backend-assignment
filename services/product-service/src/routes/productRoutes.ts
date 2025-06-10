import { Router } from 'express';
import {
  addProduct,
  getAllProducts,
  getProductById,
  getProductsByCategory,
  updateProduct,
} from '../controllers/productController';
import { validateProduct, validateRequestBody } from '../middleware/validation';

const router = Router();

// Routes
router.post('/', validateRequestBody(validateProduct), addProduct);
router.get('/id/:id', getProductById);
router.get('/', getAllProducts);
router.get('/category', getProductsByCategory);
router.patch('/:id', updateProduct);

export default router;
