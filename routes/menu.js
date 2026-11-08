const express = require('express');
const mongoose = require('mongoose');
const MenuItem = require('../models/MenuItem');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

const CATEGORIES = ['starter', 'main', 'dessert', 'beverage'];

// Checks the data before saving. Returns an error message, or null if it is fine.
function validateMenuItem(body, isUpdate = false) {
  const { name, category, price } = body;

  if (!isUpdate || name !== undefined) {
    if (!name || !String(name).trim()) return 'Name is required';
  }
  if (!isUpdate || category !== undefined) {
    if (!CATEGORIES.includes(category)) {
      return 'Category must be one of: ' + CATEGORIES.join(', ');
    }
  }
  if (!isUpdate || price !== undefined) {
    if (typeof price !== 'number' || Number.isNaN(price) || price <= 0) {
      return 'Price must be a number greater than 0';
    }
  }
  return null;
}

// GET /api/menu  (public) - optional filters: ?category=main&search=pasta&maxPrice=20&dietary=vegetarian
router.get('/', async (req, res) => {
  try {
    const { category, search, maxPrice, dietary } = req.query;
    const filter = {};

    if (category) filter.category = category;
    if (dietary) filter.dietary = dietary;
    if (maxPrice) filter.price = { $lte: Number(maxPrice) };
    if (search) filter.name = { $regex: search, $options: 'i' };

    const items = await MenuItem.find(filter).sort({ category: 1, name: 1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/menu/:id  (public)
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid menu item id' });
    }
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Menu item not found' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/menu  (admin only)
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const problem = validateMenuItem(req.body);
    if (problem) return res.status(400).json({ message: problem });

    const item = await MenuItem.create(req.body);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/menu/:id  (admin only)
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid menu item id' });
    }
    const problem = validateMenuItem(req.body, true);
    if (problem) return res.status(400).json({ message: problem });

    const item = await MenuItem.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!item) return res.status(404).json({ message: 'Menu item not found' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// DELETE /api/menu/:id  (admin only)
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid menu item id' });
    }
    const item = await MenuItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: 'Menu item not found' });
    res.json({ message: 'Menu item deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;