/*!
 * 芙宁娜 Live2D 看板娘 - 自定义加载脚本
 * 基于 live2d-widget (https://github.com/827802685/live2d-widget)
 *
 * 工作原理：
 *  - live2d_path  : 插件核心(dist)所在路径，含末尾 /
 *  - cdnPath      : 模型仓库根路径，插件会在此请求 model_list.json 和 model/<名字>/index.json
 */
// 推荐：部署到 GitHub Pages 子路径时，只要打包的 model/ 和 dist/ 与 autoload.js 同目录，
// 下面两个相对路径即可直接工作（模型与页面同源，无跨域问题）。无需逐行改成绝对 URL。
// 如果你打算把模型放在别的源（例如对象存储），或由于站点 rewrite 导致相对路径失效，才需要改成绝对路径，
// 例如：const live2d_path = 'https://<用户名>.github.io/<仓库名>/dist/';  注意末尾 / 必须保留。
// 固定为 GitHub Pages 绝对路径（同源，CORS 就绪，加载大模型稳定）
// 之前改走自定义加速 DNS 会导致浏览器加载大文件不稳定而"刷不出来"，已回滚。
const live2d_path = 'https://827802685.github.io/Live2D/dist/';
// 模型根路径与本项目同源（GitHub Pages），避免外部 DNS 在大文件传输上不稳定导致加载失败
const model_root = 'https://827802685.github.io/Live2D/';

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

// 模型预载：随页面一起并行预取模型的两个大文件（moc3 网格 + 主贴图），
// 让博客页面的看板娘几乎无需等待。若已存在同名 preload 则跳过，避免重复。
function preloadModel() {
  const files = [
    { href: model_root + 'model/furina/furina.moc3', as: 'fetch', type: 'application/octet-stream' },
    { href: model_root + 'model/furina/furina.8192/texture_00.png', as: 'image', type: 'image/png', crossOrigin: 'anonymous' }
  ];
  for (const f of files) {
    if (document.querySelector(`link[rel="preload"][href="${f.href}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = f.as;
    link.href = f.href;
    if (f.type) link.type = f.type;
    if (f.crossOrigin) link.crossOrigin = f.crossOrigin;
    document.head.appendChild(link);
  }
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

  // 页面解析到脚本立即并行预取模型大文件
  preloadModel();

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

  // 加载动画：模型就绪前显示"转圈 + 蓝色：看板娘正在准备迎客"
  showLoading();

  // 加载参数设置面板（右下角齿轮可收起/唤出，拖动滑块即时调参）
  loadExternalResource(live2d_path + 'config-panel.js', 'js');
})();

// 在左下角注入加载转圈 + 蓝色文案，模型真正渲染出第一帧(live2d:rendered)后自动移除
function showLoading() {
  if (document.getElementById('waifu-loading')) return;
  const wrap = document.createElement('div');
  wrap.id = 'waifu-loading';
  wrap.innerHTML =
    '<div class="waifu-loading-spin"></div>' +
    '<div class="waifu-loading-text">看板娘正在准备迎客</div>';
  document.body.appendChild(wrap);

  function hide() {
    const el = document.getElementById('waifu-loading');
    if (el) el.remove();
    window.removeEventListener('live2d:rendered', hide);
    window.removeEventListener('live2d:loaded', hide);
  }
  window.addEventListener('live2d:rendered', hide, { once: true });
  // 兜底：就算渲染事件没触发（如 WebGL 不可用），最多 60 秒后也移除，避免永久挡着
  window.addEventListener('live2d:loaded', hide, { once: true });
  setTimeout(hide, 60000);
}