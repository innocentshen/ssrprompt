import { Router, type IRouter } from 'express';
import { runsController } from '../controllers/evaluations.controller.js';
import { asyncHandler } from '../middleware/error-handler.js';

const router: IRouter = Router();

/**
 * @swagger
 * /runs/{id}:
 *   delete:
 *     tags: [Runs]
 *     summary: 删除评测运行
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: 删除成功
 */
router.delete('/:id', asyncHandler(runsController.delete));

/**
 * @swagger
 * /runs/{id}/results:
 *   get:
 *     tags: [Runs]
 *     summary: 获取运行结果
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功
 *   post:
 *     tags: [Runs]
 *     summary: 添加运行结果
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: 创建成功
 */
router.get('/:id/results', asyncHandler(runsController.getResults));
router.post('/:id/results', asyncHandler(runsController.addResult));

export default router;
