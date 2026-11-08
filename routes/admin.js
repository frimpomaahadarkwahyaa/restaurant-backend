const express = require('express');
const User = require('../models/User');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const Reservation = require('../models/Reservation');
const Event = require('../models/Event');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.use(protect, adminOnly);

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      users,
      menuItems,
      orders,
      pendingOrders,
      reservations,
      pendingReservations,
      events,
      pendingEvents,
      revenue,
      ordersPerDay,
      popularItems,
    ] = await Promise.all([
      User.countDocuments(),
      MenuItem.countDocuments(),
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Reservation.countDocuments({ status: { $ne: 'cancelled' } }),
      Reservation.countDocuments({ status: 'pending' }),
      Event.countDocuments({ status: { $ne: 'cancelled' } }),
      Event.countDocuments({ status: 'pending' }),
      Order.aggregate([
        { $match: { status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: weekAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: { status: { $ne: 'cancelled' } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.name', quantity: { $sum: '$items.quantity' } } },
        { $sort: { quantity: -1 } },
        { $limit: 5 },
      ]),
    ]);

    res.json({
      users,
      menuItems,
      orders: { total: orders, pending: pendingOrders },
      reservations: { total: reservations, pending: pendingReservations },
      events: { total: events, pending: pendingEvents },
      revenue: revenue.length ? Math.round(revenue[0].total * 100) / 100 : 0,
      ordersPerDay: ordersPerDay.map((d) => ({ date: d._id, orders: d.orders })),
      popularItems: popularItems.map((p) => ({ name: p._id, quantity: p.quantity })),
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;