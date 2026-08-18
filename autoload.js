/*!
 * 芙宁娜 Live2D 看板娘 - 自定义加载脚本
 * 基于 live2d-widget (https://github.com/827802685/live2d-widget)
 *
 * 工作原理：
 *  - live2d_path  : 插件核心(dist)所在路径，含末尾 /
 *  - cdnPath      : 模型仓库根路径，插件会在此请求 model_list.json 和 model/<名字>/index.json
 */
// 固定为 GitHub Pages 绝对路径（同源，CORS 就绪）
const live2d_path = 'https://827802685.github.io/Live2D/dist/';
// 模型大文件（91MB moc3 等）走自定义加速 DNS（镜像 raw.githubusercontent.com），避免 github.io 传输大文件过慢
const model_root = 'https://raw-githubusercontent-com-gh.zjkl0330.dpdns.org/827802685/Live2D/refs/heads/master/';

// 封装异步资源加载
function loadExternalResource(url, type) {
  return new Promise((resolve, reject) => {
    let tag;
    if (type === 'css') {
      tag = document.createElement('link');
      tag.rel = 'stylesheet';
      tag.href = url;
    } else if (type === 'js') {
      tag = document.createElement('script');
      tag.type = 'module';
      tag.src = url;
    }
    if (tag) {
      tag.onload = () => resolve(url);
      tag.onerror = () => reject(url);
      document.head.appendChild(tag);
    }
  });
}

// ============ 下载进度追踪 ============
// 在 initWidget() 之前包装 window.fetch，统计模型文件(moc3/贴图/物理等)的实时下载字节数，
// 驱动加载框里的进度条。首次加载需下载的文件总字节数作为进度分母(EXPECTED_TOTAL)。
// 若日后更换模型，请把 EXPECTED_TOTAL 改为新模型首次加载各文件大小之和。
function installProgressTracker() {
  // 首次加载实际下载的文件总字节数：moc3(91MB) + 4K贴图(8MB) + physics + cdi + idle 动作
  const EXPECTED_TOTAL = 103740290;
  const state = window.__live2dProgress = {
    total: EXPECTED_TOTAL,
    loaded: 0,
    activeUrl: null
  };
  const origFetch = window.fetch.bind(window);
  let rafPending = false;

  function updateUI() {
    const el = document.getElementById('waifu-loading');
    if (!el) return;
    const bar = el.querySelector('.waifu-loading-bar-fill');
    const pct = el.querySelector('.waifu-loading-pct');
    const info = el.querySelector('.waifu-loading-info');
    if (!bar || !pct) return;
    const p = Math.min(100, Math.round(state.loaded / state.total * 100));
    bar.style.width = p + '%';
    pct.textContent = p + '%';
    if (info) {
      const f = state.activeUrl ? state.activeUrl.split('/').pop() : '';
      const mb = (n) => (n / 1048576).toFixed(1);
      info.textContent = f
        ? '正在下载 ' + f + ' · ' + mb(state.loaded) + ' / ' + mb(state.total) + ' MB'
        : '已下载 ' + mb(state.loaded) + ' / ' + mb(state.total) + ' MB';
    }
  }
  function scheduleUI() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; updateUI(); });
  }

  // 只拦截模型文件请求(URL 含 model/)，其余请求原样放行
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('model/') === -1) return origFetch(input, init);
    return origFetch(input, init).then(async (resp) => {
      if (!resp || !resp.body) return resp;
      state.activeUrl = url;
      const reader = resp.body.getReader();
      const chunks = [];
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        chunks.push(r.value);
        state.loaded += r.value.byteLength;
        scheduleUI();
      }
      // 重建 Response：去掉压缩相关头，避免与已解码的 Blob 体积不一致
      const headers = new Headers(resp.headers);
      headers.delete('content-encoding');
      headers.delete('content-length');
      headers.delete('transfer-encoding');
      return new Response(new Blob(chunks), {
        status: resp.status,
        statusText: resp.statusText,
        headers: headers
      });
    });
  };
}

