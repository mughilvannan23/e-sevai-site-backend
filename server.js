const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const workRoutes = require('./routes/workRoutes');
const adminRoutes = require('./routes/adminRoutes');
const superadminRoutes = require('./routes/superadminRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');

const path = require('path');
const app = express();

// Serve public directory for generated receipts
app.use('/public', express.static(path.join(__dirname, 'public')));

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
const allowedOrigins = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : ['http://localhost:5173', 'https://www.sevagan.shop', ''];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Validate required environment values before startup
const validateEnvironment = () => {
  const required = ['MONGODB_URI', 'JWT_SECRET', 'ADMIN_MOBILE'];
  let missing = [];
  required.forEach((key) => {
    if (!process.env[key]) {
      missing.push(key);
    }
  });


  if (!process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH) {
    missing.push('ADMIN_PASSWORD or ADMIN_PASSWORD_HASH');
  }

  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }

  if (!process.env.EMAIL_HOST || !process.env.EMAIL_PORT || !process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD || !process.env.EMAIL_FROM) {
    console.warn('Email environment variables are not fully configured. OTP emails may fail.');
  }
};

validateEnvironment();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  }
});

app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Logging middleware
app.use(morgan('dev'));

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log('MongoDB connected successfully');
  // Auto-migrate old data to the default admin
  try {
    const User = require('./models/User');
    const Work = require('./models/Work');
    const WorkItem = require('./models/WorkItem');
    const Purchase = require('./models/Purchase');

    const defaultAdmin = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
    if (defaultAdmin) {
      const adminId = defaultAdmin._id;
      // Assign all employees without adminId
      await User.updateMany({ role: 'employee', adminId: { $exists: false } }, { $set: { adminId } });
      await User.updateMany({ role: 'employee', adminId: null }, { $set: { adminId } });
      // Assign works
      await Work.updateMany({ adminId: { $exists: false } }, { $set: { adminId } });
      await Work.updateMany({ adminId: null }, { $set: { adminId } });
      // Assign work items
      await WorkItem.updateMany({ adminId: { $exists: false } }, { $set: { adminId } });
      await WorkItem.updateMany({ adminId: null }, { $set: { adminId } });
      // Assign purchases
      await Purchase.updateMany({ adminId: { $exists: false } }, { $set: { adminId } });
      await Purchase.updateMany({ adminId: null }, { $set: { adminId } });
      console.log('✅ Auto-migration for multi-tenant shops completed.');
    }

    // Drop the old email unique index if it exists since email is no longer unique/required
    try {
      await mongoose.connection.collection('users').dropIndex('email_1');
      console.log('✅ Dropped deprecated email_1 index.');
    } catch (e) {
      if (e.codeName !== 'IndexNotFound') {
         console.warn('⚠️ Could not drop email_1 index:', e.message);
      }
    }

    try {
      await mongoose.connection.collection('users').dropIndex('employeeId_1');
      console.log('✅ Dropped employeeId_1 index (to allow recreation as sparse).');
    } catch (e) {
      if (e.codeName !== 'IndexNotFound') {
         console.warn('⚠️ Could not drop employeeId_1 index:', e.message);
      }
    }

  } catch (error) {
    console.error('Data migration error:', error);
  }
})
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/works', workRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/purchases', purchaseRoutes);





// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'production' ? {} : err.message
  });
});

// 404 handler - fixed to avoid Express 5 issues
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;