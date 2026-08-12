# opencode_vision：无视觉主模型的图像分析方案

[English](README.md) | [中文](README.CN.md)

> 让不具备视觉能力、高性价比的 opencode 文本模型（如 `deepseek-v4-flash`）获得看图能力：
> 通过把图像分析委托给 `mimo-v2.5` 视觉子代理完成——无需额外配置其他套餐，
> 使用 opencode-go 自带套餐即可。

## 项目亮点

- **高性价比文本模型 + 视觉子代理。** 主模型如 `deepseek-v4-flash`——opencode-go 套餐中
  性价比极高的纯文本模型，自身无法理解图片。
- **通过 subagent 机制"补上眼睛"。** 本项目利用 opencode 的 **subagent 机制**，让这些文本
  模型具备视觉能力：当主模型需要分析图片（截图、UI 设计稿、游戏画面、用户粘贴的图片等）时，
  通过 `task` 工具委托 `vision` 子代理（视觉模型 `mimo-v2.5`）读取图片并返回描述。
- **无需额外套餐。** 使用你已有的 opencode-go 套餐即可，不需要再订阅其他模型套餐。

## 工作原理

1. 主模型遇到图片（文件路径或用户粘贴的图片）。
2. 调用 `task` 工具，传入 `subagent_type="vision"` 与图片路径。
3. `vision` 子代理用 `Read` 工具读取图片并返回详细的图像描述。
4. 主模型把分析结果整合进自己的回答。

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `opencode.json` | 声明 opencode-go 下 `mimo-v2.5` 支持图像输入 |
| `vision.md` | `vision` 子代理定义（只读权限，仅做图像分析） |
| `vision-image-handler.ts` | 粘贴图片插件：把用户粘贴的图片落盘到 `.opencode/tmp/vision/`，并用文本指引主模型委托 `vision` 子代理 |

## 安装步骤

### 一句话安装（推荐）

直接让 opencode 帮你在一条指令中完成安装，例如：

> 帮我安装这个仓库里的 `vision` 子代理和粘贴图片插件。

opencode 会自动把 `vision.md` 复制到 `~/.config/opencode/agent/vision.md`、
`vision-image-handler.ts` 复制到 `~/.config/opencode/plugins/vision-image-handler.ts`，
并把 `opencode.json` 中的 `provider.opencode-go` 块合并到全局配置。之后退出并重启 opencode 即可。

### 手动安装

1. 复制 `vision.md` → `~/.config/opencode/agent/vision.md`
2. 复制 `vision-image-handler.ts` → `~/.config/opencode/plugins/vision-image-handler.ts`
3. 将 `opencode.json` 中的 `provider.opencode-go` 块合并到 `~/.config/opencode/opencode.json`
   （保留原有的 `$schema`、`provider.deepseek`、`mcp` 等已有字段）
4. 若全局插件按 npm 方式加载，需在 `~/.config/opencode/package.json` 的 `dependencies`
   中加入 `"@opencode-ai/plugin"`（若已存在则跳过）
5. 退出并重启 opencode 使配置生效

## 使用方式

- **图片文件**：主模型遇到图片路径时，直接调用 `task` 工具、`subagent_type="vision"`，
  传入图片完整路径即可。
- **粘贴图片**：用户粘贴图片后，插件自动落盘并注入委托指引，主模型据此调用 `vision` 子代理。
- 建议在项目 `AGENTS.md` 中补充约定：
  - 需要分析图片时不要直接用 Read 工具读取图片（读到的字节无法理解）；
  - 应使用 task 工具调用 `vision` 子代理，传入图片完整文件路径。

下面两张图展示了完整流程：`1.png` 是用户粘贴的示例图片，`2.png` 是实际效果——纯文本主模型
（此处为 `DeepSeek V4 Flash`）委托 `Vision Task` 子代理分析图片并返回描述。

![示例图片（用户粘贴）](1.png)

![主模型委托视觉子代理并返回分析结果](2.png)

## 注意事项

- `vision.md` 中 `model: opencode-go/mimo-v2.5` 的模型 ID 需与 `opencode-go` 下实际 ID 一致
  （可在 opencode 内运行 `/models` 确认，不一致时修改 `vision.md` 中的模型 ID）。
- 图片落盘目录 `.opencode/tmp/vision/` 已被各项目 `.gitignore` 忽略，不会进入版本库。
