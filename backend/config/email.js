const nodemailer = require('nodemailer');

// Basic reusable transporter based on environment variables.
// Configure in .env:
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE (optional), SMTP_FROM (optional)
const createTransporter = () => {
  if (!process.env.SMTP_HOST) {
    console.warn('[email] SMTP_HOST not set; emails will be skipped.');
    return null;
  }

  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  const auth =
    process.env.SMTP_USER && process.env.SMTP_PASS
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth,
  });
};

const transporter = createTransporter();

async function sendWelcomeEmail(user) {
  if (!user || !user.email) return;
  if (!transporter) {
    // Transporter not configured; just log for development.
    console.warn(`[email] Skipping welcome email for ${user.email} (no SMTP config).`);
    return;
  }

  const from = process.env.SMTP_FROM || '"WasteZero" <no-reply@wastezero.local>';

  const mailOptions = {
    from,
    to: user.email,
    subject: 'Welcome to WasteZero 🎉',
    text: [
      `Hi ${user.name || 'there'},`,
      '',
      'Welcome to WasteZero! Your account has been created successfully.',
      '',
      'You can now:',
      '- Schedule eco-friendly waste pickups,',
      '- Track your environmental impact,',
      '- Connect with volunteers and admins in your area.',
      '',
      'Thanks for helping keep your community clean,',
      'The WasteZero Team',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Welcome to WasteZero 👋</h2>
        <p>Hi <strong>${user.name || 'there'}</strong>,</p>
        <p>
          Thanks for signing up to <strong>WasteZero</strong>!
          Your account has been created successfully.
        </p>
        <p>You can now:</p>
        <ul>
          <li>Schedule eco-friendly waste pickups,</li>
          <li>Track your environmental impact over time,</li>
          <li>Connect with volunteers and admins in your area.</li>
        </ul>
        <p>
          Together we can make your neighborhood cleaner and greener 🌱.
        </p>
        <p>Cheers,<br/>The WasteZero Team</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[email] Welcome email sent to ${user.email}`);
  } catch (err) {
    console.error('[email] Failed to send welcome email:', err.message || err);
  }
}

async function sendPasswordResetOtp(user, otp) {
  if (!user || !user.email) return;
  if (!transporter) {
    console.warn(`[email] Skipping password reset email for ${user.email} (no SMTP config).`);
    return;
  }

  const from = process.env.SMTP_FROM || '"WasteZero" <no-reply@wastezero.local>';

  const mailOptions = {
    from,
    to: user.email,
    subject: 'WasteZero Password Reset Code',
    text: [
      `Hi ${user.name || 'there'},`,
      '',
      'We received a request to reset your WasteZero password.',
      `Your one-time code is: ${otp}`,
      '',
      'This code will expire in 10 minutes. If you did not request this, you can safely ignore this email.',
      '',
      'Thanks,',
      'The WasteZero Team',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Password reset request</h2>
        <p>Hi <strong>${user.name || 'there'}</strong>,</p>
        <p>We received a request to reset your <strong>WasteZero</strong> password.</p>
        <p style="margin:16px 0;">
          Your one-time reset code is:
        </p>
        <p style="font-size:1.8rem;font-weight:700;letter-spacing:0.3rem;background:#0f172a;color:#e5e7eb;padding:10px 16px;border-radius:8px;display:inline-block;">
          ${otp}
        </p>
        <p style="margin-top:16px;">
          This code will expire in <strong>10 minutes</strong>. If you did not request this,
          you can safely ignore this email and your password will stay the same.
        </p>
        <p style="margin-top:24px;">Stay safe,<br/>The WasteZero Team</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[email] Password reset OTP sent to ${user.email}`);
  } catch (err) {
    console.error('[email] Failed to send password reset email:', err.message || err);
  }
}

module.exports = {
  transporter,
  sendWelcomeEmail,
  sendPasswordResetOtp,
};

