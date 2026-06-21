# GlossReader

[English](./README.en.md)

一个带有 AI 行内注释的桌面学术 PDF 阅读器。像中世纪抄写员在手稿上方标注释义（glossing）一样，GlossReader 将生词的释义直接渲染在单词上方——并且能感知论文领域，同一个单词 "power" 在心理学论文中标注为「统计检验力」，在政治学论文中则标注为「权力」。

基于 Tauri v2 + React 19 构建，打包体积约 10MB，原生性能。

## 功能

- **PDF 渲染** — 基于 PDFium WASM 引擎（EmbedPDF），支持双栏、公式、表格等复杂学术排版
- **AI 释义** — 选中单词或短语，右键查询，释义以 ruby text 形式直接标注在原文上方
- **句子翻译** — 选中句子，右键翻译，译文显示在侧边栏
- **领域感知** — 支持心理学、认知神经科学、计算机科学、医学、经济学、统计学，可自动检测或手动指定
- **多 AI 服务商** — 支持 Anthropic Claude、OpenAI、DeepSeek，以及本地 Ollama
- **多标签页** — 同时打开多个 PDF，标签页切换
- **注释持久化** — 释义标注自动保存，跨会话保留
- **自定义显示** — 释义和翻译的字号、颜色、透明度均可调节
- **自定义 Prompt** — 可覆盖默认的释义和翻译 prompt 模板
- **自动更新** — 内置更新器，通过 GitHub Releases 分发
- **多目标语言** — 支持中文、英文、日文释义

## 安装

从 [GitHub Releases](https://github.com/Tongzhao9417/GlossReader/releases) 下载对应平台的安装包：

| 平台 | 格式 |
|---|---|
| macOS | `.dmg` |
| Windows | `.msi` / `.exe` |
| Linux | `.deb` / `.AppImage` |

## 使用

1. 打开 PDF — 拖拽文件到窗口，或点击「选择文件」
2. 进入设置（齿轮图标），配置 AI 服务商和 API Key
3. 在 PDF 中选中一个单词 — 右键选择「释义」，定义会以行内标注的形式出现在单词上方
4. 选中一个句子 — 右键选择「翻译」，译文显示在侧边面板
5. 释义标注跨会话保存；右键点击已有标注可以编辑或删除

### 快捷键

| 快捷键 | 功能 |
|---|---|
| `Cmd/Ctrl + C` | 复制选中文本 |

## 开发

### 环境要求

- [Node.js](https://nodejs.org/)（v18+）
- [Rust](https://www.rust-lang.org/tools/install) 工具链
- [Tauri v2 系统依赖](https://v2.tauri.app/start/prerequisites/)

### 本地开发

```bash
# 安装依赖（同时会将 pdfium.wasm 复制到 public/embedpdf/）
npm install

# 开发模式（前端热更新 + Tauri 后端）
npm run tauri dev

# 仅前端开发（不启动 Tauri 壳，用于快速迭代 UI）
npm run dev
```

### 构建

```bash
# 生产构建
npm run tauri build

# 类型检查
npx tsc --noEmit
cd src-tauri && cargo clippy
```

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Tauri v2（Rust） |
| PDF 渲染 | EmbedPDF / PDFium WASM |
| 前端 | React 19、TypeScript、Vite 7 |
| AI | OpenAI 兼容 API（Claude、GPT、DeepSeek、Ollama） |

## 开源协议

MIT

## Links

- [LinuxDO](https://linux.do)