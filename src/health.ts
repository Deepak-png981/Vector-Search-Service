import { Request, Response, Router } from 'express';
import mongoose from 'mongoose';
import logger from './utils/logger';
import pineconeService from './services/pinecone.service';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const health = {
    status: 'ok',
    timestamp: new Date(),
    services: {
      mongo: {
        connected: mongoose.connection.readyState === 1,
      },
      pinecone: {
        connected: false,
      },
    },
  };

  try {
    health.services.pinecone.connected = await pineconeService.isHealthy();
    
    if (
      health.services.mongo.connected &&
      health.services.pinecone.connected
    ) {
      return res.status(200).json(health);
    } else {
      health.status = 'degraded';
      logger.warn({ health }, 'Health check failed');
      return res.status(503).json(health);
    }
  } catch (error) {
    health.status = 'error';
    logger.error({ error }, 'Health check error');
    return res.status(500).json({
      ...health,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router; 