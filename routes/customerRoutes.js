// routes/customerRoutes.js
const express = require('express');
const { 
  getCustomers, 
  createCustomer, 
  updateCustomer, 
  deleteCustomer,
  verifyCustomer,
  getEventFormFields
} = require('../controllers/customerController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, getCustomers);
router.post('/', createCustomer);
router.put('/:id', protect, authorize('admin'), updateCustomer);
router.delete('/:id', protect, authorize('admin'), deleteCustomer);
router.post('/verify', protect, verifyCustomer);
router.get('/event-fields/:eventId', getEventFormFields);

module.exports = router;