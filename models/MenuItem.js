const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      required: true,
      enum: ['starter', 'main', 'dessert', 'beverage'],
    },
    description: { type: String, trim: true, default: '' },
    ingredients: { type: [String], default: [] },
    price: { type: Number, required: true, min: 0.01 },
    dietary: { type: [String], default: [] }, // e.g. vegetarian, vegan, gluten-free
    available: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MenuItem', menuItemSchema);