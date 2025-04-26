# GraphQL Gateway

The **GraphQL Gateway** serves as the single entry point for clients interacting with the backend microservices (User, Product, Order). It aggregates data from these services, provides a unified GraphQL API, handles authentication, and implements caching strategies using Redis.

## Core Capabilities

### **GraphQL API Integration**

- **Schema Federation**: Aggregates schemas and resolvers for User, Product, and Order domains into a single federated interface.
- **Unified Endpoint**: Exposes a single GraphQL endpoint (`http://localhost:4000/graphql` by default) for all client interactions.
- **Precision Queries**: Enables clients to retrieve precisely required data, minimizing over-fetching and network overhead.

### **Microservice Orchestration**

- **REST-to-GraphQL Bridging**: Leverages Axios (`infrastructure/http.ts`) to route requests to corresponding microservices via environment-configured URLs.
- **Event-Driven Architecture**: Kafka integration (`infrastructure/kafka.ts`) for real-time cache invalidation and event processing, with primary event handling delegated to backend services.

### **Performance Optimization**

- **Redis Caching Layer**: Implements Redis (`infrastructure/redis.ts`) to cache frequent query results, reducing latency and backend load.
- **Adaptive Caching Policies**: Configurable middleware for automatic query caching using directive-based or rule-driven strategies.

### **Security Framework**

- **JWT Authentication**: Validates incoming requests via JWT tokens in headers using dedicated middleware (`middleware/auth-middleware.ts`), ensuring authorization prior to downstream service routing.

### **Observability and Monitoring**

- Exposes **Prometheus-compatible metrics** at `/metrics` on a dedicated port (default: 9200) for monitoring API usage, performance, and system health.

---

## Architecture

```
graphql-gateway/
├── src/
│   ├── app.ts              # Express server setup, middleware (including Apollo Server)
│   ├── index.ts            # Gateway entry point, starts the server
│   ├── infrastructure/     # Cross-cutting concerns
│   │   ├── http.ts         # Axios setup for calling microservices
│   │   ├── kafka.ts        # Kafka producer/consumer setup (if used)
│   │   └── redis.ts        # Redis client setup for caching
│   ├── schema/             # GraphQL schema definitions and resolvers
│   │   ├── user.ts         # User type definitions and resolvers
│   │   ├── product.ts      # Product type definitions and resolvers
│   │   ├── order.ts        # Order type definitions and resolvers
│   │   └── index.ts        # Merges schemas and resolvers
│   ├── services/           # Logic to interact with downstream microservices
│   │   ├── user.ts         # Functions calling the User service API
│   │   ├── product.ts      # Functions calling the Product service API
│   │   └── order.ts        # Functions calling the Order service API
│   ├── types/              # TypeScript types
│   │   └── types.ts
│   └── middleware/         # Express/Apollo middleware (e.g., auth, caching)
├── package.json            # Project dependencies
├── tsconfig.json           # TypeScript configuration
├── Dockerfile              # Containerized deployment configuration
└── README.md               # This file
```

---

## API Endpoint

- **GraphQL Endpoint**: `http://localhost:4000/graphql`
  - Accepts POST requests with GraphQL queries/mutations.
  - Supports GraphQL Playground/introspection for schema exploration.
- **Metrics Endpoint**: `http://localhost:9200/metrics`
  - Exposes Prometheus metrics.

---

## Environment Variables

- `GATEWAY_PORT`: Port for the GraphQL server (default: `4000`)
- `METRICS_PORT`: Port for the Prometheus metrics endpoint (default: `9200`)
- `USERS_SERVICE_URL`: Base URL for the User Service.
- `PRODUCTS_SERVICE_URL`: Base URL for the Product Service.
- `ORDERS_SERVICE_URL`: Base URL for the Order Service.
- `REDIS_URL`: Connection URL for the Redis instance (for caching).
- `KAFKA_BROKERS`: Comma-separated list of Kafka broker addresses (if Kafka integration is used).
- `JWT_SECRET`: Secret key for validating JWT tokens (must match the one used by User Service).

---

## Running the Gateway Locally

Ensure that dependent services (User, Product, Order, Redis, potentially Kafka) are running and accessible at the URLs specified in the environment variables.

1.  **Install dependencies:**
    ```bash
    cd graphql-gateway
    npm install
    ```

2.  **Start the service:**
    ```bash
    npm start
    ```
    Or for development with auto-reload:
    ```bash
    npm run dev
    ```

The GraphQL Gateway will be accessible at `http://localhost:4000/graphql` (or the port specified in `GATEWAY_PORT`).
The metrics endpoint will be accessible at `http://localhost:9200` (or the port specified in `METRICS_PORT`).

### Using Docker Compose

Use the main `docker-compose.yml` in the project root:

```bash
# From the project root directory
docker-compose up graphql-gateway
```

This will build and run the gateway along with its dependencies as defined in the compose file.
