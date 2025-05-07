const express = require('express');
const serverless = require('serverless-http');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('../config/db'); // Sesuaikan path

// Load env vars
dotenv.config();

// Connect to database
connectDB();

// Route files
const authRoutes = require('../routes/authRoutes'); // Sesuaikan path
const eventRoutes = require('../routes/eventRoutes'); // Sesuaikan path
const customerRoutes = require('../routes/customerRoutes'); // Sesuaikan path
const userRoutes = require('../routes/userRoutes'); // Sesuaikan path

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Mount routes - perhatikan base path diubah
app.use('/.netlify/functions/api/auth', authRoutes);
app.use('/.netlify/functions/api/events', eventRoutes);
app.use('/.netlify/functions/api/customers', customerRoutes);
app.use('/.netlify/functions/api/users', userRoutes);

// Tambahkan route test sederhana
app.get('/.netlify/functions/api', (req, res) => {
  res.json({ message: 'API is working!' });
});

// Export handler function
module.exports.handler = serverless(app);