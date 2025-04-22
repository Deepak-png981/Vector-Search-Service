import { Pinecone, IndexList, IndexModel, QueryResponse, Index, CreateIndexRequestMetricEnum } from '@pinecone-database/pinecone';
import { config } from '../utils/config';
import logger from '../utils/logger';
import { PineconeError } from '../types/errors';
import { VectorMetadata } from '../types';

const INDEX_DIMENSION = 1536;
const INDEX_METRIC: CreateIndexRequestMetricEnum = 'cosine';
const MAX_RETRIES = 12;
const RETRY_DELAY_MS = 5000;
const BATCH_SIZE = 40;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface IndexConfig {
  name: string;
  dimension: number;
  metric: CreateIndexRequestMetricEnum;
  cloud: 'aws' | 'gcp' | 'azure';
  region: string;
}

const createIndexConfig = (indexName: string): IndexConfig => ({
  name: indexName,
  dimension: INDEX_DIMENSION,
  metric: INDEX_METRIC,
  cloud: config.pinecone.cloud as 'aws' | 'gcp' | 'azure',
  region: config.pinecone.region,
});

const validateExistingIndex = (description: IndexModel, indexName: string): void => {
  if (description.dimension !== INDEX_DIMENSION) {
    logger.error(
      { indexName, expected: INDEX_DIMENSION, found: description.dimension },
      'Existing index has incorrect dimension!',
    );
    throw new Error(
      `Index ${indexName} has dimension ${description.dimension}, expected ${INDEX_DIMENSION}`,
    );
  }
  
  if (description.metric !== INDEX_METRIC) {
    logger.warn(
      { indexName, expected: INDEX_METRIC, found: description.metric },
      'Existing index has different metric. Ensure this is intended.',
    );
  }
};

const waitForIndexReady = async (
  client: Pinecone,
  indexName: string,
): Promise<void> => {
  for (let retries = 0; retries < MAX_RETRIES; retries++) {
    try {
      const status = await client.describeIndex(indexName);
      if (status?.status?.ready) {
        logger.info({ indexName }, 'Index created and ready.');
        return;
      }
    } catch (describeError: unknown) {
      const pineconeError = describeError as PineconeError;
      if (pineconeError?.code !== '404') {
        logger.warn(
          { indexName, error: pineconeError?.message },
          'Error describing index while waiting, retrying...',
        );
      }
    }
    logger.info({ indexName, retryCount: retries + 1 }, 'Waiting for index to become ready...');
    await delay(RETRY_DELAY_MS);
  }
  
  const error = `Index ${indexName} did not become ready after ${MAX_RETRIES} retries`;
  logger.error({ indexName }, error);
  throw new Error(error);
};

const processBatch = async (
  namespace: Index<VectorMetadata>,
  vectors: { id: string; values: number[]; metadata: VectorMetadata }[],
  startIdx: number,
  batchSize: number,
  totalCount: number,
): Promise<void> => {
  const batch = vectors.slice(startIdx, startIdx + batchSize).map((vector) => ({
    id: vector.id,
    values: vector.values,
    metadata: {
      ...vector.metadata,
      commit: vector.metadata.commit || '',
    },
  }));

  await namespace.upsert(batch);
  
  const progress = Math.round(((startIdx + batch.length) / totalCount) * 100);
  logger.info(
    {
      count: batch.length,
      total: totalCount,
      progress,
    },
    'Upserted vectors to Pinecone namespace',
  );
};

class PineconeService {
  private readonly client: Pinecone;
  private index!: Index<VectorMetadata>;
  private initialized = false;

