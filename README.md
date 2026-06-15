# Codex Meter

Codex Meter 是一款 macOS 桌面用量监控工具，通过本机 Codex
`app-server` 实时显示 5 小时和 7 天两个限额窗口的剩余百分比及重置时间。

![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![Version](https://img.shields.io/badge/version-0.2.6-blue)
![Electron](https://img.shields.io/badge/Electron-41-47848F)

## 功能

- 桌面右上角常驻轻量悬浮框
- 显示 5 小时、7 天剩余百分比和重置时间
- 点击悬浮框打开完整主窗口
- 监听 Codex 实时限额更新，每 60 秒主动校准
- 自定义绿色、黄色、红色余量范围
- 独立设置低余量通知阈值
- 支持 macOS 登录后自动启动
- 连接中断后自动重连
- 小组件可自由拖动，并自动记住上次位置
- 可调整小组件透明度，并选择是否始终置顶
- 可锁定小组件，锁定后鼠标穿透且无法点击或拖动
- 主界面与小组件跟随 macOS 自动切换浅色、深色外观

## 数据来源与隐私

应用启动本机 `codex app-server`，通过 JSON-RPC 调用
`account/rateLimits/read` 并监听 `account/rateLimits/updated`。

- 不读取、复制或上传 `~/.codex/auth.json`
- 不保存 Codex 登录凭证
- 不向第三方服务发送用量数据
- 设置仅保存在本机 Electron 用户数据目录

Codex Meter 优先使用：

```text
/Applications/Codex.app/Contents/Resources/codex
```

若该路径不存在，则回退到系统 `PATH` 中的 `codex`。

## 技术架构

```text
Electron main process
├── Codex app-server JSON-RPC client
├── Settings and notifications
├── Desktop meter window
└── Secure IPC handlers

Preload bridge
└── Restricted contextBridge API

Renderer
├── Overview
├── Settings
└── Desktop meter
```

安全配置：

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- 外部链接通过主进程白名单打开

## 系统要求

- macOS 11 或更高版本
- Apple Silicon
- 已安装并登录 Codex Desktop 或 Codex CLI
- 开发环境需要 Node.js 20 或更高版本

## 开发

```bash
npm install
npm run dev
```

## 测试与构建

```bash
npm run typecheck
npm test
npm run build
npm run dist
```

安装包输出到 `release/`：

```text
Codex Meter-<version>-arm64.dmg
Codex Meter-<version>-arm64.zip
```

当前本地构建未使用 Apple Developer 签名。首次运行时，macOS 可能要求在
“系统设置 → 隐私与安全性”中手动允许。

## 作者

- Author: Helo Chang
- GitHub: [cyrilchang-0306/codexmeter](https://github.com/cyrilchang-0306/codexmeter)
- 抖音 / 小红书 / B站：常期主义
