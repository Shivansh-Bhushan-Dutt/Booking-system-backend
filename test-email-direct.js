const nodemailer = require('nodemailer');
require('dotenv').config();

console.log('🔍 Testing Email Configuration...\n');
console.log('SMTP Settings:');
console.log('  Host:', process.env.SMTP_HOST);
console.log('  Port:', process.env.SMTP_PORT);
console.log('  User:', process.env.SMTP_USER);
console.log('  Pass:', process.env.SMTP_PASS ? '****' + process.env.SMTP_PASS.slice(-4) : 'NOT SET');
console.log('  From:', process.env.EMAIL_FROM);
console.log('  Admin:', process.env.ADMIN_EMAIL);
console.log('\n');

async function testEmail() {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    console.log('📧 Sending test email...\n');

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.ADMIN_EMAIL,
      subject: 'Test Email - Booking System',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px;">
            <h1>✅ Email Test Successful!</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; margin-top: 20px; border-radius: 10px;">
            <h2>Test Results:</h2>
            <ul>
              <li><strong>SMTP Host:</strong> ${process.env.SMTP_HOST}</li>
              <li><strong>SMTP Port:</strong> ${process.env.SMTP_PORT}</li>
              <li><strong>From:</strong> ${process.env.EMAIL_FROM}</li>
              <li><strong>To:</strong> ${process.env.ADMIN_EMAIL}</li>
              <li><strong>Time:</strong> ${new Date().toLocaleString()}</li>
            </ul>
            <p style="color: green; font-weight: bold;">✅ If you're reading this, your email configuration is working perfectly!</p>
          </div>
        </div>
      `
    });

    console.log('✅ SUCCESS! Email sent successfully!\n');
    console.log('Details:');
    console.log('  Message ID:', info.messageId);
    console.log('  Response:', info.response);
    console.log('\n✅ Check your inbox:', process.env.ADMIN_EMAIL);
    console.log('\n🎉 Email service is working correctly!\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ FAILED to send email!\n');
    console.error('Error Details:');
    console.error('  Message:', error.message);
    console.error('  Code:', error.code);
    if (error.command) {
      console.error('  Command:', error.command);
    }
    console.error('\nFull Error:');
    console.error(error);
    
    console.log('\n🔧 Troubleshooting:');
    console.log('  1. Verify Gmail App Password is correct');
    console.log('  2. Check if 2-Step Verification is enabled');
    console.log('  3. Make sure "Less secure app access" is not required');
    console.log('  4. Try generating a new App Password');
    
    process.exit(1);
  }
}

testEmail();
