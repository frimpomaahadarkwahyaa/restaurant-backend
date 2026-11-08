const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // e.g. 2026-12-05
    time: { type: String, required: true }, // e.g. 18:30
    startMinutes: { type: Number, required: true }, // minutes after midnight
    guests: { type: Number, required: true, min: 1, max: 8 },
    tableNumber: { type: Number, required: true },
    reservationType: {
      type: String,
      enum: ['regular', 'birthday', 'corporate'],
      default: 'regular',
    },
    notes: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Reservation', reservationSchema);