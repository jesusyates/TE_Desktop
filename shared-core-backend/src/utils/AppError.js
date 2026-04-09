class AppError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} [statusCode=400]
   */
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

module.exports = { AppError };
