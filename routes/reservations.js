const express = require('express');
const mongoose = require('mongoose');
const Reservation = require('../models/Reservation');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

// ---- Restaurant settings (change these if you like) ----
const TABLES = [
  { number: 1, seats: 2 },
  { number: 2, seats: 2 },
  { number: 3, seats: 2 },
  { number: 4, seats: 4 },
  { number: 5, seats: 4 },
  { number: 6, seats: 4 },
  { number: 7, seats: 4 },
  { number: 8, seats: 6 },
  { number: 9, seats: 6 },
  { number: 10, seats: 8 },
];
const TYPES = ['regular', 'birthday', 'corporate'];
const STATUSES = ['pending', 'confirmed', 'cancelled'];
const DURATION = 120; // each booking lasts 2 hours
const OPENING = 11 * 60; // 11:00
const CLOSING = 22 * 60; // 22:00

function toMinutes(time) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// Checks date, time, guests and type. Returns { error } or { start }.
function validateDetails({ date, time, guests, reservationType }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return { error: 'Date must look like 2026-12-05' };
  }
  const start = toMinutes(time);
  if (start === null) return { error: 'Time must look like 18:30 (24-hour time)' };
  if (!Number.isInteger(guests) || guests < 1 || guests > 8) {
    return { error: 'Guests must be a whole number from 1 to 8' };
  }
  if (reservationType !== undefined && !TYPES.includes(reservationType)) {
    return { error: 'Reservation type must be one of: ' + TYPES.join(', ') };
  }
  if (start < OPENING || start + DURATION > CLOSING) {
    return { error: 'The restaurant is open 11:00 to 22:00. The last booking starts at 20:00' };
  }

  const [y, m, d] = date.split('-').map(Number);
  const when = new Date(date + 'T' + time + ':00');
  const realDate =
    !Number.isNaN(when.getTime()) &&
    when.getFullYear() === y &&
    when.getMonth() + 1 === m &&
    when.getDate() === d;
  if (!realDate) return { error: 'That date does not exist' };
  if (when <= new Date()) return { error: 'Reservation must be in the future' };

  return { start };
}

// Finds a free table. Returns { tableNumber } or { error, conflict }.
async function findTable({ date, start, guests, preferred, excludeId }) {
  const filter = { date, status: { $ne: 'cancelled' } };
  if (excludeId) filter._id = { $ne: excludeId };
  const sameDay = await Reservation.find(filter);

  // Tables that already have a booking overlapping this time slot
  const busy = new Set(
    sameDay
      .filter((r) => r.startMinutes < start + DURATION && start < r.startMinutes + DURATION)
      .map((r) => r.tableNumber)
  );

  if (preferred !== undefined && preferred !== null) {
    const table = TABLES.find((t) => t.number === preferred);
    if (!table) return { error: 'That table does not exist' };
    if (table.seats < guests) {
      return { error: 'Table ' + preferred + ' only seats ' + table.seats };
    }
    if (busy.has(preferred)) {
      return { error: 'Table ' + preferred + ' is already booked at that time', conflict: true };
    }
    return { tableNumber: preferred };
  }

  // Otherwise pick the smallest free table that fits the group
  const free = TABLES.find((t) => t.seats >= guests && !busy.has(t.number));
  if (!free) {
    return { error: 'No table is free at that time. Please try another time.', conflict: true };
  }
  return { tableNumber: free.number };
}

function isOwnerOrAdmin(reservation, user) {
  return user.role === 'admin' || reservation.user.equals(user._id);
}

// POST /api/reservations  (logged in)
router.post('/', protect, async (req, res) => {
  try {
    const { date, time, guests, reservationType = 'regular', notes = '', tableNumber } = req.body;

    const check = validateDetails({ date, time, guests, reservationType });
    if (check.error) return res.status(400).json({ message: check.error });

    const found = await findTable({
      date,
      start: check.start,
      guests,
      preferred: tableNumber,
    });
    if (found.error) {
      return res.status(found.conflict ? 409 : 400).json({ message: found.error });
    }

    const reservation = await Reservation.create({
      user: req.user._id,
      date,
      time,
      startMinutes: check.start,
      guests,
      tableNumber: found.tableNumber,
      reservationType,
      notes,
    });

    res.status(201).json(reservation);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/reservations/my  (logged in)
router.get('/my', protect, async (req, res) => {
  try {
    const list = await Reservation.find({ user: req.user._id }).sort({ date: 1, startMinutes: 1 });
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/reservations  (admin only)
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const list = await Reservation.find()
      .populate('user', 'name email')
      .sort({ date: 1, startMinutes: 1 });
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/reservations/:id  (owner or admin)
router.get('/:id', protect, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid reservation id' });
    }
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    if (!isOwnerOrAdmin(reservation, req.user)) {
      return res.status(403).json({ message: 'You can only view your own reservations' });
    }
    res.json(reservation);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/reservations/:id  (owner) - change date, time, guests, type, notes
router.put('/:id', protect, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid reservation id' });
    }
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    if (!reservation.user.equals(req.user._id)) {
      return res.status(403).json({ message: 'You can only change your own reservations' });
    }
    if (reservation.status === 'cancelled') {
      return res.status(400).json({ message: 'A cancelled reservation cannot be changed' });
    }

    const merged = {
      date: req.body.date ?? reservation.date,
      time: req.body.time ?? reservation.time,
      guests: req.body.guests ?? reservation.guests,
      reservationType: req.body.reservationType ?? reservation.reservationType,
    };

    const check = validateDetails(merged);
    if (check.error) return res.status(400).json({ message: check.error });

    const found = await findTable({
      date: merged.date,
      start: check.start,
      guests: merged.guests,
      preferred: req.body.tableNumber,
      excludeId: reservation._id,
    });
    if (found.error) {
      return res.status(found.conflict ? 409 : 400).json({ message: found.error });
    }

    reservation.date = merged.date;
    reservation.time = merged.time;
    reservation.startMinutes = check.start;
    reservation.guests = merged.guests;
    reservation.reservationType = merged.reservationType;
    reservation.tableNumber = found.tableNumber;
    if (req.body.notes !== undefined) reservation.notes = req.body.notes;
    await reservation.save();

    res.json(reservation);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/reservations/:id/cancel  (owner or admin)
router.put('/:id/cancel', protect, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid reservation id' });
    }
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    if (!isOwnerOrAdmin(reservation, req.user)) {
      return res.status(403).json({ message: 'You can only cancel your own reservations' });
    }

    reservation.status = 'cancelled';
    await reservation.save();
    res.json(reservation);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/reservations/:id/status  (admin only) - approve or cancel
router.put('/:id/status', protect, adminOnly, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid reservation id' });
    }
    const { status } = req.body;
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Status must be one of: ' + STATUSES.join(', ') });
    }

    const reservation = await Reservation.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    res.json(reservation);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;