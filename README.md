# Codex 一键换肤

Windows Codex 桌面端的可交互主题工具。它把图片和主题参数注入 Codex 渲染层，保留原生输入框、图片附件、模型菜单、导航和任务操作；不会把整张界面截图盖在应用上。

## 功能

- 内置 QQ 2007、樱粉晨曦、午夜极光、赛博霓虹、森野薄雾和琥珀黄昏主题。
- 从 JPG、PNG 或 WebP 图片生成自适应主题，并立即应用。
- 在 Codex 顶部导航栏的“换肤”菜单中实时切换全部已加载主题。
- 一键返回 Codex 官方外观，随时重新进入当前主题。
- 监听 Codex 页面重载并自动重新注入。
- 安装、验证、恢复全程不修改 `WindowsApps`、`app.asar`、应用签名、账号凭据或 API 配置。

## 环境要求

- Windows 10/11
- Microsoft Store 安装的官方 OpenAI Codex 桌面端
- Node.js 22 或更高版本
- Windows PowerShell 5.1 或 PowerShell 7

## 安装

1. 关闭 Codex，双击 `install.cmd`。
2. 桌面会出现“Codex 一键换肤”和“Codex 一键换肤 - 启动”。
3. 打开“Codex 一键换肤”，选择内置主题或导入自己的图片。

如果电脑上安装过旧版 Codex QQ 2007，请先用旧项目的恢复脚本还原官方外观，再安装本项目；安装器会阻止覆盖仍需恢复的旧备份。

也可以在 PowerShell 中运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-dream-skin.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\theme-picker.ps1
```

首次应用主题时，Codex 需要重启一次来启用仅限本机回环地址的调试端口。重启可能丢失尚未发送的输入，脚本会先征求确认。

## 导入图片

打开桌面“Codex 一键换肤”，点击“导入图片”并选择文件即可。也可直接运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\import-theme.ps1 `
  -ImagePath C:\Pictures\my-skin.png -Name "我的主题"
```

图片会复制到 `%LOCALAPPDATA%\CodexOneClickSkin\themes`。渲染器会从图片分析色彩；控件仍是 Codex 的真实控件，不会变成不可点击的贴图。

## 命令

```powershell
# 查看主题
.\scripts\list-themes.ps1

# 切换主题并立即应用
.\scripts\switch-theme.ps1 -ThemeId preset-sakura-dawn

# 启动当前主题
.\scripts\start-dream-skin.ps1 -PromptRestart

# 截图并验证当前会话
.\scripts\verify-dream-skin.ps1 -ScreenshotPath .\verify.png

# 恢复官方外观
.\scripts\restore-dream-skin.ps1 -RestoreBaseTheme -PromptRestart

# 卸载快捷方式并恢复
.\scripts\restore-dream-skin.ps1 -Uninstall -RestoreBaseTheme -PromptRestart
```

## 主题格式

每个主题是 `presets/<id>/` 或本地主题库中的一个目录：

```text
theme.json
background.jpg
assistant.png   # 可选
qq-show.png     # 可选
```

`theme.json` 至少需要：

```json
{
  "schemaVersion": 1,
  "id": "my-theme",
  "name": "我的主题",
  "image": "background.jpg",
  "appearance": "auto",
  "art": { "focusX": 0.5, "focusY": 0.5, "safeArea": "auto" }
}
```

主题 id 只允许英文字母、数字、下划线和连字符。图片上限 16 MB。载荷构建器会检查文件名、扩展名、图片签名、大小和重复 id。

## 安全边界

本项目通过 Chrome DevTools Protocol 连接 `127.0.0.1` 上由当前官方 Codex 进程持有的端口。脚本会校验 Store 包身份、可执行文件路径、监听进程、浏览器会话 id 和页面目标，不连接远程调试端点。

恢复操作会停止注入进程、移除实时样式、关闭调试会话并重新打开官方 Codex。用户主题与选择记录位于 `%LOCALAPPDATA%\CodexOneClickSkin`。

## 测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\run-tests.ps1
```

## 来源与许可

项目基于 [zhangjanice66/Codex-QQ-2007](https://github.com/zhangjanice66/Codex-QQ-2007) 的主题结构和可逆注入思路，并包含本次 Windows 适配与多主题交互实现。详见 [NOTICE.md](NOTICE.md)。代码按 MIT License 发布。
