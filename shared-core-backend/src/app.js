const express = require("express");
const cors = require("cors");
const { config } = require("./infra/config");
const { securityHeadersMiddleware } = require("./middlewares/security-headers.middleware");
const { unifiedContextMiddleware } = require("./middlewares/request-context.middleware");
const { requestLoggingMiddleware } = require("./middlewares/request-logging.middleware");
const { errorMiddleware } = require("./middlewares/error.middleware");
const { healthRouter } = require("./routes/health.routes");
const { versionRouter } = require("./routes/version.routes");
const v1Router = require("./routes/v1");
const { legacyKernelHandler } = require("./compatibility/legacy-kernel");
const { compatibilityDeprecationMiddleware } = require("./compatibility/deprecated-headers.middleware");

function createApp() {
  const app = express();
  const c = config();

  const trust = c.trustProxy;
  if (trust === "1" || trust === "true") app.set("trust proxy", 1);
  else if (/^\d+$/.test(String(trust))) app.set("trust proxy", parseInt(trust, 10));
  else app.set("trust proxy", false);

  app.disable("x-powered-by");

  app.use(securityHeadersMiddleware);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (c.allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Not allowed by CORS"));
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Client-Platform",
        "X-Client-Market",
        "X-Client-Locale",
        "X-Client-Version",
        "X-Client-Product",
        "X-Client-Id",
        "X-Product",
        "X-Client-Preference-Market",
        "X-Client-Preference-Locale"
      ],
      exposedHeaders: ["X-Session-Refresh-Recommended", "Deprecation", "Link", "X-API-Compat-Deprecated"],
      credentials: false
    })
  );
  app.use(express.json({ limit: c.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: c.urlEncodedBodyLimit }));
  app.use(unifiedContextMiddleware);
  app.use(requestLoggingMiddleware);

  app.use(healthRouter);
  app.use(versionRouter);
  app.use("/v1", v1Router);

  app.use(compatibilityDeprecationMiddleware);
  app.use((req, res, next) => {
    Promise.resolve(legacyKernelHandler(req, res)).catch(next);
  });

  app.use(errorMiddleware);

  return app;
}

module.exports = { createApp };
