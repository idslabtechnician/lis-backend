const nodemailer = require("nodemailer");

// Initialize transporter once at the top level
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // Use STARTTLS on port 587
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASSWORD,
  },
  tls: {
    // This helps resolve issues with some cloud environment certificates
    rejectUnauthorized: false
  },
  connectionTimeout: 15000, // Increase to 15s for STARTTLS handshake
});

/**
 * Send an email using SMTP
 * @param {Object} options - Email options (email, subject, html)
 */
const sendEmail = async (options) => {
  const fromName = process.env.FROM_NAME || "IDS Lab System";
  const fromEmail = process.env.GMAIL_USER; // Use the authenticated email as the sender

  const message = {
    from: `"${fromName}" <${fromEmail}>`,
    to: options.email,
    subject: options.subject,
    html: options.html,
  };

  try {
    console.log(`[EMAIL] Attempting to send to: ${options.email}`);
    const info = await transporter.sendMail(message);
    console.log(`[EMAIL] Success: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error("[EMAIL] Error:", error);
    throw error;
  }
};

module.exports = sendEmail;
