const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db/database');
const router = express.Router();

// Validation middleware
const validateBounds = [
    body('bounds.north').isFloat({ min: -90, max: 90 }),
    body('bounds.south').isFloat({ min: -90, max: 90 }),
    body('bounds.east').isFloat({ min: -180, max: 180 }),
    body('bounds.west').isFloat({ min: -180, max: 180 }),
];

const validateAmenityType = [
    body('type').isIn(['toilets', 'cafes', 'indoor'])
];

const validateSuggestion = [
    body('type').isIn(['toilets', 'cafes', 'indoor']),
    body('name').isLength({ min: 1, max: 255 }).trim(),
    body('description').optional().isLength({ max: 1000 }).trim(),
    body('lat').isFloat({ min: -90, max: 90 }),
    body('lng').isFloat({ min: -180, max: 180 }),
    body('distanceToRoute').optional().isInt({ min: 0 })
];

const validateFlag = [
    body('amenityId').isInt({ min: 1 }),
    body('flagType').isIn(['incorrect_location', 'closed_permanently', 'incorrect_type', 'duplicate', 'spam', 'other']),
    body('reason').optional().isLength({ max: 1000 }).trim()
];

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }
    next();
};

// GET /api/amenities/cached - Get cached amenities for a specific area
router.post('/cached', validateBounds, validateAmenityType, handleValidationErrors, async (req, res) => {
    try {
        const { bounds, type } = req.body;
        
        // Check if cache is fresh (< 24 hours)
        const isStale = await db.isCacheStale(bounds, type);
        
        if (isStale) {
            return res.json({ amenities: [], cacheStale: true });
        }
        
        const amenities = await db.getCachedAmenities(bounds, type);
        
        res.json({ 
            amenities,
            cacheStale: false,
            count: amenities.length 
        });
        
    } catch (error) {
        console.error('Error fetching cached amenities:', error);
        res.status(500).json({ error: 'Failed to fetch cached amenities' });
    }
});

// POST /api/amenities/cache - Cache new amenities from Overpass API
router.post('/cache', validateBounds, validateAmenityType, handleValidationErrors, async (req, res) => {
    try {
        const { bounds, type, amenities } = req.body;
        
        if (!Array.isArray(amenities)) {
            return res.status(400).json({ error: 'Amenities must be an array' });
        }
        
        const result = await db.cacheAmenities(bounds, type, amenities);
        
        res.json({ 
            success: true,
            cached: result.cached,
            updated: result.updated 
        });
        
    } catch (error) {
        console.error('Error caching amenities:', error);
        res.status(500).json({ error: 'Failed to cache amenities' });
    }
});

// POST /api/amenities/user-suggested - Get approved user suggestions for an area
router.post('/user-suggested', validateBounds, handleValidationErrors, async (req, res) => {
    try {
        const { bounds } = req.body;
        
        const amenities = await db.getUserSuggestedAmenities(bounds);
        
        res.json({ 
            amenities,
            count: amenities.length 
        });
        
    } catch (error) {
        console.error('Error fetching user-suggested amenities:', error);
        res.status(500).json({ error: 'Failed to fetch user suggestions' });
    }
});

// POST /api/amenities/suggest - Submit a new user suggestion
router.post('/suggest', validateSuggestion, handleValidationErrors, async (req, res) => {
    try {
        const { type, name, description, lat, lng, distanceToRoute, userInfo } = req.body;
        
        const suggestion = {
            type,
            name,
            description: description || null,
            latitude: lat,
            longitude: lng,
            distance_to_route: distanceToRoute || null,
            user_ip_address: req.userIP,
            user_agent: userInfo?.userAgent || req.get('User-Agent')
        };
        
        const result = await db.createUserSuggestion(suggestion);
        
        res.status(201).json({ 
            success: true,
            suggestion: result,
            message: 'Suggestion submitted successfully and will be reviewed' 
        });
        
    } catch (error) {
        console.error('Error submitting user suggestion:', error);
        res.status(500).json({ error: 'Failed to submit suggestion' });
    }
});

// POST /api/amenities/flag - Flag an amenity as incorrect/closed
router.post('/flag', validateFlag, handleValidationErrors, async (req, res) => {
    try {
        const { amenityId, flagType, reason, userInfo } = req.body;
        
        const flag = {
            amenity_id: amenityId,
            flag_type: flagType,
            flag_reason: reason || null,
            user_ip_address: req.userIP,
            user_agent: userInfo?.userAgent || req.get('User-Agent')
        };
        
        const result = await db.createFlag(flag);
        
        res.status(201).json({ 
            success: true,
            flag: result,
            message: 'Flag submitted successfully and will be reviewed' 
        });
        
    } catch (error) {
        console.error('Error flagging amenity:', error);
        res.status(500).json({ error: 'Failed to flag amenity' });
    }
});

// GET /api/amenities/stats - Get statistics about cached data and user contributions
router.get('/stats', async (req, res) => {
    try {
        const stats = await db.getAmenityStats();
        
        res.json(stats);
        
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

module.exports = router;