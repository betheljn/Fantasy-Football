// Start the server (pnpm dev, with .env loaded).
import { buildApp } from "./app.ts";
import { createDb } from "./db.ts";

const app = buildApp({ db: createDb(), logger: true });
const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: "0.0.0.0" });
