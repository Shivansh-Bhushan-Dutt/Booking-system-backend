CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id VARCHAR(50) UNIQUE NOT NULL,
  
  -- Tour Information
  tour_id VARCHAR(50) NOT NULL,
  tour_name VARCHAR(255) NOT NULL,
  tour_slug VARCHAR(255) NOT NULL,
  
  -- Customer Information
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  
  -- Booking Details
  departure_date TIMESTAMP NOT NULL,
  adults INTEGER NOT NULL DEFAULT 1,
  children_with_bed INTEGER DEFAULT 0,
  children_without_bed INTEGER DEFAULT 0,
  
  -- Room Configuration (JSON)
  room_configuration JSONB DEFAULT '{}',
  
  -- Addons (JSON array)
  addons JSONB DEFAULT '[]',
  
  -- Pricing
  base_price DECIMAL(10,2) NOT NULL,
  children_price DECIMAL(10,2) DEFAULT 0,
  room_price DECIMAL(10,2) DEFAULT 0,
  addons_price DECIMAL(10,2) DEFAULT 0,
  total_price DECIMAL(10,2) NOT NULL,
  
  -- Payment Information
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'confirmed', 'failed', 'refunded')),
  payment_id VARCHAR(255),
  payment_method VARCHAR(50) DEFAULT 'razorpay' CHECK (payment_method IN ('razorpay', 'bank_transfer', 'other')),
  payment_details JSONB,
  
  -- Booking Status
  booking_status VARCHAR(20) DEFAULT 'pending' CHECK (booking_status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  
  -- Additional Information
  special_requests TEXT,
  admin_notes TEXT,
  
  -- Timestamps
  booking_date TIMESTAMP DEFAULT NOW(),
  confirmed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  
  -- Email Tracking
  confirmation_email_sent BOOLEAN DEFAULT FALSE,
  confirmation_email_sent_at TIMESTAMP,
  
  -- Auto timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_bookings_customer_email ON bookings(customer_email);
CREATE INDEX idx_bookings_booking_date ON bookings(booking_date DESC);
CREATE INDEX idx_bookings_departure_date ON bookings(departure_date);
CREATE INDEX idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX idx_bookings_booking_status ON bookings(booking_status);
CREATE INDEX idx_bookings_tour_id ON bookings(tour_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for authenticated users
-- You can customize these policies based on your security requirements
CREATE POLICY "Enable all operations for service role"
  ON bookings FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE bookings IS 'Stores all booking information for the Immersive Trips booking system';
