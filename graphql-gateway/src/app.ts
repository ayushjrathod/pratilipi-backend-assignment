import { makeExecutableSchema } from '@graphql-tools/schema';
import express from 'express';
import { createHandler } from 'graphql-http/lib/use/express';

import { OrderService } from './services/order';
import { ProductService } from './services/product';
import { UserService } from './services/user';

import { orderTypeDefs } from './schema/order';
import { productTypeDefs } from './schema/product';
import { userTypeDefs } from './schema/user';

// Define resolvers
const resolvers = {
  // User resolvers
  fetchAllUsers: UserService.getAll,
  fetchUserById: UserService.getById,
  signin: UserService.signin,
  signup: UserService.signup,
  updateUserPreferences: UserService.updatePreferences,

  // Product resolvers
  fetchAllProducts: ProductService.fetchAllProducts,
  fetchProductById: ProductService.fetchProductById,
  addProduct: ProductService.addProduct,

  // Order resolvers
  fetchAllOrders: OrderService.getAll,
  fetchOrdersById: OrderService.getById,
  placeOrder: OrderService.post,
};

// Create GraphQL schema
const schema = makeExecutableSchema({
  typeDefs: [userTypeDefs, orderTypeDefs, productTypeDefs],
});

const app = express();

// Setup GraphQL endpoint
app.all(
  '/graphql',
  createHandler({
    schema,
    rootValue: resolvers,
    context: (req: { headers: any }) => ({
      headers: req.headers,
    }),
  })
);

export default app;
