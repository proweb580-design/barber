import path from "node:path";
import { config } from "dotenv";
import Fastify from "fastify";
import { registerRoutes } from "./app.js";

config({ path: path.resolve(import.meta.dirname, "../../../.env") });

const app = Fastify({ logger: true, bodyLimit: 4 * 1024 * 1024 });

await registerRoutes(app);

const port = Number(process.env.PORT || 3000);

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});

export default app;

