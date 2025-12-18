const { supabase } = require('../config/supabase');

/**
 * Booking Service using Supabase
 * Replaces MongoDB Booking model
 */

// Helper function to convert snake_case to camelCase
function toCamelCase(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(toCamelCase);
  }
  
  const camelObj = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    camelObj[camelKey] = typeof value === 'object' ? toCamelCase(value) : value;
  }
  return camelObj;
}

// Helper function to convert camelCase to snake_case
function toSnakeCase(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(toSnakeCase);
  }
  
  const snakeObj = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    snakeObj[snakeKey] = typeof value === 'object' && !Array.isArray(value) ? toSnakeCase(value) : value;
  }
  return snakeObj;
}

// Generate unique booking ID
function generateBookingId() {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `IMT-TRIP-${timestamp.slice(-8)}${random}`;
}

class BookingService {
  /**
   * Create a new booking
   */
  static async create(bookingData) {
    try {
      // Generate booking ID if not provided
      if (!bookingData.bookingId) {
        bookingData.bookingId = generateBookingId();
      }

      // Convert to snake_case for Supabase
      const dbData = toSnakeCase(bookingData);
      
      const { data, error } = await supabase
        .from('bookings')
        .insert([dbData])
        .select()
        .single();

      if (error) throw error;
      
      // Convert back to camelCase
      return toCamelCase(data);
    } catch (error) {
      console.error('Error creating booking:', error);
      throw error;
    }
  }

  /**
   * Find booking by ID (UUID or booking_id)
   */
  static async findById(id) {
    try {
      // Try to find by UUID first, then by booking_id
      let query = supabase
        .from('bookings')
        .select('*');

      // Check if it's a UUID format
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      
      if (isUUID) {
        query = query.eq('id', id);
      } else {
        query = query.eq('booking_id', id);
      }

      const { data, error } = await query.single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }
      
      return toCamelCase(data);
    } catch (error) {
      console.error('Error finding booking:', error);
      throw error;
    }
  }

  /**
   * Find bookings with filters
   */
  static async find(filters = {}, options = {}) {
    try {
      let query = supabase.from('bookings').select('*', { count: 'exact' });

      // Apply filters
      if (filters.customerEmail) {
        query = query.eq('customer_email', filters.customerEmail);
      }
      if (filters.bookingStatus) {
        query = query.eq('booking_status', filters.bookingStatus);
      }
      if (filters.paymentStatus) {
        query = query.eq('payment_status', filters.paymentStatus);
      }
      if (filters.tourId) {
        query = query.eq('tour_id', filters.tourId);
      }
      if (filters.startDate) {
        query = query.gte('departure_date', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('departure_date', filters.endDate);
      }
      if (filters.search) {
        query = query.or(`customer_name.ilike.%${filters.search}%,customer_email.ilike.%${filters.search}%,booking_id.ilike.%${filters.search}%`);
      }

      // Pagination
      const page = options.page || 1;
      const limit = options.limit || 50;
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      // Sorting
      const sortBy = options.sortBy || 'booking_date';
      const sortOrder = options.sortOrder === 'asc' ? { ascending: true } : { ascending: false };
      query = query.order(sortBy, sortOrder);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        bookings: data.map(toCamelCase),
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit)
      };
    } catch (error) {
      console.error('Error finding bookings:', error);
      throw error;
    }
  }

  /**
   * Update booking
   */
  static async update(id, updateData) {
    try {
      const dbData = toSnakeCase(updateData);
      
      // Check if it's UUID or booking_id
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      
      let query = supabase
        .from('bookings')
        .update(dbData)
        .select()
        .single();

      if (isUUID) {
        query = query.eq('id', id);
      } else {
        query = query.eq('booking_id', id);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      return toCamelCase(data);
    } catch (error) {
      console.error('Error updating booking:', error);
      throw error;
    }
  }

  /**
   * Delete booking
   */
  static async delete(id) {
    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      
      let query = supabase
        .from('bookings')
        .delete();

      if (isUUID) {
        query = query.eq('id', id);
      } else {
        query = query.eq('booking_id', id);
      }

      const { error } = await query;

      if (error) throw error;
      
      return true;
    } catch (error) {
      console.error('Error deleting booking:', error);
      throw error;
    }
  }

  /**
   * Count bookings
   */
  static async count(filters = {}) {
    try {
      let query = supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true });

      if (filters.bookingStatus) {
        query = query.eq('booking_status', filters.bookingStatus);
      }
      if (filters.paymentStatus) {
        query = query.eq('payment_status', filters.paymentStatus);
      }
      if (filters.startDate) {
        query = query.gte('booking_date', filters.startDate);
      }

      const { count, error } = await query;

      if (error) throw error;
      
      return count;
    } catch (error) {
      console.error('Error counting bookings:', error);
      throw error;
    }
  }

  /**
   * Get revenue statistics
   */
  static async getRevenueStats(filters = {}) {
    try {
      let query = supabase
        .from('bookings')
        .select('total_price')
        .eq('payment_status', 'confirmed');

      if (filters.startDate) {
        query = query.gte('booking_date', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('booking_date', filters.endDate);
      }

      const { data, error } = await query;

      if (error) throw error;

      const total = data.reduce((sum, booking) => sum + parseFloat(booking.total_price || 0), 0);
      
      return {
        total,
        count: data.length,
        average: data.length > 0 ? total / data.length : 0
      };
    } catch (error) {
      console.error('Error getting revenue stats:', error);
      throw error;
    }
  }

  /**
   * Get upcoming departures
   */
  static async getUpcomingDepartures(limit = 10) {
    try {
      const today = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('bookings')
        .select('departure_date, tour_name')
        .eq('booking_status', 'confirmed')
        .gte('departure_date', today)
        .order('departure_date', { ascending: true })
        .limit(limit);

      if (error) throw error;

      // Group by departure date
      const grouped = data.reduce((acc, booking) => {
        const date = booking.departure_date.split('T')[0];
        if (!acc[date]) {
          acc[date] = 0;
        }
        acc[date]++;
        return acc;
      }, {});

      return Object.entries(grouped).map(([date, count]) => ({
        _id: date,
        count
      }));
    } catch (error) {
      console.error('Error getting upcoming departures:', error);
      throw error;
    }
  }
}

module.exports = BookingService;
