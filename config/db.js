const mongoose = require('mongoose');

// Buat cache koneksi di luar lingkup fungsi
let cachedConnection = null;

const connectDB = async () => {
  // Gunakan koneksi yang sudah ada jika tersedia
  if (cachedConnection && mongoose.connection.readyState === 1) {
    console.log('Menggunakan koneksi MongoDB yang sudah ada');
    return cachedConnection;
  }

  try {
    // Hapus opsi yang tidak digunakan
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    cachedConnection = conn;
    return conn;
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    throw error; // Lempar error agar bisa ditangani di atas
  }
};

module.exports = connectDB;