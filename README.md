# SpinRead Web

乒乓球训练视频分析产品 **SpinRead** 的前端。用户登录后上传训练/比赛视频（预签名 URL 分片直传 MinIO），后端自动完成探测、转码、质量检查与 AI 活动识别；前端按时间线展示切出的训练片段，点击片段即可在播放器中只播放该区间（virtual clip）。

## 技术栈

- Vite + React 19 + TypeScript（strict 模式）
- react-router-dom（路由与登录守卫）
- hls.js（HLS 播放，统一走 MSE 并携带 Authorization 头，不使用原生 HLS）
- 手写 CSS（深色简洁风；无 UI 组件库、无外部字体 / CDN）

## 功能清单

- **登录 / 退出**：预填演示账号；token 存 `localStorage`（`spinread_token`）；401 自动清 token 并跳回登录页；已登录访问 `/login` 自动跳走
- **视频列表**（`/`）：文件名、状态徽章、时长、创建时间；每 5s 自动刷新；处理中的卡片实时显示 `progress_pct` 进度条；支持删除（confirm 后 DELETE）
- **上传**（`/upload`）：选择视频后创建上传会话，16MiB 分片直传（并发 4、单片失败重试 3 次、XHR `upload.onprogress` 累计字节进度条），完成后 `complete` 并跳转详情页；上传中禁止重复提交
- **视频详情**（`/videos/:id`）：
  - 处理中：每 2s 轮询 `processing-status`，渲染阶段清单（✓ 成功 / ↻ 运行中 / ○ 等待 / ✗ 失败，最多 9 阶段：解析 / 转码 / 质量检查 / 活动识别 / 回合检测 / 事件提取 / 时间线生成 / 指标计算 / 报告生成）+ 总进度条 + limitations
  - 失败态：红色横幅 + `error_code`
  - 就绪（READY / PARTIAL_READY）：
    - HLS 播放器（hls.js，`xhrSetup` 注入 Bearer token）
    - **层级片段列表**：顶层活动段为组（类型徽章 / 起止 / 时长 / 置信度），下挂 RALLY 回合子行（序号、起止、时长、击球数、置信度）；HIT_CANDIDATE 不单独成行。点击段 / 回合 seek 到 `start-800ms` 播放，到 `end+1200ms` 自动暂停；当前片段高亮；「全部播放」取消区间限制
    - **时间线编辑**：「编辑时间线」开关；顶层段支持起 / 终点 ±0.1s、±1s 微调、类型下拉、「在此拆分」（取播放器播放头）、「与下一段合并」、删除；RALLY 行支持边界微调与删除。修改本地暂存（脏标记 + 离开页面拦截），底部「保存修改（N 项修改）」一次提交（同一 item 多次微调合并为一个 op）；成功后刷新时间线与报告并提示「指标正在重算」；409 版本冲突时自动刷新并提示重新应用
    - **报告面板**：指标卡片（有效训练时长 / 回合数 / 平均回合时长 / 最长回合 / 每回合击球均值 / 置信度覆盖率）+ 回合长度分布 CSS 直方图 + 训练发现（类别中文映射、样本数、LOW_EVIDENCE 淡显、点击证据区间 seek 播放器）；报告未生成（404）时容忍；时间线版本领先报告时显示「指标正在重算」并每 3s 轮询
    - **片段导出**：顶层段与 RALLY 行均可「导出」为 mp4（创建后轮询状态 2s，READY 变「下载」，fetch blob + `a[download]`，文件名 `{视频名}_{起}-{止}.mp4`）；回合行 checkbox 多选 + 「生成集锦（N）」合成 highlight reel（下载 `{视频名}_集锦_N段.mp4`，下载 URL 按 kind 拼 `/clips` 或 `/highlight-reels` 路径）；进入页面时已有的导出直接显示「下载」
    - **手动重跑**：「重新分析」按钮（confirm 后 POST `pipeline-runs`，409 提示「已有分析在进行中」），触发后页面切回轮询模式
    - 胶片条：每 5s 一张缩略图横向滚动（fetch blob + `URL.createObjectURL` 以携带鉴权头，404 即停止），点击缩略图 seek
    - PARTIAL_READY 顶部提示「部分分析不可用」+ limitations
  - READY 前请求时间线 / 报告返回 404 时前端容忍（提示「时间线尚未生成」）

## 依赖后端

后端仓库：`../spinread-server`（详细说明见该仓库 README）。快速启动：

```bash
cd ../spinread-server
bash scripts/dev_up.sh
.venv/bin/python -m uvicorn spinread.api.main:app --port 8000
```

演示账号：`demo@spinread.local` / `spinread-demo`

## 快速开始

```bash
npm install
npm run dev      # http://localhost:5173，/api 由 vite proxy 转发到 http://localhost:8000
```

## 构建

```bash
npm run build    # tsc -b && vite build，产物输出到 dist/
```

## 目录结构

```
src/
├── api/            # API 层
│   ├── client.ts   #   fetch 封装：自动带 token、401 跳登录、error envelope 解析
│   ├── upload.ts   #   分片直传（XHR 进度、并发、重试）
│   └── types.ts    #   与后端契约对齐的类型定义
├── auth/           # AuthContext + RequireAuth 路由守卫
├── components/     # Player / SegmentTree / EditControls / ReportPanel / ExportButton
│                   # Filmstrip / StatusBadge / ProgressBar / TopBar
├── hooks/          # useExports（片段/集锦导出：创建、2s 轮询、blob 下载）
├── pages/          # LoginPage / VideoListPage / UploadPage / VideoDetailPage
└── utils/          # 时间与文件大小格式化、状态与类型中文文案
```

## 页面截图

（待补充）

- 登录页：
- 视频列表：
- 上传页：
- 视频详情（处理中）：
- 视频详情（片段播放 + 胶片条）：
- 视频详情（报告面板 + 层级片段列表）：
- 视频详情（时间线编辑模式）：
