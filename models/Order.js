const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: { type: [orderItemSchema], required: true },
    orderType: { type: String, enum: ['delivery', 'pickup'], default: 'pickup' },
    deliveryAddress: { type: String, trim: true, default: '' },
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'preparing', 'ready', 'delivered', 'cancelled'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);