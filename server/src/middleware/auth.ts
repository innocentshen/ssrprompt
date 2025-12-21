import type { Request, Response, NextFunction } from 'express';

export function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.API_KEY;

  // 如果未配置 API_KEY，则跳过验证（开发环境）
  if (!expectedKey) {
    console.warn('Warning: API_KEY not configured, skipping authentication');
    return next();
  }

  if (!apiKey || apiKey !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }

  next();
}
