// routes/userRoutes.js
const express = require('express');
const { 
  getUsers, 
  getUser, 
  updateUser, 
  deleteUser 
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// All these routes require authentication and admin privileges
router.use(protect);
router.use(authorize('admin'));

router
  .route('/')
  .get(getUsers);

router
  .route('/:id')
  .get(getUser)
  .put(updateUser)
  .delete(deleteUser);

module.exports = router;