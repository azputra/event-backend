// controllers/customerController.js
const Customer = require('../models/Customer');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

// Setup email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Create customer (admin only)
exports.createCustomer = async (req, res) => {
  try {
    const { email, noHp, nama, event, alamat } = req.body;

    // Create customer first without barcode
    const customer = new Customer({
      email,
      noHp,
      nama,
      event,
      alamat
    });
    
    // Save customer to get the ID
    await customer.save();
    
    // Generate barcode data with customer details
    const barcodeData = JSON.stringify({
      customerId: customer._id,
      eventId: customer.event,
      email: customer.email
    });
    
    // Create temporary file path for QR code
    const tempDir = path.join(__dirname, '../public/temp');
    
    // Make sure directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const qrFilename = `qr-${customer._id}.png`;
    const qrFilePath = path.join(tempDir, qrFilename);
    
    // Generate QR code and save to file
    await QRCode.toFile(qrFilePath, barcodeData);
    
    // Store the relative path in the customer record
    const barcodeUrl = `/temp/${qrFilename}`;
    customer.barcode = barcodeUrl;
    await customer.save();
    
    // Kirim email dengan barcode
    // Updated email template with elegant design
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: customer.email,
      subject: 'Tiket Event Anda',
      html: `
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
                  <img src="cid:unique-barcode-id" alt="Barcode" />
                </div>
                
                <div class="ticket-id">
                  ID Tiket: ${customer._id}
                </div>
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
      `,
      attachments: [
        {
          filename: 'barcode.png',
          path: qrFilePath,
          cid: 'unique-barcode-id'
        }
      ]
    };

    try {      
      await transporter.sendMail(mailOptions);
      res.status(201).json(customer);
    } catch (emailErr) {
      console.error('Error sending email:', emailErr);
      res.status(201).json({
        customer,
        warning: 'Customer created but email delivery failed'
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Other controller methods remain unchanged

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

// Update customer (admin only)
exports.updateCustomer = async (req, res) => {
  try {
    const { email, noHp, nama, event } = req.body;
    
    const customer = await Customer.findById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({ message: 'Customer tidak ditemukan' });
    }
    
    customer.email = email || customer.email;
    customer.noHp = noHp || customer.noHp;
    customer.nama = nama || customer.nama;
    customer.event = event || customer.event;
    customer.alamat = alamat || customer.alamat;
    
    const updatedCustomer = await customer.save();
    
    res.json(updatedCustomer);
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
      return res.status(404).json({ message: 'Customer tidak ditemukan' });
    }
    
    customer.deletedAt = Date.now();
    await customer.save();
    
    res.json({ message: 'Customer berhasil dihapus' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Verify customer barcode
exports.verifyCustomer = async (req, res) => {
  try {
    const { customerId, eventId } = req.body;
    
    const customer = await Customer.findById(customerId);
    
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Data customer tidak ditemukan' 
      });
    }
    
    if (customer.deletedAt) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer sudah dihapus' 
      });
    }
    
    if (customer.isVerified) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer sudah diverifikasi sebelumnya' 
      });
    }
    
    if (customer.event.toString() !== eventId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Barcode tidak valid untuk event ini' 
      });
    }
    
    customer.isVerified = true;
    customer.verifiedAt = Date.now();
    await customer.save();
    
    res.json({ 
      success: true, 
      message: 'Customer berhasil diverifikasi',
      customer: {
        nama: customer.nama,
        email: customer.email,
        noHp: customer.noHp,
        verifiedAt: customer.verifiedAt
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};