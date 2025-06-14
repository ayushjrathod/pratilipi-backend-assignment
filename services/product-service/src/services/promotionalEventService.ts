import { Producer } from 'kafkajs';
import { Document } from 'mongoose';
import cron from 'node-cron';
import { Counter, Gauge, Registry } from 'prom-client';
import { Product } from '../models/product';

interface ProductDocument extends Document {
  name: string;
  price: number;
  quantity: number;
  category: string;
}

interface PromoEventMetadata {
  source: string;
  batchId: string;
}

interface PromotionalEvent {
  timestamp: Date;
  products: ProductDocument[];
  eventType: 'promotional-batch';
  metadata: PromoEventMetadata;
}

interface PromoMetrics {
  promoEventsTotal: Counter;
  promoEventsBatchSize: Gauge;
  promoEventsError: Counter;
}

class PromotionalEventService {
  private readonly producer: Producer;
  private readonly metrics: PromoMetrics;

  constructor(producer: Producer, register: Registry) {
    this.producer = producer;
    this.metrics = this.initializeMetrics(register);
  }

  private initializeMetrics(register: Registry): PromoMetrics {
    const metrics: PromoMetrics = {
      promoEventsTotal: new Counter({
        name: 'promotional_events_total',
        help: 'Total number of promotional events sent',
      }),
      promoEventsBatchSize: new Gauge({
        name: 'promotional_events_batch_size',
        help: 'Number of products in each promotional event batch',
      }),
      promoEventsError: new Counter({
        name: 'promotional_events_errors_total',
        help: 'Total number of errors in promotional events generation',
      }),
    };

    Object.values(metrics).forEach((metric) => register.registerMetric(metric));
    return metrics;
  }

  private async generatePromotionalEvent(): Promise<void> {
    try {
      const products = await Product.find({ quantity: { $gt: 0 } });

      if (products.length === 0) {
        console.log('No products available for promotional events');
        return;
      }

      this.metrics.promoEventsBatchSize.set(products.length);

      const promoEvent: PromotionalEvent = {
        timestamp: new Date(),
        products,
        eventType: 'promotional-batch',
        metadata: {
          source: 'product-service-cron',
          batchId: Date.now().toString(),
        },
      };

      await this.producer.send({
        topic: 'promotional-events',
        messages: [
          {
            value: JSON.stringify(promoEvent),
            key: promoEvent.metadata.batchId,
            timestamp: promoEvent.timestamp.getTime().toString(),
          },
        ],
      });

      console.log(
        `Promotional event sent successfully. Batch ID: ${promoEvent.metadata.batchId}, Products: ${products.length}`
      );
      this.metrics.promoEventsTotal.inc();
    } catch (error) {
      console.error('Error generating promotional events:', error);
      this.metrics.promoEventsError.inc();
      throw error;
    }
  }

  public initialize(): void {
    cron.schedule('*/5 * * * *', async () => {
      console.log('Starting promotional events generation');
      try {
        await this.generatePromotionalEvent();
      } catch (error) {
        console.error('Promotional events cron job failed:', error);
      }
    });
    console.log('Promotional events cron job initialized');
  }
}

export function initializePromotionalEvents(producer: Producer, register: Registry): void {
  const service = new PromotionalEventService(producer, register);
  service.initialize();
}
