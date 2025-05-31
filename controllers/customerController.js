// controllers/customerController.js
const Customer = require('../models/Customer');
const Event = require('../models/Event');
const twilio = require('twilio');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();
const mailjet = require('node-mailjet').apiConnect(
  process.env.MAILJET_API_KEY,
  process.env.MAILJET_SECRET_KEY
);

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

    // Cek jumlah pendaftar untuk event ini
    const registeredCount = await Customer.countDocuments({
      event: event,
      deletedAt: null // Hanya hitung peserta yang tidak dihapus
    });

    // Jika sudah mencapai batas 1700 peserta, tolak pendaftaran
    if (registeredCount >= 1700) {
      return res.status(400).json({
        message: 'Batas maksimum pendaftar sudah tercapai. Pendaftaran telah ditutup.'
      });
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
    
    // Format nomor WhatsApp penerima (format E.164) - Keeping this for future use
    let recipientNumber = customer.noHp;
    
    // Pastikan format nomor diawali dengan kode negara (+62) dan tidak ada spasi atau karakter lain
    if (recipientNumber.startsWith('0')) {
      recipientNumber = '+62' + recipientNumber.substring(1);
    } else if (!recipientNumber.startsWith('+')) {
      recipientNumber = '+' + recipientNumber;
    }
    
    // Hapus spasi, tanda hubung, dan karakter lain yang tidak diizinkan
    recipientNumber = recipientNumber.replace(/\s+|-|\(|\)/g, '');
    
    // Generate registration details for the email
    let emailRegistrationDetails = '';
    if (customer.registrationData.size > 0) {
      emailRegistrationDetails = '<div class="registration-details">';
      emailRegistrationDetails += '<h3>Detail Pendaftaran:</h3>';
      emailRegistrationDetails += '<ul>';
      
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
        
        emailRegistrationDetails += `<li><strong>${label}:</strong> ${displayValue}</li>`;
      }
      
      emailRegistrationDetails += '</ul></div>';
    }
    
    // HTML template for email using cloudinary URL directly
    const emailTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Tiket Event</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f9f9f9;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
          }
          .header {
            background: linear-gradient(135deg, #6b46c1 0%, #9f7aea 100%);
            color: white;
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
            letter-spacing: 1px;
          }
          .content {
            padding: 30px;
          }
          .ticket-info {
            background-color: #f3f4f6;
            border-radius: 8px;
            padding: 25px;
            margin: 20px 0;
            text-align: center;
          }
          .qr-code {
            margin: 20px auto;
            text-align: center;
          }
          .qr-code img {
            max-width: 220px;
            height: auto;
            border: 8px solid white;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }
          .ticket-id {
            font-family: monospace;
            font-size: 16px;
            background: #edf2f7;
            padding: 10px;
            border-radius: 4px;
            margin: 15px 0;
            display: inline-block;
            word-break: break-all;
          }
          .registration-details {
            margin: 25px 0;
            text-align: left;
            background-color: #f9f9f9;
            padding: 15px;
            border-radius: 8px;
          }
          .registration-details ul {
            padding-left: 20px;
          }
          .registration-details li {
            margin-bottom: 8px;
          }
          .footer {
            background-color: #f3f4f6;
            padding: 20px;
            text-align: center;
            font-size: 14px;
            color: #666;
          }
          .instructions {
            margin: 25px 0;
            line-height: 1.7;
          }
          .highlight {
            color: #6b46c1;
            font-weight: 600;
          }
          .button {
            display: inline-block;
            background-color: #6b46c1;
            color: white;
            padding: 12px 24px;
            border-radius: 4px;
            text-decoration: none;
            font-weight: 500;
            margin: 15px 0;
            transition: background-color 0.2s;
          }
          .button:hover {
            background-color: #553c9a;
          }
          .terms-conditions {
            margin: 25px 0;
            background-color: #f3f4f6;
            padding: 20px;
            border-radius: 8px;
            text-align: left;
          }
          .terms-conditions h3 {
            color: #6b46c1;
            margin-top: 0;
          }
          .terms-conditions ol {
            padding-left: 20px;
          }
          .terms-conditions li {
            margin-bottom: 10px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>TIKET EVENT</h1>
          </div>
          
          <div class="content">
            <p>Halo <span class="highlight">${customer.nama}</span>,</p>
            
            <p>Terima kasih telah mendaftar. Berikut adalah tiket digital Anda:</p>
            
            <div class="ticket-info">
              <div class="qr-code">
                <img src="${cloudinaryResult.secure_url}" alt="Barcode" />
              </div>
              
              <div class="ticket-id">
                ID Tiket: ${customer._id}
              </div>
            </div>
            
            ${emailRegistrationDetails}
            
            <div class="terms-conditions">
              <h3>Terms & Conditions – Me-O Cat Fun Day</h3>
              <ol>
                <li>Peserta wajib mendaftar melalui Link pendaftaran & melakukan registrasi ulang saat event mulai pukul 05.30 - 06.15 WIB</li>
                <li>Peserta diperbolehkan membawa Kucing maksimal 1 ekor kucing.</li>
                <li>Pastikan anabul dalam kondisi sehat sebelum di bawa ya sohib.</li>
                <li>Sohib yang membawa kucing wajib menggunakan pet cargo.</li>
                <li>Sohib yang ikut funwalk bisa menitipkan anabul di area penitipan anabul di area venue.</li>
                <li>Ukuran tshirt akan disesuaikan dengan stock ya sohib</li>
                <li>Jangan lupa bawa kebutuhan-kebutuhan kucing kamu yaa</li>
                <li>Kucing adalah tanggung jawab penuh pemilik selama acara berlangsung.</li>
                <li>Dilarang membawa hewan selain kucing.</li>
              </ol>
            </div>
            
            <div class="instructions">
              <p><strong>Petunjuk:</strong></p>
              <ol>
                <li>Simpan email ini untuk referensi Anda.</li>
                <li>Tunjukkan QR code kepada petugas saat acara berlangsung.</li>
                <li>Pastikan perangkat Anda sudah terisi daya.</li>
              </ol>
            </div>
            
            <p>Jika Anda memiliki pertanyaan atau membutuhkan bantuan, jangan ragu untuk menghubungi kami. Jika barcode tidak terlihat pindahkan email ini dari folder spam, maka barcode akan otomatis terlihat.</p>
            
            <div style="text-align: center;">
              <a style="color: white;" href="https://wa.me/081322113345?text=Hubungi%20Kami" class="button">Hubungi Kami</a>
            </div>
          </div>
          
          <div class="footer">
            <p>Jika QR code tidak muncul, silakan hubungi kami di <a href="mailto:${process.env.EMAIL_USER}">${process.env.EMAIL_USER}</a></p>
            <p>&copy; ${new Date().getFullYear()} Event Organizer. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      // Send email with Mailjet
      const mailjetRequest = await mailjet
        .post("send", {'version': 'v3.1'})
        .request({
          "Messages": [
            {
              "From": {
                "Email": process.env.EMAIL_USER,
                "Name": "Me-O Cat Fun Day"
              },
              "To": [
                {
                  "Email": customer.email,
                  "Name": customer.nama
                }
              ],
              "Subject": "Tiket Event Anda",
              "HTMLPart": emailTemplate
            }
          ]
        });
      
      res.status(201).json({
        customer,
        message: 'Peserta created and email sent successfully'
      });
    } catch (emailErr) {
      console.error('Error sending email:', emailErr);
      
      res.status(201).json({
        customer,
        warning: 'Peserta created but email delivery failed',
        emailError: emailErr.message
      });
    } finally {
      // Clean up local file
      if (fs.existsSync(qrFilePath)) {
        fs.unlinkSync(qrFilePath);
      }
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

const axios = require('axios');

exports.resendEmails = async (req, res) => {
  try {
    const { customers } = req.body; // Expecting an array of complete customer objects
    
    if (!customers || !Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid customer data provided. Please provide an array of customer objects.'
      });
    }

    // Helper function untuk create attachment dari URL
    async function createAttachmentFromUrl(imageUrl, filename, contentType = "image/png") {
      try {
        console.log(`📥 Downloading ${filename} from ${imageUrl}`);
        const response = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        
        console.log(`✅ Successfully downloaded ${filename} (${response.data.byteLength} bytes)`);
        return {
          ContentType: contentType,
          Filename: filename,
          Base64Content: Buffer.from(response.data).toString('base64')
        };
      } catch (error) {
        console.error(`❌ Error downloading ${filename}:`, error.message);
        return null;
      }
    }

    const results = {
      success: [],
      failed: []
    };

    // Process each customer
    for (const customer of customers) {
      try {
        if (!customer._id || !customer.email || !customer.nama || !customer.barcode) {
          results.failed.push({
            id: customer._id || 'unknown',
            error: 'Missing required customer data (id, email, nama, or barcode)'
          });
          continue;
        }

        console.log(`📧 Processing email for ${customer.nama}...`);

        // Get event data
        const event = customer.event || { nama: 'ME-O Cat Fun Day' };

        // Generate registration details for the email
        let emailRegistrationDetails = '';
        if (customer.registrationData && Object.keys(customer.registrationData).length > 0) {
          emailRegistrationDetails = `
            <div class="registration-details">
              <h3 style="color: #ff6b35; margin: 0 0 15px 0;">📋 Detail Pendaftaran Kamu</h3>
              <ul style="padding-left: 20px; margin: 0;">
          `;
          
          // Field labels - use a mapping if available
          const fieldLabels = {
            'olahragayangdiikutifunwalkzumba9858': 'Olahraga yang diikuti',
            'ukurankaos6066': 'Ukuran Kaos',
            'apakahakanmembawakucing1223': 'Apakah akan membawa kucing'
          };
          
          for (const [key, value] of Object.entries(customer.registrationData)) {
            const label = fieldLabels[key] || key;
            
            // Handle different types of values (checkbox arrays, etc)
            let displayValue = value;
            if (Array.isArray(value)) {
              displayValue = value.join(', ');
            }
            
            emailRegistrationDetails += `
              <li style="margin-bottom: 10px; color: #495057;">
                <strong>${label}:</strong> ${displayValue}
              </li>
            `;
          }
          
          emailRegistrationDetails += '</ul></div>';
        }

        // Create attachments array
        const attachments = [];

        // Attachment 1: QR Code dari customer.barcode
        if (customer.barcode) {
          const qrAttachment = await createAttachmentFromUrl(
            customer.barcode,
            `QR-Tiket-${customer.nama.replace(/[^a-zA-Z0-9]/g, '-')}-${customer._id}.png`,
            "image/png"
          );
          
          if (qrAttachment) {
            attachments.push(qrAttachment);
            console.log(`✅ QR Code attachment created for ${customer.nama}`);
          }
        }

        // Check if we have QR attachment for email template
        const hasQrAttachment = attachments.some(att => att.Filename.includes('QR-Tiket'));
        
        // HTML template for email
        const emailTemplate = `
  <!DOCTYPE html>
  <html lang="id">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>Me-O Cat Fun Day - Tiket Digital</title>
    <style>
      /* Reset styles */
      body, table, td, p { margin: 0; padding: 0; }
      body { 
        font-family: Arial, Helvetica, sans-serif;
        line-height: 1.6;
        color: #333333;
        background-color: #f9f9f9;
        width: 100% !important;
        -webkit-text-size-adjust: 100%;
        -ms-text-size-adjust: 100%;
      }
      
      /* Dark mode support */
      [data-ogsc] body { background-color: #1a1a1a !important; color: #ffffff !important; }
      [data-ogsc] .container { background-color: #2d2d2d !important; }
      [data-ogsc] .content { background-color: #2d2d2d !important; color: #ffffff !important; }
      [data-ogsc] .ticket-info { background-color: #404040 !important; }
      [data-ogsc] .terms-conditions { background-color: #404040 !important; }
      
      table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      img { border: 0; display: block; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; max-width: 100%; height: auto; }
      
      .container {
        max-width: 600px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
      }
      
      .header {
        background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
        color: white;
        padding: 30px 20px;
        text-align: center;
      }
      
      .header h1 {
        margin: 0;
        font-size: 28px;
        font-weight: 700;
        letter-spacing: 1px;
      }
      
      .content {
        padding: 30px 20px;
      }
      
      .ticket-info {
        background-color: #f8f9fa;
        border-radius: 12px;
        padding: 25px;
        margin: 20px 0;
        text-align: center;
        border: 2px dashed #ff6b35;
      }
      
      .qr-code {
        margin: 20px auto;
        text-align: center;
      }
      
      .qr-code img {
        max-width: 200px;
        height: auto;
        border: 4px solid white;
        border-radius: 8px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        margin: 0 auto;
      }
      
      .ticket-id {
        font-family: 'Courier New', monospace;
        font-size: 14px;
        background: #e9ecef;
        padding: 10px 15px;
        border-radius: 6px;
        margin: 15px 0;
        display: inline-block;
        word-break: break-all;
        color: #495057;
      }
      
      .event-details {
        background: linear-gradient(45deg, #ff6b35, #f7931e);
        color: white;
        padding: 20px;
        border-radius: 8px;
        margin: 20px 0;
        text-align: left;
      }
      
      .event-details h2 { margin: 0 0 15px 0; font-size: 24px; text-align: center; }
      .event-details p { margin: 8px 0; font-size: 16px; }
      
      .registration-details {
        margin: 25px 0;
        background-color: #f8f9fa;
        padding: 20px;
        border-radius: 8px;
        border-left: 4px solid #ff6b35;
      }
      
      .attachment-notice {
        background: linear-gradient(45deg, #28a745, #20c997);
        color: white;
        border-radius: 8px;
        padding: 20px;
        margin: 20px 0;
        text-align: center;
      }
      
      .attachment-list {
        background-color: #e7f3ff;
        border: 1px solid #b3d9ff;
        border-radius: 8px;
        padding: 15px;
        margin: 15px 0;
      }
      
      .terms-conditions {
        margin: 25px 0;
        background-color: #fff3cd;
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #ffeaa7;
      }
      
      .terms-conditions h3 {
        color: #856404;
        margin: 0 0 15px 0;
        font-size: 18px;
      }
      
      .terms-conditions ol {
        padding-left: 20px;
        margin: 0;
      }
      
      .terms-conditions li {
        margin-bottom: 8px;
        color: #856404;
        font-size: 14px;
      }
      
      .contact-button {
        display: inline-block;
        background: linear-gradient(45deg, #25d366, #128c7e);
        color: white !important;
        padding: 15px 30px;
        border-radius: 25px;
        text-decoration: none;
        font-weight: 600;
        margin: 20px 0;
      }
      
      .footer {
        background-color: #f8f9fa;
        padding: 20px;
        text-align: center;
        font-size: 14px;
        color: #6c757d;
        border-top: 1px solid #dee2e6;
      }
      
      .highlight { color: #ff6b35; font-weight: 600; }
      .cat-emoji { font-size: 24px; margin: 0 5px; }
      
      /* Mobile responsive */
      @media only screen and max-width: 600px {
        .container { width: 100% !important; margin: 0 !important; border-radius: 0 !important; }
        .content { padding: 20px 15px !important; }
        .header { padding: 20px 15px !important; }
        .header h1 { font-size: 24px !important; }
        .qr-code img { max-width: 180px !important; }
        .event-details h2 { font-size: 20px !important; }
        .contact-button { padding: 12px 24px !important; font-size: 14px !important; }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <!-- Header -->
      <div class="header">
        <h1><span class="cat-emoji">🐾</span> ME-O CAT FUN DAY <span class="cat-emoji">🐾</span></h1>
      </div>
      
      <!-- Content -->
      <div class="content">
        <!-- Main Message -->
        <p style="font-size: 18px; margin-bottom: 20px; font-weight: 600;">
          Hai Sohib Me-O <span class="highlight">${customer.nama}</span>! 🐾
        </p>
        
        <p style="margin-bottom: 15px; font-size: 16px;">
          Kamu udah siap buat event CFD belum? Soalnya… sebentar lagi adalah hari yang ditunggu-tunggu: <strong>CAT FUN DAY!</strong> 🎉
        </p>
        
        <p style="margin-bottom: 15px; font-size: 16px;">
          Kami nggak sabar buat ketemu kamu dan si meong untuk seru-seruan bareng! semuanya udah siap menyambut kalian!
        </p>
        
        <!-- Event Details -->
        <div class="event-details">
          <h2>🎉 DETAIL ACARA</h2>
          <p><strong>📍 Lokasi:</strong> Plaza Sudirman Gelora Bung Karno</p>
          <p><strong>🗓️ Tanggal:</strong> Minggu 1 Juni 2025</p>
          <p><strong>⏰ Jam:</strong> 05.30 - 09.00</p>
          <p style="margin-top: 15px; font-style: italic;">
            Kamera wajib siap: bakal banyak momen lucu & menggemaskan 🐱📸
          </p>
        </div>
        
        <!-- Ticket Info -->
        <div class="ticket-info">
          <h3 style="color: #ff6b35; margin-bottom: 15px;">🎫 TIKET DIGITAL KAMU</h3>
          
          <!-- QR Code Display -->
          <div class="qr-code">
            ${hasQrAttachment ? 
              `<div class="attachment-notice">
                <h4 style="margin: 0 0 15px 0; font-size: 18px;">QR CODE TIKET</h4>
                <p style="margin: 10px 0; font-size: 16px;">
                  QR Code tiket kamu tersedia sebagai <strong>file lampiran</strong><br>
                  dalam email ini!
                </p>
              </div>` :
              `<img src="${customer.barcode}" alt="QR Code Tiket - ${customer.nama}" />
               <p style="margin: 10px 0; color: #6c757d; font-size: 14px;">
                 <em>Jika QR code tidak terlihat, pindahkan email dari folder spam</em>
               </p>`
            }
          </div>
          
          <div class="ticket-id">
            ID Tiket: ${customer._id}
          </div>
          
          <p style="margin: 15px 0 0 0; color: #6c757d; font-size: 14px;">
            <em>Tunjukkan QR code ini saat registrasi ulang ya!</em>
          </p>
        </div>
        
        <!-- Attachments Info -->
        ${attachments.length > 0 ? `
        <div class="attachment-list">
          <h3 style="color: #0066cc; margin: 0 0 15px 0; font-size: 16px;">📎 File Lampiran dalam Email Ini:</h3>
          <ul style="margin: 0; padding-left: 20px; color: #333;">
            ${attachments.map(att => `<li style="margin-bottom: 5px;"><strong>${att.Filename}</strong></li>`).join('')}
          </ul>
        </div>
        ` : ''}
        
        <!-- Registration Details -->
        ${emailRegistrationDetails}
        
        <!-- Instructions -->
        <div style="background-color: #d1ecf1; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #bee5eb;">
          <h3 style="color: #0c5460; margin: 0 0 15px 0;">💡 Petunjuk Penting:</h3>
          <ul style="margin: 0; padding-left: 20px; color: #0c5460;">
            <li>Simpan email ini untuk referensi Anda</li>
            <li>Download semua file lampiran sebagai backup</li>
            <li>Tunjukkan QR code kepada petugas saat acara berlangsung</li>
            <li>Pastikan perangkat Anda sudah terisi daya</li>
            <li>Datang tepat waktu untuk registrasi ulang</li>
          </ul>
        </div>
        
        <p style="margin-bottom: 15px; font-size: 16px;">
          Jika Anda memiliki pertanyaan atau membutuhkan bantuan, jangan ragu untuk menghubungi kami. 
          Jika barcode tidak terlihat pindahkan email ini dari folder spam, maka barcode akan otomatis terlihat.
        </p>
        
        <div style="text-align: center;">
          <a href="https://wa.me/081322113345?text=Hubungi%20Kami%20-%20Cat%20Fun%20Day" 
             class="contact-button">
            📱 Hubungi Kami
          </a>
        </div>
      </div>
      
      <!-- Footer -->
      <div class="footer">
        <p>🐱 Me-O Cat Fun Day 2025 🐱</p>
        <p>Email: <a href="mailto:${process.env.EMAIL_USER}" style="color: #ff6b35;">${process.env.EMAIL_USER}</a></p>
      </div>
    </div>
  </body>
  </html>
        `;

        // Prepare email message object
        const emailMessage = {
          "From": {
            "Email": process.env.EMAIL_USER,
            "Name": "Me-O Cat Fun Day"
          },
          "To": [
            {
              "Email": customer.email,
              "Name": customer.nama
            }
          ],
          "Subject": `🎫 Tiket Cat Fun Day - ${customer.nama}`,
          "HTMLPart": emailTemplate,
          "TextPart": `Halo ${customer.nama}! Tiket Cat Fun Day kamu sudah siap. ID Tiket: ${customer._id}. Acara: Minggu, 1 Juni 2025, 05.30-09.00 WIB di Plaza Sudirman GBK. Download QR code dan file lampiran lainnya. Jangan lupa bawa QR code!`
        };

        // Add attachments jika ada
        if (attachments.length > 0) {
          emailMessage.Attachments = attachments;
          console.log(`📎 Added ${attachments.length} attachments for ${customer.nama}`);
        }

        // Send email with Mailjet
        await mailjet
          .post("send", {'version': 'v3.1'})
          .request({
            "Messages": [emailMessage]
          });

        // Add to success list
        results.success.push({
          id: customer._id,
          email: customer.email,
          nama: customer.nama,
          attachmentCount: attachments.length,
          attachments: attachments.map(att => att.Filename),
          hasQrAttachment: hasQrAttachment
        });

        console.log(`✅ Email sent to ${customer.nama} with ${attachments.length} attachments`);

        // Add a delay between each email to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay

      } catch (emailErr) {
        console.error(`❌ Error sending email to ${customer.nama}:`, emailErr);
        results.failed.push({
          id: customer._id || 'unknown',
          email: customer.email || 'unknown',
          nama: customer.nama || 'unknown',
          error: emailErr.message
        });
      }
    }

    // Return results
    res.status(200).json({
      message: `Processed ${results.success.length} emails successfully, ${results.failed.length} failed`,
      success: results.success,
      failed: results.failed,
      totalAttachments: results.success.reduce((total, item) => total + item.attachmentCount, 0)
    });
    
  } catch (err) {
    console.error('Error in resendEmails:', err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};