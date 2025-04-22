import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import mongoService from '../services/mongo.service';
import gitService from '../services/git.service';
import pineconeService from '../services/pinecone.service';
import { walkAndChunkDirectory, CodeChunk } from '../utils/chunker';
import { generateEmbedding } from '../services/openai.service';
import { Vector } from '../types';
import {
  BATCH_SIZE,
  CHUNKING_PROGRESS,
  FINAL_PROGRESS,
  INITIAL_PROGRESS,
} from '../utils/constants';
import { ApplicationError } from '../types/errors';

const updateProgress = async (
  jobId: string,
  baseProgress: number,
  current: number,
  total: number,
): Promise<void> => {
  const progress = Math.floor(baseProgress + ((100 - baseProgress) * current) / total);
  await mongoService.updateJobStatus(jobId, 'running', progress);
};

const processChunk = async (
  chunk: CodeChunk,
  repoUrl: string,
  userId: string,
  commit: string,
): Promise<Vector> => {
  try {
    const embedding = await generateEmbedding(chunk.content);
    return {
      id: uuidv4(),
      values: embedding,
      metadata: {
        repoUrl,
        filePath: chunk.filePath,
        chunkIndex: chunk.chunkIndex,
        commit,
        userId,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
      },
    };
  } catch (error: unknown) {
    const appError = error as ApplicationError;
    logger.error(
      {
        error: appError,
        errorMessage: appError?.message || 'Unknown error generating embedding',
        errorStack: appError?.stack,
        chunkFile: chunk.filePath,
        chunkIndex: chunk.chunkIndex,
      },
      'Failed to generate embedding for chunk',
    );
    throw error;
  }
};

const processChunksInBatches = async (
  chunks: CodeChunk[],
  jobId: string,
  repoUrl: string,
  userId: string,
  commit: string,
): Promise<Vector[]> => {
  const vectors: Vector[] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, Math.min(i + BATCH_SIZE, chunks.length));
    const batchVectors = await Promise.all(
      batch.map((chunk) => processChunk(chunk, repoUrl, userId, commit)),
    );
    vectors.push(...batchVectors);

    await updateProgress(jobId, CHUNKING_PROGRESS, i + batch.length, chunks.length);
  }

  return vectors;
};

const upsertVectors = async (vectors: Vector[]): Promise<void> => {
  try {
    logger.info({ count: vectors.length }, 'Upserting vectors to Pinecone');
    await pineconeService.upsert(vectors);
  } catch (error: unknown) {
    const appError = error as ApplicationError;
    logger.error(
      {
        error: appError,
        errorMessage: appError?.message || 'Unknown Pinecone error',
        errorStack: appError?.stack,
        vectorCount: vectors.length,
      },
      'Failed to upsert vectors to Pinecone',
    );
    throw error;
  }
};

export const processEmbedding = async (
  jobId: string,
  repoUrl: string,
  userId: string,
  commit?: string,
): Promise<void> => {
  const workDir = await gitService.cloneRepository(repoUrl, jobId, commit);
  const normalizedCommit = commit || '';

  try {
    await mongoService.updateJobStatus(jobId, 'running');
    logger.info({ jobId, repoUrl }, 'Starting embedding job');

    await mongoService.updateJobStatus(jobId, 'running', INITIAL_PROGRESS);
    logger.info({ workDir }, 'Processing files in repository');

    const chunks = await walkAndChunkDirectory(workDir);
    if (chunks.length === 0) {
      logger.warn({ jobId }, 'No code chunks found in repository');
      await mongoService.updateJobStatus(jobId, 'succeeded', FINAL_PROGRESS);
      return;
    }

    logger.info({ count: chunks.length }, 'Generated code chunks');
    await mongoService.updateJobStatus(jobId, 'running', CHUNKING_PROGRESS);

    const vectors = await processChunksInBatches(chunks, jobId, repoUrl, userId, normalizedCommit);
    await upsertVectors(vectors);

    await mongoService.updateJobStatus(jobId, 'succeeded', FINAL_PROGRESS);
    logger.info({ jobId }, 'Embedding job completed successfully');
  } catch (error: unknown) {
    const appError = error as ApplicationError;
    logger.error(
      {
        error: appError,
        errorMessage: appError?.message || 'Unknown error during embedding process',
        errorStack: appError?.stack,
        jobId,
        repoUrl,
        workDir,
      },
      'Embedding job failed',
    );
    await mongoService.updateJobStatus(
      jobId,
      'failed',
      0,
      appError?.message || 'Unknown error during embedding process',
    );
    throw error;
  } finally {
    try {
      await gitService.cleanWorkingDirectory(workDir);
    } catch (cleanupError: unknown) {
      const appError = cleanupError as ApplicationError;
      logger.error(
        {
          error: appError,
          errorMessage: appError?.message || 'Unknown error during cleanup',
          errorStack: appError?.stack,
          workDir,
        },
        'Failed to clean working directory',
      );
    }
  }
};
