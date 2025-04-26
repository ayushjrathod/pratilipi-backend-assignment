import { buildSchema } from 'graphql';

const userTypeDefs = buildSchema(`
    type User {
        _id: ID!
        email: String!
        name: String!
        preferences: UserPreferences!
        createdAt: String!
        updatedAt: String!
    }

    type UserPreferences {
        promotions: Boolean!
        orderUpdates: Boolean!
        recommendations: Boolean!
    }

    input CreateUserInput {
        email: String!
        name: String!
        password: String!
        preferences: UserPreferencesInput
    }

    type SignupResult {
        access_token: String!
        user: User!
    }

    input SigninInput {
        email: String!
        password: String!
    }

    type SigninResult {
        access_token: String!
        user: User!
    }

    input UserPreferencesInput {
        promotions: Boolean
        orderUpdates: Boolean
        recommendations: Boolean
    }

    input UpdateUserPreferencesInput {
        promotions: Boolean
        orderUpdates: Boolean
        recommendations: Boolean
    }

    type Query {
        users: [User]
        user(_id: ID!): User
    }

    type Mutation {
        signup(input: CreateUserInput!): SignupResult!
        signin(input: SigninInput!): SigninResult!
        updateUserPreferences(id: ID!, preferences: UpdateUserPreferencesInput!): User!
    }
`);

export { userTypeDefs };
