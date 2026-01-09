import { Router, type IRouter, type Request, type Response } from 'express';
import { generateDemoToken, authenticateJWT } from '../middleware/auth.js';
import { authService } from '../services/auth.service.js';
import { prisma } from '../config/database.js';
import { RegisterSchema, LoginSchema, RefreshTokenSchema, ChangePasswordSchema } from '@ssrprompt/shared';
import { ValidationError } from '@ssrprompt/shared';
import { asyncHandler } from '../utils/async-handler.js';
import rateLimit from 'express-rate-limit';

const router: IRouter = Router();

// Rate limiting for auth endpoints
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: '登录尝试次数过多，请稍后再试',
        requestId: req.requestId,
      },
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per hour per IP
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: '注册尝试次数过多，请稍后再试',
        requestId: req.requestId,
      },
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: 用户注册
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: 注册成功
 *       400:
 *         description: 验证错误
 *       409:
 *         description: 邮箱已存在
 */
router.post(
  '/register',
  registerRateLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const result = RegisterSchema.safeParse(req.body);
    if (!result.success) {
      throw new ValidationError('Validation failed', result.error.flatten().fieldErrors);
    }

    const response = await authService.register(result.data);

    res.status(201).json({ data: response });
  })
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: 用户登录
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: 登录成功
 *       401:
 *         description: 认证失败
 */
router.post(
  '/login',
  loginRateLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const result = LoginSchema.safeParse(req.body);
    if (!result.success) {
      throw new ValidationError('Validation failed', result.error.flatten().fieldErrors);
    }

    const { email, password } = result.data;
    const response = await authService.login(email, password, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    res.json({ data: response });
  })
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: 退出登录
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: 退出成功
 */
router.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    const result = RefreshTokenSchema.safeParse(req.body);
    if (!result.success) {
      // Silent fail for logout
      res.json({ data: { success: true } });
      return;
    }

    await authService.logout(result.data.refreshToken);
    res.json({ data: { success: true } });
  })
);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: 刷新访问令牌
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: 刷新成功
 *       401:
 *         description: 刷新令牌无效或已过期
 */
router.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const result = RefreshTokenSchema.safeParse(req.body);
    if (!result.success) {
      throw new ValidationError('Validation failed', result.error.flatten().fieldErrors);
    }

    const tokens = await authService.refreshTokens(result.data.refreshToken, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    res.json({ data: tokens });
  })
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: 获取当前用户信息
 *     responses:
 *       200:
 *         description: 成功
 *       401:
 *         description: 未认证
 */
router.get(
  '/me',
  authenticateJWT,
  asyncHandler(async (req: Request, res: Response) => {
    // For demo users, return minimal info
    if (req.user?.isDemo) {
      res.json({
        data: {
          id: req.user.userId,
          email: '',
          status: 'active',
          emailVerified: false,
          isDemo: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      return;
    }

    const user = await authService.getCurrentUser(req.user!.userId);
    res.json({ data: user });
  })
);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: 修改密码
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: 修改成功
 *       401:
 *         description: 当前密码错误
 */
router.post(
  '/change-password',
  authenticateJWT,
  asyncHandler(async (req: Request, res: Response) => {
    if (req.user?.isDemo) {
      throw new ValidationError('Demo users cannot change password');
    }

    const result = ChangePasswordSchema.safeParse(req.body);
    if (!result.success) {
      throw new ValidationError('Validation failed', result.error.flatten().fieldErrors);
    }

    await authService.changePassword(
      req.user!.userId,
      result.data.currentPassword,
      result.data.newPassword
    );

    res.json({ data: { success: true } });
  })
);

/**
 * @swagger
 * /auth/demo-token:
 *   get:
 *     tags: [Auth]
 *     summary: 获取 Demo Token
 *     security: []
 *     responses:
 *       200:
 *         description: 成功
 */
router.get(
  '/demo-token',
  asyncHandler(async (_req: Request, res: Response) => {
    const { token, userId } = generateDemoToken();

    // Ensure a corresponding user row exists so demo sessions can use the normal tenant isolation layer.
    // Demo users have no password and are cleaned up by scripts/cleanup-demo.ts.
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: `${userId}@demo.local`,
        name: 'Demo User',
        status: 'active',
        emailVerified: false,
      },
    });

    res.json({
      data: {
        token,
        user: {
          id: userId,
          tenantType: 'demo',
        },
      },
    });
  })
);

export default router;
