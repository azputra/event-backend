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
    // Opsi koneksi yang direkomendasikan untuk stabilitas di Heroku
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout setelah 5 detik
      maxPoolSize: 10, // Pertahankan hingga 10 koneksi socket
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Tambahkan event listeners untuk menangani disconnections
    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected, attempting to reconnect...');
      setTimeout(connectDB, 5000);
    });

    mongoose.connection.on('error', (err) => {
      console.error(`MongoDB connection error: ${err}`);
      setTimeout(connectDB, 5000);
    });

    // Cache koneksi untuk penggunaan berikutnya
    cachedConnection = conn;
    return conn;
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    // Tambahkan logging detail untuk membantu debugging
    if (error.name === 'MongoServerSelectionError') {
      console.error('Cannot connect to MongoDB server. Please check:');
      console.error('1. Your connection string is correct');
      console.error('2. Network access is allowed from Heroku');
      console.error('3. MongoDB service is running');
    }
    // Coba lagi setelah jeda waktu
    console.log('Retrying connection in 5 seconds...');
    setTimeout(connectDB, 5000);
    
    throw error; // Lempar error agar bisa ditangani di atas
  }
};

// Pastikan koneksi tertutup dengan benar saat aplikasi berhenti
process.on('SIGINT', async () => {
  if (mongoose.connection.readyState === 1) {
    console.log('Closing MongoDB connection due to application termination');
    await mongoose.connection.close();
    process.exit(0);
  }
});

module.exports = connectDB;