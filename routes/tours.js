const express = require('express');
const router = express.Router();
const wordpressService = require('../services/wordpressService');

/**
 * GET /api/tours
 * Fetch all tours from WordPress
 */
router.get('/', async (req, res) => {
  try {
    const { page, perPage, search, destination } = req.query;
    
    let result;
    if (search) {
      const tours = await wordpressService.searchTours(search);
      result = { tours, total: tours.length, totalPages: 1 };
    } else if (destination) {
      const tours = await wordpressService.getToursByDestination(destination);
      result = { tours, total: tours.length, totalPages: 1 };
    } else {
      result = await wordpressService.getAllTours({
        page: parseInt(page) || 1,
        perPage: parseInt(perPage) || 20
      });
    }
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error in GET /api/tours:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/tours/:id
 * Fetch single tour by ID or slug from WordPress
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tour = await wordpressService.getTourById(id);
    
    res.json({
      success: true,
      tour
    });
  } catch (error) {
    console.error('Error in GET /api/tours/:id:', error);
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
