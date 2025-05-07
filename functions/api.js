const express = require('express');
const serverless = require('serverless-http');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('../config/db');
const bodyParser = require('body-parser');

// Load env vars
dotenv.config();

const app = express();

// Middleware dasar
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Tambahkan setelah middleware CORS dan sebelum middleware timeout
app.use((req, res, next) => {
  // Khusus untuk request dengan content-type application/json
  if (req.headers['content-type']?.includes('application/json')) {
    // Jika body masih berupa Buffer
    if (Buffer.isBuffer(req.body)) {
      try {
        const bodyText = req.body.toString();
        console.log('Raw Buffer JSON:', bodyText);
        req.body = JSON.parse(bodyText);
        console.log('Parsed JSON body:', req.body);
      } catch (error) {
        console.error('Failed to parse Buffer as JSON:', error);
      }
    }
  }
  next();
});

// Tambahkan middleware timeout
app.use((req, res, next) => {
  // Set timeout 8 detik (buffer sebelum batas 10 detik)
  const timeoutDuration = 8000;
  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      console.log('Request timeout, mengirim respons cepat');
      res.status(408).json({
        error: 'Request timeout',
        message: 'Operasi memakan waktu terlalu lama, coba lagi nanti'
      });
    }
  }, timeoutDuration);
  
  // Bersihkan timeout setelah respons selesai
  res.on('finish', () => {
    clearTimeout(timeoutId);
  });
  
  next();
});

// Middleware database connection
app.use(async (req, res, next) => {
  try {
    // Route /api tidak memerlukan koneksi database
    if (req.path === '/.netlify/functions/api') {
      return next();
    }
    
    // Connect DB untuk rute lainnya
    await connectDB();
    next();
  } catch (error) {
    console.error('Database connection failed:', error);
    return res.status(500).json({
      error: 'Database connection failed',
      message: 'Tidak dapat terhubung ke database, coba lagi nanti'
    });
  }
});

// Rute dasar untuk health check
app.get('/.netlify/functions/api', (req, res) => {
  res.json({ message: 'API is working!', timestamp: new Date().toISOString() });
});

// Muat routes setelah middleware koneksi DB
const authRoutes = require('../routes/authRoutes');
const eventRoutes = require('../routes/eventRoutes');
const customerRoutes = require('../routes/customerRoutes');
const userRoutes = require('../routes/userRoutes');

// Mount routes
app.use('/.netlify/functions/api/auth', authRoutes);
app.use('/.netlify/functions/api/events', eventRoutes);
app.use('/.netlify/functions/api/customers', customerRoutes);
app.use('/.netlify/functions/api/users', userRoutes);

// Export handler function
module.exports.handler = serverless(app);