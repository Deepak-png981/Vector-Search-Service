import dotenv from 'dotenv';
import Joi from 'joi';
import logger from './logger';

dotenv.config();

const configSchema = Joi.object({
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),

  OPENAI_API_KEY: Joi.string().required(),

  PINECONE_API_KEY: Joi.string().required(),
  PINECONE_INDEX_NAME: Joi.string().required(),
  PINECONE_CLOUD: Joi.string().valid('aws', 'gcp', 'azure').default('aws'),
  PINECONE_REGION: Joi.string().default('us-east-1'),

  MONGODB_URI: Joi.string().required(),
  TEMP_DIR: Joi.string().default('./work'),
});

const { error, value: validatedEnvConfig } = configSchema.validate(process.env, {
  abortEarly: false,
  allowUnknown: true,
});

if (error) {
  logger.error('Configuration validation error:');
  error.details.forEach((detail) => {
    logger.error(`  ${detail.message}`);
  });
  process.exit(1);
}

export const config = {
  port: validatedEnvConfig.PORT,
  nodeEnv: validatedEnvConfig.NODE_ENV,
  logLevel: validatedEnvConfig.LOG_LEVEL,
  openai: {
    apiKey: validatedEnvConfig.OPENAI_API_KEY,
  },
  pinecone: {
    apiKey: validatedEnvConfig.PINECONE_API_KEY,
    indexName: validatedEnvConfig.PINECONE_INDEX_NAME,
    cloud: validatedEnvConfig.PINECONE_CLOUD,
    region: validatedEnvConfig.PINECONE_REGION,
  },
  mongodb: {
    uri: validatedEnvConfig.MONGODB_URI,
  },
  tempDir: validatedEnvConfig.TEMP_DIR,
};
