# 芙宁娜 Live2D 看板娘 · GitHub Pages 部署指南

本项目是一个完全自托管的 Live2D 集成包，包含：

- `live2d-widget` 插件核心（`dist/`，含全部运行依赖，无外部 CDN）
- 原神「芙宁娜」Cubism 3 模型（`model/furina/`，贴图已优化为 4K）

整体约 **99 MB**，其中模型网格 `furina.moc3`（91 MB）在 GitHub 单文件 100 MB 上限内，可用 GitHub Pages 完整托管源，无需切片、无需改造。

---

## 接入博客后新增的功能

把 `autoload.js` 引到博客后，博客会多出以下能力（全部自动生效，无需其它配置）：

| 功能 | 说明 |
|---|---|
| 芙宁娜看板娘 | 左下角常驻的 Live2D 角色，随页面滚动保持悬浮 |
| 跟手互动 | 鼠标移动时头部、身体跟随转动，离开窗口后平滑回正 |
| 点击互动 | 点击角色会播放对应动作（点头、挥手等） |
| 随机台词气泡 | 不定期弹出角色台词气泡，内容来自 `waifu-tips.json` |
| 一言 | 工具栏按钮，随机展示一句「一言」句子 |
| 拍照 | 工具栏按钮，把当前看板娘截图保存为图片 |
| 信息 | 工具栏按钮，显示看板娘信息 |
| 关闭 | 工具栏按钮，隐藏看板娘（再次刷新页面会重新出现） |
| 参数调校面板 | 左下角齿轮按钮，可实时调整跟手灵敏度、抖动抑制等参数 |
| 实时加载进度条 | 首次加载模型时显示下载进度（百分比 + 已下载/总大小），不再干等 |
| 设置记忆 | 调好的参数自动存入浏览器 `localStorage`，刷新后保持 |

> 首次访问会下载约 99 MB 模型，之后浏览器缓存生效，再次访问秒开。加载期间左下角会显示转圈 + 进度条，模型渲染出第一帧后自动登场。

---

## 本项目当前线上接入地址

以下为本集成包托管后的实际资源入口，可直接引用。

| 用途 | 地址 |
|---|---|
| 看板娘演示页 | `https://827802685.github.io/Live2D/index.html` |
| 一键接入脚本（推荐直接引这个） | `https://827802685.github.io/Live2D/autoload.js` |
| 插件核心目录（dist） | `https://827802685.github.io/Live2D/dist/` |
| 模型根路径（大文件） | `https://raw-githubusercontent-com-gh.zjkl0330.dpdns.org/827802685/Live2D/refs/heads/master/` |

> `dist` 走 GitHub Pages 同源以稳定加载插件小文件；模型大文件（约 91MB）走加速 DNS 避免传输过慢。

---

## 前提条件

- 一个 GitHub 账号
- 本地装了 `git`（用于 `git push` 上传模型，**不要**用网页上传，网页限制单文件 ≤ 25 MB）

---

## 第 1 步：在 GitHub 建一个仓库

在 github.com 新建一个仓库（Public / Private 均可），记下仓库名，例如 `live2d-furina`。

---

## 第 2 步：推送到仓库

在你自己的电脑上，进入本项目目录并推送（把命令里的占位符换成你自己的）：

```bash
cd live2d-furina
git init
git add .
git commit -m "Add Furina Live2D widget + model"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

> 91 MB 的 `furina.moc3` 用 `git push` 上传是没问题的（上限 100 MB）。
> 如果你的网速偏慢或经常断，可以改用 `git lfs` 托管该文件，但 GitHub Pages 不托管 LFS 文件（会解析不了），所以**本项目不要用 LFS**，直接 push 原始文件即可。

---

## 第 3 步：开启 GitHub Pages

1. 仓库页面 → **Settings** → **Pages**
2. **Build and deployment** → Source 选 **Deploy from a branch**
3. Branch 选 `main`，目录选 `/`（根目录），Save
4. 等 1 ~ 3 分钟，会生成访问地址：`https://<你的用户名>.github.io/<仓库名>/`

> 注意：这是子路径站点，需要用 `<用户名>.github.io/<仓库名>/` 访问，不是 `<用户名>.github.io/`。

---

## 第 4 步：验证

浏览器打开 `https://<你的用户名>.github.io/<仓库名>/index.html`（本集成包当前线上为 `https://827802685.github.io/Live2D/index.html`）

首次加载要下载约 99 MB 模型，左下角会先出现转圈 + 实时下载进度条（显示百分比和已下载/总大小）。进度走完后提示「模型加载完成，正在渲染」，随后芙宁娜登场。若模型正常出现，说明已可对外访问。

> 若进度条长时间停在 0% 不动：可能是加速 DNS 镜像缓存了旧文件，强刷（`Ctrl+Shift+R`）一次即可；若始终无进展，说明网络到该镜像不稳定，可把 `autoload.js` 里的 `model_root` 换成 GitHub Pages 直链（见第 6 步方式 A 的说明）。

---

## 第 5 步：用设置面板调参（推荐先做）

页面左下角会多出一个齿轮按钮，点击即可唤出「芙宁娜参数调校」面板（右下角），可拖动滑块实时调参：

| 参数 | 作用 | 建议 |
|---|---|---|
| 头部水平灵敏度 | 鼠标左右移动时头的跟随幅度 | 0~60，默认 30 |
| 头部垂直灵敏度 | 鼠标上下移动时头的跟随幅度 | 默认 30 |
| 头部倾斜灵敏度 | 头左右倾斜幅度 | 默认 30 |
| 身体灵敏度 | 身体左右跟随幅度 | 默认 10 |
| 仰角软死区 | 鼠标接近水平线时抑制抖动；调大更稳、调小更灵敏 | 默认 0.06 |

