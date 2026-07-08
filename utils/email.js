const { Resend } = require('resend');

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * ✅ Send OTP Email using Resend
 */
const sendOTP = async (email, otp) => {
  try {
    const fromEmail = process.env.EMAIL_FROM;

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: 'Your OTP for e-Sevai Office Login',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; border: 1px solid #dee2e6;">
            <h2 style="color: #2c3e50; margin-top: 0;">e-Sevai Office Management</h2>
            <h3 style="color: #3498db;">One Time Password (OTP)</h3>
            <p style="font-size: 16px; line-height: 1.6; color: #333;">
              Your OTP for authentication is: 
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
    });

    if (error) {
      throw new Error(error.message);
    }

    console.log(`✅ OTP email sent successfully to ${email}, messageId: ${data.id}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to send OTP email:', error.message);
    throw new Error(`Email delivery failed: ${error.message}`);
  }
};

/**
 * ✅ Send Welcome Email to New Employees using Resend
 */
const sendWelcomeEmail = async (email, name, password) => {
  try {
    const fromEmail = process.env.EMAIL_FROM;

    const { data, error } = await resend.emails.send({
      from: fromEmail,
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
    });

    if (error) {
      throw new Error(error.message);
    }

    console.log(`✅ Welcome email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to send welcome email:', error.message);
    throw new Error(`Failed to send welcome email: ${error.message}`);
  }
};

/**
 * Test email connection (For Resend, we can just verify the API key is present)
 */
const testEmailConnection = async () => {
  if (process.env.RESEND_API_KEY) {
    console.log('✅ Resend API Key is configured');
    return true;
  } else {
    console.error('❌ Resend API Key is missing');
    return false;
  }
};

module.exports = {
  sendOTP,
  sendWelcomeEmail,
  testEmailConnection
};