import { buildSchema } from 'graphql';

const orderTypeDefs = buildSchema(`
  type OrderProduct {
    _id: ID!
    quantity: Int!
    name: String
    category: String
    price: Float
  }

  type Order {
    _id: ID!
    userId: ID!
    products: [OrderProduct]!
  }

  input OrderProductInput {
    _id: String!
    quantity: Int!
  }

  type Query {
    fetchAllOrders: [Order]!
    fetchOrdersById(id: ID!): Order
  }

  type Mutation {
    placeOrder(products: [OrderProductInput]!): Order
  }
`);

export { orderTypeDefs };