(async () => {
  // 初始化运行时参数（内置默认 + 可选 LIVE2D_PRESET 预设 + localStorage 覆盖）
  (function initConfig() {
    const preset = (typeof LIVE2D_PRESET !== 'undefined') ? LIVE2D_PRESET : {};
    const cfg = Object.assign(
      { angleX: 30, angleY: 30, angleZ: 30, bodyAngleX: 10, deadZone: 0.06 },
      preset || {}
    );
    try {
      const saved = JSON.parse(window.localStorage.getItem('live2dConfig') || 'null');
      if (saved && typeof saved === 'object') Object.assign(cfg, saved);
    } catch (e) {}
    window.__live2dConfig = cfg;
  })();

  // 安装下载进度追踪（必须在 initWidget 之前，才能拦到模型下载请求）
  installProgressTracker();

  // 避免图片资源跨域问题
  const OriginalImage = window.Image;
  window.Image = function (...args) {
    const img = new OriginalImage(...args);
    img.crossOrigin = 'anonymous';
    return img;
  };
  window.Image.prototype = OriginalImage.prototype;

  await Promise.all([
    loadExternalResource(live2d_path + 'waifu.css', 'css'),
    loadExternalResource(live2d_path + 'waifu-tips.js', 'js')
  ]);

  // 先显示加载框（含实时下载进度），模型下载开始前就绪
  showLoading();

  initWidget({
    waifuPath: live2d_path + 'waifu-tips.json',
    cdnPath: model_root,
    cubism2Path: live2d_path + 'live2d.min.js',
    cubism5Path: live2d_path + 'live2dcubismcore.min.js',
    tools: ['hitokoto', 'photo', 'info', 'quit'],
    modelId: 0,
    drag: false,
    logLevel: 'info'
  });

  // 加载参数设置面板（右下角齿轮可收起/唤出，拖动滑块即时调参）
  loadExternalResource(live2d_path + 'config-panel.js', 'js');
})();

// 加载动画 + 渲染门控：模型真正渲染出第一帧(live2d:rendered)前，看板娘保持隐藏，只显示转圈 + 实时下载进度
function showLoading() {
  if (document.getElementById('waifu-loading')) return;
  // 渲染完成前隐藏看板娘主体（body 加 class，配合 CSS 隐藏 #waifu），避免空 canvas/未渲染模型提前"蹦出来"
  document.body.classList.add('live2d-loading');

  const wrap = document.createElement('div');
  wrap.id = 'waifu-loading';
  wrap.innerHTML =
    '<div class="waifu-loading-spin"></div>' +
    '<div class="waifu-loading-text">看板娘正在准备迎客</div>' +
    '<div class="waifu-loading-bar"><div class="waifu-loading-bar-fill"></div></div>' +
    '<div class="waifu-loading-pct">0%</div>' +
    '<div class="waifu-loading-info">正在连接模型…</div>';
  document.body.appendChild(wrap);

  // 若已开始下载，立即刷新一次进度
  if (window.__live2dProgress) {
    const el = document.getElementById('waifu-loading');
    const bar = el.querySelector('.waifu-loading-bar-fill');
    const pct = el.querySelector('.waifu-loading-pct');
    const info = el.querySelector('.waifu-loading-info');
    const st = window.__live2dProgress;
    const p = Math.min(100, Math.round(st.loaded / st.total * 100));
    if (bar) bar.style.width = p + '%';
    if (pct) pct.textContent = p + '%';
    if (info) info.textContent = '已下载 ' + (st.loaded / 1048576).toFixed(1) + ' / ' + (st.total / 1048576).toFixed(1) + ' MB';
  }

  function onLoaded() {
    // 所有文件下载完成，进入渲染阶段
    const el = document.getElementById('waifu-loading');
    if (!el) return;
    const text = el.querySelector('.waifu-loading-text');
    const pct = el.querySelector('.waifu-loading-pct');
    const info = el.querySelector('.waifu-loading-info');
    const bar = el.querySelector('.waifu-loading-bar-fill');
    if (text) text.textContent = '模型加载完成，正在渲染…';
    if (pct) pct.textContent = '100%';
    if (info) info.textContent = '即将登场，请稍候';
    if (bar) bar.style.width = '100%';
  }

  function hide() {
    const el = document.getElementById('waifu-loading');
    if (el) el.remove();
    document.body.classList.remove('live2d-loading');
    window.removeEventListener('live2d:rendered', hide);
    window.removeEventListener('live2d:loaded', onLoaded);
    window.clearInterval(stallTimer);
  }

  // 下载完成(live2d:loaded)后提示进入渲染阶段
  window.addEventListener('live2d:loaded', onLoaded, { once: true });
  // 只在真正渲染出第一帧后才放行看板娘 + 移除转圈
  window.addEventListener('live2d:rendered', hide, { once: true });

  // 兜底：若下载长时间无进展(网络异常)或渲染始终不触发(WebGL 被禁用)，届时放行避免永久卡住
  let lastLoaded = 0;
  const stallTimer = window.setInterval(function () {
    const st = window.__live2dProgress;
    const cur = st ? st.loaded : 0;
    if (cur > lastLoaded) { lastLoaded = cur; return; } // 仍在下载，继续等待
    hide(); // 连续 60 秒无进展且未渲染 → 放行
  }, 60000);
}
