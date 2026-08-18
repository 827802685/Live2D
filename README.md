# 芙宁娜 Live2D 看板娘

一个完全自托管的 Live2D 集成包：加载游戏《原神》角色「芙宁娜」的 Cubism 3 模型作为网页看板娘，可随鼠标/触摸跟手、可拖动、带参数调校面板与实时下载进度条，加载完成后再渲染出现。

项目由 live2d-widget 插件核心 + 芙宁娜模型两部分组成，无外部 CDN 依赖，GitHub Pages 可直接托管。

---

## 接入地址

以下地址为项目托管后的实际资源入口，供直接引用。

| 用途 | 地址 |
|---|---|
| 看板娘演示页 | `https://827802685.github.io/Live2D/index.html` |
| 一键接入脚本（推荐直接引这个） | `https://827802685.github.io/Live2D/autoload.js` |
| 插件核心目录（dist） | `https://827802685.github.io/Live2D/dist/` |
| 模型根路径（大文件） | `https://raw-githubusercontent-com-gh.zjkl0330.dpdns.org/827802685/Live2D/refs/heads/master/` |

> `dist` 走 GitHub Pages 同源以稳定加载插件小文件；模型大文件（约 91MB 的 `furina.moc3` + 贴图）走加速 DNS 以避免大文件传输过慢。

## 快速开始

### 在任意网页引入

在 `</body>` 结束标签前加入一行：

```html
<script src="https://827802685.github.io/Live2D/autoload.js"></script>
```

页面左下角即出现加载转圈 + 实时下载进度条（百分比 + 已下载/总大小），模型下载并渲染出第一帧后看板娘出现。

### 在我的 Hexo（Rin 主题）博客引入

1. 在主题布局文件 `layout/layout.ejs`（或 `_partial/footer.ejs`）的 `</body>` 前加入：
   ```html
   <script src="https://827802685.github.io/Live2D/autoload.js"></script>
   ```
2. 重新构建部署：
   ```bash
   hexo clean && hexo g && hexo d
   ```

模型与插件已独立在 `Live2D` 仓库，博客仓库无需包含模型文件，仅需一行脚本引用，进站不卡加载（模型在页面并行拉取）。

## 使用说明

- 看板娘默认位于左下角，可上下拖动。
- 鼠标/触摸移动时，头部与身体随光标方向跟手倾斜。
- 点击看板娘会触发随机动作。
- 关闭按钮（×）可隐藏看板娘；重启页面恢复。

### 参数调校面板

页面载入后，左下角有 **⚙ 齿轮按钮**，点击唤出「芙宁娜参数调校」面板（默认右下角，可拖动）：

| 滑块 | 作用 |
|---|---|
| 头部水平灵敏度 `angleX` | 鼠标水平移动时头部跟随幅度（范围 0–60，默认 30） |
| 头部垂直灵敏度 `angleY` | 鼠标垂直移动时头部跟随幅度（范围 0–60，默认 30） |
| 头部倾斜灵敏度 `angleZ` | 头部左右倾斜幅度（范围 0–60，默认 30） |
| 身体灵敏度 `bodyAngleX` | 鼠标水平移动时身体跟随幅度（范围 0–30，默认 10） |
| 仰角软死区 `deadZone` | 鼠标接近模型水平线时抑制抖动；调大更稳、调小更灵敏（范围 0–0.3，默认 0.06） |

- 拖动滑块即时生效，无需刷新。
- 参数自动保存在浏览器（`localStorage`），刷新后保持。
- 面板右上角有 **导出配置**，点击后复制一段 `LIVE2D_PRESET`，可粘贴到 `autoload.js` 顶部固化默认值。
- 头部/身体角度已做硬限位（头部 ±15°、垂直 ±10°、倾斜 ±12°、身体 ±4°），快速滑动时不会被推过头导致破图。

## 工作原理

加载顺序如下：

1. 页面解析到 `autoload.js` 立即注入运行时配置 `window.__live2dConfig`（默认值 + `LIVE2D_PRESET` 预设 + `localStorage` 覆盖）。
2. 并行加载 `waifu.css`、`waifu-tips.js`；随后 `initWidget` 读取模型清单、初始化 Cubism Core。
3. 显示加载转圈「看板娘正在准备迎客」+ 实时下载进度条（包装 `fetch` 统计模型文件下载字节数）。
4. 模型下载完成后渲染出第一帧，触发 `live2d:rendered` 事件，此时才移除转圈并显示看板娘。
5. `config-panel.js` 加载调校面板，供运行时实时调参。

关键点：看板娘只在模型真正渲染出第一帧后才出现，避免下载过程中出现空白/未渲染的半成品。

## 文件结构

```
live2d-furina/
├── autoload.js              # 加载入口（路径配置、渲染门控、面板加载）
├── index.html               # 本地/线上演示页
├── model_list.json          # 模型清单
├── deploy.sh                # 部署脚本
├── dist/                    # 插件核心（无外部 CDN）
│   ├── waifu.css
│   ├── waifu-tips.js        # 核心交互逻辑
│   ├── waifu-tips.json
│   ├── live2d.min.js        # Cubism 2 渲染器
│   ├── live2dcubismcore.min.js  # Cubism 5 Core
│   ├── chunk/index.js
│   ├── chunk/index2.js      # 模型加载 + 跟手参数（含限位）
│   └── config-panel.js      # 参数调校面板
└── model/furina/            # 芙宁娜模型
    ├── index.json           # 模型清单（Cubism 3）
    ├── furina.moc3          # 模型网格（约 91MB）
    ├── furina.physics3.json # 物理模拟（头发/布料飘动）
    ├── furina.cdi3.json     # 显示设置
    ├── furina.8192/texture_00.png  # 角色贴图
    ├── expressions/         # 17 个表情
    └── motions/             # 4 个动作
```

## 部署到自己的 GitHub Pages

若需部署到自己名下，参照以下步骤：

1. 将本项目 `dist/`、`model/`、`autoload.js`、`index.html`、`model_list.json` 上传到你的仓库 `master` 分支。
2. 仓库 Settings → Pages → 选 `master`，目录 `/`，Save。
3. 等 1–3 分钟生成地址 `https://<用户名>.github.io/<仓库名>/`。
4. 修改 `autoload.js` 顶部的两个路径：
   ```js
   const live2d_path = 'https://<用户名>.github.io/<仓库名>/dist/';
   const model_root  = 'https://<用户名>.github.io/<仓库名>/';
   ```
   若用加速 DNS 托管模型大文件，则将 `model_root` 替换为对应镜像地址（注意末尾 `/` 必须保留）。

> 91MB 的 `furina.moc3` 建议用 `git push` 上传（单文件上限 100MB），不要用 GitHub 网页上传（限制 25MB），也不要启用 LFS（Pages 不托管 LFS 文件）。

## 常见问题

- 首次加载要下载约 99MB 模型（moc3 91MB + 4K 贴图 8MB），会偏慢，属正常；加载框会显示实时进度，之后浏览器缓存会加速。
- 若看板娘一直不出现，请强刷（Ctrl+Shift+R），并确认 WebGL 已开启；模型大文件能正常下载时最多等待约 90 秒。
- 控制台出现 `favicon.ico 404` 或一言接口 `429` 均不影响看板娘，可忽略。