  constructor() {
    this.client = new Pinecone({
      apiKey: config.pinecone.apiKey,
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      logger.warn('Pinecone client not initialized. Attempting initialization now...');
      await this.init();
      if (!this.initialized) {
        throw new Error('Pinecone initialization failed');
      }
    }
  }

  private getNamespaceForUser(userId: string): string {
    return `user_${userId}`;
  }

  public async init(): Promise<void> {
    const indexName = config.pinecone.indexName;
    
    try {
      const indexesResponse: IndexList = await this.client.listIndexes();
      const indexExists = indexesResponse.indexes?.some((index) => index.name === indexName);

      if (!indexExists) {
        const indexConfig = createIndexConfig(indexName);
        logger.info(indexConfig, 'Index not found, creating new index...');
        
        await this.client.createIndex({
          name: indexConfig.name,
          dimension: indexConfig.dimension,
          metric: indexConfig.metric,
          spec: {
            serverless: {
              cloud: indexConfig.cloud,
              region: indexConfig.region,
            },
          },
        });

        await waitForIndexReady(this.client, indexName);
      } else {
        logger.info({ indexName }, 'Connecting to existing index.');
        const description: IndexModel = await this.client.describeIndex(indexName);
        validateExistingIndex(description, indexName);
      }

      this.index = this.client.index(indexName);
      this.initialized = true;
      logger.info('Pinecone client initialized and connected to index');
    } catch (error: unknown) {
      const pineconeError = error as PineconeError;
      logger.error(
        {
          error: pineconeError,
          errorMessage: pineconeError?.message,
          errorStack: pineconeError?.stack,
          indexName,
        },
        'Failed to initialize Pinecone client or create/connect to index',
      );
      throw error;
    }
  }

  public async upsert(
    vectors: { id: string; values: number[]; metadata: VectorMetadata }[],
  ): Promise<void> {
    if (vectors.length === 0) {
      logger.warn('No vectors provided for upserting');
      return;
    }

    await this.ensureInitialized();

    try {
      // Group vectors by userId to maintain data isolation
      const vectorsByUser = vectors.reduce((acc, vector) => {
        const userId = vector.metadata.userId;
        if (!acc[userId]) {
          acc[userId] = [];
        }
        acc[userId].push(vector);
        return acc;
      }, {} as Record<string, typeof vectors>);

      // Process each user's vectors separately in their own namespace
      for (const [userId, userVectors] of Object.entries(vectorsByUser)) {
        const namespaceName = this.getNamespaceForUser(userId);
        const namespace = this.index.namespace(namespaceName);
        
        logger.info({ userId, vectorCount: userVectors.length, namespaceName }, 'Processing vectors for user namespace');

        for (let i = 0; i < userVectors.length; i += BATCH_SIZE) {
          await processBatch(
            namespace,
            userVectors,
            i,
            BATCH_SIZE,
            userVectors.length,
          );
        }
      }
    } catch (error: unknown) {
      const pineconeError = error as PineconeError;
      logger.error(
        {
          error: pineconeError,
          errorMessage: pineconeError?.message,
          errorStack: pineconeError?.stack,
          vectorCount: vectors.length,
        },
        'Failed to upsert vectors to Pinecone',
      );
      throw error;
    }
  }

  public async query(
    vector: number[],
    userId: string,
    topK = 5,
    additionalFilters?: Partial<VectorMetadata>,
  ): Promise<QueryResponse<VectorMetadata>> {
    await this.ensureInitialized();

    try {
      const namespaceName = this.getNamespaceForUser(userId);
      const namespace = this.index.namespace(namespaceName);

      return await namespace.query({
        vector,
        topK,
        includeMetadata: true,
        filter: additionalFilters,
      });
    } catch (error: unknown) {
      const pineconeError = error as PineconeError;
      logger.error(
        {
          error: pineconeError,
          errorMessage: pineconeError?.message,
          errorStack: pineconeError?.stack,
          userId,
          topK,
          filter: additionalFilters,
        },
        'Failed to query Pinecone',
      );
      throw error;
    }
  }

  public async deleteUserVectors(userId: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const namespaceName = this.getNamespaceForUser(userId);
      const namespace = this.index.namespace(namespaceName);
      
      await namespace.deleteAll();
      logger.info({ userId, namespaceName }, 'Deleted all vectors for user namespace');
    } catch (error: unknown) {
      const pineconeError = error as PineconeError;
      logger.error(
        {
          error: pineconeError,
          errorMessage: pineconeError?.message,
          errorStack: pineconeError?.stack,
          userId,
        },
        'Failed to delete user vectors from Pinecone',
      );
      throw error;
    }
  }

  public async isHealthy(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      await this.index.describeIndexStats();
      return true;
    } catch (error: unknown) {
      const pineconeError = error as PineconeError;
      logger.error(
        {
          error: pineconeError,
          errorMessage: pineconeError?.message,
          errorStack: pineconeError?.stack,
        },
        'Pinecone health check failed',
      );
      return false;
    }
  }
}

export const pineconeService = new PineconeService();
export default pineconeService;
