export type OrderEvent = 'order-placed' | 'order-shipped';

export interface ProductRequestBody {
  name: string;
  price: number;
  quantity: number;
  category: string;
}

export type OrderEventPayload = {
  type: OrderEvent;
  payload: {
    _id: string;
    userId: string;
    products: {
      _id: string;
      quantity: number;
      category: string;
    }[];
  };
};
