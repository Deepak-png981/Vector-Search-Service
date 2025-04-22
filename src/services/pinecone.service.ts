import { Pinecone, IndexList, IndexModel, QueryResponse, Index } from '@pinecone-database/pinecone';
import { config } from '../utils/config';
import logger from '../utils/logger';
import { PineconeError } from '../types/errors';
import { VectorMetadata } from '../types';

const INDEX_DIMENSION = 1536;
const INDEX_METRIC = 'cosine';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class PineconeService {
  private client: Pinecone;
  private index!: Index<VectorMetadata>;
  private initialized = false;

  constructor() {
    this.client = new Pinecone({
      apiKey: config.pinecone.apiKey,
    });
  }

  public async init(): Promise<void> {
    const indexName = config.pinecone.indexName;
    try {
      const indexesResponse: IndexList = await this.client.listIndexes();
      const indexExists = indexesResponse.indexes?.some((index) => index.name === indexName);

      if (!indexExists) {
        logger.info(
          {
            indexName,
            dimension: INDEX_DIMENSION,
            metric: INDEX_METRIC,
            cloud: config.pinecone.cloud,
            region: config.pinecone.region,
          },
          'Index not found, creating new index...',
        );
        await this.client.createIndex({
          name: indexName,
          dimension: INDEX_DIMENSION,
          metric: INDEX_METRIC,
          spec: {
            serverless: {
              cloud: config.pinecone.cloud as 'aws' | 'gcp' | 'azure',
              region: config.pinecone.region,
            },
          },
        });

        let status: IndexModel | null = null;
        let retries = 0;
        const maxRetries = 12;
        while (retries < maxRetries) {
          try {
            status = await this.client.describeIndex(indexName);
            if (status?.status?.ready) {
              logger.info({ indexName }, 'Index created and ready.');
              break;
            }
          } catch (describeError: unknown) {
            const pineconeError = describeError as PineconeError;
            // Ignore potential 404 errors while index is still provisioning
            if (pineconeError?.code !== '404') {
              logger.warn(
                { indexName, error: pineconeError?.message },
                'Error describing index while waiting, retrying...',
              );
            }
          }
          logger.info(
            { indexName, status: status?.status },
            'Waiting for index to become ready...',
          );
          await delay(5000); // Wait 5 seconds before checking again
          retries++;
        }

        if (retries === maxRetries) {
          logger.error({ indexName }, 'Index did not become ready after waiting.');
          throw new Error(`Index ${indexName} did not become ready in time.`);
        }
      } else {
        logger.info({ indexName }, 'Connecting to existing index.');
        // Optional: Check dimension/metric of existing index
        const description: IndexModel = await this.client.describeIndex(indexName);
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
          indexName: indexName,
        },
        'Failed to initialize Pinecone client or create/connect to index',
      );
      throw error;
    }
  }

  public async upsert(
    vectors: { id: string; values: number[]; metadata: VectorMetadata }[],
  ): Promise<void> {
    if (!this.initialized) {
      logger.warn('Pinecone client not initialized. Attempting initialization now...');
      await this.init(); // Ensure initialization happens if called directly
      if (!this.initialized) {
        throw new Error('Pinecone initialization failed, cannot upsert.');
      }
    }

    try {
      // For serverless indexes, use smaller batch size
      const batchSize = 40;
      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize).map((vector) => ({
          ...vector,
          metadata: {
            ...vector.metadata,
            commit: vector.metadata.commit || '', // Ensure commit is always a string
          },
        }));

        await this.index.upsert(batch);

        logger.info(
          {
            count: batch.length,
            total: vectors.length,
            progress: Math.round(((i + batch.length) / vectors.length) * 100),
          },
          'Upserted vectors to Pinecone',
        );
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
    topK = 5,
    filter?: Partial<VectorMetadata>,
  ): Promise<QueryResponse> {
    if (!this.initialized) {
      logger.warn('Pinecone client not initialized. Attempting initialization now...');
      await this.init(); // Ensure initialization happens if called directly
      if (!this.initialized) {
        throw new Error('Pinecone initialization failed, cannot query.');
      }
    }

    try {
      const result = await this.index.query({
        vector,
        topK,
        includeMetadata: true,
        filter: filter,
      });

      return result;
    } catch (error: unknown) {
      const pineconeError = error as PineconeError;
      logger.error(
        {
          error: pineconeError,
          errorMessage: pineconeError?.message,
          errorStack: pineconeError?.stack,
          topK,
          filter,
        },
        'Failed to query Pinecone',
      );
      throw error;
    }
  }

  public async isHealthy(): Promise<boolean> {
    try {
      if (!this.initialized) {
        // Try to initialize if not already
        await this.init();
        if (!this.initialized) {
          return false; // Initialization failed
        }
      }

      // For health check, use describeIndexStats
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
