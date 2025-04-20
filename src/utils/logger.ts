import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const logger = pino({
  level: LOG_LEVEL,
  transport: process.env.NODE_ENV !== 'production'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      }
    : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
});

export default logger; 