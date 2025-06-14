import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

export const middleware = {
  validateBody: (schema: z.ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
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
  validateParams: (schema: z.ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
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
