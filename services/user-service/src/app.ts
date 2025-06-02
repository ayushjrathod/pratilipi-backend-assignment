import express from 'express';
import morgan from 'morgan';
import userRoutes from './routes/userRoutes';

// Initialize express app
const app = express();

// Middleware setup
app.use(express.json());
app.use(morgan('common'));

// Routes
app.use('/', userRoutes);

export default app;
