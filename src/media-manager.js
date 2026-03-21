/**
 * MediaManager - 统一媒体管理控制器
 *
 * 解决媒体互斥播放问题：
 * - 主页音乐播放器
 * - 动态页音频播放器
 * - 动态页视频播放器
 *
 * 核心原则：同一时刻只有一个媒体在播放
 */
class MediaManager {
  constructor() {
    // 单例检测
    if (MediaManager.instance) {
      return MediaManager.instance;
    }
    MediaManager.instance = this;

    // 当前播放的媒体信息
    this.currentMedia = null;

    // 已注册的媒体控制器
    this.controllers = new Map();

    // 页面可见性状态
    this.isPageVisible = !document.hidden;

    // 绑定页面可见性变化
    this._bindVisibilityChange();
  }

  /**
   * 获取单例实例
   */
  static getInstance() {
    if (!MediaManager.instance) {
      MediaManager.instance = new MediaManager();
    }
    return MediaManager.instance;
  }

  /**
   * 注册媒体控制器
   * @param {string} id - 媒体唯一标识
   * @param {Object} controller - 控制器对象 { play, pause, stop, type }
   */
  register(id, controller) {
    if (!id || !controller) {
      console.warn('[MediaManager] 注册失败：缺少 id 或 controller');
      return;
    }

    this.controllers.set(id, {
      id,
      type: controller.type || 'unknown',
      play: controller.play.bind(controller),
      pause: controller.pause.bind(controller),
      stop: controller.stop ? controller.stop.bind(controller) : controller.pause.bind(controller),
      getElement: controller.getElement ? controller.getElement.bind(controller) : () => null,
    });

    console.log(`[MediaManager] 已注册媒体控制器: ${id} (${controller.type || 'unknown'})`);
  }

  /**
   * 注销媒体控制器
   * @param {string} id - 媒体唯一标识
   */
  unregister(id) {
    // 如果正在播放的是要注销的媒体，先停止
    if (this.currentMedia && this.currentMedia.id === id) {
      this.stop(id);
    }
    this.controllers.delete(id);
    console.log(`[MediaManager] 已注销媒体控制器: ${id}`);
  }

  /**
   * 请求播放 - 核心互斥逻辑
   * @param {string} id - 媒体唯一标识
   * @returns {boolean} 是否成功开始播放
   */
  play(id) {
    const controller = this.controllers.get(id);
    if (!controller) {
      console.warn(`[MediaManager] 未找到控制器: ${id}`);
      return false;
    }

    // 如果当前有其他媒体在播放，先暂停它
    if (this.currentMedia && this.currentMedia.id !== id) {
      this.pause(this.currentMedia.id);
    }

    // 执行播放
    try {
      controller.play();
      this.currentMedia = {
        id,
        type: controller.type,
        startTime: Date.now(),
      };
      console.log(`[MediaManager] 开始播放: ${id}`);
      return true;
    } catch (err) {
      console.error(`[MediaManager] 播放失败: ${id}`, err);
      return false;
    }
  }

  /**
   * 暂停指定媒体
   * @param {string} id - 媒体唯一标识
   */
  pause(id) {
    const controller = this.controllers.get(id);
    if (!controller) return;

    try {
      controller.pause();
      if (this.currentMedia && this.currentMedia.id === id) {
        this.currentMedia = null;
      }
      console.log(`[MediaManager] 已暂停: ${id}`);
    } catch (err) {
      console.error(`[MediaManager] 暂停失败: ${id}`, err);
    }
  }

  /**
   * 停止指定媒体
   * @param {string} id - 媒体唯一标识
   */
  stop(id) {
    const controller = this.controllers.get(id);
    if (!controller) return;

    try {
      controller.stop();
      if (this.currentMedia && this.currentMedia.id === id) {
        this.currentMedia = null;
      }
      console.log(`[MediaManager] 已停止: ${id}`);
    } catch (err) {
      console.error(`[MediaManager] 停止失败: ${id}`, err);
    }
  }

  /**
   * 停止所有媒体
   */
  stopAll() {
    this.controllers.forEach((controller, id) => {
      try {
        controller.stop();
      } catch (err) {
        // 忽略错误，继续停止其他
      }
    });
    this.currentMedia = null;
    console.log('[MediaManager] 已停止所有媒体');
  }

  /**
   * 媒体自然结束（非用户主动暂停）
   * @param {string} id - 媒体唯一标识
   */
  onEnded(id) {
    if (this.currentMedia && this.currentMedia.id === id) {
      this.currentMedia = null;
      console.log(`[MediaManager] 媒体自然结束: ${id}`);
    }
  }

  /**
   * 获取当前播放状态
   * @returns {Object|null} { id, type, startTime }
   */
  getCurrentMedia() {
    return this.currentMedia;
  }

  /**
   * 检查指定媒体是否正在播放
   * @param {string} id - 媒体唯一标识
   * @returns {boolean}
   */
  isPlaying(id) {
    return this.currentMedia && this.currentMedia.id === id;
  }

  /**
   * 页面可见性变化处理
   */
  _bindVisibilityChange() {
    document.addEventListener('visibilitychange', () => {
      this.isPageVisible = !document.hidden;

      if (document.hidden) {
        // 页面隐藏时，记录播放状态（但不暂停，让用户选择）
        if (this.currentMedia) {
          console.log(`[MediaManager] 页面隐藏，当前播放: ${this.currentMedia.id}`);
        }
      }
    });
  }
}

// 立即创建并暴露到全局
window.MediaManager = MediaManager.getInstance();
console.log('[MediaManager] 模块已初始化');