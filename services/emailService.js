const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/**
 * Send booking confirmation email to customer
 */
async function sendBookingConfirmation(booking, tour) {
  try {
    const departureDate = new Date(booking.departureDate).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const totalTravelers = booking.adults + booking.childrenWithBed + booking.childrenWithoutBed;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .booking-id { background: #fff; padding: 15px; border-left: 4px solid #667eea; margin: 20px 0; }
          .details { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
          .detail-label { font-weight: bold; color: #666; }
          .detail-value { color: #333; }
          .price-total { font-size: 24px; color: #667eea; font-weight: bold; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Booking Confirmed!</h1>
            <p>Thank you for booking with Immersive Trips</p>
          </div>
          
          <div class="content">
            <div class="booking-id">
              <strong>Booking Reference:</strong> ${booking.bookingId}
            </div>
            
            <p>Dear ${booking.customerName},</p>
            <p>Your booking has been successfully confirmed! We're excited to have you join us on this incredible journey.</p>
            
            <div class="details">
              <h2 style="color: #667eea; margin-top: 0;">Tour Details</h2>
              
              <div class="detail-row">
                <span class="detail-label">Tour Name:</span>
                <span class="detail-value">${booking.tourName}</span>
              </div>
              
              <div class="detail-row">
                <span class="detail-label">Departure Date:</span>
                <span class="detail-value">${departureDate}</span>
              </div>
              
              <div class="detail-row">
                <span class="detail-label">Duration:</span>
                <span class="detail-value">${tour.duration || 'As per itinerary'}</span>
              </div>
              
              <div class="detail-row">
                <span class="detail-label">Travelers:</span>
                <span class="detail-value">${booking.adults} Adult(s)${booking.childrenWithBed + booking.childrenWithoutBed > 0 ? `, ${booking.childrenWithBed + booking.childrenWithoutBed} Child(ren)` : ''}</span>
              </div>
              
              <div class="detail-row">
                <span class="detail-label">Total Amount Paid:</span>
                <span class="detail-value price-total">₹${booking.totalPrice.toLocaleString('en-IN')}</span>
              </div>
            </div>
            
            <div class="details">
              <h2 style="color: #667eea; margin-top: 0;">Contact Information</h2>
              
              <div class="detail-row">
                <span class="detail-label">Name:</span>
                <span class="detail-value">${booking.customerName}</span>
              </div>
              
              <div class="detail-row">
                <span class="detail-label">Email:</span>
                <span class="detail-value">${booking.customerEmail}</span>
              </div>
              
              <div class="detail-row">
                <span class="detail-label">Phone:</span>
                <span class="detail-value">${booking.customerPhone}</span>
              </div>
            </div>
            
            ${booking.specialRequests ? `
              <div class="details">
                <h3 style="color: #667eea; margin-top: 0;">Special Requests</h3>
                <p>${booking.specialRequests}</p>
              </div>
            ` : ''}
            
            <div style="text-align: center;">
              <a href="https://immersivetrips.in" class="button">View Tour Details</a>
            </div>
            
            <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
              <strong>⚠️ Important:</strong> Please carry a valid ID proof and this booking confirmation on the day of departure.
            </div>
            
            <p>If you have any questions or need to make changes to your booking, please contact us:</p>
            <ul>
              <li>Email: info@immerseindiatours.com</li>
              <li>Phone: +(91) 971 199 2099</li>
            </ul>
            
            <p>We look forward to creating unforgettable memories with you!</p>
            
            <p>Best regards,<br><strong>Immersive Trips Team</strong></p>
          </div>
          
          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
            <p>&copy; ${new Date().getFullYear()} Immersive Trips. All rights reserved.</p>
            <p>A-1, Vasant Kunj Enclave, New Delhi, India</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: booking.customerEmail,
      cc: process.env.ADMIN_EMAIL,
      subject: `Booking Confirmed - ${booking.bookingId} - ${booking.tourName}`,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Confirmation email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Error sending confirmation email:', error);
    throw error;
  }
}

/**
 * Send booking notification to admin
 */
async function sendAdminNotification(booking, tour) {
  try {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; }
          .header { background: #667eea; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: white; }
          .detail { padding: 10px; border-bottom: 1px solid #eee; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🔔 New Booking Received</h2>
          </div>
          <div class="content">
            <div class="detail"><strong>Booking ID:</strong> ${booking.bookingId}</div>
            <div class="detail"><strong>Tour:</strong> ${booking.tourName}</div>
            <div class="detail"><strong>Customer:</strong> ${booking.customerName}</div>
            <div class="detail"><strong>Email:</strong> ${booking.customerEmail}</div>
            <div class="detail"><strong>Phone:</strong> ${booking.customerPhone}</div>
            <div class="detail"><strong>Departure:</strong> ${new Date(booking.departureDate).toLocaleDateString('en-IN')}</div>
            <div class="detail"><strong>Travelers:</strong> ${booking.adults} Adult(s), ${booking.childrenWithBed + booking.childrenWithoutBed} Child(ren)</div>
            <div class="detail"><strong>Total Amount:</strong> ₹${booking.totalPrice.toLocaleString('en-IN')}</div>
            <div class="detail"><strong>Payment Status:</strong> ${booking.paymentStatus}</div>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: process.env.ADMIN_EMAIL,
      subject: `New Booking: ${booking.bookingId} - ${booking.tourName}`,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Admin notification sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Error sending admin notification:', error);
    throw error;
  }
}

module.exports = {
  sendBookingConfirmation,
  sendAdminNotification
};
