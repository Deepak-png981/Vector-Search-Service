import { CreateIndexRequestMetricEnum, RecordMetadata } from '@pinecone-database/pinecone';

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
    content: string;
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
  content: string;
  [key: string]: string | number;
}

export interface SearchParams {
  namespace: string;
  query: {
    inputs: { text: string };
    top_k: number;
  };
  includeMetadata?: boolean;
  includeValues?: boolean;
  filter?: Record<string, any>;
}

export interface IndexConfig {
  name: string;
  dimension: number;
  metric: CreateIndexRequestMetricEnum;
  cloud: 'aws' | 'gcp' | 'azure';
  region: string;
}
