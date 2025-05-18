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
  deskripsi: {
    type: String
  },
  backgroundColor: {
    type: String,
    default: '#ffffff'
  },
  backgroundImage: {
    type: String 
  },
  backgroundImageType: {
    type: String
  },
  registrationSlug: {
    type: String,
    unique: true
  },
  customFields: [{
    fieldId: String,
    label: String,
    type: {
      type: String,
      enum: ['text', 'select', 'textarea', 'checkbox', 'radio'],
      default: 'text'
    },
    required: {
      type: Boolean,
      default: false
    },
    options: [String],
    placeholder: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Event', EventSchema);