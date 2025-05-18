// controllers/customerController.js
const Customer = require('../models/Customer');
const Event = require('../models/Event');
const twilio = require('twilio');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// Setup Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Create customer (admin only)
exports.createCustomer = async (req, res) => {
  try {
    const { email, noHp, nama, event, alamat, ...dynamicFields } = req.body;

    // Dapatkan event untuk validasi customFields
    const eventData = await Event.findById(event);
    if (!eventData) {
      return res.status(404).json({ message: 'Event tidak ditemukan' });
    }

    // Create customer with fixed fields
    const customer = new Customer({
      email,
      noHp,
      nama,
      event,
      alamat
    });
    
    if (Object.keys(dynamicFields).length > 0) {
      // Get event to validate fields (optional)
      const eventData = await Event.findById(event);
      
      // If event exists and has customFields defined
      if (eventData && eventData.customFields && eventData.customFields.length > 0) {
        // Get list of valid fieldIds from event
        const validFieldIds = eventData.customFields.map(field => field.fieldId);
        
        // Add only valid fields to registrationData
        for (const [key, value] of Object.entries(dynamicFields)) {
          if (validFieldIds.includes(key)) {
            customer.registrationData.set(key, value);
          }
        }
      } else {
        // If event doesn't exist or has no customFields, just add all dynamic fields
        for (const [key, value] of Object.entries(dynamicFields)) {
          customer.registrationData.set(key, value);
        }
      }
    }
    
    // Save customer to get the ID
    await customer.save();
    
    // Generate barcode data with customer details
    const barcodeData = JSON.stringify({
      customerId: customer._id,
      eventId: customer.event,
      email: customer.email
    });
    
    // Create temporary file path for QR code
    const tempDir = path.join(__dirname, '../temp');
    
    // Make sure directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const qrFilename = `qr-${customer._id}.png`;
    const qrFilePath = path.join(tempDir, qrFilename);
    
    // Generate QR code and save to file
    await QRCode.toFile(qrFilePath, barcodeData);
    
    // Upload to Cloudinary
    const cloudinaryResult = await cloudinary.uploader.upload(qrFilePath, {
      folder: 'event-qrcodes',
      public_id: `qr-${customer._id}`,
      overwrite: true
    });
    
    // Store the cloudinary URL in the customer record
    customer.barcode = cloudinaryResult.secure_url;
    await customer.save();
    
    // Clean up local file
    fs.unlinkSync(qrFilePath);
    
    // Format nomor WhatsApp penerima (format E.164)
    let recipientNumber = customer.noHp;
    
    // Pastikan format nomor diawali dengan kode negara (+62) dan tidak ada spasi atau karakter lain
    if (recipientNumber.startsWith('0')) {
      recipientNumber = '+62' + recipientNumber.substring(1);
    } else if (!recipientNumber.startsWith('+')) {
      recipientNumber = '+' + recipientNumber;
    }
    
    // Hapus spasi, tanda hubung, dan karakter lain yang tidak diizinkan
    recipientNumber = recipientNumber.replace(/\s+|-|\(|\)/g, '');
    
    // Generate registration details untuk pesan WhatsApp
    let registrationDetails = '';
    if (customer.registrationData.size > 0) {
      registrationDetails = '\n\n*Detail Pendaftaran:*\n';
      
      // Create a map of field IDs to labels from event's customFields
      const fieldLabels = {};
      eventData.customFields.forEach(field => {
        fieldLabels[field.fieldId] = field.label;
      });
      
      for (const [key, value] of customer.registrationData) {
        const label = fieldLabels[key] || key;
        
        // Handle different types of values (checkbox arrays, etc)
        let displayValue = value;
        if (Array.isArray(value)) {
          displayValue = value.join(', ');
        }
        
        registrationDetails += `• *${label}:* ${displayValue}\n`;
      }
    }
    
    // Buat pesan WhatsApp
    const whatsappMessage = 
      `*TIKET EVENT*\n\n` +
      `Halo *${customer.nama}*,\n\n` +
      `Terima kasih telah mendaftar. Berikut adalah tiket digital Anda:\n\n` +
      `*ID Tiket:* ${customer._id}\n` +
      `${registrationDetails}\n` +
      `*Petunjuk:*\n` +
      `1. Simpan pesan ini untuk referensi Anda.\n` +
      `2. Tunjukkan QR code kepada petugas saat acara berlangsung.\n` +
      `3. Pastikan perangkat Anda sudah terisi daya.\n\n` +
      `Jika Anda memiliki pertanyaan atau membutuhkan bantuan, jangan ragu untuk menghubungi petugas kami`;

    try {
      // Kirim QR code yang disimpan di Cloudinary
      const mediaMessage = await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${recipientNumber}`,
        body: whatsappMessage, 
        mediaUrl: cloudinaryResult.secure_url
      });
      // Berhasil mengirim pesan text
      res.status(201).json({
        customer,
        message: 'Peserta created and WhatsApp message sent successfully'
      });
    } catch (whatsappErr) {
      console.error('Error sending WhatsApp:', whatsappErr);
      res.status(201).json({
        customer,
        warning: 'Peserta created but WhatsApp delivery failed: ' + whatsappErr.message
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Update customer (admin only)
exports.updateCustomer = async (req, res) => {
  try {
    const { email, noHp, nama, event, alamat, ...dynamicFields } = req.body;
    
    const customer = await Customer.findById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({ message: 'Peserta tidak ditemukan' });
    }
    
    // Update fixed fields
    customer.email = email || customer.email;
    customer.noHp = noHp || customer.noHp;
    customer.nama = nama || customer.nama;
    
    // Only update event if it's provided
    if (event && event !== customer.event.toString()) {
      customer.event = event;
      
      // Clear existing registration data since event is changing
      customer.registrationData.clear();
    }
    
    customer.alamat = alamat || customer.alamat;
    
    // Update dynamic fields
    if (Object.keys(dynamicFields).length > 0) {
      // Get event to validate fields
      const eventData = await Event.findById(customer.event);
      if (eventData) {
        // Optionally validate fields against eventData.customFields
        
        for (const [key, value] of Object.entries(dynamicFields)) {
          customer.registrationData.set(key, value);
        }
      }
    }
    
    const updatedCustomer = await customer.save();
    
    res.json(updatedCustomer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Get semua customer
exports.getCustomers = async (req, res) => {
  try {
    const customers = await Customer.find({ deletedAt: null })
      .populate('event', 'nama tanggal lokasi');
    res.json(customers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Soft delete customer (admin only)
exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({ message: 'Peserta tidak ditemukan' });
    }
    
    customer.deletedAt = Date.now();
    await customer.save();
    
    res.json({ message: 'Peserta berhasil dihapus' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Verify customer barcode
exports.verifyCustomer = async (req, res) => {
  try {
    const { customerId, eventId } = req.body;
    
    const customer = await Customer.findById(customerId)
      .populate('event', 'nama tanggal lokasi');
    
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Data customer tidak ditemukan' 
      });
    }
    
    if (customer.deletedAt) {
      return res.status(400).json({ 
        success: false, 
        message: 'Peserta sudah dihapus' 
      });
    }
    
    if (customer.isVerified) {
      return res.status(400).json({ 
        success: false, 
        message: 'Peserta sudah diverifikasi sebelumnya' 
      });
    }
    
    if (customer.event._id.toString() !== eventId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Barcode tidak valid untuk event ini' 
      });
    }
    
    customer.isVerified = true;
    customer.verifiedAt = Date.now();
    await customer.save();
    
    // Construct response with customer details
    const customerDetails = {
      nama: customer.nama,
      email: customer.email,
      noHp: customer.noHp,
      verifiedAt: customer.verifiedAt,
      event: customer.event.nama,
      registrationData: {}
    };
    
    // Add dynamic fields
    if (customer.registrationData.size > 0) {
      // Get event to get field labels
      const eventData = await Event.findById(customer.event._id);
      if (eventData) {
        // Create a map of field IDs to labels
        const fieldLabels = {};
        eventData.customFields.forEach(field => {
          fieldLabels[field.fieldId] = field.label;
        });
        
        // Add each dynamic field with proper label
        for (const [key, value] of customer.registrationData.entries()) {
          const label = fieldLabels[key] || key;
          customerDetails.registrationData[label] = value;
        }
      } else {
        // Just add raw data if event not found
        for (const [key, value] of customer.registrationData.entries()) {
          customerDetails.registrationData[key] = value;
        }
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Peserta berhasil diverifikasi',
      customer: customerDetails
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Get available form fields for an event
exports.getEventFormFields = async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const event = await Event.findById(eventId);
    
    if (!event) {
      return res.status(404).json({ message: 'Event tidak ditemukan' });
    }
    
    res.json(event.customFields || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};