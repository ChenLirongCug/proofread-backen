import { Logger } from 'winston';
import * as winston from 'winston';

let logger: Logger;

export const initLogger = () => {
  logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json(),
    ),
    defaultMeta: { service: 'proofread-backend' },
    transports: [
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
  });

  if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }));
  }

  return logger;
};

export const getLogger = (): Logger => {
  return logger || initLogger();
};

export const logLogin = (account: string, ip: string, success: boolean, reason?: string) => {
  getLogger().info('Login attempt', {
    account,
    ip,
    success,
    reason,
    timestamp: new Date().toISOString(),
  });
};

export const logTokenDeduction = (userId: number, amount: number, businessType: string) => {
  getLogger().info('Token deduction', {
    userId,
    amount,
    businessType,
    timestamp: new Date().toISOString(),
  });
};

export const logPayment = (orderId: string, userId: number, amount: number, status: string) => {
  getLogger().info('Payment operation', {
    orderId,
    userId,
    amount,
    status,
    timestamp: new Date().toISOString(),
  });
};
