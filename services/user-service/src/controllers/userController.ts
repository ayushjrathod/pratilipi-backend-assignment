import bcrypt from 'bcryptjs';
import express from 'express';
import { producer } from '../kafka/kafka';
import { signJWT } from '../middleware/auth';
import { User } from '../models/user';

// Route handlers
export const userController = {
  // Get all users
  getAllUsers: async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const users = await User.find({});
      res.status(200).json({ result: users });
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
      res.status(200).json({ result: user });
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
      await producer.send({
        topic: 'user-events',
        messages: [
          {
            value: JSON.stringify({
              userId: newUser.id,
              email: newUser.email,
              eventType: 'user-signup',
              details: {
                timestamp: new Date().toISOString(),
                loginMethod: 'email',
              },
            }),
          },
        ],
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
      res.json({
        result: {
          user: {
            _id: user.id,
            name: user.name,
            email: user.email,
            preferences: user.preferences,
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
      res.status(200).json({ result: updatedUser });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unexpected error occurred';
      res.status(500).json({ error: errorMessage });
    }
  },
};
