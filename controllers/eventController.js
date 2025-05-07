// controllers/eventController.js
const Event = require('../models/Event');

// Get semua event
exports.getEvents = async (req, res) => {
  try {
    const events = await Event.find({});
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Get event by ID
exports.getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ message: 'Event tidak ditemukan' });
    }
    
    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Create event (admin only)
exports.createEvent = async (req, res) => {
  try {
    const { nama, tanggal, lokasi, deskripsi } = req.body;
    
    const event = await Event.create({
      nama,
      tanggal,
      lokasi,
      deskripsi
    });
    
    res.status(201).json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Update event (admin only)
exports.updateEvent = async (req, res) => {
  try {
    const { nama, tanggal, lokasi, deskripsi } = req.body;
    
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ message: 'Event tidak ditemukan' });
    }
    
    event.nama = nama || event.nama;
    event.tanggal = tanggal || event.tanggal;
    event.lokasi = lokasi || event.lokasi;
    event.deskripsi = deskripsi || event.deskripsi;
    
    const updatedEvent = await event.save();
    
    res.json(updatedEvent);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Delete event (admin only) - alternative method
exports.deleteEvent = async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    
    if (!event) {
      return res.status(404).json({ message: 'Event tidak ditemukan' });
    }
    
    res.json({ message: 'Event berhasil dihapus' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};