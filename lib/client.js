/**
 * dsh-sidebar-density — client half (browser bundle).
 *
 * This file is what `exports["./client"]` points at: a self-registering lazy
 * factory picked up by `window.__ModuleLoader__` in the browser.
 *
 * ## What problem this solves
 *
 * The shipped sidebar spends its height on fixed furniture: the brand row, the
 * "new session" button, the global panel nav (one 36px row per installed panel),
 * the workspace section header, and the foot area (cost card + import +
 * settings). The `sidebar.workspaces` region is `flex:1` — it only ever gets
 * what is left over, which on a ~840px viewport is roughly 200px. This plugin
 * hands height back by shrinking those fixed blocks and by offering a whole
 * sidebar density preset, and never touches the session list itself.
 *
 * ## Shape of the control surface
 *
 *  - **One foot entry** (`sidebar.footer.action`, order -10) that opens a
 *    compact popover: density preset, width preset, five switches.
 *  - **One settings section** (`settings.section`, id `sidebar-density`) with
 *    the same controls as a full row list.
 *  - **Nothing always-on**: every switch defaults to the stock look, the
 *    standing attributes are only written when a non-default choice exists.
 *
 * ## Why it is written this way
 *
 *  - **No host DOM mutation.** Choices are attributes on `<html>`
 *    (`data-dsd-*`) that the stylesheet keys off. The shell's own React tree is
 *    never edited, so a re-render cannot undo us and an unmount cannot leave
 *    debris. The one exception is the width preset, which has no host API and
 *    therefore overrides the frame's inline `grid-template-columns`; it stands
 *    down while the right column is open, while the sidebar is collapsed, and
 *    the moment the user grabs the resize handle.
 *  - **No private API.** Controls live in the shipped `sidebar.footer.action`
 *    and `settings.section` seats; styling is scoped by attributes and by the
 *    structural hooks the shell already guarantees.
 *  - **Selectors survive upgrades.** DSH ships CSS-module class names
 *    (`hHd-Xa_panelRow` — a build hash plus the *local* name), so matching on
 *    the local name (`[class*="panelRow"]`) keeps working across builds where
 *    the hash changes. If upstream ever renames a local name the rule silently
 *    stops matching: the sidebar falls back to its stock look instead of
 *    breaking.
 *  - **Cheap to undo.** Removing the `<style>` tag restores the stock sidebar
 *    exactly; `dsh plugin remove` removes the whole thing.
 *
 * @module dsh-sidebar-density/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-sidebar-density',

  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Shown in the panel so a stale bundle is obvious after a restart. */
    const VERSION = '0.1.0'
    /** `<style>` id, so a reload replaces rather than stacks the sheet. */
    const STYLE_ID = 'dsh-sidebar-density-css'
    /** localStorage key holding the v2 state. */
    const STORE_KEY = 'dsh-sidebar-density/v2'
    /** v1 key (two attribute values); read once for migration, then removed. */
    const LEGACY_KEY = 'dsh-sidebar-density/v1'
    /** `<html>` attributes the stylesheet keys off. */
    const PRESET_ATTR = 'data-dsd-preset'
    const WIDTH_ATTR = 'data-dsd-width'
    /** Slot entry ids. */
    const FOOTER_SLOT = 'sidebar.footer.action'
    const FOOTER_ID = 'sidebar-density'
    const SECTION_SLOT = 'settings.section'
    const SECTION_ID = 'sidebar-density'
    /** Lowest order in the foot list: our control sits above the cost card. */
    const FOOTER_ORDER = -10
    /** After General, before the plugins catalogue. */
    const SECTION_ORDER = 40

    /** Presets: stock look, dense, roomy. `standard` writes no attribute. */
    const PRESETS = ['standard', 'compact', 'comfortable']
    /** Width presets. `auto` leaves the host layout alone. */
    const WIDTHS = ['auto', 'narrow', 'wide']

    /** Switch table: key → the attribute and the value it carries when on. */
    const TOGGLES = [
      { key: 'nav', attr: 'data-dsd-nav', on: 'icons' },
      { key: 'bill', attr: 'data-dsd-bill', on: 'single' },
      { key: 'brand', attr: 'data-dsd-brand', on: 'slim' },
      { key: 'newSession', attr: 'data-dsd-new', on: 'slim' },
      { key: 'header', attr: 'data-dsd-header', on: 'slim' },
    ]
    const TOGGLE_KEYS = TOGGLES.map((row) => row.key)

    /** The stock state: nothing on, host layout width, stock typography. */
    const DEFAULT_STATE = Object.freeze({
      preset: 'standard',
      width: 'auto',
      toggles: Object.freeze(Object.fromEntries(TOGGLE_KEYS.map((key) => [key, false]))),
    })

    /**
     * Sidebar column anchor. The shell renders
     * `root > (logoRow | newSession | nav.panelList | regionArea | footArea)`,
     * so `_root` plus a `panelList` child identifies the column without
     * depending on the build hash.
     */
    const COLUMN = ':is([class*="_root"]:has(> nav[class*="panelList"]))'
    /** Same anchor, but never while the column is a 56px rail. */
    const COLUMN_WIDE = `${COLUMN}:not([class*="collapsed"])`

    // ------------------------------------------------------------------ 样式

    /**
     * The whole visual layer. Every rule is inert until the matching choice
     * exists, so a partially-matching sheet (e.g. after a DSH upgrade renames
     * one local class) degrades to "no change".
     */
    const CSS = `
/* ── 控件条与弹出面板 ─────────────────────────────────────────────────── */
.dsd-bar{
  position:relative;
  display:flex;
  flex:0 0 100%;
  width:100%;
  box-sizing:border-box;
  align-items:center;
  justify-content:flex-end;
  gap:4px;
  padding:0 0 2px;
}
.dsd-entry{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  box-sizing:border-box;
  height:24px;
  padding:0 8px;
  border:.5px solid var(--dsw-alias-border-l1);
  border-radius:6px;
  background:transparent;
  color:var(--dsw-alias-label-secondary);
  font:inherit;
  font-size:12px;
  line-height:1;
  white-space:nowrap;
  cursor:pointer;
}
.dsd-entry:hover,
.dsd-entry.dsd-on{
  color:var(--dsw-alias-label-primary);
  border-color:var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-1);
}
.dsd-entry:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsd-pop{
  position:absolute;
  right:0;
  bottom:calc(100% + 6px);
  z-index:60;
  width:252px;
  box-sizing:border-box;
  padding:10px;
  border:.5px solid var(--dsw-alias-border-l2);
  border-radius:10px;
  background:var(--dsw-alias-bg-layer-1);
  box-shadow:0 8px 24px rgba(0,0,0,.18);
  color:var(--dsw-alias-label-primary);
  font-size:12px;
}
.dsd-pop-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-weight:600}
.dsd-ver{color:var(--dsw-alias-label-tertiary);font-size:10px;font-weight:400;letter-spacing:.02em}
.dsd-seg{display:flex;gap:4px;margin-bottom:8px}
.dsd-seg-label{color:var(--dsw-alias-label-tertiary);font-size:11px;margin-bottom:4px}
.dsd-segbtn{
  flex:1;
  height:24px;
  padding:0 6px;
  border:.5px solid var(--dsw-alias-border-l1);
  border-radius:6px;
  background:transparent;
  color:var(--dsw-alias-label-secondary);
  font:inherit;
  font-size:12px;
  line-height:1;
  cursor:pointer;
}
.dsd-segbtn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.dsd-segbtn.dsd-on{
  color:var(--dsw-alias-label-primary);
  border-color:var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-2);
}
.dsd-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 0}
.dsd-row-label{display:flex;flex-direction:column;min-width:0}
.dsd-row-hint{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:14px}
.dsd-switch{
  flex:none;
  width:30px;
  height:18px;
  padding:0;
  border:.5px solid var(--dsw-alias-border-l2);
  border-radius:999px;
  background:transparent;
  cursor:pointer;
  position:relative;
}
.dsd-switch:after{
  content:"";
  position:absolute;
  top:2px;
  left:2px;
  width:12px;
  height:12px;
  border-radius:50%;
  background:var(--dsw-alias-label-tertiary);
  transition:transform .12s var(--ds-ease-in-out), background-color .12s var(--ds-ease-in-out);
}
.dsd-switch.dsd-on{
  border-color:var(--dsw-alias-brand-primary);
  background:color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent);
}
.dsd-switch.dsd-on:after{
  transform:translateX(12px);
  background:var(--dsw-alias-brand-primary);
}
.dsd-reset{
  width:100%;
  height:24px;
  margin-top:6px;
  border:.5px solid var(--dsw-alias-border-l1);
  border-radius:6px;
  background:transparent;
  color:var(--dsw-alias-label-tertiary);
  font:inherit;
  font-size:11px;
  cursor:pointer;
}
.dsd-reset:hover{color:var(--dsw-alias-label-primary)}
.dsd-panel{display:flex;flex-direction:column;gap:2px;max-width:420px}
.dsd-panel-title{margin:0 0 6px;font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsd-tools{margin-top:6px;padding-top:6px;border-top:.5px solid var(--dsw-alias-border-l1)}
.dsd-tool{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  width:100%;
  box-sizing:border-box;
  height:26px;
  margin-bottom:4px;
  padding:0 6px;
  border:.5px solid var(--dsw-alias-border-l1);
  border-radius:6px;
  background:transparent;
  color:var(--dsw-alias-label-primary);
  font:inherit;
  font-size:12px;
  line-height:1;
  white-space:nowrap;
  cursor:pointer;
}
.dsd-tool:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.dsd-tool-hint{color:var(--dsw-alias-label-tertiary);font-size:10px}

/* 侧栏收成 56px 图标栏：只留入口图标，面板不展开。 */
[data-sidebar-collapsed] .dsd-bar{justify-content:center;padding:0}
[data-sidebar-collapsed] .dsd-bar .dsd-entry{width:36px;height:36px;padding:0;border:none;background:0 0}
[data-sidebar-collapsed] .dsd-bar .dsd-entry-label{display:none}
[data-sidebar-collapsed] .dsd-bar .dsd-quick{display:none}
[data-sidebar-collapsed] .dsd-bar .dsd-pop{display:none}

/* ── 收纳：导入会话与移动访问并入入口条 ──────────────────────────────── */
/* 两个原生 footer 按钮仍由各自插件渲染与拥有；这里只把它们藏起来，入口条里的
   快捷按钮替用户点它们（chat-import 优先走 sidebarRight 服务）。
   chat-import 的触发器带 inline display，普通规则压不过，必须 !important。
   aria-label 规则是第二道网（语言相关），但必须排除本插件自己的按钮——它们的
   aria-label 恰好也叫「导入会话」。 */
[data-dsd-folded]{display:none!important}
[data-slot="sidebar.footer.action"] button[aria-label="导入会话"]:not([class*="dsd-"]),
[data-slot="sidebar.footer.action"] button[aria-label="Import Sessions"]:not([class*="dsd-"]),
[data-slot="sidebar.footer.action"] [class*="dsh-mobile-control__trigger"],
[class*="footerActions"] [class*="dsh-mobile-control__trigger"]{
  display:none!important;
}

/* ── 开关一：全局面板导航 竖排 N 行 → 横排一行图标 ────────────────────── */
html[${TOGGLES[0].attr}="${TOGGLES[0].on}"] nav[class*="panelList"]{
  flex-direction:row;
  flex-wrap:wrap;
  gap:6px;
  margin-bottom:8px;
}
html[${TOGGLES[0].attr}="${TOGGLES[0].on}"] nav[class*="panelList"] [class*="panelRow"]{
  width:36px;
  min-width:36px;
  min-height:32px;
  margin:0;
  padding:0;
  justify-content:center;
}
html[${TOGGLES[0].attr}="${TOGGLES[0].on}"] nav[class*="panelList"] [class*="panelTitle"]{
  display:none;
}

/* ── 开关二：费用卡 整卡 → 只留首行 ──────────────────────────────────── */
html[${TOGGLES[1].attr}="${TOGGLES[1].on}"] [data-slot="sidebar.footer.action"] [class*="cm-footer-stack"],
html[${TOGGLES[1].attr}="${TOGGLES[1].on}"] [class*="footerActions"] [class*="cm-footer-stack"]{
  max-height:34px;
  overflow:hidden;
}

/* ── 开关三：品牌行 60px → 32px（只留标志与折叠按钮） ────────────────── */
html[${TOGGLES[2].attr}="${TOGGLES[2].on}"] ${COLUMN} > [class*="logoRow"]{
  height:32px;
  margin-bottom:2px;
  padding:2px 0;
}
html[${TOGGLES[2].attr}="${TOGGLES[2].on}"] ${COLUMN} > [class*="logoRow"] [class*="brandName"]{
  display:none;
}

/* ── 开关四：新会话按钮 38px → 26px（文字让位给图标） ────────────────── */
html[${TOGGLES[3].attr}="${TOGGLES[3].on}"] ${COLUMN} > [class*="newSession"]{
  height:26px;
  margin-bottom:6px;
  padding:2px 8px;
}
html[${TOGGLES[3].attr}="${TOGGLES[3].on}"] ${COLUMN} > [class*="newSession"] [class*="newSessionLabel"]{
  display:none;
}

/* ── 开关五：「工作区」标题行 36px → 26px ────────────────────────────── */
html[${TOGGLES[4].attr}="${TOGGLES[4].on}"] [class*="sectionHeader"]{
  height:26px;
  margin-top:0;
  margin-bottom:2px;
}

/* ── 密度预设：紧凑 ──────────────────────────────────────────────────── */
html[${PRESET_ATTR}="compact"] ${COLUMN_WIDE}{
  --dsh-sidebar-inline-padding:10px;
  font-size:13px;
  padding-top:4px;
  padding-bottom:4px;
}
html[${PRESET_ATTR}="compact"] ${COLUMN_WIDE} > [class*="logoRow"]{
  height:48px;
  margin-bottom:2px;
  padding:4px 0;
}
html[${PRESET_ATTR}="compact"] ${COLUMN_WIDE} > [class*="newSession"]{
  height:32px;
  margin-bottom:8px;
  padding:5px 8px;
  font-size:13px;
}
html[${PRESET_ATTR}="compact"] ${COLUMN_WIDE} > nav[class*="panelList"]{
  gap:2px;
  margin-bottom:6px;
}
html[${PRESET_ATTR}="compact"] ${COLUMN_WIDE} > nav[class*="panelList"] > [class*="panelRow"]{
  min-height:30px;
  padding:4px 6px;
  line-height:18px;
}
html[${PRESET_ATTR}="compact"] [class*="sectionHeader"]{
  height:28px;
  margin-top:0;
  margin-bottom:2px;
}

/* ── 密度预设：舒适 ──────────────────────────────────────────────────── */
html[${PRESET_ATTR}="comfortable"] ${COLUMN_WIDE}{
  --dsh-sidebar-inline-padding:14px;
  font-size:15px;
  padding-top:8px;
  padding-bottom:8px;
}
html[${PRESET_ATTR}="comfortable"] ${COLUMN_WIDE} > [class*="logoRow"]{
  height:64px;
  margin-bottom:6px;
  padding:10px 0;
}
html[${PRESET_ATTR}="comfortable"] ${COLUMN_WIDE} > [class*="newSession"]{
  height:42px;
  margin-bottom:14px;
  padding:10px 12px;
  font-size:15px;
}
html[${PRESET_ATTR}="comfortable"] ${COLUMN_WIDE} > nav[class*="panelList"]{
  gap:6px;
  margin-bottom:10px;
}
html[${PRESET_ATTR}="comfortable"] ${COLUMN_WIDE} > nav[class*="panelList"] > [class*="panelRow"]{
  min-height:38px;
  padding:8px 10px;
}
html[${PRESET_ATTR}="comfortable"] [class*="sectionHeader"]{
  height:42px;
  margin-bottom:6px;
}

/* ── 侧栏宽度预设 ────────────────────────────────────────────────────── */
/* 宿主把列宽写成 frame 的 inline grid-template-columns，官方 layout 服务不
   暴露设宽度；这里只在三列都可预测时覆盖第一列：右栏无轨道（关闭）、非折叠、
   非右栏全屏。拖分隔条时插件会把宽度设回 auto。 */
html[${WIDTH_ATTR}="narrow"] [class*="_frame"]:not([data-sidebar-collapsed]):not([data-rightbar-fullscreen]):not(:has([data-sidebar-right-open])){
  grid-template-columns:264px minmax(400px,1fr) minmax(0px,0px)!important;
}
html[${WIDTH_ATTR}="wide"] [class*="_frame"]:not([data-sidebar-collapsed]):not([data-rightbar-fullscreen]):not(:has([data-sidebar-right-open])){
  grid-template-columns:320px minmax(400px,1fr) minmax(0px,0px)!important;
}

/* 右栏展开时预设只调内容字号（tab 栏与正文一起变），不动它的布局。 */
html[${PRESET_ATTR}="compact"] [data-sidebar-right-panel]{font-size:12.5px}
html[${PRESET_ATTR}="comfortable"] [data-sidebar-right-panel]{font-size:14.5px}
`

    // ------------------------------------------------------------------ 文案

    const DICTS = {
      zh: {
        'entry.label': '设置',
        'entry.title': '侧栏密度',
        'section.title': '侧栏密度',
        'preset.label': '密度预设',
        'preset.standard': '标准',
        'preset.compact': '紧凑',
        'preset.comfortable': '舒适',
        'width.label': '侧栏宽度',
        'width.auto': '自动',
        'width.narrow': '窄',
        'width.wide': '宽',
        reset: '恢复默认',
        'launcher.group': '工具入口',
        'launcher.import': '导入会话',
        'launcher.importHint': '右栏打开导入',
        'launcher.mobile': '移动访问',
        'launcher.mobileHint': '扫码 / 移动端接入',
        'quick.import': '导入',
        'quick.mobile': '移动',
        't.nav': '导航',
        't.navHint': '面板导航横排一行图标',
        't.bill': '账单',
        't.billHint': '费用卡只留首行',
        't.brand': '品牌行',
        't.brandHint': '品牌行压到 32px',
        't.newSession': '新会话',
        't.newSessionHint': '按钮压到 26px，只留图标',
        't.header': '区标题',
        't.headerHint': '「工作区」标题行压到 26px',
      },
      en: {
        'entry.label': 'Settings',
        'entry.title': 'Sidebar density',
        'section.title': 'Sidebar density',
        'preset.label': 'Density preset',
        'preset.standard': 'Standard',
        'preset.compact': 'Compact',
        'preset.comfortable': 'Roomy',
        'width.label': 'Sidebar width',
        'width.auto': 'Auto',
        'width.narrow': 'Narrow',
        'width.wide': 'Wide',
        reset: 'Reset',
        'launcher.group': 'Tools',
        'launcher.import': 'Import sessions',
        'launcher.importHint': 'Open import in the right bar',
        'launcher.mobile': 'Mobile access',
        'launcher.mobileHint': 'QR / mobile access',
        'quick.import': 'Import',
        'quick.mobile': 'Mobile',
        't.nav': 'Nav',
        't.navHint': 'Panel nav as one icon row',
        't.bill': 'Cost',
        't.billHint': 'Keep only the cost card header',
        't.brand': 'Brand row',
        't.brandHint': 'Fold the brand row to 32px',
        't.newSession': 'New session',
        't.newSessionHint': 'Fold the button to 26px, icon only',
        't.header': 'Section title',
        't.headerHint': 'Fold the workspace header to 26px',
      },
    }

    /** Current UI language, read from the document the shell already sets. */
    function language() {
      try {
        const tag = String(document.documentElement.lang || navigator.language || '')
        return tag.toLowerCase().startsWith('zh') ? 'zh' : 'en'
      } catch {
        return 'zh'
      }
    }

    /** Translate one key; unknown keys fall through as-is. */
    function t(key) {
      const dict = DICTS[language()] ?? DICTS.zh
      return dict[key] ?? key
    }

    // ------------------------------------------------------------------ 状态

    /** Collapse anything unreadable or out of range to the stock value. */
    function normalizeState(raw) {
      const out = {
        preset: 'standard',
        width: 'auto',
        toggles: Object.fromEntries(TOGGLE_KEYS.map((key) => [key, false])),
      }
      if (raw === null || typeof raw !== 'object') return out
      if (PRESETS.includes(raw.preset)) out.preset = raw.preset
      if (WIDTHS.includes(raw.width)) out.width = raw.width
      const toggles = raw.toggles
      if (toggles !== null && typeof toggles === 'object') {
        for (const key of TOGGLE_KEYS) out.toggles[key] = toggles[key] === true
      }
      return out
    }

    /** v1 stored `{ nav, bill }` with the attribute values; map the two on. */
    function migrateLegacy(raw) {
      if (raw === null || typeof raw !== 'object') return null
      return normalizeState({
        toggles: { nav: raw.nav === 'icons', bill: raw.bill === 'single' },
      })
    }

    /** Persist the state. A blocked localStorage must not break the UI. */
    function persist(next) {
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(next))
        window.localStorage.removeItem(LEGACY_KEY)
      } catch {
        /* private mode / quota: the switches still work for this page life */
      }
    }

    /** Read the persisted state, migrating v1 on sight. */
    function readState() {
      try {
        const raw = window.localStorage.getItem(STORE_KEY)
        if (raw !== null) {
          try {
            return normalizeState(JSON.parse(raw))
          } catch {
            return normalizeState(null)
          }
        }
        const legacy = window.localStorage.getItem(LEGACY_KEY)
        if (legacy !== null) {
          try {
            const migrated = migrateLegacy(JSON.parse(legacy))
            if (migrated !== null) {
              persist(migrated)
              return migrated
            }
          } catch {
            /* fall through to stock */
          }
        }
      } catch {
        /* private mode: stock look for this page life */
      }
      return normalizeState(null)
    }

    /** Push the state onto `<html>`; absent attribute = stock look. */
    function applyAttrs(next) {
      const root = document.documentElement
      if (next.preset === 'standard') root.removeAttribute(PRESET_ATTR)
      else root.setAttribute(PRESET_ATTR, next.preset)
      if (next.width === 'auto') root.removeAttribute(WIDTH_ATTR)
      else root.setAttribute(WIDTH_ATTR, next.width)
      for (const row of TOGGLES) {
        if (next.toggles[row.key] === true) root.setAttribute(row.attr, row.on)
        else root.removeAttribute(row.attr)
      }
    }

    /** Remove every attribute this plugin owns (dispose path). */
    function clearAttrs() {
      const root = document.documentElement
      root.removeAttribute(PRESET_ATTR)
      root.removeAttribute(WIDTH_ATTR)
      for (const row of TOGGLES) root.removeAttribute(row.attr)
    }

    /** Live state; `null` until the first component asks (or apply runs). */
    let state = null

    /** Current state, initializing from storage on first use. */
    function getState() {
      if (state === null) state = readState()
      return state
    }

    /** Commit one state object: normalize, reflect, persist, return it. */
    function commit(next) {
      state = normalizeState(next)
      applyAttrs(state)
      persist(state)
      return state
    }

    // ------------------------------------------------------------------ 收纳入口

    /**
     * Host context captured in `apply`, used to reach the native right-bar
     * service from the import launcher. Never stored on the DOM.
     */
    let hostCtx = null

    /** Marker the sheet keys off to hide an entry the bar has taken over. */
    const FOLDED_ATTR = 'data-dsd-folded'
    /** Language-independent test for the chat-import trigger's text/label. */
    const IMPORT_TEXT = /导入|Import/i
    /** The dsh-mobile control trigger; its class is stable (no build hash). */
    const MOBILE_SELECTOR = '[class*="dsh-mobile-control__trigger"]'

    /** The two entries the bar offers as shortcuts. */
    const LAUNCHERS = [
      { key: 'import', label: 'launcher.import', hint: 'launcher.importHint' },
      { key: 'mobile', label: 'launcher.mobile', hint: 'launcher.mobileHint' },
    ]

    /** Every button the host currently renders in the sidebar foot. */
    function footerButtons() {
      if (typeof document.querySelectorAll !== 'function') return []
      const found = []
      for (const selector of [
        '[data-slot="sidebar.footer.action"] button',
        '[class*="footerActions"] button',
      ]) {
        try {
          for (const node of document.querySelectorAll(selector)) found.push(node)
        } catch {
          /* invalid selector: skip */
        }
      }
      return found
    }

    /** True when the button is one of our own bar entries. */
    function isOwnButton(node) {
      try {
        return typeof node.closest === 'function' && node.closest('[data-dsd-bar]') !== null
      } catch {
        return false
      }
    }

    /** aria-label + visible text, for a language-tolerant match. */
    function buttonText(node) {
      let label = ''
      try {
        label = node.getAttribute?.('aria-label') ?? ''
      } catch {
        /* ignore */
      }
      const text = typeof node.textContent === 'string' ? node.textContent : ''
      return `${label} ${text}`
    }

    /** The chat-import trigger currently on the page, if any. */
    function findImportButton() {
      return (
        footerButtons().find(
          (node) => isOwnButton(node) === false && IMPORT_TEXT.test(buttonText(node)),
        ) ?? null
      )
    }

    /**
     * Hide every footer entry the bar has taken over.
     *
     * Idempotent and cheap: called at install time and on each render of the
     * bar. Matching on text rather than an aria-label keeps it working in any
     * UI language and across chat-import renames of its own label.
     */
    function markFoldedEntries() {
      for (const node of footerButtons()) {
        if (isOwnButton(node)) continue
        if (!IMPORT_TEXT.test(buttonText(node))) continue
        if (typeof node.setAttribute === 'function') node.setAttribute(FOLDED_ATTR, '')
      }
    }

    /** Drop the marker so a disposed plugin leaves the footer as it found it. */
    function clearFoldedEntries() {
      for (const node of footerButtons()) {
        if (typeof node.removeAttribute === 'function') node.removeAttribute(FOLDED_ATTR)
      }
    }

    /**
     * Keep fold targets marked while the footer mounts and re-renders.
     *
     * chat-import only renders its trigger after its preferences load, so the
     * first pass at install time can easily miss it. Observe the footer (or the
     * body until the footer exists), then move the observer onto the footer as
     * soon as it appears. `attributeFilter` only watches aria-label, so our own
     * marker writes never feed the observer.
     */
    let watchedFooter = null

    function watchFooter() {
      if (typeof MutationObserver !== 'function') return null
      const observer = new MutationObserver(() => {
        markFoldedEntries()
        const footer = findElement(['[class*="footerActions"]'])
        if (footer !== null && footer !== observedTarget()) {
          observer.disconnect()
          try {
            observer.observe(footer, FOLD_OPTIONS)
            watchedFooter = footer
          } catch {
            /* keep the body observer */
          }
        }
      })
      const footer = findElement(['[class*="footerActions"]'])
      const target = footer ?? document.body
      if (target === null || target === undefined) return null
      try {
        observer.observe(target, FOLD_OPTIONS)
        watchedFooter = target
        return observer
      } catch {
        return null
      }
    }

    const FOLD_OPTIONS = Object.freeze({
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label'],
    })

    function observedTarget() {
      return watchedFooter
    }

    /** First element matching any selector; a malformed selector just skips. */
    function findElement(selectors) {
      if (typeof document.querySelector !== 'function') return null
      for (const selector of selectors) {
        try {
          const element = document.querySelector(selector)
          if (element !== null && element !== undefined) return element
        } catch {
          /* invalid selector: keep looking */
        }
      }
      return null
    }

    /** Replay the original footer button's click. */
    function clickOriginal(selectors) {
      const element = findElement(selectors)
      if (element === null || typeof element.click !== 'function') return false
      element.click()
      return true
    }

    /**
     * Open the import tab.
     *
     * Preferred path is the native right-bar service (`openTab('chat-import')`,
     * the same call chat-import's own button makes); the original button's
     * click is the fallback for a host where the service is not exposed.
     */
    function openImport() {
      const service = hostCtx?.get?.('sidebarRight')
      if (service !== null && service !== undefined && typeof service.openTab === 'function') {
        try {
          service.openTab('chat-import')
          return true
        } catch {
          /* fall through to the button */
        }
      }
      const button = findImportButton()
      if (button !== null && typeof button.click === 'function') {
        button.click()
        return true
      }
      return false
    }

    /** Open the mobile-access panel by replaying its trigger. */
    function openMobile() {
      return clickOriginal([MOBILE_SELECTOR])
    }

    /** Which folded entries exist on this page (plugins differ per profile). */
    function launcherAvailability() {
      return {
        import:
          findImportButton() !== null || hostCtx?.get?.('sidebarRight') !== undefined,
        mobile: findElement([MOBILE_SELECTOR]) !== null,
      }
    }

    // ------------------------------------------------------------------ 控件

    /**
     * Read the live state in a component and hand back a setter.
     *
     * Deliberately local rather than a global subscription: the footer popover
     * and the settings section are never visible at the same time, and a
     * subscription would need effect cleanup the host's hook runtime does not
     * guarantee. One mount, one local copy.
     */
    function useDensity() {
      const [local, setLocal] = React.useState(getState)
      const change = (next) => {
        setLocal(commit(next))
      }
      return [local, change]
    }

    /** One segmented choice row (preset / width). */
    function Segmented({ label, values, active, onPick, labelKey }) {
      return h(
        'div',
        { className: 'dsd-seg', role: 'group', 'aria-label': label },
        values.map((value) =>
          h(
            'button',
            {
              key: value,
              type: 'button',
              className: active === value ? 'dsd-segbtn dsd-on' : 'dsd-segbtn',
              'aria-pressed': active === value,
              onClick: () => onPick(value),
            },
            t(labelKey(value)),
          ),
        ),
      )
    }

    /** One switch row. */
    function SwitchRow({ row, on, onToggle }) {
      return h(
        'div',
        { className: 'dsd-row' },
        h(
          'span',
          { className: 'dsd-row-label' },
          h('span', {}, t(`t.${row.key}`)),
          h('span', { className: 'dsd-row-hint' }, t(`t.${row.key}Hint`)),
        ),
        h('button', {
          type: 'button',
          role: 'switch',
          className: on ? 'dsd-switch dsd-on' : 'dsd-switch',
          'aria-checked': on,
          'aria-label': t(`t.${row.key}`),
          onClick: () => onToggle(row.key),
        }),
      )
    }

    /** The shared control stack (footer popover + settings section). */
    function DensityControls({ current, change, onLaunched, showTools }) {
      const availability = showTools === true ? launcherAvailability() : { import: false, mobile: false }
      const launch = (key) => {
        if (key === 'import') openImport()
        else openMobile()
        if (typeof onLaunched === 'function') onLaunched()
      }
      const tools = LAUNCHERS.filter((row) => availability[row.key] === true).map((row) =>
        h(
          'button',
          {
            key: row.key,
            type: 'button',
            className: 'dsd-tool',
            'aria-label': t(row.label),
            title: t(row.hint),
            onClick: () => launch(row.key),
          },
          h('span', {}, t(row.label)),
          h('span', { className: 'dsd-tool-hint' }, t(row.hint)),
        ),
      )
      const toggle = (key) => {
        const toggles = { ...current.toggles, [key]: !current.toggles[key] }
        change({ ...current, toggles })
      }
      return h(
        'div',
        { className: 'dsd-panel' },
        h('div', { className: 'dsd-seg-label' }, t('preset.label')),
        Segmented({
          label: t('preset.label'),
          values: PRESETS,
          active: current.preset,
          onPick: (preset) => change({ ...current, preset }),
          labelKey: (value) => `preset.${value}`,
        }),
        h('div', { className: 'dsd-seg-label' }, t('width.label')),
        Segmented({
          label: t('width.label'),
          values: WIDTHS,
          active: current.width,
          onPick: (width) => change({ ...current, width }),
          labelKey: (value) => `width.${value}`,
        }),
        TOGGLES.map((row) =>
          SwitchRow({
            key: row.key,
            row,
            on: current.toggles[row.key] === true,
            onToggle: toggle,
          }),
        ),
        tools.length > 0 &&
          h(
            'div',
            { className: 'dsd-tools' },
            h('div', { className: 'dsd-seg-label' }, t('launcher.group')),
            tools,
          ),
        h(
          'button',
          {
            type: 'button',
            className: 'dsd-reset',
            onClick: () => change(DEFAULT_STATE),
          },
          t('reset'),
        ),
      )
    }

    /**
     * The foot entry: one button that opens the popover.
     *
     * Kept deliberately dumb: one piece of local open state, and the shared
     * control stack. A control that can fail inside the sidebar foot would take
     * the shipped footer with it.
     */
    function DensityEntry() {
      const [current, change] = useDensity()
      const [open, setOpen] = React.useState(false)

      React.useEffect(() => {
        if (!open) return undefined
        const closeOnOutside = (event) => {
          const target = event?.target
          if (
            target !== null &&
            typeof target?.closest === 'function' &&
            target.closest('[data-dsd-bar]') !== null
          ) {
            return
          }
          setOpen(false)
        }
        if (typeof document.addEventListener === 'function') {
          document.addEventListener('pointerdown', closeOnOutside, true)
          return () => {
            if (typeof document.removeEventListener === 'function') {
              document.removeEventListener('pointerdown', closeOnOutside, true)
            }
          }
        }
        return undefined
      }, [open])

      const availability = launcherAvailability()
      markFoldedEntries()
      return h(
        'div',
        { className: 'dsd-bar', 'data-dsd-bar': '' },
        h(
          'button',
          {
            type: 'button',
            className: open ? 'dsd-entry dsd-on' : 'dsd-entry',
            'aria-expanded': open,
            'aria-haspopup': 'dialog',
            title: t('entry.title'),
            onClick: () => setOpen((value) => !value),
          },
          h('span', { className: 'dsd-entry-label' }, t('entry.label')),
        ),
        availability.import &&
          h(
            'button',
            {
              type: 'button',
              className: 'dsd-entry dsd-quick',
              'aria-label': t('launcher.import'),
              title: t('launcher.importHint'),
              onClick: openImport,
            },
            t('quick.import'),
          ),
        availability.mobile &&
          h(
            'button',
            {
              type: 'button',
              className: 'dsd-entry dsd-quick',
              'aria-label': t('launcher.mobile'),
              title: t('launcher.mobileHint'),
              onClick: openMobile,
            },
            t('quick.mobile'),
          ),
        open &&
          h(
            'div',
            { className: 'dsd-pop', role: 'dialog', 'aria-label': t('entry.title') },
            h(
              'div',
              { className: 'dsd-pop-head' },
              h('span', {}, t('entry.title')),
              h('span', { className: 'dsd-ver' }, `v${VERSION}`),
            ),
            DensityControls({ current, change, onLaunched: () => setOpen(false) }),
          ),
      )
    }

    /** The settings section: the same stack, as a normal preference page. */
    function DensityPanel() {
      const [current, change] = useDensity()
      return h(
        'div',
        { className: 'dsd-panel' },
        h(
          'h3',
          { className: 'dsd-panel-title' },
          t('section.title'),
          h('span', { className: 'dsd-ver' }, ` v${VERSION}`),
        ),
        DensityControls({ current, change, showTools: true }),
      )
    }

    // ------------------------------------------------------------------ apply

    /** Install the sheet once, reflect the stored state, and arm the width escape hatch. */
    function installStyles() {
      if (document.getElementById(STYLE_ID) === null) {
        const tag = document.createElement('style')
        tag.id = STYLE_ID
        tag.dataset.plugin = 'dsh-sidebar-density'
        tag.textContent = CSS
        document.head.appendChild(tag)
      }

      /* Reflect the stored choice before any component mounts, so the sidebar
         never paints one frame in the stock look first. */
      applyAttrs(getState())
      markFoldedEntries()
      const footerWatch = watchFooter()

      /* The width preset overrides the host's inline grid track. The moment the
         user grabs the resize handle, hand control back to the host layout. */
      const onPointerDown = (event) => {
        const target = event?.target
        if (target === null || typeof target?.closest !== 'function') return
        if (target.closest('[class*="_handle"]') === null) return
        if (getState().width === 'auto') return
        commit({ ...getState(), width: 'auto' })
      }
      if (typeof document.addEventListener === 'function') {
        document.addEventListener('pointerdown', onPointerDown, true)
      }

      return () => {
        document.getElementById(STYLE_ID)?.remove()
        if (typeof document.removeEventListener === 'function') {
          document.removeEventListener('pointerdown', onPointerDown, true)
        }
        footerWatch?.disconnect?.()
        clearAttrs()
        clearFoldedEntries()
        state = null
        hostCtx = null
      }
    }

    return {
      inject: ['slots'],

      apply(ctx) {
        hostCtx = ctx
        ctx.effect(installStyles, 'dsh-sidebar-density: styles')
        ctx.slots.inject(FOOTER_SLOT, () =>
          ctx.slots.register(
            {
              name: FOOTER_SLOT,
              id: FOOTER_ID,
              order: FOOTER_ORDER,
              label: () => t('entry.title'),
            },
            DensityEntry,
          ),
        )
        ctx.slots.inject(SECTION_SLOT, () =>
          ctx.slots.register(
            {
              name: SECTION_SLOT,
              id: SECTION_ID,
              order: SECTION_ORDER,
              label: () => t('section.title'),
            },
            DensityPanel,
          ),
        )
      },
    }
  },
})
