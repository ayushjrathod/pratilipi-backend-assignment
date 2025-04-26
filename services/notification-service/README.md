# Notifications Service Documentation

## Overview  
The Notifications Service serves as a centralized event-driven platform for managing user notifications across the system. It processes events from multiple sources, orchestrates notification delivery via configurable channels (primarily email), and ensures adherence to user preferences and operational reliability through robust error handling mechanisms.

---

## Key Features  

### Core Capabilities  
- **Multi-Source Event Ingestion**: Consumes events from Kafka topics (`user-events`, `order-events`, `product-events`, `recommendation-events`).  
- **Notification Lifecycle Management**:  
  - Persistent storage of notification metadata in MongoDB  
  - Status tracking (queued, sent, failed) with timestamps  
  - Two types of queues for processing:  
    - **High Priority**: Immediate processing for critical notifications (e.g., order confirmations)  
    - **Low Priority**: Batch processing for less urgent notifications (e.g., promotional emails)
- **Intelligent Delivery System**:  
  - Priority-based processing via dedicated Kafka consumer groups  
  - User preference validation through User Service integration  
  - HTML/CSS template engine for email rendering  
- **Operational Resilience**:  
  - Three-stage retry mechanism with exponential backoff  
  - Dead Letter Queue (DLQ) integration for unrecoverable failures  
  - Transactional email tracking via embedded pixel  

### System Integration  
- **Event Broker**:  
  - **Input Topics**: `user-events`, `order-events`, `promotional-events`, `recommendation-events`  
  - **Output Topic**: `dead-letter-queue` (failed message archival)  
- **External Service Connections**:  
  - User Service (REST API) - User preference verification  
  - SMTP Service (Nodemailer) - Email delivery execution  

### Monitoring Framework  
- Prometheus-compatible metrics endpoint (`/metrics`)  
- Key performance indicators:  
  - Notification processing rate  
  - Email delivery success/failure ratios  
  - DLQ message accumulation trends  

---

## Architectural Components  

```plaintext
notifications-service/
├── src/
│   ├── app.ts                      # Express server configuration
│   ├── index.ts                    # Service initialization (DB/Kafka)
│   ├── EventProcessor/             # Event handling implementations
│   │   ├── NotificationEventProcessor.ts # Core event router
│   │   ├── [Domain]EventProcessor.ts      # Specialized handlers
│   │   └── DeadLetterQueue.ts      # DLQ management module
│   ├── kafka/                      # Broker connectivity config
│   ├── models/                     # Data schemas (Mongoose)
│   ├── services/                   # Business logic services
│   ├── styles/                     # Email presentation layer
│   ├── templates/                  # HTML template repository
│   └── types/                      # Type definitions
└── infrastructure/                 # Deployment artifacts
```

---

## Operational Workflow  

1. **Event Subscription**: Kafka consumers initialize with topic-specific configurations  
2. **Event Classification**: Router delegates events to domain-specific processors  
3. **Data Enrichment**:  
   - User preference verification via User Service API  
   - Template selection based on event characteristics  
4. **Notification Execution**:  
   - MongoDB write operation with initial `pending` status  
   - SMTP transmission attempt with retry fallback  
5. **State Reconciliation**:  
   - MongoDB status update to `delivered` or `failed`  
   - DLQ routing for non-transient failures  

---

## Configuration Parameters  

| Variable                   | Purpose                                | Default Value |
|----------------------------|----------------------------------------|---------------|
| `KAFKA_BROKERS`            | Kafka broker addresses                 | -             |
| `MONGO_URI`                | MongoDB connection string             | -             |
| `USERS_SERVICE_URL`        | User Service API endpoint             | -             |
| `SMTP_HOST`                | Mail server hostname                  | -             |
| `SMTP_PORT`                | Mail server port                      | 587           |
| `NOTIFICATIONS_SERVICE_PORT` | Service listening port               | 8000          |

---

## Local Deployment Guide  


### Execution Steps  
1. Install dependencies:  
   ```bash
   npm install
   ```
2. Initialize service:  
   ```bash
   npm start
   ```

### Container Deployment  
```bash
docker-compose up --build notifications-service
```

---

## Observability Notes  
- Monitor `notification_processing_duration_seconds` metric for performance baselining  
- Configure alerts on `email_delivery_failures_total` counter increments  
- Regularly audit DLQ message accumulation patterns  
- Ensure proper logging for all notification events  


