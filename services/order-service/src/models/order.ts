import { model, Schema } from 'mongoose';

const OrderSchema = new Schema({
  userId: {
    type: String,
    required: true,
  },
  products: [
    {
      _id: {
        type: String,
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
      },
      name: {
        type: String,
      },
      category: {
        type: String,
      },
      price: {
        type: Number,
      },
    },
  ],
});

export const Order = model('Order', OrderSchema);
