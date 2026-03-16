/**
 * Escapes HTML special characters to prevent HTML injection in emails.
 * @param {string} str - The input string to escape
 * @returns {string} The escaped string
 */
const escapeHtml = (str) => {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

module.exports = escapeHtml;
