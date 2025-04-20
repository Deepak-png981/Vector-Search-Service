import request from 'supertest';
import express from 'express';
import embedController from '../../src/api/embed.controller';
import healthRouter from '../../src/health';
import mongoService from '../../src/services/mongo.service';
import { scheduleEmbedRepoJob } from '../../src/jobs';

jest.mock('../../src/services/mongo.service');
jest.mock('../../src/jobs');

describe('API Endpoints', () => {
  const app = express();
  app.use(express.json());
  app.use('/embed', embedController);
  app.use('/healthz', healthRouter);
  
  beforeEach(() => {
    jest.resetAllMocks();
  });
  
  describe('POST /embed', () => {
    test('should return 400 for invalid payload', async () => {
      const response = await request(app)
        .post('/embed')
        .send({
          repoUrl: 'https://github.com/user/repo.git',
        });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
    
    test('should return 404 when user not found', async () => {
      (mongoService.userExists as jest.Mock).mockResolvedValue(false);
      
      const response = await request(app)
        .post('/embed')
        .send({
          repoUrl: 'https://github.com/user/repo.git',
          userId: 'non-existent-user',
        });
      
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('User not found');
    });
    
    test('should create job and schedule embedding when valid', async () => {
      (mongoService.userExists as jest.Mock).mockResolvedValue(true);
      (mongoService.createJob as jest.Mock).mockResolvedValue({
        jobId: 'test-job-id',
        repoUrl: 'https://github.com/user/repo.git',
        userId: 'test-user',
      });
      (scheduleEmbedRepoJob as jest.Mock).mockResolvedValue(undefined);
      
      const response = await request(app)
        .post('/embed')
        .send({
          repoUrl: 'https://github.com/user/repo.git',
          userId: 'test-user',
        });
      
      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.jobId).toBe('test-job-id');
      expect(mongoService.createJob).toHaveBeenCalledWith('test-user', 'https://github.com/user/repo.git', undefined);
      expect(scheduleEmbedRepoJob).toHaveBeenCalledWith('test-job-id');
    });
  });
  
  describe('GET /embed/:jobId', () => {
    test('should return 404 when job not found', async () => {
      (mongoService.getJob as jest.Mock).mockResolvedValue(null);
      
      const response = await request(app).get('/embed/non-existent-job');
      
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
    
    test('should return job status when job exists', async () => {
      (mongoService.getJob as jest.Mock).mockResolvedValue({
        jobId: 'test-job-id',
        status: 'running',
        progress: 45,
        repoUrl: 'https://github.com/user/repo.git',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      const response = await request(app).get('/embed/test-job-id');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.job.jobId).toBe('test-job-id');
      expect(response.body.job.status).toBe('running');
      expect(response.body.job.progress).toBe(45);
    });
  });
}); 