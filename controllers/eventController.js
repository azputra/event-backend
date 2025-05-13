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

// controllers/eventController.js
exports.createEvent = async (req, res) => {
  try {
    const { nama, tanggal, lokasi, deskripsi, backgroundColor } = req.body;
    
    const event = await Event.create({
      nama,
      tanggal,
      lokasi,
      deskripsi,
      backgroundColor: backgroundColor || '#ffffff'
    });
    
    res.status(201).json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Also update the updateEvent function
exports.updateEvent = async (req, res) => {
  try {
    const { nama, tanggal, lokasi, deskripsi, backgroundColor } = req.body;
    
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ message: 'Event tidak ditemukan' });
    }
    
    event.nama = nama || event.nama;
    event.tanggal = tanggal || event.tanggal;
    event.lokasi = lokasi || event.lokasi;
    event.deskripsi = deskripsi || event.deskripsi;
    event.backgroundColor = backgroundColor || event.backgroundColor;
    
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

// Get event by slug
exports.getEventBySlug = async (req, res) => {
  try {
    const event = await Event.findOne({ registrationSlug: req.params.slug });
    
    if (!event) {
      return res.status(404).json({ message: 'Event tidak ditemukan' });
    }
    
    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};