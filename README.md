# Embedding Builder (EB)

A microservice for embedding repository code into vector stores.

## Overview

Embedding Builder clones Git repositories, chunks code files, generates embeddings using OpenAI, and stores them in Pinecone as vector embeddings with appropriate metadata. This enables semantic code search and various AI-powered code analysis features.

## Tech Stack

- **Language**: TypeScript
- **HTTP Framework**: Express
- **Job Scheduler**: Bree v7.x
- **Vector Store**: Pinecone
- **Metadata Store**: MongoDB
- **Logger**: Pino (structured, JSON-based)
- **Configuration**: dotenv + Joi for schema validation
- **Git Integration**: simple-git for cloning and checkouts
- **Embeddings**: OpenAI

## Prerequisites

- Node.js 18+
- MongoDB connection
- Pinecone account with an index created
- OpenAI API key

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in your environment variables:
   ```bash
   cp .env.example .env
   ```
4. Build the TypeScript code:
   ```bash
   npm run build
   ```
5. Start the service:
   ```bash
   npm start
   ```

## API Endpoints

### POST /embed

Starts a new embedding job for a repository.

**Request:**
```json
{
  "repoUrl": "https://github.com/username/repo.git",
  "commit": "optional-commit-hash",
  "userId": "required-user-id"
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "job-id",
  "message": "Embedding job scheduled successfully"
}
```

### GET /embed/:jobId

Gets the status of an embedding job.

**Response:**
```json
{
  "success": true,
  "job": {
    "jobId": "job-id",
    "status": "queued|running|succeeded|failed",
    "progress": 45,
    "repoUrl": "https://github.com/username/repo.git",
    "createdAt": "2023-04-18T12:34:56.789Z",
    "updatedAt": "2023-04-18T12:35:56.789Z",
    "error": null
  }
}
```

### GET /healthz

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2023-04-18T12:34:56.789Z",
  "services": {
    "mongo": {
      "connected": true
    },
    "pinecone": {
      "connected": true
    },
    "bree": {
      "running": true
    }
  }
}
```

## Development

### Running in Development Mode

```bash
npm run dev
```

### Linting

```bash
npm run lint
```

### Testing

```bash
npm test
```

## Deployment

This service can be deployed using Docker or on Render.com using the provided configuration files:

- `Dockerfile` - For Docker-based deployments
- `render.yaml` - For Render.com deployments

## Environment Variables

- `PORT` - HTTP port (default: 3000)
- `NODE_ENV` - Environment (development, production, test)
- `LOG_LEVEL` - Logging level (info, debug, error, etc.)
- `OPENAI_API_KEY` - OpenAI API key
- `PINECONE_API_KEY` - Pinecone API key
- `PINECONE_ENVIRONMENT` - Pinecone environment
- `PINECONE_INDEX_NAME` - Pinecone index name
- `MONGODB_URI` - MongoDB connection string
- `MAX_JOBS_CONCURRENCY` - Maximum concurrent jobs (default: 2)
- `TEMP_DIR` - Directory for temporary files (default: ./work) 