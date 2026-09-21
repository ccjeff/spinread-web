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
  - 处理中：每 2s 轮询 `processing-status`，渲染阶段清单（✓ 成功 / ↻ 运行中 / ○ 等待 / ✗ 失败）+ 总进度条 + limitations
  - 失败态：红色横幅 + `error_code`
  - 就绪（READY / PARTIAL_READY）：
    - HLS 播放器（hls.js，`xhrSetup` 注入 Bearer token）
    - 片段列表：类型中文名（训练回合 / 捡球 / 休息 / 讲解 / 未知）、起止时间、时长、置信度百分比；点击片段 seek 到 `start-800ms` 播放，到 `end+1200ms` 自动暂停；当前片段高亮；「全部播放」取消区间限制
    - 胶片条：每 5s 一张缩略图横向滚动（fetch blob + `URL.createObjectURL` 以携带鉴权头，404 即停止），点击缩略图 seek
    - PARTIAL_READY 顶部提示「部分分析不可用」+ limitations
  - READY 前请求时间线返回 404 时前端容忍（提示「时间线尚未生成」）

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
├── components/     # Player / SegmentList / Filmstrip / StatusBadge / ProgressBar / TopBar
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
