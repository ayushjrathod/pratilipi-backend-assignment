import { buildSchema } from 'graphql';

const productTypeDefs = buildSchema(`
  type Product {
    _id: ID!
    name: String!
    price: Float!
    quantity: Int!
    category: String!
  } 

  input CreateProductInput {
    name: String!
    price: Float!
    quantity: Int!
    category: String!
  }

  type Query {
    fetchAllProducts: [Product]
    fetchProductById(id: ID!): Product
  }

  type Mutation {
    addProduct(input: CreateProductInput): Product
  }
`);

export { productTypeDefs };
