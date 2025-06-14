import express from 'express';
import morgan from 'morgan';
import orderRoutes from './routes/orderRoutes';

// Express app setup
const app = express();
app.use(express.json());
app.use(morgan('common'));

app.use('/', orderRoutes); // Assuming you want to prefix order routes with /orders

export default app;
