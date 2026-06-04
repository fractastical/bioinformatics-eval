import express, { type Express, type ErrorRequestHandler } from "express";
import cors, { type CorsOptions } from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Behind the Replit shared proxy — trust a single hop so rate limiting / client IPs work.
app.set("trust proxy", 1);

// Allowed browser origins. In Replit these env vars are set; locally they may be absent,
// in which case we fall back to allowing all origins so dev isn't broken.
const allowedHosts = new Set(
  [
    ...(process.env.REPLIT_DOMAINS?.split(",") ?? []),
    process.env.REPLIT_DEV_DOMAIN,
  ]
    .filter((h): h is string => Boolean(h))
    .map((h) => h.trim()),
);

const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, cb) {
    // No Origin header = same-origin request, curl, or server-to-server — allow.
    if (!origin) return cb(null, true);
    if (allowedHosts.size === 0) return cb(null, true);
    try {
      const host = new URL(origin).hostname;
      if (allowedHosts.has(host)) return cb(null, true);
    } catch {
      // fall through to deny
    }
    return cb(null, false);
  },
};

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 300, // generous: the SPA polls evaluation status frequently
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use("/api", router);

// Centralized error handler — keeps stack traces out of responses and maps known errors.
const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const log = (req as { log?: typeof logger }).log ?? logger;

  if (err?.name === "MulterError") {
    const tooLarge = err.code === "LIMIT_FILE_SIZE";
    res
      .status(tooLarge ? 413 : 400)
      .json({ error: tooLarge ? "File too large (max 25MB)" : `Upload error: ${err.message}` });
    return;
  }
  if (err?.message === "Only PDF files are accepted") {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err?.type === "entity.too.large" || err?.status === 413) {
    res.status(413).json({ error: "Request body too large" });
    return;
  }
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  log.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);

export default app;
