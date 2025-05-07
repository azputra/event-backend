// models/Event.js
const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  nama: {
    type: String,
    required: true
  },
  tanggal: {
    type: Date,
    required: true
  },
  lokasi: {
    type: String,
    required: true
  },
  deskripsi: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Event', EventSchema);