import { Request, Response, Router } from 'express';
import Joi from 'joi';
import logger from '../utils/logger';
import mongoService from '../services/mongo.service';
import gitService from '../services/git.service';
import pineconeService from '../services/pinecone.service';
import { Configuration, OpenAIApi } from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../utils/config';
import { walkAndChunkDirectory } from '../utils/chunker';

const router = Router();

const openai = new OpenAIApi(
  new Configuration({
    apiKey: config.openai.apiKey,
  })
);

const generateEmbedding = async (text: string): Promise<number[]> => {
  try {
    const response = await openai.createEmbedding({
      model: 'text-embedding-ada-002',
      input: text,
    });
    
    return response.data.data[0].embedding;
  } catch (error: any) {
    logger.error({ 
      error,
      errorMessage: error?.message || 'Unknown OpenAI API error',
      errorStack: error?.stack,
      errorResponse: error?.response?.data
    }, 'OpenAI API error generating embedding');
    throw error;
  }
};

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
    const jobId = job.jobId;
    let workDir: string | null = null;

    res.status(202).json({
      success: true,
      jobId: jobId,
      message: 'Embedding job started successfully',
    });

    try {
      await mongoService.updateJobStatus(jobId, 'running');
      logger.info({ jobId, repoUrl }, 'Starting embedding job');
      
      workDir = await gitService.cloneRepository(repoUrl, jobId, commit);
      await mongoService.updateJobStatus(jobId, 'running', 20);
      
      logger.info({ workDir }, 'Processing files in repository');
      const chunks = await walkAndChunkDirectory(workDir);
      
      if (chunks.length === 0) {
        logger.warn({ jobId }, 'No code chunks found in repository');
        await mongoService.updateJobStatus(jobId, 'succeeded', 100);
        return;
      }
      
      logger.info({ count: chunks.length }, 'Generated code chunks');
      await mongoService.updateJobStatus(jobId, 'running', 40);
      
      const vectors = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
          const embedding = await generateEmbedding(chunk.content);
          vectors.push({
            id: uuidv4(),
            values: embedding,
            metadata: {
              repoUrl: repoUrl,
              filePath: chunk.filePath,
              chunkIndex: chunk.chunkIndex,
              commit: commit,
              userId: userId,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
            },
          });
          
          if (i % 10 === 0 || i === chunks.length - 1) {
            const progress = Math.floor(40 + (60 * (i + 1)) / chunks.length);
            await mongoService.updateJobStatus(jobId, 'running', progress);
          }
        } catch (error: any) {
          logger.error({ 
            error,
            errorMessage: error?.message || 'Unknown error generating embedding',
            errorStack: error?.stack,
            chunkFile: chunk.filePath,
            chunkIndex: chunk.chunkIndex
          }, 'Failed to generate embedding for chunk');
          throw error;
        }
      }
      
      logger.info({ count: vectors.length }, 'Upserting vectors to Pinecone');
      try {
        await pineconeService.upsert(vectors);
      } catch (error: any) {
        logger.error({ 
          error,
          errorMessage: error?.message || 'Unknown Pinecone error',
          errorStack: error?.stack,
          vectorCount: vectors.length
        }, 'Failed to upsert vectors to Pinecone');
        throw error;
      }

      await mongoService.updateJobStatus(jobId, 'succeeded', 100);
      logger.info({ jobId }, 'Embedding job completed successfully');
    } catch (error: any) {
      logger.error({ 
        error,
        errorMessage: error?.message || 'Unknown error during embedding process',
        errorStack: error?.stack,
        jobId,
        repoUrl,
        workDir 
      }, 'Embedding job failed');
      await mongoService.updateJobStatus(jobId, 'failed', 0, error?.message || 'Unknown error during embedding process');
    } finally {
      if (workDir) {
        try {
          await gitService.cleanWorkingDirectory(workDir);
        } catch (cleanupError: any) {
          logger.error({
            error: cleanupError,
            errorMessage: cleanupError?.message || 'Unknown error during cleanup',
            errorStack: cleanupError?.stack,
            workDir
          }, 'Failed to clean working directory');
        }
      }
    }
  } catch (error: any) {
    logger.error({ 
      error,
      errorMessage: error?.message || 'Unknown error processing request',
      errorStack: error?.stack,
      body: req.body 
    }, 'Error processing embedding request');
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
  } catch (error: any) {
    logger.error({ 
      error,
      errorMessage: error?.message || 'Unknown error fetching job status',
      errorStack: error?.stack,
      jobId: req.params.jobId 
    }, 'Error fetching job status');
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

export default router; 