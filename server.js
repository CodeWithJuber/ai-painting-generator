const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./database');
const authRoutes = require('./routes/auth');
const titleRoutes = require('./routes/titles');
const paintingRoutes = require('./routes/paintings');
const referenceRoutes = require('./routes/references');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend static files (CSS, JS, images)
app.use(express.static(__dirname));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/titles', titleRoutes);
app.use('/api/paintings', paintingRoutes);
app.use('/api/references', referenceRoutes);

// Config endpoint
app.get('/api/config', (req, res) => {
  res.json({
    serverIP: process.env.SERVER_IP || 'localhost',
    apiPort: process.env.PORT || 3000,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Serve index.html for the root route and any non-API routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle SPA routing - serve index.html for any non-API routes
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
initializeDatabase()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📱 Frontend available at: http://localhost:${PORT}`);
      console.log(`🔗 API available at: http://localhost:${PORT}/api`);
      if (process.env.SERVER_IP) {
        console.log(`🌐 External access: http://${process.env.SERVER_IP}:${PORT}`);
      }
    });
  })
  .catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  }); 