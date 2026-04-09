function securityHeadersMiddleware(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  next();
}

module.exports = { securityHeadersMiddleware };
