const axios = require('axios');

const WORDPRESS_API_URL = process.env.WORDPRESS_API_URL || 'https://immersivetrips.in/wp-json';
const API_TIMEOUT = parseInt(process.env.WORDPRESS_API_TIMEOUT) || 10000;

/**
 * Fetch all tours from WordPress
 */
async function getAllTours(params = {}) {
  try {
    const response = await axios.get(`${WORDPRESS_API_URL}/wp/v2/itinerary`, {
      params: {
        per_page: params.perPage || 100,
        page: params.page || 1,
        _embed: true,
        acf_format: 'standard',
        ...params
      },
      timeout: API_TIMEOUT
    });

    const tours = await Promise.all(response.data.map(tour => formatTourData(tour)));
    return {
      tours,
      total: parseInt(response.headers['x-wp-total'] || 0),
      totalPages: parseInt(response.headers['x-wp-totalpages'] || 0)
    };
  } catch (error) {
    console.error('Error fetching tours from WordPress:', error.message);
    throw new Error('Failed to fetch tours from WordPress');
  }
}

/**
 * Fetch single tour by ID or slug
 */
async function getTourById(idOrSlug) {
  try {
    const isNumeric = !isNaN(idOrSlug);
    const endpoint = isNumeric 
      ? `${WORDPRESS_API_URL}/wp/v2/itinerary/${idOrSlug}`
      : `${WORDPRESS_API_URL}/wp/v2/itinerary?slug=${idOrSlug}`;

    const response = await axios.get(endpoint, {
      params: {
        _embed: true,
        acf_format: 'standard',
        _: Date.now() // Cache buster
      },
      timeout: API_TIMEOUT,
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    const tourData = Array.isArray(response.data) ? response.data[0] : response.data;
    
    if (!tourData) {
      throw new Error('Tour not found');
    }

    return await formatTourData(tourData);
  } catch (error) {
    console.error('Error fetching tour from WordPress:', error.message);
    throw new Error('Failed to fetch tour details');
  }
}

/**
 * Format tour data from WordPress to our application format
 */
async function formatTourData(wpTour) {
  const acf = wpTour.acf || {};
  
  // Extract featured image
  let featuredImage = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800';
  if (wpTour._embedded && wpTour._embedded['wp:featuredmedia']) {
    const media = wpTour._embedded['wp:featuredmedia'][0];
    featuredImage = media.source_url || media.media_details?.sizes?.large?.source_url || featuredImage;
  }

  // Extract gallery images
  const galleryImages = [];
  if (acf.gallery && Array.isArray(acf.gallery)) {
    acf.gallery.forEach(img => {
      if (img.url) galleryImages.push(img.url);
    });
  }

  // Parse duration
  const duration = acf.duration || wpTour.title?.rendered || '7 Days / 6 Nights';
  
  // Parse price - will be overridden by departure schedule data
  let pricePerPerson = 0;
  
  // Parse departure schedule from ACF JSON field - STRICT MODE
  let departureSchedule = null;
  let availableDates = [];
  let seatsAvailable = 0;
  let pricingTiersFromSchedule = [];
  
  // Check ONLY acf.departure_schedule field
  const departureScheduleRaw = acf.departure_schedule;
  
  if (departureScheduleRaw) {
    // Parse if it's a JSON string, otherwise use as-is
    if (typeof departureScheduleRaw === 'string') {
      try {
        departureSchedule = JSON.parse(departureScheduleRaw);
        console.log(`✅ Tour ${wpTour.id}: Parsed departure_schedule JSON successfully`);
      } catch (e) {
        console.error(`❌ Tour ${wpTour.id}: Failed to parse departure_schedule JSON:`, e);
        departureSchedule = null;
      }
    } else if (typeof departureScheduleRaw === 'object') {
      departureSchedule = departureScheduleRaw;
      console.log(`✅ Tour ${wpTour.id}: Using departure_schedule object`);
    }
    
    if (departureSchedule && departureSchedule.departures && Array.isArray(departureSchedule.departures)) {
      // Extract available dates from departures (exclude sold_out)
      availableDates = departureSchedule.departures
        .filter(d => d.status !== 'sold_out')
        .map(d => d.date);
      
      console.log(`📅 Tour ${wpTour.id}: Found ${departureSchedule.departures.length} departures, ${availableDates.length} available`);
      
      // Calculate total available seats across all departures
      seatsAvailable = departureSchedule.departures
        .filter(d => d.status !== 'sold_out')
        .reduce((sum, d) => sum + (d.availableSeats || 0), 0);
      
      // Use pricing tiers from first available departure
      const firstDeparture = departureSchedule.departures.find(d => d.status !== 'sold_out');
      if (firstDeparture) {
        if (firstDeparture.pricingTiers && firstDeparture.pricingTiers.length > 0) {
          pricingTiersFromSchedule = firstDeparture.pricingTiers;
        }
        // Get price from first departure
        pricePerPerson = firstDeparture.pricePerPerson || 0;
      }
    }
  }
  
  // NO FALLBACK - Only use departure_schedule JSON data
  // If no departure schedule, log warning and return empty arrays
  if (!departureSchedule || availableDates.length === 0) {
    console.warn(`⚠️ Tour ${wpTour.id}: No departure_schedule JSON or no available departures! Tour will show no dates.`);
    availableDates = [];
    seatsAvailable = 0;
  }

  // Parse destinations
  let destinations = [];
  if (wpTour._embedded && wpTour._embedded['wp:term']) {
    const terms = wpTour._embedded['wp:term'].flat();
    destinations = terms
      .filter(term => term.taxonomy === 'destinations')
      .map(term => term.name);
  }

  // ONLY use pricing tiers from departure schedule - NO FALLBACKS
  let pricingTiers = pricingTiersFromSchedule;
  
  if (pricingTiers.length === 0) {
    console.warn(`⚠️ Tour ${wpTour.id}: No pricingTiers in departure_schedule! Pricing will not work correctly.`);
    pricingTiers = [];
  }

  // Extract pickup location
  const pickupLocation = acf.pickup_location || acf.meeting_point || 'Hotel Pickup Available';

  // Extract inclusions and exclusions
  const inclusions = acf.inclusions || acf.whats_included || [];
  const exclusions = acf.exclusions || acf.whats_excluded || [];

  return {
    id: wpTour.id.toString(),
    slug: wpTour.slug,
    name: wpTour.title?.rendered || 'Untitled Tour',
    shortDescription: acf.short_description || wpTour.excerpt?.rendered?.replace(/<[^>]*>/g, '').substring(0, 200) || '',
    description: '', // Remove description to avoid showing Elementor/HTML tags
    itinerary: acf.itinerary || acf.day_by_day_itinerary || [],
    
    // Images
    featuredImage,
    galleryImages,
    thumbnailImage: acf.thumbnail || featuredImage,
    
    // Location & Duration - Prefer metadata from JSON, then ACF, then parsed
    location: departureSchedule?.metadata?.location || destinations.join(', ') || acf.location || 'India',
    destinations,
    duration: departureSchedule?.metadata?.duration || acf.duration || wpTour.title?.rendered || '7 Days / 6 Nights',
    
    // Pricing - STRICTLY from departure_schedule JSON only
    pricePerPerson,
    priceAdult: pricePerPerson,
    priceChild: 0, // Deprecated - use departure-specific child prices
    childWithBed: departureSchedule?.departures?.[0]?.childWithBed || 0,
    childWithoutBed: departureSchedule?.departures?.[0]?.childWithoutBed || 0,
    extraAdultSameRoom: departureSchedule?.departures?.[0]?.extraAdultSameRoom || 0,
    singleRoomSupplement: departureSchedule?.departures?.[0]?.singleRoomSupplement || 0,
    pricingTiers,
    
    // Availability - ONLY from departure_schedule
    availableDates,
    departureDate: availableDates[0] || '',
    departureSchedule, // Include full schedule for frontend
    minTravelers: parseInt(departureSchedule?.metadata?.minTravelers || 1),
    maxTravelers: parseInt(departureSchedule?.metadata?.maxTravelers || 30),
    seatsAvailable: seatsAvailable,
    bookingDeadline: 7,
    
    // Additional Details
    pickupLocation,
    inclusions: Array.isArray(inclusions) ? inclusions : [],
    exclusions: Array.isArray(exclusions) ? exclusions : [],
    
    // Addons - tour-level fallback (departure-specific addons preferred)
    addons: departureSchedule?.departures?.[0]?.addons || [],
    
    // Meta
    code: acf.tour_code || `TOUR-${wpTour.id}`,
    status: wpTour.status,
    createdAt: wpTour.date,
    modifiedAt: wpTour.modified,
    
    // Custom ACF fields (preserve all)
    customFields: acf
  };
}

/**
 * Search tours by keyword
 */
async function searchTours(keyword) {
  try {
    const response = await axios.get(`${WORDPRESS_API_URL}/wp/v2/itinerary`, {
      params: {
        search: keyword,
        per_page: 50,
        _embed: true,
        acf_format: 'standard'
      },
      timeout: API_TIMEOUT
    });

    const tours = await Promise.all(response.data.map(tour => formatTourData(tour)));
    return tours;
  } catch (error) {
    console.error('Error searching tours:', error.message);
    throw new Error('Failed to search tours');
  }
}

/**
 * Get tours by destination
 */
async function getToursByDestination(destinationSlug) {
  try {
    const response = await axios.get(`${WORDPRESS_API_URL}/wp/v2/itinerary`, {
      params: {
        destinations: destinationSlug,
        per_page: 50,
        _embed: true,
        acf_format: 'standard'
      },
      timeout: API_TIMEOUT
    });

    const tours = await Promise.all(response.data.map(tour => formatTourData(tour)));
    return tours;
  } catch (error) {
    console.error('Error fetching tours by destination:', error.message);
    throw new Error('Failed to fetch tours by destination');
  }
}

module.exports = {
  getAllTours,
  getTourById,
  searchTours,
  getToursByDestination,
  formatTourData
};
