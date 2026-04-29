/**
 * Send an email using Brevo API (HTTP-based)
 * This bypasses SMTP blocks on Render/Vercel.
 */
const sendEmail = async (options) => {
  const BREVO_API_KEY = process.env.BREVO_API_KEY?.replace(/["']/g, "")?.trim();
  console.log(`[BREVO] Using API Key starting with: ${BREVO_API_KEY?.substring(0, 10)}... length: ${BREVO_API_KEY?.length}`);

  // Use your verified Brevo sender email
  const fromEmail = process.env.FROM_EMAIL;
  const fromName = process.env.FROM_NAME;

  try {
    console.log(`[BREVO] Sending email to: ${options.email}`);

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: fromName,
          email: fromEmail,
        },
        to: [
          {
            email: options.email,
          },
        ],
        subject: options.subject,
        htmlContent: options.html,
      }),
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
