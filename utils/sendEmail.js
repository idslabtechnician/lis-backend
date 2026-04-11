const nodemailer = require("nodemailer");

const sendEmail = async (options) => {
  // Create a transporter using the SMTP settings
  // Using host/port instead of "service" can be more stable in some environments
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // true for 465, false for other ports
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASSWORD,
    },
    // Adding a short timeout
    connectionTimeout: 10000, 
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  const message = {
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: options.email,
    subject: options.subject,
    html: options.html,
  };

  try {
    console.log(`Attempting to send email to: ${options.email}...`);
    const info = await transporter.sendMail(message);
    console.log("Email sent successfully! Message ID: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("Nodemailer Error Details:", error);
    throw error; // Let the controller handle it
  }
};

module.exports = sendEmail;
