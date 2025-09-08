const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const amenitiesRoutes = require('./routes/amenities');
const cacheRoutes = require('./routes/cache');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://metroranta.shoeme.fit', 'https://shoeme.fit']
        : ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request IP tracking middleware
app.use((req, res, next) => {
    // Get real IP address (considering proxies)
    req.userIP = req.headers['x-forwarded-for'] 
        || req.headers['x-real-ip'] 
        || req.connection.remoteAddress 
        || req.socket.remoteAddress 
        || (req.connection.socket ? req.connection.socket.remoteAddress : null);
    
    next();
});

// Routes
app.use('/api/amenities', amenitiesRoutes);
app.use('/api/cache', cacheRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: require('./package.json').version
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    
    res.status(500).json({ 
        error: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { details: err.message })
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
    console.log(`🚀 Metroranta Backend running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
});