# Order Service Documentation

The **Order Service** manages the lifecycle of customer orders, including creation, retrieval, and status updates. It leverages REST APIs for synchronous communication and Kafka for event-driven interactions with other services.

---

## Key Features

### Core Functionality
- **Order Management**:  
  - Create orders with validation of user and product data.
  - Retrieve order lists and individual order details.
  - Validate input using Zod schemas for requests and parameters.

### Service Integration
- **External Service Validation**:  
  - Validates user existence via the User Service and product details via the Product Service (direct HTTP or GraphQL Gateway).
- **Event-Driven Architecture**:  
  - Publishes `order-events` (e.g., `order-placed`) to Kafka for downstream processing (e.g., inventory updates, notifications).
- **Caching**:  
  - Implements Redis for caching order data (primary caching may reside in the Gateway or consumer services).

### Observability
- **Metrics**:  
  - Exposes Prometheus-compatible metrics at the `/metrics` endpoint (default port: `9202`).

---

## API Reference

**Base URL**: `http://localhost:8002`  

### Endpoints

#### 1. List All Orders
- **Method**: `GET /`
- **Description**: Fetch a paginated list of all orders.
- **Authentication**: Required (JWT token).
- **Response**:
  - **Status**: `200 OK`
  ```json
  [
    {
      "_id": "order_id_1",
      "userId": "user_id_1",
      "products": [
        {
          "_id": "product_id_1",
          "quantity": 2,
          "name": "Product One",
          "price": 29.99,
          "category": "Electronics"
        }
      ],
      "status": "Pending",
      "createdAt": "2025-01-29T00:00:00Z",
      "updatedAt": "2025-01-29T00:00:00Z"
    }
  ]
  ```

#### 2. Retrieve Order by ID
- **Method**: `GET /:id`
- **Description**: Fetch details of a specific order.
- **Path Parameters**:
  - `id` (string): Order identifier.
- **Authentication**: Required.
- **Response**:
  - **Status**: `200 OK`
  ```json
  {
    "_id": "order_id_1",
    "userId": "user_id_1",
    "products": [/* ... */],
    "status": "Pending",
    "createdAt": "2025-01-29T00:00:00Z",
    "updatedAt": "2025-01-29T00:00:00Z"
  }
  ```
- **Errors**:
  - `404 Not Found`: Order not found.

#### 3. Create Order
- **Method**: `POST /`
- **Description**: Create a new order and emit a Kafka event.
- **Authentication**: Required.
- **Request Body**:
  ```json
  {
    "userId": "user_id_1",
    "products": [
      { "_id": "product_id_1", "quantity": 2 }
    ]
  }
  ```
- **Response**:
  - **Status**: `201 Created`
  ```json
  {
    "_id": "new_order_id",
    "userId": "user_id_1",
    "products": [/* ... */],
    "status": "Pending",
    "createdAt": "2025-04-26T11:00:00Z",
    "updatedAt": "2025-04-26T11:00:00Z"
  }
  ```
- **Errors**:
  - `400 Bad Request`: Invalid input or insufficient stock.
  - `404 Not Found`: User or product not found.

---

## System Architecture

### Directory Structure
```
order-service/
├── src/
│   ├── app.ts          # Express configuration and routes
│   ├── index.ts        # Entry point with service initialization
│   ├── kafka/
│   │   └── kafka.ts    # Kafka producer setup
│   ├── models/
│   │   └── order.ts    # MongoDB schema and model
├── package.json        # Dependencies and scripts
├── Dockerfile          # Containerization setup
└── .env.example        # Environment variable template
```

---

## Configuration

### Environment Variables
| Variable               | Description                              | Default   |
|------------------------|------------------------------------------|-----------|
| `ORDERS_SERVICE_PORT`  | Port for the Order Service API           | `8002`    |
| `METRICS_PORT`         | Port for Prometheus metrics endpoint     | `9202`    |
| `MONGO_URI`            | MongoDB connection string                | -         |
| `KAFKA_BROKERS`        | Kafka broker addresses (comma-separated) | -         |
| `USERS_SERVICE_URL`    | User Service base URL for validation     | -         |
| `PRODUCTS_SERVICE_URL` | Product Service base URL for validation  | -         |

---

## Local Deployment

### Prerequisites
- MongoDB, Kafka, User Service, and Product Service running.

### Steps
1. **Install Dependencies**:
   ```bash
   cd services/order-service
   npm install
   ```

3. **Start the Service**:
   ```bash
   npm start      # Production mode
   npm run dev        # Development mode (with hot-reload)
   ```
4. **Access Endpoints**:
   - API: `http://localhost:8002`
   - Metrics: `http://localhost:9202/metrics`

### Docker Deployment
Deploy using the project's root `docker-compose.yml`:
```bash
docker-compose up order-service
```

---
