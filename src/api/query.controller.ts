import { Router, RequestHandler } from 'express';
import Joi from 'joi';
import logger from '../utils/logger';
import pineconeService from '../services/pinecone.service';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

interface SearchRequestBody {
  query: string;
  topK: number;
  includeMetadata: boolean;
  includeValues: boolean;
  filter?: Record<string, any>;
}

const searchRequestSchema = Joi.object({
  query: Joi.string().required(),
  topK: Joi.number().integer().min(1).max(10000).default(10),
  includeMetadata: Joi.boolean().default(true),
  includeValues: Joi.boolean().default(false),
  filter: Joi.object().optional(),
});

router.use(authMiddleware);

const searchHandler: RequestHandler<{}, any, SearchRequestBody> = async (req, res) => {
  try {
    const { error, value } = searchRequestSchema.validate(req.body);

    if (error) {
      logger.warn({ error: error.message, body: req.body }, 'Invalid search request');
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    const { query, topK, includeMetadata, includeValues, filter } = value;
    const userId = (req as AuthenticatedRequest).userId;
    const namespace = `user_${userId}`;
    console.log("namespace", namespace);
    logger.debug({ 
      userId,
      namespace,
      query,
      topK,
      filter 
    }, 'Processing search request');

    const searchResults = await pineconeService.search({
      namespace,
      query: {
        inputs: { text: query },
        top_k: topK,
      },
      includeMetadata,
      includeValues,
      filter,
    });

    logger.debug({ 
      matchCount: searchResults.matches?.length || 0,
      namespace: searchResults.namespace,
      usage: searchResults.usage
    }, 'Search results received');

    return res.status(200).json({
      success: true,
      results: searchResults,
    });
  } catch (error) {
    logger.error({ error }, 'Error processing search request');
    return res.status(500).json({
      success: false,
      message: 'Internal server error during search',
    });
  }
};

router.post('/search', searchHandler);

export default router;
