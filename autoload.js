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
const live2d_path = './dist/';
// 模型清单（model_list.json）所在根路径，同样以 / 结尾
const model_root = './';

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

(async () => {
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
})();