export interface Product {
  _id: string;
  quantity: number;
  name?: string;
  category?: string | null;
  price?: number | null;
}

export interface Order {
  _id: string;
  userId: string;
  products: Product[];
  __v: number;
}

export interface OrdersResponse {
  result: Order[];
}

export interface ProductResponse {
  data: {
    product: {
      _id: string;
      name: string;
      price: number;
      quantity: number;
      category: string;
    };
  };
}

export interface ProductsByCategoryResponse {
  data: {
    products: Product[];
  };
}

export interface RecommendationFeedback {
  userId: string;
  productId: string;
  isPositive: boolean;
  timestamp: string;
}

export interface UserFeedbackStats {
  productId: string;
  positiveCount: number;
  negativeCount: number;
  category: string;
}
