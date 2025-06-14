import express from 'express';
import { z } from 'zod';
import { userController } from '../controllers/userController';

const router = express.Router();

// Validation schemas
const schemas = {
  signup: z.object({
    name: z.string().min(1, 'Name is required').trim(),
    email: z.string().email('Invalid Email Format'),
    password: z.string().min(6, 'Password must be at least 6 characters long'),
  }),
  userId: z.object({
    id: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid user ID'),
  }),
  signin: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters long'),
  }),
};

// Request validation middleware
const validate = {
  body:
    (schema: z.ZodSchema) =>
    (req: express.Request, res: express.Response, next: express.NextFunction): void => {
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
  params:
    (schema: z.ZodSchema) =>
    (req: express.Request, res: express.Response, next: express.NextFunction): void => {
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

// Routes
router.get('/', userController.getAllUsers);
router.get('/:id', validate.params(schemas.userId), userController.getUserById);
router.post('/', validate.body(schemas.signup), userController.signup);
router.post('/login', validate.body(schemas.signin), userController.signin);
router.put('/:id/preferences', validate.params(schemas.userId), userController.updatePreferences);

export default router;
