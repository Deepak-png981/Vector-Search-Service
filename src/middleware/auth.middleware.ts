import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import mongoService from '../services/mongo.service';

export interface AuthenticatedRequest extends Request {
  userId: string;
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization header missing or invalid format',
      });
    }

    const token = authHeader.split(' ')[1];

    const userExists = await mongoService.userExists(token);

    if (!userExists) {
      return res.status(401).json({
        success: false,
        message: 'Invalid user token',
      });
    }

    (req as AuthenticatedRequest).userId = token;

    next();
  } catch (error) {
    logger.error({ error }, 'Error in auth middleware');
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication',
    });
  }
};
