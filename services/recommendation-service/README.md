# Recommendation Service

The **Recommendation Service** delivers personalized product recommendations by analyzing user purchase behavior and interaction patterns. This service processes data to distribute targeted suggestions through event-driven architecture. Core functionalities include real-time data processing, user preference modeling, and adaptive recommendation strategies supported by Redis caching mechanisms.

## Key Features

### Core Capabilities

- **Order Data Ingestion**: currently mock data is being used.
- **Adaptive Recommendation Engine**:
  - Implements multi-factor recommendation algorithms considering:
    - Category purchase frequency analysis
    - Unexplored products within high-affinity categories
    - User sentiment analysis from feedback data
    - Inventory-aware fallback mechanisms (default categories/product lists)
  - Integrates real-time product availability checks
- **Feedback Integration**: Processes user preference indicators (positive/negative ratings) to dynamically refine suggestion models
- **Automated Workflows**: Implements cron-based scheduling for periodic data synchronization and recommendation updates


### Architectural Components

```
recommendation-service/
├── src/
│   ├── app.ts                    # Service orchestration layer
│   ├── index.ts                  # Bootstrapping & infrastructure configuration
│   ├── kafka/
│   │   └── kafka.ts              # Event streaming producers configuration
│   ├── processor/
│   │   ├── orderProcessor.ts     # Order data transformation pipelines
│   │   └── recommendationProcessor.ts # Core recommendation algorithm implementation
│   ├── services/
│   │   └── RecommendationService.ts # Scheduled task management & service lifecycle
│   └── types/
│       └── types.ts              # Type definitions & data contracts
├── package.json                  # Dependency management
├── tsconfig.json                 # TypeScript compilation settings
├── Dockerfile                    # Containerization specifications
└── README.md                     # Service documentation
```

## Operational Workflows

1. **Data Synchronization Cycle**
   - **Trigger**: Scheduled cron job execution
   - **Process**:
     1. Batch order retrieval from Order Service API
     2. Purchase history augmentation in Redis
     3. Product metadata cache population
     4. Data integrity validation checks

2. **Recommendation Generation Pipeline**
   - **Input**: User identification context
   - **Execution Flow**:
     1. Behavioral pattern extraction from Redis datasets
     2. Affinity category identification
     3. Product catalog filtering (availability, exclusion filters)
     4. Feedback-weighted scoring model application
     5. Fallback strategy activation when necessary
     6. Recommendation event publication via Kafka

3. **Feedback Processing Mechanism**
   - **Endpoint**: REST API submission
   - **Actions**:
     1. User preference persistence in Redis
     2. Real-time recommendation model adjustment
     3. Optional recommendation regeneration trigger

## API Specification

### Base URL: `http://<host>:8005`

| Endpoint         | Method | Description                                  | Parameters                                   | Success Response          |
|------------------|--------|----------------------------------------------|----------------------------------------------|---------------------------|
| `/metrics`       | GET    | Prometheus metrics exposure                  | -                                            | 200: Text/plain format    |
| `/process`       | POST   | Manual processing trigger                    | -                                            | 200: Processing status    |
| `/feedback`      | POST   | User preference submission                   | JSON: {userId, productId, isPositive}       | 200: Acknowledgement      |
| `/health`        | GET    | System health check                          | -                                            | 200: Service status       |

## Configuration Management

| Environment Variable         | Purpose                                  | Default Value     |
|------------------------------|------------------------------------------|-------------------|
| `RECOMMENDATIONS_SERVICE_PORT` | API listener port                       | 8000              |
| `METRICS_PORT`               | Monitoring endpoint port                | 9205              |
| `KAFKA_BROKERS`              | Kafka cluster addresses                 | -                 |
| `REDIS_URL`                  | Redis connection string                 | -                 |
| `SERVICE_URLS`               | Dependent service endpoints             | -                 |
| `CRON_SCHEDULE`              | Data processing cron pattern            | - |
| `CRON_TIMEZONE`              | Scheduler timezone                      | UTC               |

## Deployment Guide

### Prerequisites
- Operational Redis instance
- Kafka cluster availability
- Accessible Product/Order Services

### Local Execution
```bash
# Install dependencies
npm install

# Start service
npm start  # Production mode
npm run dev    # Development mode with hot-reload
```

### Container Deployment
```bash
docker-compose up --build recommendations-service
```
