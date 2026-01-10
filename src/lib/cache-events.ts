/**
 * 全局缓存失效事件系统
 * 用于跨页面同步缓存状态
 */

type CacheEventType = 'prompts' | 'models' | 'providers' | 'evaluations';

type CacheEventListener = (type: CacheEventType, data?: unknown) => void;

// 存储待更新的数据（用于精确更新缓存，而不是全量刷新）
interface PendingUpdate {
  type: CacheEventType;
  data: unknown;
  timestamp: number;
}

// 配置常量
const MAX_PENDING_UPDATES = 50; // 队列最大长度
const PENDING_UPDATE_TTL = 5 * 60 * 1000; // 待更新数据 5 分钟过期

class CacheEventEmitter {
  private listeners: Set<CacheEventListener> = new Set();
  // 存储待处理的更新（用于页面未挂载时的延迟处理）
  private pendingUpdates: PendingUpdate[] = [];

  /**
   * 订阅缓存失效事件
   */
  subscribe(listener: CacheEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 发布缓存失效事件
   */
  invalidate(type: CacheEventType, data?: unknown): void {
    // 保存待更新的数据
    if (data) {
      this.pendingUpdates.push({ type, data, timestamp: Date.now() });
      // 清理过期和超量的待更新数据
      this.cleanupPendingUpdates();
    }
    // 通知所有监听器
    this.listeners.forEach((listener) => {
      try {
        listener(type, data);
      } catch (error) {
        console.error('Cache event listener error:', error);
      }
    });
  }

  /**
   * 清理过期和超量的待更新数据
   */
  private cleanupPendingUpdates(): void {
    const now = Date.now();
    // 移除过期数据
    this.pendingUpdates = this.pendingUpdates.filter(
      (u) => now - u.timestamp < PENDING_UPDATE_TTL
    );
    // 如果仍然超量，移除最旧的
    if (this.pendingUpdates.length > MAX_PENDING_UPDATES) {
      this.pendingUpdates = this.pendingUpdates.slice(-MAX_PENDING_UPDATES);
    }
  }

  /**
   * 获取并清除指定类型的待更新数据
   */
  consumePendingUpdates(type: CacheEventType): unknown[] {
    const now = Date.now();
    const updates = this.pendingUpdates
      .filter((u) => u.type === type && now - u.timestamp < PENDING_UPDATE_TTL)
      .map((u) => u.data);
    this.pendingUpdates = this.pendingUpdates.filter((u) => u.type !== type);
    return updates;
  }

  /**
   * 检查是否有待处理的更新
   */
  hasPendingUpdates(type: CacheEventType): boolean {
    const now = Date.now();
    return this.pendingUpdates.some(
      (u) => u.type === type && now - u.timestamp < PENDING_UPDATE_TTL
    );
  }

  /**
   * 清除所有待更新数据
   */
  clearAllPendingUpdates(): void {
    this.pendingUpdates = [];
  }
}

// 单例实例
export const cacheEvents = new CacheEventEmitter();

// 便捷方法
export const invalidatePromptsCache = (data?: unknown) => cacheEvents.invalidate('prompts', data);
export const invalidateModelsCache = (data?: unknown) => cacheEvents.invalidate('models', data);
export const invalidateProvidersCache = (data?: unknown) => cacheEvents.invalidate('providers', data);
export const invalidateEvaluationsCache = (data?: unknown) => cacheEvents.invalidate('evaluations', data);
