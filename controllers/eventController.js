// controllers/eventController.js
const Event = require('../models/Event');

// Get all events
exports.getEvents = async (req, res) => {
  try {
    const events = await Event.find();
    
    // Jangan kirim base64 data dalam response untuk daftar event
    const eventsWithoutBase64 = events.map(event => {
      const eventObj = event.toObject();
      if (eventObj.backgroundImage) {
        eventObj.hasBackgroundImage = true;
        delete eventObj.backgroundImage; // Hapus data base64 dari response
      } else {
        eventObj.hasBackgroundImage = false;
      }
      return eventObj;
    });
    
    res.json(eventsWithoutBase64);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Get single event by ID
exports.getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ message: 'Event tidak ditemukan' });
    }
    
    // Event tunggal tidak perlu mengirimkan data base64 dalam response
    const eventObj = event.toObject();
    if (eventObj.backgroundImage) {
      eventObj.hasBackgroundImage = true;
      delete eventObj.backgroundImage; // Hapus data base64 dari response
    } else {
      eventObj.hasBackgroundImage = false;
    }
    
    res.json(eventObj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Get single event by slug - untuk halaman pendaftaran publik
exports.getEventBySlug = async (req, res) => {
  try {
    const event = await Event.findOne({ registrationSlug: req.params.slug });
    
    if (!event) {
      return res.status(404).json({ message: 'Event tidak ditemukan' });
    }
    
    // Untuk halaman pendaftaran publik, kita perlu mengirimkan data base64
    // Tapi kita perlu memastikan data yang dikirim tidak terlalu besar
    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Get event image by ID - untuk menampilkan gambar sebagai endpoint terpisah
exports.getEventImage = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event || !event.backgroundImage) {
      return res.status(404).send('Image not found');
    }
    
    // Set tipe konten berdasarkan tipe gambar yang disimpan
    const contentType = event.backgroundImageType || 'image/jpeg';
    
    // Jika string base64 sudah berisi prefix data URI, kita perlu menghapusnya
    let base64Data = event.backgroundImage;
    if (base64Data.startsWith('data:')) {
      base64Data = base64Data.split(',')[1];
    }
    
    // Konversi base64 menjadi buffer
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Set header dan kirim respons
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400'); // Cache selama 24 jam
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving image');
  }
};

// Create a new event
exports.createEvent = async (req, res) => {
  try {
    let { 
      nama, 
      tanggal, 
      lokasi, 
      deskripsi, 
      backgroundColor, 
      customFields,
      backgroundImage, // Menerima data base64
      backgroundImageType // Menerima tipe MIME
    } = req.body;
    
    // Parse customFields jika dalam bentuk string
    if (customFields && typeof customFields === 'string') {
      try {
        customFields = JSON.parse(customFields);
      } catch (error) {
        customFields = [];
      }
    }

    // Generate slug untuk registrasi
    const slug = generateSlug(nama);
    
    // Bersihkan data base64 jika ada prefix URI
    if (backgroundImage && backgroundImage.startsWith('data:')) {
      backgroundImage = backgroundImage.split(',')[1];
    }
    
    // Buat event baru
    const event = new Event({
      nama,
      tanggal,
      lokasi,
      deskripsi,
      backgroundColor,
      backgroundImage,
      backgroundImageType: backgroundImageType || 'image/jpeg',
      registrationSlug: slug,
      customFields
    });
    
    const savedEvent = await event.save();
    
    // Jangan kirim data base64 dalam response
    const eventResponse = savedEvent.toObject();
    if (eventResponse.backgroundImage) {
      eventResponse.hasBackgroundImage = true;
      delete eventResponse.backgroundImage;
    } else {
      eventResponse.hasBackgroundImage = false;
    }
    
    res.status(201).json(eventResponse);
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

// Update an event
exports.updateEvent = async (req, res) => {
  try {
    let { 
      nama, 
      tanggal, 
      lokasi, 
      deskripsi, 
      backgroundColor, 
      customFields,
      backgroundImage,
      backgroundImageType,
      removeBackgroundImage // Flag untuk menghapus gambar
    } = req.body;
    
    // Parse customFields jika dalam bentuk string
    if (customFields && typeof customFields === 'string') {
      try {
        customFields = JSON.parse(customFields);
      } catch (error) {
        customFields = null;
      }
    }

    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ message: 'Event tidak ditemukan' });
    }
    
    // Update fields
    event.nama = nama || event.nama;
    event.tanggal = tanggal || event.tanggal;
    event.lokasi = lokasi || event.lokasi;
    event.deskripsi = deskripsi !== undefined ? deskripsi : event.deskripsi;
    event.backgroundColor = backgroundColor || event.backgroundColor;
    
    // Update custom fields jika diberikan
    if (customFields) {
      event.customFields = customFields;
    }
    
    // Update gambar
    if (removeBackgroundImage) {
      // Hapus gambar jika flag remove diberikan
      event.backgroundImage = null;
      event.backgroundImageType = null;
    } else if (backgroundImage) {
      // Bersihkan data base64 jika ada prefix URI
      if (backgroundImage.startsWith('data:')) {
        backgroundImage = backgroundImage.split(',')[1];
      }
      
      // Update gambar dan tipe
      event.backgroundImage = backgroundImage;
      event.backgroundImageType = backgroundImageType || 'image/jpeg';
    }
    
    const updatedEvent = await event.save();
    
    // Jangan kirim data base64 dalam response
    const eventResponse = updatedEvent.toObject();
    if (eventResponse.backgroundImage) {
      eventResponse.hasBackgroundImage = true;
      delete eventResponse.backgroundImage;
    } else {
      eventResponse.hasBackgroundImage = false;
    }
    
    res.json(eventResponse);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Delete an event
exports.deleteEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ message: 'Event tidak ditemukan' });
    }
    
    await event.deleteOne();
    
    res.json({ message: 'Event berhasil dihapus' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Helper function to generate a slug
function generateSlug(name) {
  const base = name
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')     // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-')   // Replace multiple - with single -
    .replace(/^-+/, '')       // Trim - from start of text
    .replace(/-+$/, '');      // Trim - from end of text
  
  // Add a random string to ensure uniqueness
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${base}-${randomStr}`;
}

exports.updateCustomFields = async (req, res) => {
  try {
    const eventId = req.params.id;
    const { customFields } = req.body;
    
    const event = await Event.findById(eventId);
    
    if (!event) {
      return res.status(404).json({ message: 'Event tidak ditemukan' });
    }
    
    // Validate custom fields format
    if (!Array.isArray(customFields)) {
      return res.status(400).json({ message: 'customFields harus berupa array' });
    }
    
    // Ensure each custom field has required properties
    for (const field of customFields) {
      if (!field.fieldId || !field.label || !field.type) {
        return res.status(400).json({ 
          message: 'Setiap custom field harus memiliki fieldId, label, dan type' 
        });
      }
      
      // If field type is select, checkbox, or radio, ensure options array exists
      if (['select', 'checkbox', 'radio'].includes(field.type) && 
          (!Array.isArray(field.options) || field.options.length === 0)) {
        return res.status(400).json({ 
          message: `Field ${field.label} dengan tipe ${field.type} harus memiliki array options yang tidak kosong` 
        });
      }
    }
    
    // Update custom fields
    event.customFields = customFields;
    
    await event.save();
    
    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};