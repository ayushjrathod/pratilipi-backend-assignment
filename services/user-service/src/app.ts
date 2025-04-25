import bcrypt from 'bcryptjs';
import express from 'express';
import morgan from 'morgan';
import { z } from 'zod';
import { producer } from './kafka/kafka';
import { signJWT } from './middleware/auth';
import { User } from './models/user';

// Initialize express app
const app = express();

// Middleware setup
app.use(express.json());
app.use(morgan('common'));

// Validation schemas
const schemas = {
  signup: z.object({
    name: z.string().min(1, 'Name is required').trim(),
    email: z.string().min(6, 'Email must be at least 6 characters long'),
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

// Route handlers
const handlers = {
  // Get all users
  getAllUsers: async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const users = await User.find({});
      res.json({ result: users });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unexpected error occurred';
      res.status(500).json({ error: errorMessage });
    }
  },

  // Get user by ID
  getUserById: async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { id } = req.params;
      const user = await User.findById(id);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json({ result: user });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unexpected error occurred';
      res.status(500).json({ error: errorMessage });
    }
  },

  // Sign up new user
  signup: async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { name, email, password, preferences } = req.body;
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        res.status(400).json({ error: 'Email already exists' });
        return;
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await User.create({
        name,
        email,
        password: hashedPassword,
        preferences: {
          promotions: preferences?.promotions ?? true,
          orderUpdates: preferences?.orderUpdates ?? true,
          recommendations: preferences?.recommendations ?? true,
        },
      });

      const token = signJWT(newUser.id);
      res.status(201).json({
        result: {
          user: newUser,
          access_token: token,
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unexpected error occurred';
      res.status(500).json({ error: errorMessage });
    }
  },

  // Sign in user
  signin: async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const token = signJWT(user.id);
      await producer.send({
        topic: 'user-events',
        messages: [
          {
            value: JSON.stringify({
              userId: user.id,
              email: user.email,
              eventType: 'user-login',
              details: {
                timestamp: new Date().toISOString(),
                loginMethod: 'email',
              },
            }),
          },
        ],
      });

      res.json({
        result: {
          user: {
            _id: user.id,
            name: user.name,
            email: user.email,
            preferences: user.preferences,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
          access_token: token,
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unexpected error occurred';
      res.status(500).json({ error: errorMessage });
    }
  },

  // Update user preferences
  updatePreferences: async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { id } = req.params;
      const preferences = req.body;
      const updatedUser = await User.findByIdAndUpdate(
        id,
        { $set: { preferences } },
        { new: true }
      );

      if (!updatedUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json({ result: updatedUser });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unexpected error occurred';
      res.status(500).json({ error: errorMessage });
    }
  },
};

// Routes
app.get('/', handlers.getAllUsers);
app.get('/:id', validate.params(schemas.userId), handlers.getUserById);
app.post('/', validate.body(schemas.signup), handlers.signup);
app.post('/login', validate.body(schemas.signin), handlers.signin);
app.put('/:id/preferences', validate.params(schemas.userId), handlers.updatePreferences);

export default app;
