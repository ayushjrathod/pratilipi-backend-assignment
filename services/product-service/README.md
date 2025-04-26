# Product Service Documentation

## Overview

The Product Service serves as the central component for managing product catalog operations and inventory tracking within the e-commerce ecosystem. This microservice implements a RESTful API architecture while leveraging event-driven communication patterns for real-time system synchronization.

## Key Capabilities

### 1. Product Catalog Management
- Full CRUD operations for product entities
- Inventory tracking with quantity adjustments
- Product search capabilities through:
  - Unique identifier lookup
  - Category-based filtering
  - Complete catalog listing

### 2. System Integrations
- **Event Streaming (Kafka):**
  - Consumes `order-events` to maintain inventory accuracy
  - Produces `inventory-events` reflecting stock changes
  - Generates scheduled `promotional-events` via cron job
- **Performance Optimization:**
  - Redis caching integration for high-frequency data access
  - Cache synchronization with inventory updates

### 3. Operational Visibility
- Prometheus-compatible metrics endpoint
- Service health monitoring
- Performance tracking (response times, error rates)
- Resource utilization statistics

## API Specification

| Endpoint               | Method | Description                          | Parameters                       | Success Response | Error Responses                  |
|------------------------|--------|--------------------------------------|-----------------------------------|------------------|-----------------------------------|
| `/`                    | GET    | Retrieve full product catalog        | None                             | 200 OK           | N/A                               |
| `/id/{id}`             | GET    | Fetch product by unique identifier   | Path: id (String)                | 200 OK           | 404 Not Found                     |
| `/category`            | GET    | Filter products by category          | Query: category (String)         | 200 OK           | 400 Bad Request                   |
| `/`                    | POST   | Create new product entry             | JSON body (Product Schema)       | 201 Created      | 400 Bad Request                   |

**Example Product Schema:**
```json
{
  "_id": "prod_XYZ123",
  "name": "Premium Wireless Headphones",
  "price": 299.95,
  "quantity": 150,
  "category": "Audio Equipment",
  "createdAt": "2024-03-15T09:30:00Z",
  "updatedAt": "2024-03-20T14:45:00Z"
}
```

## System Architecture

### Component Structure
```
product-service/
├── src/
│   ├── app.ts                    # API route configuration
│   ├── index.ts                  # Service initialization
│   ├── kafka/                    # Event streaming configuration
│   ├── models/                   # Data persistence layer
│   ├── services/                 # Business logic components
│   ├── types/                    # Type definitions
├── infrastructure/
│   ├── Dockerfile                # Containerization setup
│   └── compose.yml               # Local deployment configuration
```

### Data Flow
1. API requests processed through Express middleware
2. MongoDB for persistent product storage
3. Kafka producers/consumers handle event streaming
4. Redis cache layer for frequent data access
5. Metrics exported via Prometheus endpoint

## Configuration Management

| Environment Variable     | Purpose                                  | Default Value   |
|--------------------------|------------------------------------------|-----------------|
| `PRODUCTS_SERVICE_PORT`  | Main API listener port                   | 8000            |
| `METRICS_PORT`           | Prometheus metrics endpoint              | 9203            |
| `MONGO_URI`              | MongoDB connection string                | -               |
| `KAFKA_BROKERS`          | Kafka cluster addresses                  | localhost:9092  |
| `REDIS_HOST`             | Redis server location                    | localhost       |

## Deployment Guide

### Local Development Setup
1. Install dependencies:
   ```bash
   npm install
   ```

2. Start service:
   ```bash
   npm dev
   ```

### Containerized Deployment
```bash
docker-compose up products-service
```


## Event Handling Specifications

| Event Type          | Trigger                | Action                            |
|---------------------|------------------------|-----------------------------------|
| order-placed        | Order confirmation     | Inventory quantity reduction      |
| order-cancelled     | Order cancellation     | Inventory quantity restoration    |
| product-updated     | Stock modification     | Cache invalidation                |
| promotional-event   | Scheduled cron job     | Notification service trigger      |



