import app from "./app";
import { logger } from "./lib/logger";
import { runSeedIfEmpty } from "@workspace/db/autoSeed";
import { seedUsersIfEmpty } from "./seedUsers";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

runSeedIfEmpty()
  .then(() => seedUsersIfEmpty())
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to seed database");
    process.exit(1);
  });
