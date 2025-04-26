# User Service Documentation

## Overview  
The **User Service** manages user lifecycle operations, including registration, authentication, and preference management. It provides secure RESTful APIs with JWT-based authentication and integrates with distributed systems via Kafka for real-time event propagation.  

---

## Key Features  

### Core Capabilities  
- **User Registration**: Securely creates user accounts with bcrypt password hashing.  
- **Authentication**: Generates JWT tokens upon successful login for subsequent API authorization.  
- **User Management**: Retrieves user lists, individual profiles, and handles notification preferences.  

### Service Integration  
- **RESTful APIs**: Interfaces with the GraphQL Gateway and other services via standardized endpoints.  
- **Event-Driven Architecture**: Publishes `user-events` to Kafka topics for cross-service synchronization (e.g., login events).  

### Security  
- **JWT Authorization**: Protects sensitive endpoints using middleware token validation.  
- **Password Encryption**: Employs bcrypt for irreversible password hashing.  

### Monitoring  
- **Prometheus Metrics**: Exposes service health, performance, and usage statistics at `/metrics` (default port: 9201).  

---

## API Reference  
**Base URL**: `http://localhost:8001`  

### Retrieve All Users  
- **Endpoint**: `GET /`  
- **Authentication**: Valid JWT  
- **Success Response**:  
  ```http
  HTTP/1.1 200 OK
  Content-Type: application/json
  [
    {
      "_id": "user_id_1",
      "email": "user1@example.com",
      "name": "User One",
      "preferences": { "promotions": true, "orderUpdates": true },
      "createdAt": "2025-01-29T00:00:00Z",
      "updatedAt": "2025-01-29T00:00:00Z"
    }
  ]
  ```

### Retrieve User by ID  
- **Endpoint**: `GET /:id`  
- **Path Parameters**:  
  - `id` (string): User identifier.  
- **Authentication**: Valid JWT  
- **Success Response**:  
  ```http
  HTTP/1.1 200 OK
  Content-Type: application/json
  {
    "_id": "user_id_1",
    "email": "user1@example.com",
    "name": "User One",
    "preferences": { "promotions": true, "orderUpdates": true }
  }
  ```
- **Error Response**:  
  ```http
  HTTP/1.1 404 Not Found
  {"error": "User not found"}
  ```

### Register User  
- **Endpoint**: `POST /`  
- **Request Payload**:  
  ```json
  {
    "email": "newuser@example.com",
    "name": "New User",
    "password": "securePassword123",
    "preferences": { "promotions": true }
  }
  ```
- **Success Response**:  
  ```http
  HTTP/1.1 201 Created
  {
    "_id": "new_user_id",
    "email": "newuser@example.com",
    "name": "New User",
    "preferences": { "promotions": true }
  }
  ```
- **Error Responses**:  
  - `400 Bad Request`: Invalid input format.  
  - `409 Conflict`: Duplicate email.  

### Authenticate User  
- **Endpoint**: `POST /login`  
- **Request Payload**:  
  ```json
  {
    "email": "user1@example.com",
    "password": "user_password"
  }
  ```
- **Success Response**:  
  ```http
  HTTP/1.1 200 OK
  {
    "token": "jwt_token",
    "user": {
      "_id": "user_id_1",
      "email": "user1@example.com",
      "name": "User One"
    }
  }
  ```
- **Triggers**: Kafka `user-event` on successful login.  
- **Error Responses**:  
  - `401 Unauthorized`: Invalid credentials.  

### Update User Preferences  
- **Endpoint**: `PUT /:id/preferences`  
- **Path Parameters**:  
  - `id` (string): User identifier.  
- **Authentication**: Valid JWT  
- **Request Payload**:  
  ```json
  {
    "preferences": { "promotions": false, "orderUpdates": true }
  }
  ```
- **Success Response**:  
  ```http
  HTTP/1.1 200 OK
  {
    "_id": "user_id_1",
    "preferences": { "promotions": false, "orderUpdates": true }
  }
  ```
- **Error Responses**:  
  - `400 Bad Request`: Invalid preference keys.  

---

## System Architecture  
```plaintext
user-service/
├── src/
│   ├── app.ts          # Express configuration and route handlers
│   ├── index.ts        # Service entry point, initializes connections
│   ├── kafka/          # Kafka producer/consumer implementations
│   ├── middleware/     # Authentication and validation logic
│   └── models/         # MongoDB schema definitions
├── Dockerfile          # Container build instructions
└── package.json        # Dependency management
```

---

## Configuration  

### Environment Variables  
| Variable            | Description                          | Default  |
|---------------------|--------------------------------------|----------|
| `USERS_SERVICE_PORT`| API service port                     | `8000`   |
| `METRICS_PORT`      | Prometheus metrics endpoint port     | `9201`   |
| `MONGO_URI`         | MongoDB connection URI               | Required |
| `KAFKA_BROKERS`     | Kafka broker addresses (comma-sep)   | Required |
| `JWT_SECRET`        | JWT signing key                      | Required |

---

## Deployment  

### Local Execution  
1. **Prerequisites**:  
   - MongoDB and Kafka instances running.  
2. **Install Dependencies**:  
   ```bash
   npm install
   ```
3. **Configure Environment**:  
   Create `.env` using the provided template.  
4. **Start Service**:  
   ```bash
   npm start
   ```

### Containerized Deployment  
Deploy via Docker Compose:  
```bash
docker-compose up user-service
```

---

## Observability  
- **Metrics Endpoint**: Accessible at `http://localhost:9201/metrics` for integration with Prometheus/Grafana.  
- **Logging**: Structured logs output for debugging and audit trails.  

--- 

