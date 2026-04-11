/**
 * Send an email using Brevo API (HTTP-based)
 * This bypasses SMTP blocks on Render/Vercel.
 */
const sendEmail = async (options) => {
  const BREVO_API_KEY = process.env.BREVO_API_KEY || "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";
  
  // Use your verified Brevo sender email
  const fromEmail = "hamilicheslerjohn@gmail.com"; 
  const fromName = process.env.FROM_NAME || "IDS Lab System";

  try {
    console.log(`[BREVO] Sending email to: ${options.email}`);

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sender: {
          name: fromName,
          email: fromEmail
        },
        to: [
          {
            email: options.email
          }
        ],
        subject: options.subject,
        htmlContent: options.html
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[BREVO] API Error Response:", data);
      throw new Error(data.message || "Failed to send email via Brevo");
    }

    console.log(`[BREVO] Success! Message ID: ${data.messageId}`);
    return data;
  } catch (error) {
    console.error("[BREVO] Catch Error:", error);
    throw error;
  }
};

module.exports = sendEmail;
