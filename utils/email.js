const nodemailer = require('nodemailer');

/**
 * Create Nodemailer transporter with proper error handling
 */
const createTransporter = () => {
  try {
    // Validate required email configuration
    const required = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASSWORD'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing email configuration: ${missing.join(', ')}`);
    }

    // Default EMAIL_FROM if not set
    if (!process.env.EMAIL_FROM) {
      process.env.EMAIL_FROM = process.env.EMAIL_USER;
    }

    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
      // Timeout settings for reliability
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      // Disable TLS reject unauthorized for development
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production'
      }
    });
  } catch (error) {
    console.error('❌ Email transporter creation failed:', error.message);
    throw error;
  }
};

/**
 * ✅ Send OTP Email
 */
const sendOTP = async (email, otp) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Your OTP for e-Sevai Office Login',
      priority: 'high',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; border: 1px solid #dee2e6;">
            <h2 style="color: #2c3e50; margin-top: 0;">e-Sevai Office Management</h2>
            <h3 style="color: #3498db;">One Time Password (OTP)</h3>
            <p style="font-size: 16px; line-height: 1.6; color: #333;">
              Your OTP for admin login is: 
              <strong style="font-size: 28px; color: #e74c3c; letter-spacing: 4px; display: block; margin: 15px 0;">${otp}</strong>
            </p>
            <p style="color: #666; font-size: 14px;">
              This OTP is <strong>valid for 5 minutes only</strong>. Please do not share this code with anyone.
            </p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">
              If you didn't request this OTP, please ignore this email and contact administrator.
            </p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ OTP email sent successfully to ${email}, messageId: ${info.messageId}`);
    
    return true;
  } catch (error) {
    console.error('❌ Failed to send OTP email:', error.message);
    throw new Error(`Email delivery failed: ${error.message}`);
  }
};

/**
 * ✅ Send Welcome Email to New Employees
 */
const sendWelcomeEmail = async (email, name, password) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Welcome to e-Sevai Office Management System',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; border: 1px solid #dee2e6;">
            <h2 style="color: #2c3e50; margin-top: 0;">Welcome ${name}!</h2>
            <p style="font-size: 16px; line-height: 1.6; color: #333;">
              Your account has been created successfully. Here are your login credentials:
            </p>
            <div style="background: #fff; padding: 20px; border-radius: 5px; border: 1px solid #ddd; margin: 20px 0;">
              <p style="margin: 8px 0;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 8px 0;"><strong>Password:</strong> ${password}</p>
            </div>
            <p style="color: #666; font-size: 14px;">
              <strong>Important:</strong> Please change your password after your first login for security purposes.
            </p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent to ${email}`);
    
    return true;
  } catch (error) {
    console.error('❌ Failed to send welcome email:', error.message);
    throw new Error(`Failed to send welcome email: ${error.message}`);
  }
};

/**
 * Test email connection
 */
const testEmailConnection = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('✅ Email server connection successful');
    return true;
  } catch (error) {
    console.error('❌ Email server connection failed:', error.message);
    return false;
  }
};

module.exports = {
  sendOTP,
  sendWelcomeEmail,
  testEmailConnection,
  createTransporter
};