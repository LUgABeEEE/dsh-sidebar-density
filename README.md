# dsh-sidebar-density

A sidebar density control centre for [DSH (DeepSeek Harness)](https://github.com/LUgABeEEE/dsh-main-workspace): five fold switches, three density presets and three width presets — served from one compact foot entry plus a settings section.

把 DSH 左侧栏被"外壳"吃掉的高度还给「工作区」（会话列表），并提供整套侧栏密度控制。**v0.1.0**

## 问题

侧栏的高度是固定的几块拼出来的，只有 `sidebar.workspaces` 是 `flex:1`——它拿到的永远是**剩余**高度：

| 侧栏里的固定块 | 高度 | 来源 |
| --- | --- | --- |
| 品牌行 | 60 + 4px | ui-sidebar `.logoRow` |
| 新会话按钮 | 38 + 8 + 12px | ui-sidebar `.newSession` |
| 全局导航面板（每个已装插件一行） | 36px / 行，5 行 ≈ **204px** | ui-sidebar `nav.panelList` |
| 「工作区」标题行 | 36 + 4px | ui-workspace `.sectionHeader` |
| 底部：费用卡 + 导入会话 + 设置 | ≈ **190px** | dsh-cost-meter + 各插件 |

在 ~840px 的视口里，会话列表只剩 ≈200px ≈ **4.5 行**。装上越多面板型插件，列表越小。

## 这个插件做什么（v0.1.0）

### 入口（收纳，不占常驻高度）

| 入口 | 位置 | 内容 |
| --- | --- | --- |
| 侧栏底部「密度」按钮 | `sidebar.footer.action`，order -10（费用卡之前） | 点开弹出面板，全部控件都在里面 |
| 设置 →「侧栏密度」 | `settings.section`（order 40，General 之后） | 同一套控件的正式页面 |

折叠成 56px 图标栏时，底部入口缩成图标仍然可点（面板不在此时展开）。
**默认全部关闭/标准**，状态按浏览器持久化（`localStorage`，v2；会自动迁移 v1 的两开关记录）。

### 五个折叠开关

| 开关 | 关 | 开 | 拿回 |
| --- | --- | --- | --- |
| **导航** | 竖排 N 行 | 横排一行图标，面板照样点得到 | 204 → ≈44px，省 **160px** |
| **账单** | 完整费用卡 | 只留首行（今日） | 96 → 34px，省 **62px** |
| **品牌行** | 60px | 32px（只留标志与折叠按钮） | 省 **28px** |
| **新会话** | 38px | 26px（只留图标） | 省 **12px** |
| **区标题** | 36px | 26px | 省 **10px** |

全部打开约还给会话列表 **270px ≈ 7 行**。

### 三档密度预设

| 预设 | 字号 | 行高 | 侧栏内边距 | 面板行 | 品牌行 | 新会话 |
| --- | --- | --- | --- | --- | --- | --- |
| 标准 | 14px | 沿用宿主 | 12px | 36px | 60px | 38px |
| **紧凑** | 13px | 18px | 10px | 30px | 48px | 32px |
| **舒适** | 15px | 沿用宿主 | 14px | 38px | 64px | 42px |

预设作用于侧栏整列（`root` + `sectionHeader`），折叠成 rail 时自动不施加，避免打乱 56px 图标栏；
右栏展开时预设只调右栏内容字号，不动它的布局。

### 三档侧栏宽度

| 宽度 | 值 | 说明 |
| --- | --- | --- |
| 自动 | 不动 | 宿主的拖拽宽度继续生效（默认） |
| 窄 | 264px | 宿主拖拽下限 |
| 宽 | 320px | 介于默认 280 与上限 420 之间 |

**取舍（必须知道）**：宿主把列宽写成 frame 的 inline `grid-template-columns`，官方 `ctx.layout`
只暴露 `toggleSidebar` / `selectPanel`，**没有设宽度的 API**。所以宽度预设只能覆盖那个 inline 值，且只在
三列都可预测时覆盖：**右栏无轨道**（`:has([data-sidebar-right-open])` 不成立）、**非折叠**、**非右栏全屏**。
一旦你拖动侧栏分隔条，插件会立即把宽度设回「自动」，把控制权交还宿主布局——不会抢你的拖拽。

## 怎么实现（以及为什么这样做）

- **不改宿主 DOM**：所有选项只是 `<html>` 上的 `data-dsd-*` 属性，视觉全部由一张注入的样式表承担。
  宿主 React 树不被编辑，重渲染撤销不了它，卸载也不会留残渣。
- **不用私有接口**：控件注册进官方、有文档的 `sidebar.footer.action` 与 `settings.section` 座位；
  样式靠属性 + 结构钩子限定作用域。
- **选择器能跨版本**：DSH 的类名是 CSS module 产物（`hHd-Xa_panelRow` = 构建哈希 + **本地名**），
  所以按本地名匹配（`[class*="panelRow"]`）。上游若改名，规则静默失效→侧栏回到原样，而不是坏掉。
  侧栏列锚点用 `:is([class*="_root"]:has(> nav[class*="panelList"]))`，同样不依赖哈希。
- **易撤**：删掉 `<style>` 即完全恢复；`dsh plugin remove` 撤得干干净净。

## 安装 / 卸载

```bash
# 1) 克隆到任意目录
git clone git@github.com:LUgABeEEE/dsh-sidebar-density.git

# 2) 装进 web profile（路径必须是绝对路径）
dsh plugin --profile web add "$(pwd)/dsh-sidebar-density"

# 重启 dsh-web 让组合生效。
# ⚠ 本机 SER8 实测：`systemctl restart dsh-web` 被 polkit 拦死
#   （Interactive authentication required；CanStart/CanStop=yes 只是单元属性）。
#   现行做法是 kill 主进程，由 Restart=always 接管：
kill "$(systemctl show -p MainPID --value dsh-web)"

# 只停用，不卸载：在 profile 的 cordis.patch.yml 里加
#   - id: sidebar-density
#     disabled: true
# 然后同样重启

# 卸载
dsh plugin --profile web remove dsh-sidebar-density
```

> 客户端半改动（`lib/client.js`）没有 HMR 时**必须重启**才到浏览器；页面刷新不足以换掉服务端缓存的 bundle。

## 自测

```bash
npm run verify     # node --check + node --test
```

测试用最小化的 `window` / `document` / `react` 假件挂起控件，验证：模块自注册、两个座位各注册一次、
样式只装一次、默认不动任何属性、五个开关独立翻转并持久化、预设与宽度写属性、v1 迁移、非法存档回落、
设置页渲染同一套控件、拖拽 handle 让位、dispose 后样式与全部属性清空。
**真实 CSS 层叠、`:has()` 匹配与布局不在单测范围内**——那部分以运行中的 GUI 截图与实测高度为准。

## 上手验收（刷新页面后逐条看）

1. 侧栏底部出现「密度」按钮，点开有预设/宽度/五个开关。
2. 点「紧凑」→ 字号、面板行、品牌行一起收紧；会话列表多出几行。
3. 打开「导航」→ 面板导航变一行图标。
4. 点「窄」→ 侧栏变 264px；**拖一下分隔条** → 恢复自动宽度，设置里的宽度回到「自动」。
5. 把侧栏收成图标栏 → 「密度」按钮变成可点图标。
6. 打开右栏 → 侧栏宽度预设不与你抢布局；右栏字号跟随预设。
7. 设置页里出现「侧栏密度」分区，控件与弹出面板一致。
8. 点「恢复默认」→ 界面回到出厂样子（记录仍留在 localStorage，刷新不丢）。
