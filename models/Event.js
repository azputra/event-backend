// models/Event.js
const mongoose = require('mongoose');
const shortid = require('shortid');

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
  backgroundColor: {
    type: String,
    default: '#ffffff' // Default white color
  },
  registrationSlug: {
    type: String,
    default: shortid.generate,
    unique: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Event', EventSchema);