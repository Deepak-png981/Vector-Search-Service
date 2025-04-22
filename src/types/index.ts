import { RecordMetadata } from '@pinecone-database/pinecone';

export interface Vector {
  id: string;
  values: number[];
  metadata: {
    repoUrl: string;
    filePath: string;
    chunkIndex: number;
    commit: string;
    userId: string;
    startLine: number;
    endLine: number;
  };
}

export interface VectorMetadata extends RecordMetadata {
  repoUrl: string;
  filePath: string;
  chunkIndex: number;
  userId: string;
  startLine: number;
  endLine: number;
  commit: string;
  [key: string]: string | number;
}
