import mongoose, { Document, Schema } from 'mongoose';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface IJob extends Document {
  jobId: string;
  userId: string;
  repoUrl: string;
  commit?: string;
  status: JobStatus;
  progress: number;
  createdAt: Date;
  updatedAt: Date;
  error?: string;
}

const JobSchema = new Schema<IJob>(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: String,
      required: true,
    },
    repoUrl: {
      type: String,
      required: true,
    },
    commit: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: ['queued', 'running', 'succeeded', 'failed'],
      default: 'queued',
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    error: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  },
);

export const Job = mongoose.model<IJob>('Job', JobSchema);

export default Job;
