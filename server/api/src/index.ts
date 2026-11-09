import "dotenv/config";
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 4000);

// Last resort: a stray failure nothing else caught is logged, not allowed to stop the API (and
// with it the POS and Admin). The error handler in createApp() is the real defence.
process.on("unhandledRejection", (reason) => {
  console.error("[api] unhandled rejection:", reason);
});

const app = createApp();

app.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port}`);
});
