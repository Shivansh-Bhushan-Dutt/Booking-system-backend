const express = require('express');
const router = express.Router();
const BookingService = require('../services/bookingService');
const { Parser } = require('json2csv');

/**
 * GET /api/admin/bookings
 * Get all bookings with advanced filtering for admin dashboard
 */
router.get('/bookings', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      paymentStatus,
      startDate,
      endDate,
      search,
      sortBy = 'bookingDate',
      sortOrder = 'desc'
    } = req.query;

    const filters = {};

    if (status) {
      filters.bookingStatus = status;
    }

    if (paymentStatus) {
      filters.paymentStatus = paymentStatus;
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
      sort: { [sortBy]: sortOrder }
    };

    const { data: bookings, pagination } = await BookingService.find(filters, options);

    // Get statistics - using count and revenue methods
    const [
      totalBookings,
      confirmedBookings,
      pendingBookings,
      cancelledBookings,
      revenueStats
    ] = await Promise.all([
      BookingService.count({}),
      BookingService.count({ bookingStatus: 'confirmed' }),
      BookingService.count({ bookingStatus: 'pending' }),
      BookingService.count({ bookingStatus: 'cancelled' }),
      BookingService.getRevenueStats({})
    ]);

    res.json({
      success: true,
      bookings,
      pagination,
      stats: {
        totalBookings,
        totalRevenue: revenueStats.totalRevenue || 0,
        confirmedBookings,
        pendingBookings,
        cancelledBookings
      }
    });
  } catch (error) {
    console.error('Error fetching admin bookings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/admin/bookings/export
 * Export bookings to CSV
 */
router.get('/bookings/export', async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;

    const filters = {};

    if (status) {
      filters.bookingStatus = status;
    }

    if (startDate || endDate) {
      filters.departureDate = {};
      if (startDate) filters.departureDate.gte = new Date(startDate).toISOString();
      if (endDate) filters.departureDate.lte = new Date(endDate).toISOString();
    }

    const options = {
      sort: { bookingDate: 'desc' },
      limit: 10000 // reasonable limit for CSV export
    };

    const { data: bookings } = await BookingService.find(filters, options);

    const fields = [
      'bookingId',
      'tourName',
      'customerName',
      'customerEmail',
      'customerPhone',
      'departureDate',
      'adults',
      'childrenWithBed',
      'childrenWithoutBed',
      'totalPrice',
      'paymentStatus',
      'bookingStatus',
      'bookingDate'
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(bookings);

    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', `attachment; filename=bookings_${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting bookings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/admin/dashboard/stats
 * Get dashboard statistics
 */
router.get('/dashboard/stats', async (req, res) => {
  try {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalBookings,
      confirmedBookings,
      pendingBookings,
      recentBookings,
      revenueStats,
      upcomingDepartures
    ] = await Promise.all([
      BookingService.count({}),
      BookingService.count({ bookingStatus: 'confirmed' }),
      BookingService.count({ bookingStatus: 'pending' }),
      BookingService.count({ 
        bookingDate: { gte: thirtyDaysAgo.toISOString() }
      }),
      BookingService.getRevenueStats({ paymentStatus: 'confirmed' }),
      BookingService.getUpcomingDepartures(10)
    ]);

    res.json({
      success: true,
      stats: {
        totalBookings,
        confirmedBookings,
        pendingBookings,
        recentBookings,
        totalRevenue: revenueStats.totalRevenue || 0,
        upcomingDepartures
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/admin/bookings/:id/status
 * Update booking status
 */
router.patch('/bookings/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingStatus, paymentStatus, adminNotes } = req.body;

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
      if (bookingStatus === 'confirmed' && !existingBooking.confirmedAt) {
        updateData.confirmedAt = new Date().toISOString();
      } else if (bookingStatus === 'cancelled' && !existingBooking.cancelledAt) {
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
    console.error('Error updating booking status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
