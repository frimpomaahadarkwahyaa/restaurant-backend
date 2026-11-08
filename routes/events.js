const express = require('express');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const MenuItem = require('../models/MenuItem');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

// ---- Event settings (change these if you like) ----
const EVENT_TYPES = ['birthday', 'corporate', 'other'];
const STATUSES = ['pending', 'confirmed', 'cancelled'];
const MIN_GUESTS = 9;
const MAX_GUESTS = 60;
const DURATION = 240; // an event uses the space for 4 hours
const OPENING = 11 * 60; // 11:00
const CLOSING = 22 * 60; // 22:00

function toMinutes(time) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// Checks type, date, time and guests. Returns { error } or { start }.
function validateDetails({ eventType, date, time, guests }) {
  if (!EVENT_TYPES.includes(eventType)) {
    return { error: 'Event type must be one of: ' + EVENT_TYPES.join(', ') };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return { error: 'Date must look like 2026-12-12' };
  }
  const start = toMinutes(time);
  if (start === null) return { error: 'Time must look like 12:00 (24-hour time)' };
  if (!Number.isInteger(guests) || guests < MIN_GUESTS || guests > MAX_GUESTS) {
    return { error: 'Guests must be a whole number from ' + MIN_GUESTS + ' to ' + MAX_GUESTS };
  }
  if (start < OPENING || start + DURATION > CLOSING) {
    return { error: 'Events run 4 hours between 11:00 and 22:00. The last start time is 18:00' };
  }

  const [y, m, d] = date.split('-').map(Number);
  const when = new Date(date + 'T' + time + ':00');
  const realDate =
    !Number.isNaN(when.getTime()) &&
    when.getFullYear() === y &&
    when.getMonth() + 1 === m &&
    when.getDate() === d;
  if (!realDate) return { error: 'That date does not exist' };
  if (when <= new Date()) return { error: 'Event must be in the future' };

  return { start };
}

// Checks the chosen menu items exist and are available. Returns { error } or { ids }.
async function validateMenu(menuItems) {
  if (menuItems === undefined) return { ids: [] };
  if (!Array.isArray(menuItems)) return { error: 'Menu items must be a list of ids' };

  const ids = [...new Set(menuItems.map(String))];
  for (const id of ids) {
    if (!mongoose.isValidObjectId(id)) return { error: 'Invalid menu item id' };
    const item = await MenuItem.findById(id);
    if (!item) return { error: 'Menu item not found' };
    if (!item.available) return { error: item.name + ' is not available' };
  }
  return { ids };
}

// True if another active event overlaps this time on the same day
async function hasConflict(date, start, excludeId) {
  const filter = { date, status: { $ne: 'cancelled' } };
  if (excludeId) filter._id = { $ne: excludeId };
  const sameDay = await Event.find(filter);
  return sameDay.some((e) => e.startMinutes < start + DURATION && start < e.startMinutes + DURATION);
}

function isOwnerOrAdmin(event, user) {
  return user.role === 'admin' || event.user.equals(user._id);
}

// POST /api/events  (logged in)
router.post('/', protect, async (req, res) => {
  try {
    const { eventType, date, time, guests, requirements = '', menuItems } = req.body;

    const check = validateDetails({ eventType, date, time, guests });
    if (check.error) return res.status(400).json({ message: check.error });

    const menu = await validateMenu(menuItems);
    if (menu.error) return res.status(400).json({ message: menu.error });

    if (await hasConflict(date, check.start)) {
      return res.status(409).json({ message: 'Another event is already booked at that time' });
    }

    const event = await Event.create({
      user: req.user._id,
      eventType,
      date,
      time,
      startMinutes: check.start,
      guests,
      requirements,
      menuItems: menu.ids,
    });

    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/events/my  (logged in)
router.get('/my', protect, async (req, res) => {
  try {
    const list = await Event.find({ user: req.user._id })
      .populate('menuItems', 'name price')
      .sort({ date: 1, startMinutes: 1 });
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/events  (admin only)
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const list = await Event.find()
      .populate('user', 'name email')
      .populate('menuItems', 'name price')
      .sort({ date: 1, startMinutes: 1 });
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/events/:id  (owner or admin)
router.get('/:id', protect, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid event id' });
    }
    const event = await Event.findById(req.params.id).populate('menuItems', 'name price');
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (!isOwnerOrAdmin(event, req.user)) {
      return res.status(403).json({ message: 'You can only view your own events' });
    }
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/events/:id  (owner) - change details
router.put('/:id', protect, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid event id' });
    }
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (!event.user.equals(req.user._id)) {
      return res.status(403).json({ message: 'You can only change your own events' });
    }
    if (event.status === 'cancelled') {
      return res.status(400).json({ message: 'A cancelled event cannot be changed' });
    }

    const merged = {
      eventType: req.body.eventType ?? event.eventType,
      date: req.body.date ?? event.date,
      time: req.body.time ?? event.time,
      guests: req.body.guests ?? event.guests,
    };

    const check = validateDetails(merged);
    if (check.error) return res.status(400).json({ message: check.error });

    const menu = await validateMenu(req.body.menuItems);
    if (menu.error) return res.status(400).json({ message: menu.error });

    if (await hasConflict(merged.date, check.start, event._id)) {
      return res.status(409).json({ message: 'Another event is already booked at that time' });
    }

    event.eventType = merged.eventType;
    event.date = merged.date;
    event.time = merged.time;
    event.startMinutes = check.start;
    event.guests = merged.guests;
    if (req.body.requirements !== undefined) event.requirements = req.body.requirements;
    if (req.body.menuItems !== undefined) event.menuItems = menu.ids;
    await event.save();

    res.json(event);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/events/:id/cancel  (owner or admin)
router.put('/:id/cancel', protect, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid event id' });
    }
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (!isOwnerOrAdmin(event, req.user)) {
      return res.status(403).json({ message: 'You can only cancel your own events' });
    }

    event.status = 'cancelled';
    await event.save();
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/events/:id/status  (admin only) - approve or cancel
router.put('/:id/status', protect, adminOnly, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid event id' });
    }
    const { status } = req.body;
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Status must be one of: ' + STATUSES.join(', ') });
    }

    const event = await Event.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;