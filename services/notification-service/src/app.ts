import express from 'express';
import morgan from 'morgan';
import notificationRoutes from './routes/notificationRoutes';

// Initialize express app
const app = express();

// Middleware
app.use(express.json());
app.use(morgan('common'));

// Routes
app.use('/', notificationRoutes);

export default app;
