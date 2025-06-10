import express from 'express';
import morgan from 'morgan';
import productRoutes from './routes/productRoutes';

const app = express();

// Middleware setup
app.use(express.json());
app.use(morgan('common'));

// Routes
app.use('/', productRoutes);

export default app;
