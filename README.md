# Furina Live2D (芙宁娜看板娘)

芙宁娜（Cubism 5）Live2D 模型展示 + 可嵌入博客看板娘。

## 文件结构

```
index.html            全屏展示页（本地预览 / 独立访问）
embed.html            嵌入演示页（模拟博客环境）
kaban/
  kaban.js            看板娘组件（一行 script 嵌入）
  kaban.css           看板娘样式
js/
  pixi.min.js         PixiJS 6
  live2dcubismcore.min.js   Live2D Cubism Core (自包含, asm.js, 支持 Cubism 5)
  cubism4.min.js      pixi-live2d-display (cubism4)
  main.js             全屏页逻辑
model/furina/         模型（英文路径：furina.moc3 / model3.json / 动画 / 表情 / 纹理）
server.js             本地预览服务器 (node server.js → http://127.0.0.1:8127)
```

## 本地预览

```bash
node server.js
# 打开 http://127.0.0.1:8127/index.html   全屏展示页
# 打开 http://127.0.0.1:8127/embed.html   看板娘嵌入演示
```

## 嵌入到博客

任意页面插入两行：

```html
<link rel="stylesheet" href="https://你的域名/Live2D/kaban/kaban.css">
<script src="https://你的域名/Live2D/kaban/kaban.js" data-model="model/furina/furina.model3.json" data-size="400"></script>
```

功能：
- 右下角悬浮，可拖动，可跟随滚动（fixed 定位）
- 点击 `×` 隐藏 / `＋` 显示
- 点击角色触发 TapBody 动画并弹出气泡
- 空闲时自动播放待机动画 + 自动眨眼

配置项（`data-*` 或全局 `window.KabanConfig`）：

| 属性 | 默认 | 说明 |
|------|------|------|
| data-model | (必填) | model3.json 路径 |
| data-size | 400 | canvas 高度 px |
| data-pos | right | 悬浮位置 right/left |
| data-tip | 我是芙宁娜… | 初始气泡文字 |

全局 API：`window.Kaban.showTip(text, ms)` / `.hide()` / `.show()`。

## 部署到 GitHub Pages + 代理加速

1. **部署**：推送到 GitHub 仓库，开启 Settings → Pages → Deploy from branch（main / root）。访问 `https://用户名.github.io/仓库名/`。
   - 注意：模型 `furina.moc3` 约 95 MB，接近 GitHub 单文件 100 MB 上限，`git push` 会较慢且仓库体积大，属正常。
   - `芙宁娜免费模型/` 源目录已加入 `.gitignore`，不会重复占用仓库。

2. **代理加速**：GitHub Pages 国内访问较慢，建议套一层 CDN / 反向代理（如 Cloudflare Pages、国内 CDN、或自建 Nginx 反代）。代理转发 `https://用户名.github.io/仓库名/` 并缓存静态资源即可；模型为纯静态文件，无需额外配置。

3. **嵌入到博客**：把上面的 `你的域名` 换成代理后的域名（或直接用 `用户名.github.io/仓库名`）。若博客与模型不同域，代理需返回 `Access-Control-Allow-Origin: *`，或直接用代理后同域路径。

## 模型版权

模型为「芙宁娜免费模型」（Live2D 官方 / 米哈游相关，仅限非商业用途），请遵守原始许可。本项目不重新分发模型文件，`model/furina/` 为本地拷贝。
