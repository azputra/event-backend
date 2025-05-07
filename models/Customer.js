// models/Customer.js
const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true
  },
  noHp: {
    type: String,
    required: true
  },
  nama: {
    type: String,
    required: true
  },
  alamat: {
    type: String,
    required: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  barcode: {
    type: String
  },
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  deletedAt: {
    type: Date,
    default: null
  }
});

module.exports = mongoose.model('Customer', CustomerSchema);