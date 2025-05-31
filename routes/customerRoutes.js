// routes/customerRoutes.js
const express = require('express');
const { 
  getCustomers, 
  createCustomer, 
  updateCustomer, 
  deleteCustomer,
  verifyCustomer,
  getEventFormFields,
  resendEmails
} = require('../controllers/customerController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, getCustomers);
router.post('/', createCustomer);
router.put('/:id', protect, updateCustomer);
router.delete('/:id', protect, deleteCustomer);
router.post('/verify', protect, verifyCustomer);
router.get('/event-fields/:eventId', getEventFormFields);
router.post('/resend-emails', resendEmails);

module.exports = router;