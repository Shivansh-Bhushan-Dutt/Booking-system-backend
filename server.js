require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { supabase, testConnection } = require('./config/supabase');

const app = express();

// Security Middleware
app.use(helmet());

// CORS Configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Supabase Connection Test
testConnection()
  .then(() => console.log('✅ Supabase Ready'))
  .catch(err => console.error('⚠️ Supabase connection issue:', err.message));

// Routes
app.use('/api/tours', require('./routes/tours'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/admin', require('./routes/admin'));

// Test endpoint for debugging
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
});

// Test email endpoint
app.post('/api/test-email', async (req, res) => {
  try {
    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: req.body.email || process.env.ADMIN_EMAIL,
      subject: 'Test Email - Immersive Trips Booking System',
      html: `
        <h2>✅ Email Configuration Test Successful!</h2>
        <p>This is a test email from your booking system.</p>
        <p><strong>SMTP Configuration:</strong></p>
        <ul>
          <li>Host: ${process.env.SMTP_HOST}</li>
          <li>Port: ${process.env.SMTP_PORT}</li>
          <li>User: ${process.env.SMTP_USER}</li>
        </ul>
        <p>If you're receiving this email, your SMTP configuration is working correctly!</p>
      `
    });

    console.log('✅ Test email sent:', info.messageId);
    res.json({ 
      success: true, 
      message: 'Test email sent successfully',
      messageId: info.messageId
    });
  } catch (error) {
    console.error('❌ Test email failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: error.toString()
    });
  }
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Immersive Trips Booking API is running',
    timestamp: new Date().toISOString()
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
});

module.exports = app;
