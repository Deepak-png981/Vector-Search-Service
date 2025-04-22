import mongoose from 'mongoose';
import { config } from '../utils/config';
import logger from '../utils/logger';
import Job, { IJob, JobStatus } from '../models/job.model';

class MongoService {
  public async connect(): Promise<void> {
    try {
      await mongoose.connect(config.mongodb.uri);
      logger.info('Connected to MongoDB');
    } catch (error) {
      logger.error({ error }, 'Failed to connect to MongoDB');
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await mongoose.disconnect();
      logger.info('Disconnected from MongoDB');
    } catch (error) {
      logger.error({ error }, 'Error disconnecting from MongoDB');
      throw error;
    }
  }

  public async createJob(userId: string, repoUrl: string, commit?: string): Promise<IJob> {
    const jobId = new mongoose.Types.ObjectId().toString();

    const job = new Job({
      jobId,
      userId,
      repoUrl,
      commit,
      status: 'queued' as JobStatus,
      progress: 0,
    });

    await job.save();
    logger.info({ jobId, repoUrl }, 'Created new job');
    return job;
  }

  public async updateJobStatus(
    jobId: string,
    status: JobStatus,
    progress = 0,
    error?: string,
  ): Promise<IJob | null> {
    const update: Partial<IJob> = { status, progress };

    if (error) {
      update.error = error;
    }

    const job = await Job.findOneAndUpdate({ jobId }, update, { new: true });

    if (job) {
      logger.info({ jobId, status, progress }, 'Updated job status');
    } else {
      logger.warn({ jobId }, 'Job not found when updating status');
    }

    return job;
  }

  public async getJob(jobId: string): Promise<IJob | null> {
    return Job.findOne({ jobId });
  }

  public async userExists(userId: string): Promise<boolean> {
    try {
      const collection = mongoose.connection.db.collection('users');

      const user = await collection.findOne({ userId });
      return !!user;
    } catch (error) {
      logger.error({ error, userId }, 'Error checking if user exists');
      return false;
    }
  }
}

export const mongoService = new MongoService();
export default mongoService;
