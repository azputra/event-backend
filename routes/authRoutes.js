// routes/authRoutes.js
const express = require('express');
const { login, register } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
// Hanya admin yang bisa register user baru
router.post('/register', protect, authorize('admin'), register);

module.exports = router;