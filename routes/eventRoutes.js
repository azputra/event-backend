// routes/eventRoutes.js
const express = require('express');
const { 
  getEvents, 
  getEventById, 
  createEvent, 
  updateEvent, 
  deleteEvent,
  getEventBySlug,
  getEventImage,
  updateCustomFields,
  getEventParticipantCount
} = require('../controllers/eventController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, getEvents);
router.get('/:id', protect, getEventById);
router.post('/', protect, createEvent);
router.put('/:id', protect, updateEvent);
router.delete('/:id', protect, deleteEvent);
router.get('/slug/:slug', getEventBySlug);
router.get('/image/:id', getEventImage);
router.put('/:id/custom-fields', protect, updateCustomFields);
router.get('/:id/count', getEventParticipantCount);

module.exports = router;