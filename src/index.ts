import express from 'express';
import pinoHttp from 'pino-http';
import fs from 'fs';
import { config } from './utils/config';
import logger from './utils/logger';
import mongoService from './services/mongo.service';
import pineconeService from './services/pinecone.service';
import embedController from './api/embed.controller';
import healthRouter from './health';

const app = express();

app.use(express.json());
app.use(pinoHttp({ logger }));

app.use('/embed', embedController);
app.use('/health', healthRouter);

app.get('/', (_req, res) => {
  res.json({
    name: 'embedding-builder',
    description: 'Microservice for embedding repository code into vector stores',
    docs: '/docs',
  });
});

app.use((err: Error, _req: express.Request, res: express.Response) => {
  logger.error({ err, _req }, 'Unhandled error');
  res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
});

const tempDir = config.tempDir;
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  logger.info({ tempDir }, 'Created temporary work directory');
}

const startApp = async (): Promise<void> => {
  try {
    await mongoService.connect();

    await pineconeService.init();

    const port = config.port;
    app.listen(port, () => {
      logger.info({ port }, 'Embedding Builder microservice started');
    });

    const shutdown = async () => {
      logger.info('Shutting down application...');

      await mongoService.disconnect();

      logger.info('Application shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.fatal({ error }, 'Failed to start application');
    process.exit(1);
  }
};

startApp().catch((error) => {
  logger.fatal({ error }, 'Unhandled error during startup');
  process.exit(1);
});
