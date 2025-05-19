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
            
            <p>Jika Anda memiliki pertanyaan atau membutuhkan bantuan, jangan ragu untuk menghubungi kami.</p>
            
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