行为说明：

- 拖动滑块**立即生效**，无需刷新，方便你边看边调。
- 数值自动写入 `localStorage['live2dConfig']`，**刷新页面后保持**。
- 面板右上角 **×** 收起；之后点左下角齿轮再唤出。
- 面板可拖拽移动到别处，不留碍事。
- 调满意后点 **导出配置**，会复制一段 `const LIVE2D_PRESET = {...};` 到剪贴板，可供下文「固化到博客」使用（或传给其它访客统一生效）。

> 调参逻辑说明：所有可调值都写入 `window.__live2dConfig`，由 `dist/chunk/index2.js` 在渲染每帧时读取。默认值、`LIVE2D_PRESET` 预设、`localStorage` 三者的优先级为：localStorage > LIVE2D_PRESET > 内置默认。点面板「重置」会清掉 localStorage，回到内置默认。

---

## 第 6 步：接入你的 Hexo（Rin 主题）博客

> 关键点：`autoload.js` 里用的是**绝对路径**（指向已托管的线上资源）。你的博客是另一个域名/路径，直接引用该脚本即可，无需把模型放进博客仓库。有下面两种接法，选一个即可。

### 方式 A：独立托管 + 博客引用脚本（推荐，模型不进博客仓库）

看板娘已托管在 `https://<你的用户名>.github.io/<仓库名>/`，博客只需引用 `autoload.js` 一个脚本。

1. 确认 `autoload.js` 顶部两个常量为绝对路径。本项目当前生效的配置（`dist` 走 GitHub Pages、模型大文件走加速 DNS）：

   ```js
   const live2d_path = 'https://827802685.github.io/Live2D/dist/';
   const model_root  = 'https://raw-githubusercontent-com-gh.zjkl0330.dpdns.org/827802685/Live2D/refs/heads/master/';
   ```

   若你按上文方法部署到自己的用户名，则将两处仓库地址换成自己的：

   ```js
   const live2d_path = 'https://<你的用户名>.github.io/<仓库名>/dist/';
   const model_root  = 'https://<你的用户名>.github.io/<仓库名>/';
   ```

   若模型大文件也要走加速 DNS，则把 `model_root` 替换为 `https://raw-githubusercontent-com-gh.zjkl0330.dpdns.org/<你的用户名>/<仓库名>/refs/heads/master/`。

2. 推送一遍让 Pages 更新（模型 100 MB 已有缓存，改动只是几 KB 脚本，很快）。
3. 在你的 Hexo 博客主题里加入脚本引用。Rin 主题一般在：

   - 全局布局：`themes/rin/layout/layout.ejs`（放到 `</body>` 前）
   - 或页脚局部：`themes/rin/layout/_partial/footer.ejs`

   在这些文件末尾加一行：

   ```html
   <script src="https://827802685.github.io/Live2D/autoload.js"></script>
   ```

   之后 `hexo clean && hexo g && hexo d`，进博客即可看到左下角芙宁娜。

### 方式 B：整个拷进博客 `source/`（全站同源，最省事）

把 `dist/`、`model/`、`autoload.js`、`model_list.json` 放进博客的主题静态目录（例如 `themes/rin/source/live2d/`），并在 `_config.yml` 的全局 `skip_render` 里加 `- live2d/**`（避免 Hexo 把 `.js`/`.json` 当模板去渲染）。然后在主题布局加：

```html
<script src="/live2d/autoload.js"></script>
```

> 模型约 99 MB，会随博客一起上传，适合模型不常变、想要完全自托管的场景。

### 固化为访客统一生效（可选）

面板调参只存在你自己的浏览器。想对所有访客统一用某个调好的手感，把你点「导出配置」复制的那段 `LIVE2D_PRESET`，粘贴到 `autoload.js` 顶部（`const live2d_path` 之前）即可，例如：

```js
const LIVE2D_PRESET = { "angleX": 30, "angleY": 30, "angleZ": 30, "bodyAngleX": 10, "deadZone": 0.06 };
```

> 注意：访客若再拖动面板，localStorage 会覆盖该预设；遇到这种情况点「重置」即回到预设数值。

---

## 附：运行资源清单

| 路径 | 说明 | 大小 |
|---|---|---|
| `dist/*` | 插件核心 + Cubism Core（已本地化） | ~360 KB |
| `model/furina/index.json` | 模型清单（插件约定格式） | 4 KB |
| `model/furina/furina.moc3` | 模型网格（Cubism 3 核心数据，无法压缩） | 91 MB |
| `model/furina/furina.8192/texture_00.png` | 角色贴图（已从 8K/34MB 优化为 4K/7.7MB） | 7.7 MB |
| `model/furina/furina.physics3.json` | 物理模拟（头发/布料飘动） | 152 KB |
| `model/furina/furina.cdi3.json` | 显示设置 | 48 KB |
| `model/furina/expressions/` | 表情（17 个） | — |
| `model/furina/motions/` | 动作（4 个） | — |

> 首次加载合计约 99 MB，其中 91 MB 是 `moc3` 模型网格，属该模型固有体积，无法再压缩。贴图已从 8K 压到 4K，若仍想进一步减小，可尝试把贴图转 WebP（约 3 MB），但需验证 Cubism Core 兼容性，收益有限，不建议。
