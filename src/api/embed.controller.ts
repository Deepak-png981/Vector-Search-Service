import { Request, Response, Router } from 'express';
import Joi from 'joi';
import logger from '../utils/logger';
import mongoService from '../services/mongo.service';
import gitService from '../services/git.service';
import { processEmbedding } from '../jobs/processEmbeddings';
import { ApplicationError } from '../types/errors';

const router = Router();

const embedRequestSchema = Joi.object({
  repoUrl: Joi.string().required(),
  commit: Joi.string().optional(),
  userId: Joi.string().required(),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { error, value } = embedRequestSchema.validate(req.body);

    if (error) {
      logger.warn({ error: error.message, body: req.body }, 'Invalid embedding request');
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    const { repoUrl, commit, userId } = value;

    if (!gitService.isGitUrl(repoUrl)) {
      logger.warn({ repoUrl }, 'Invalid repository URL format');
      return res.status(400).json({
        success: false,
        message: 'Invalid repository URL format',
      });
    }

    const userExists = await mongoService.userExists(userId);
    if (!userExists) {
      logger.warn({ userId }, 'User not found');
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const job = await mongoService.createJob(userId, repoUrl, commit);

    // Start background processing
    processEmbedding(job.jobId, repoUrl, userId, commit).catch((error) => {
      logger.error({ error }, 'Unhandled error in background processing');
    });

    return res.status(202).json({
      success: true,
      jobId: job.jobId,
      message: 'Embedding job started successfully',
    });
  } catch (error: unknown) {
    const appError = error as ApplicationError;
    logger.error(
      {
        error: appError,
        errorMessage: appError?.message || 'Unknown error processing request',
        errorStack: appError?.stack,
        body: req.body,
      },
      'Error processing embedding request',
    );
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

router.get('/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const job = await mongoService.getJob(jobId);

    if (!job) {
      logger.warn({ jobId }, 'Job not found');
      return res.status(404).json({
        success: false,
        message: 'Job not found',
      });
    }

    return res.status(200).json({
      success: true,
      job: {
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        repoUrl: job.repoUrl,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        error: job.error,
      },
    });
  } catch (error: unknown) {
    const appError = error as ApplicationError;
    logger.error(
      {
        error: appError,
        errorMessage: appError?.message || 'Unknown error fetching job status',
        errorStack: appError?.stack,
        jobId: req.params.jobId,
      },
      'Error fetching job status',
    );
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

export default router;
