export interface ApplicationError extends Error {
  message: string;
  stack?: string;
  code?: string;
  status?: number;
}
export interface OpenAIError extends ApplicationError {
  response?: {
    data: unknown;
  };
}

export interface PineconeError extends ApplicationError {
  code?: string;
}
