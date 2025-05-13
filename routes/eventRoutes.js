// routes/eventRoutes.js
const express = require('express');
const { 
  getEvents, 
  getEventById, 
  createEvent, 
  updateEvent, 
  deleteEvent,
  getEventBySlug
} = require('../controllers/eventController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, getEvents);
router.get('/:id', protect, getEventById);
router.post('/', protect, authorize('admin'), createEvent);
router.put('/:id', protect, authorize('admin'), updateEvent);
router.delete('/:id', protect, authorize('admin'), deleteEvent);
router.get('/slug/:slug', getEventBySlug);

module.exports = router;