const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

function checkId(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid user id' });
  }
  next();
}

function selfOrAdmin(req, res, next) {
  if (req.user.role === 'admin' || req.user._id.equals(req.params.id)) return next();
  res.status(403).json({ message: 'You can only access your own account' });
}

// GET /api/users  (admin only)
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/users/:id  (self or admin)
router.get('/:id', protect, checkId, selfOrAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/users/:id  (self or admin) - name, phone, password; only admin can change role
router.put('/:id', protect, checkId, selfOrAdmin, async (req, res) => {
  try {
    const { name, phone, password, role } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: 'Name cannot be empty' });
      user.name = name;
    }
    if (phone !== undefined) user.phone = phone;
    if (password !== undefined) {
      if (String(password).length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      }
      user.password = await bcrypt.hash(password, 10);
    }
    if (role !== undefined) {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Only an admin can change roles' });
      }
      if (!['customer', 'admin'].includes(role)) {
        return res.status(400).json({ message: 'Role must be customer or admin' });
      }
      user.role = role;
    }

    await user.save();
    res.json({ id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// DELETE /api/users/:id  (admin only, not yourself)
router.delete('/:id', protect, adminOnly, checkId, async (req, res) => {
  try {
    if (req.user._id.equals(req.params.id)) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;