const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

const STATUSES = ['pending', 'preparing', 'ready', 'delivered', 'cancelled'];

// Validates the items and works out prices from the database.
// Returns { error } or { orderItems, total }.
async function buildItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'Order must contain at least one item' };
  }

  const merged = new Map();
  for (const entry of items) {
    const id = entry && entry.menuItem;
    const qty = entry && entry.quantity;

    if (!mongoose.isValidObjectId(id)) return { error: 'Invalid menu item id' };
    if (!Number.isInteger(qty) || qty < 1) {
      return { error: 'Quantity must be a whole number of at least 1' };
    }
    merged.set(String(id), (merged.get(String(id)) || 0) + qty);
  }

  const orderItems = [];
  let total = 0;

  for (const [id, quantity] of merged) {
    if (quantity > 50) return { error: 'Quantity cannot be more than 50 per item' };

    const menuItem = await MenuItem.findById(id);
    if (!menuItem) return { error: 'Menu item not found' };
    if (!menuItem.available) return { error: menuItem.name + ' is not available' };

    orderItems.push({
      menuItem: menuItem._id,
      name: menuItem.name,
      price: menuItem.price,
      quantity,
    });
    total += menuItem.price * quantity;
  }

  return { orderItems, total: Math.round(total * 100) / 100 };
}

function isOwnerOrAdmin(order, user) {
  return user.role === 'admin' || order.user.equals(user._id);
}

// POST /api/orders  (logged in) - create an order
router.post('/', protect, async (req, res) => {
  try {
    const { items, orderType = 'pickup', deliveryAddress = '' } = req.body;

    if (!['delivery', 'pickup'].includes(orderType)) {
      return res.status(400).json({ message: 'Order type must be delivery or pickup' });
    }
    if (orderType === 'delivery' && !String(deliveryAddress).trim()) {
      return res.status(400).json({ message: 'Delivery address is required for delivery' });
    }

    const result = await buildItems(items);
    if (result.error) return res.status(400).json({ message: result.error });

    const order = await Order.create({
      user: req.user._id,
      items: result.orderItems,
      orderType,
      deliveryAddress,
      total: result.total,
    });

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/orders/my  (logged in) - my own orders
router.get('/my', protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/orders  (admin only) - all orders
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/orders/:id  (owner or admin)
router.get('/:id', protect, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!isOwnerOrAdmin(order, req.user)) {
      return res.status(403).json({ message: 'You can only view your own orders' });
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/orders/:id/items  (owner, only while pending) - add/remove items, change quantities
router.put('/:id/items', protect, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!order.user.equals(req.user._id)) {
      return res.status(403).json({ message: 'You can only change your own orders' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending orders can be changed' });
    }

    const result = await buildItems(req.body.items);
    if (result.error) return res.status(400).json({ message: result.error });

    order.items = result.orderItems;
    order.total = result.total;
    await order.save();

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/orders/:id/cancel  (owner, only while pending)
router.put('/:id/cancel', protect, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!order.user.equals(req.user._id)) {
      return res.status(403).json({ message: 'You can only cancel your own orders' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending orders can be cancelled' });
    }

    order.status = 'cancelled';
    await order.save();
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/orders/:id/status  (admin only) - preparing, ready, delivered...
router.put('/:id/status', protect, adminOnly, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }
    const { status } = req.body;
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Status must be one of: ' + STATUSES.join(', ') });
    }

    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;