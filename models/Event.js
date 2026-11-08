const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    eventType: { type: String, enum: ['birthday', 'corporate', 'other'], required: true },
    date: { type: String, required: true }, // e.g. 2026-12-12
    time: { type: String, required: true }, // e.g. 12:00
    startMinutes: { type: Number, required: true },
    guests: { type: Number, required: true, min: 9, max: 60 },
    requirements: { type: String, trim: true, default: '' },
    menuItems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' }],
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Event', eventSchema);