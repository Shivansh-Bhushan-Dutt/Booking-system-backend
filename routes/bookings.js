const express = require('express');
const router = express.Router();
const axios = require('axios');
const { body, validationResult } = require('express-validator');
const BookingService = require('../services/bookingService');
const wordpressService = require('../services/wordpressService');
const emailService = require('../services/emailService');

/**
 * POST /api/bookings
 * Create a new booking
 */
router.post('/', [
  body('tourId').notEmpty().withMessage('Tour ID is required'),
  body('customerName').trim().notEmpty().withMessage('Customer name is required'),
  body('customerEmail').isEmail().withMessage('Valid email is required'),
  body('customerPhone').trim().notEmpty().withMessage('Phone number is required'),
  body('departureDate').isISO8601().withMessage('Valid departure date is required'),
  body('adults').isInt({ min: 1 }).withMessage('At least 1 adult is required'),
  body('totalPrice').isFloat({ min: 0 }).withMessage('Valid total price is required')
], async (req, res) => {
  try {
    console.log('📨 Booking request received:', {
      tourId: req.body.tourId,
      customerEmail: req.body.customerEmail,
      paymentStatus: req.body.paymentStatus,
      totalPrice: req.body.totalPrice,
      testMode: req.body.paymentDetails?.testMode
    });
    
    // Validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      tourId,
      tourSlug,
      customerName,
      customerEmail,
      customerPhone,
      departureDate,
      adults,
      childrenWithBed,
      childrenWithoutBed,
      roomConfiguration,
      addons,
      basePrice,
      childrenPrice,
      roomPrice,
      addonsPrice,
      totalPrice,
      specialRequests,
      paymentId,
      paymentStatus
    } = req.body;

    // Fetch tour details from WordPress
    const tour = await wordpressService.getTourById(tourId);
    
    if (!tour) {
      return res.status(404).json({
        success: false,
        error: 'Tour not found'
      });
    }

    // Create booking with Supabase
    console.log('💾 Creating booking in Supabase...');
    
    // PRODUCTION SECURITY: Validate payment before creating booking
    const isTestMode = req.body.paymentDetails?.testMode === true && process.env.ENABLE_TEST_MODE === 'true';
    
    if (paymentStatus === 'confirmed' && !isTestMode) {
      // Production mode: Require valid payment ID
      if (!paymentId || paymentId.startsWith('test_')) {
        console.error('❌ Invalid payment: No valid paymentId provided');
        return res.status(400).json({
          success: false,
          error: 'Payment verification required. Invalid or missing payment ID.'
        });
      }
      
      // Additional validation: Check if paymentDetails exists
      if (!req.body.paymentDetails || Object.keys(req.body.paymentDetails).length === 0) {
        console.error('❌ Invalid payment: No payment details provided');
        return res.status(400).json({
          success: false,
          error: 'Payment verification required. Missing payment details.'
        });
      }
      
      console.log('✅ Payment validation passed:', {
        paymentId,
        isTestMode,
        hasPaymentDetails: !!req.body.paymentDetails
      });
    }
    
    const bookingData = {
      tourId: tour.id,
      tourName: tour.name,
      tourSlug: tour.slug || tourSlug,
      customerName,
      customerEmail,
      customerPhone,
      departureDate: new Date(departureDate).toISOString(),
      adults: adults || 1,
      childrenWithBed: childrenWithBed || 0,
      childrenWithoutBed: childrenWithoutBed || 0,
      roomConfiguration: roomConfiguration || {},
      addons: addons || [],
      basePrice: basePrice || 0,
      childrenPrice: childrenPrice || 0,
      roomPrice: roomPrice || 0,
      addonsPrice: addonsPrice || 0,
      totalPrice,
      specialRequests,
      paymentId,
      paymentStatus: paymentStatus || 'pending',
      bookingStatus: paymentStatus === 'confirmed' ? 'confirmed' : 'pending'
    };

    const booking = await BookingService.create(bookingData);
    
    console.log('✅ Booking saved to Supabase:', {
      bookingId: booking.bookingId,
      id: booking.id,
      paymentStatus: booking.paymentStatus,
      bookingStatus: booking.bookingStatus
    });

    // Send confirmation email
    if (paymentStatus === 'confirmed') {
      console.log('📧 Attempting to send confirmation email...');
      try {
        await emailService.sendBookingConfirmation(booking, tour);
        await BookingService.update(booking.id, {
          confirmationEmailSent: true,
          confirmationEmailSentAt: new Date().toISOString()
        });
        console.log('✅ Confirmation email sent successfully');
      } catch (emailError) {
        console.error('❌ Failed to send confirmation email:', emailError);
      }
      
      // Trigger WordPress webhook to update seat availability
      console.log('🔄 Updating seat availability in WordPress...');
      try {
        const totalGuests = (adults || 1) + (childrenWithBed || 0) + (childrenWithoutBed || 0);
        await axios.post(
          `${process.env.WORDPRESS_API_URL}/immersive-trips/v1/update-seats`,
          {
            tourId: tourId,
            departureDate: new Date(departureDate).toISOString().split('T')[0],
            guests: totalGuests
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': process.env.WORDPRESS_API_KEY
            },
            timeout: 5000
          }
        );
        console.log('✅ Seat availability updated in WordPress');
      } catch (webhookError) {
        console.error('⚠️ Failed to update seat availability in WordPress:', webhookError.message);
        // Don't fail the booking if WordPress update fails
      }
    } else {
      console.log('⏭️ Skipping email and seat update - payment status is:', paymentStatus);
    }

    const responseData = {
      success: true,
      booking: {
        id: booking.id,
        bookingId: booking.bookingId,
        tourName: booking.tourName,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        departureDate: booking.departureDate,
        adults: booking.adults,
        children: booking.childrenWithBed + booking.childrenWithoutBed,
        totalPrice: booking.totalPrice,
        paymentStatus: booking.paymentStatus,
        bookingStatus: booking.bookingStatus,
        bookingDate: booking.bookingDate
      }
    };
    
    console.log('📤 Sending response to frontend:', JSON.stringify(responseData, null, 2));
    res.status(201).json(responseData);
  } catch (error) {
    console.error('❌ Error creating booking:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/bookings
 * Get all bookings (with filters)
 */
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      email, 
      startDate, 
      endDate,
      search
    } = req.query;

    const filters = {};
    
    if (status) {
      filters.bookingStatus = status;
    }
    
    if (email) {
      filters.customerEmail = email;
    }
    
    if (startDate || endDate) {
      filters.departureDate = {};
      if (startDate) filters.departureDate.gte = new Date(startDate).toISOString();
      if (endDate) filters.departureDate.lte = new Date(endDate).toISOString();
    }

    if (search) {
      filters.search = search;
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { bookingDate: 'desc' }
    };

    const { data: bookings, pagination } = await BookingService.find(filters, options);

    res.json({
      success: true,
      bookings,
      pagination
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/bookings/:id
 * Get single booking by ID or booking ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Try to find by UUID or bookingId
    const booking = await BookingService.findById(id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/bookings/:id
 * Update booking status
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingStatus, paymentStatus, adminNotes } = req.body;

    // Check if booking exists
    const existingBooking = await BookingService.findById(id);
    if (!existingBooking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    const updateData = {};

    if (bookingStatus) {
      updateData.bookingStatus = bookingStatus;
      if (bookingStatus === 'confirmed') {
        updateData.confirmedAt = new Date().toISOString();
      } else if (bookingStatus === 'cancelled') {
        updateData.cancelledAt = new Date().toISOString();
      }
    }

    if (paymentStatus) {
      updateData.paymentStatus = paymentStatus;
    }

    if (adminNotes !== undefined) {
      updateData.adminNotes = adminNotes;
    }

    const booking = await BookingService.update(id, updateData);

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/bookings/:id
 * Delete booking (soft delete - cancel)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await BookingService.findById(id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    // Soft delete - just cancel the booking
    await BookingService.update(id, {
      bookingStatus: 'cancelled',
      cancelledAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Booking cancelled successfully'
    });
  } catch (error) {
    console.error('Error deleting booking:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
