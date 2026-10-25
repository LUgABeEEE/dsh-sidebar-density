/**
 * dsh-sidebar-density — smoke test.
 *
 * The client half runs in a browser, but almost none of it needs a browser: it
 * is a module registration, one stylesheet, one foot entry and one settings
 * section. This test provides the smallest fake of `window` / `document` /
 * `react` that the file actually touches, mounts the controls through a
 * synchronous hook runtime, and then asserts the contract the sidebar depends
 * on:
 *
 *  1. the bundle self-registers under the expected module id;
 *  2. `apply` installs the sheet once and contributes to the two shipped seats
 *     (`sidebar.footer.action`, `settings.section`);
 *  3. the sheet is inert by default — no attribute, stock sidebar;
 *  4. the foot popover carries every preset, width and switch;
 *  5. picking a choice flips `<html>` and persists the v2 state;
 *  6. a v1 record is migrated, malformed records fall back to stock;
 *  7. disposing the effect removes the sheet *and* every attribute;
 *  8. grabbing the resize handle hands the width back to the host layout.
 *
 * What it deliberately does not cover: real CSS cascade, `:has()` matching and
 * real layout. Those are verified against the running GUI, not here.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_PATH = path.join(HERE, '..', 'lib', 'client.js')
const SOURCE = readFileSync(CLIENT_PATH, 'utf8')

const MODULE_ID = 'dsh-sidebar-density'
const STORE_KEY = 'dsh-sidebar-density/v2'
const LEGACY_KEY = 'dsh-sidebar-density/v1'
const TOGGLE_ATTRS = [
  'data-dsd-nav',
  'data-dsd-bill',
  'data-dsd-brand',
  'data-dsd-new',
  'data-dsd-header',
]
const PRESET_ATTR = 'data-dsd-preset'
const WIDTH_ATTR = 'data-dsd-width'

/** Minimal element: an id, a dataset bag, text, a parent-aware remove(). */
function createElement(tag) {
  return {
    tagName: String(tag).toUpperCase(),
    id: '',
    dataset: {},
    textContent: '',
    children: [],
    parent: null,
    closest: () => null,
    appendChild(child) {
      child.parent = this
      this.children.push(child)
      return child
    },
    remove() {
      if (this.parent === null) return
      const at = this.parent.children.indexOf(this)
      if (at >= 0) this.parent.children.splice(at, 1)
      this.parent = null
    },
  }
}

/** Fresh DOM + storage + listener registry + module-loader capture. */
function createDom() {
  const head = createElement('head')
  const html = createElement('html')
  html.lang = 'zh-CN'
  html.attributes = new Map()
  html.setAttribute = (name, value) => html.attributes.set(name, String(value))
  html.removeAttribute = (name) => html.attributes.delete(name)
  html.getAttribute = (name) => (html.attributes.has(name) ? html.attributes.get(name) : null)

  const store = new Map()
  const listeners = new Map()
  const document = {
    documentElement: html,
    head,
    createElement,
    getElementById: (id) => head.children.find((child) => child.id === id) ?? null,
    querySelector: () => null,
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, [])
      listeners.get(type).push(fn)
    },
    removeEventListener: (type, fn) => {
      const rows = listeners.get(type) ?? []
      listeners.set(
        type,
        rows.filter((row) => row !== fn),
      )
    },
  }
  const window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
  }
  return {
    document,
    window,
    store,
    html,
    head,
    /** Fire every listener registered for one DOM event type. */
    dispatch: (type, event) => {
      for (const fn of listeners.get(type) ?? []) fn(event)
    },
  }
}

/**
 * Synchronous React stand-in: enough for a component with `useState`,
 * `useEffect` and `useCallback` that never suspends. Effects run once per
 * render, immediately after it.
 */
function createReact() {
  let slots = []
  let cursor = 0
  let effects = []
  let tree = null
  let component = null

  const rerender = () => {
    cursor = 0
    effects = []
    tree = component({})
    const batch = effects
    effects = []
    for (const effect of batch) effect()
    return tree
  }

  return {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...(props ?? {}), children: children.length === 1 ? children[0] : children },
      children,
    }),
    useState(initial) {
      const at = cursor++
      if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial
      const set = (next) => {
        slots[at] = typeof next === 'function' ? next(slots[at]) : next
        rerender()
      }
      return [slots[at], set]
    },
    useEffect(effect) {
      effects.push(effect)
      cursor += 1
    },
    useCallback(fn) {
      cursor += 1
      return fn
    },
    install: (fn) => {
      component = fn
      return () => rerender()
    },
    get tree() {
      return tree
    },
  }
}

/** Load the bundle in a fresh VM context and hand back its registration. */
function loadBundle() {
  const dom = createDom()
  const react = createReact()
  const registrations = []
  const context = {
    window: dom.window,
    document: dom.document,
    navigator: { language: 'zh-CN' },
    console,
  }
  context.window.__ModuleLoader__ = {
    load: (declaration) => registrations.push(declaration),
  }
  vm.createContext(context)
  vm.runInContext(SOURCE, context, { filename: CLIENT_PATH })
  assert.equal(registrations.length, 1, 'bundle must self-register exactly once')
  const [declaration] = registrations
  const plugin = declaration.factory((id) => {
    if (id === 'react') return react
    throw new Error(`unexpected require(${id})`)
  })
  return { dom, react, declaration, plugin }
}

/** Fake client context capturing effects and slot registrations. */
function createCtx() {
  const effects = []
  const registrations = []
  const injections = []
  return {
    effects,
    registrations,
    injections,
    ctx: {
      get() {
        return undefined
      },
      effect(fn, label) {
        effects.push({ label, dispose: fn() })
        return () => {}
      },
      slots: {
        inject(name, register) {
          injections.push(name)
          register()
        },
        register(options, Component) {
          registrations.push({ options, Component })
          return () => {}
        },
      },
    },
  }
}

/** Depth-first walk over a rendered element tree. */
function walk(node, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out)
    return out
  }
  if (node.type !== undefined) {
    out.push(node)
    walk(node.props?.children, out)
  }
  return out
}

/** Find a button by visible text, aria-label or title. */
function findButton(tree, label) {
  return walk(tree).find(
    (node) =>
      node.type === 'button' &&
      (node.props.children === label ||
        node.props['aria-label'] === label ||
        node.props.title === label),
  )
}

/** Mount the registered component and return the renderer + first tree. */
function mount(registration, react) {
  const render = react.install(registration.Component)
  return { tree: render(), render }
}

/** Open the foot popover, returning its rendered tree. */
function openPopover(registration, react) {
  const { tree } = mount(registration, react)
  findButton(tree, '侧栏密度').props.onClick()
  return react.tree
}

test('bundle self-registers under its module id', () => {
  const { declaration } = loadBundle()
  assert.equal(declaration.id, MODULE_ID)
  assert.equal(typeof declaration.factory, 'function')
})

test('apply fills the foot seat and the settings section, and owns one effect', () => {
  const { plugin } = loadBundle()
  assert.deepEqual([...plugin.inject], ['slots'])

  const { ctx, injections, registrations, effects } = createCtx()
  plugin.apply(ctx)

  assert.deepEqual(injections, ['sidebar.footer.action', 'settings.section'])
  assert.equal(registrations.length, 2)
  assert.equal(registrations[0].options.name, 'sidebar.footer.action')
  assert.equal(registrations[0].options.id, 'sidebar-density')
  assert.ok(registrations[0].options.order < 0, 'the foot entry sorts above the cost card')
  assert.equal(registrations[1].options.name, 'settings.section')
  assert.equal(registrations[1].options.id, 'sidebar-density')
  assert.equal(typeof registrations[1].options.label, 'function')
  assert.equal(effects.length, 1, 'apply must own exactly one effect')
})

test('the sheet is installed into head, keyed, and carries every hook', () => {
  const { dom, plugin } = loadBundle()
  const { ctx } = createCtx()
  plugin.apply(ctx)

  const style = dom.head.children.find((child) => child.id === 'dsh-sidebar-density-css')
  assert.ok(style, 'the sheet must be appended to <head>')
  assert.equal(style.dataset.plugin, MODULE_ID)
  for (const hook of [
    'nav[class*="panelList"]',
    '[class*="panelRow"]',
    '[class*="panelTitle"]',
    '[class*="cm-footer-stack"]',
    '[data-slot="sidebar.footer.action"]',
    '[data-sidebar-collapsed] .dsd-bar',
    '[data-sidebar-right-panel]',
    '[class*="_frame"]',
    '--dsw-alias-label-secondary',
    '--dsh-sidebar-inline-padding',
  ]) {
    assert.ok(style.textContent.includes(hook), `sheet must contain ${hook}`)
  }
  for (const attr of TOGGLE_ATTRS) {
    assert.ok(style.textContent.includes(`html[${attr}=`), `sheet must key off ${attr}`)
  }
  assert.ok(style.textContent.includes(`html[${PRESET_ATTR}="compact"]`))
  assert.ok(style.textContent.includes(`html[${PRESET_ATTR}="comfortable"]`))
  assert.ok(style.textContent.includes(`html[${WIDTH_ATTR}="narrow"]`))
  assert.ok(style.textContent.includes(`html[${WIDTH_ATTR}="wide"]`))
  assert.ok(style.textContent.includes('grid-template-columns'))
})

test('apply reflects the stock state: no attribute on <html>', () => {
  const { dom, plugin } = loadBundle()
  const { ctx } = createCtx()
  plugin.apply(ctx)

  for (const attr of [...TOGGLE_ATTRS, PRESET_ATTR, WIDTH_ATTR]) {
    assert.equal(dom.html.getAttribute(attr), null, `${attr} must start absent`)
  }
})

test('the foot entry opens a popover with presets, widths and five switches', () => {
  const { react, plugin } = loadBundle()
  const { ctx, registrations } = createCtx()
  plugin.apply(ctx)

  const { tree } = mount(registrations[0], react)
  assert.ok(findButton(tree, '侧栏密度'), 'the foot entry must render')
  assert.equal(findButton(tree, '紧凑'), undefined, 'the popover starts closed')

  findButton(tree, '侧栏密度').props.onClick()
  const popover = react.tree

  for (const label of ['标准', '紧凑', '舒适', '自动', '窄', '宽', '恢复默认']) {
    assert.ok(findButton(popover, label), `popover must offer ${label}`)
  }
  for (const label of ['导航', '账单', '品牌行', '新会话', '区标题']) {
    assert.ok(findButton(popover, label), `popover must offer the ${label} switch`)
  }
  assert.equal(findButton(popover, '侧栏密度').props['aria-expanded'], true)
})

test('toggling a switch flips <html>, the aria state and the v2 record', () => {
  const { dom, react, plugin } = loadBundle()
  const { ctx, registrations } = createCtx()
  plugin.apply(ctx)

  let tree = openPopover(registrations[0], react)
  findButton(tree, '导航').props.onClick()

  assert.equal(dom.html.getAttribute('data-dsd-nav'), 'icons')
  let saved = JSON.parse(dom.store.get(STORE_KEY))
  assert.equal(saved.toggles.nav, true)
  assert.equal(saved.preset, 'standard')
  assert.equal(saved.width, 'auto')

  tree = react.tree
  assert.equal(findButton(tree, '导航').props['aria-checked'], true)
  assert.equal(findButton(tree, '账单').props['aria-checked'], false, 'switches stay independent')

  findButton(tree, '账单').props.onClick()
  assert.equal(dom.html.getAttribute('data-dsd-bill'), 'single')
  saved = JSON.parse(dom.store.get(STORE_KEY))
  assert.equal(saved.toggles.bill, true)
  assert.equal(saved.toggles.nav, true)

  tree = react.tree
  findButton(tree, '导航').props.onClick()
  assert.equal(dom.html.getAttribute('data-dsd-nav'), null, 'toggling back restores the stock look')
})

test('preset and width choices become standalone attributes', () => {
  const { dom, react, plugin } = loadBundle()
  const { ctx, registrations } = createCtx()
  plugin.apply(ctx)

  let tree = openPopover(registrations[0], react)
  findButton(tree, '紧凑').props.onClick()
  assert.equal(dom.html.getAttribute(PRESET_ATTR), 'compact')
  assert.equal(JSON.parse(dom.store.get(STORE_KEY)).preset, 'compact')

  tree = react.tree
  findButton(tree, '窄').props.onClick()
  assert.equal(dom.html.getAttribute(WIDTH_ATTR), 'narrow')
  assert.equal(JSON.parse(dom.store.get(STORE_KEY)).width, 'narrow')

  tree = react.tree
  findButton(tree, '还原'.replace('还原', '恢复默认')).props.onClick()
  assert.equal(dom.html.getAttribute(PRESET_ATTR), null, 'reset returns to the stock look')
  assert.equal(dom.html.getAttribute(WIDTH_ATTR), null)
})

test('the settings section renders the same controls', () => {
  const { react, plugin } = loadBundle()
  const { ctx, registrations } = createCtx()
  plugin.apply(ctx)

  const panel = registrations[1]
  const { tree } = mount(panel, react)
  for (const label of ['标准', '紧凑', '舒适', '导航', '账单', '品牌行', '新会话', '区标题']) {
    assert.ok(findButton(tree, label), `settings section must offer ${label}`)
  }
})

test('a persisted v2 choice is read back on mount', () => {
  const { dom, react, plugin } = loadBundle()
  dom.store.set(
    STORE_KEY,
    JSON.stringify({
      preset: 'compact',
      width: 'wide',
      toggles: { nav: true, bill: true, brand: true, newSession: true, header: true },
    }),
  )
  const { ctx, registrations } = createCtx()
  plugin.apply(ctx)

  assert.equal(dom.html.getAttribute(PRESET_ATTR), 'compact')
  assert.equal(dom.html.getAttribute(WIDTH_ATTR), 'wide')
  for (const attr of TOGGLE_ATTRS) {
    assert.notEqual(dom.html.getAttribute(attr), null, `${attr} must be restored`)
  }

  const tree = openPopover(registrations[0], react)
  assert.equal(findButton(tree, '导航').props['aria-checked'], true)
})

test('a v1 record migrates to v2 and is cleared afterwards', () => {
  const { dom, plugin } = loadBundle()
  dom.store.set(LEGACY_KEY, JSON.stringify({ nav: 'icons', bill: 'single' }))
  const { ctx } = createCtx()
  plugin.apply(ctx)

  assert.equal(dom.html.getAttribute('data-dsd-nav'), 'icons')
  assert.equal(dom.html.getAttribute('data-dsd-bill'), 'single')
  assert.equal(dom.store.has(LEGACY_KEY), false, 'the v1 record must be dropped')
  const saved = JSON.parse(dom.store.get(STORE_KEY))
  assert.equal(saved.toggles.nav, true)
  assert.equal(saved.toggles.bill, true)
  assert.equal(saved.preset, 'standard')
})

test('an unreadable or malformed record falls back to stock', () => {
  for (const raw of ['not json', 'null', '{"preset":"bogus","width":42,"toggles":{"nav":"yes"}}']) {
    const { dom, react, plugin } = loadBundle()
    dom.store.set(STORE_KEY, raw)
    const { ctx, registrations } = createCtx()
    plugin.apply(ctx)
    for (const attr of [...TOGGLE_ATTRS, PRESET_ATTR, WIDTH_ATTR]) {
      assert.equal(dom.html.getAttribute(attr), null, `raw: ${raw} / ${attr}`)
    }
    openPopover(registrations[0], react)
    assert.equal(findButton(react.tree, '导航').props['aria-checked'], false, `raw: ${raw}`)
  }
})

test('grabbing the resize handle hands the width back to the host layout', () => {
  const { dom, react, plugin } = loadBundle()
  const { ctx, registrations } = createCtx()
  plugin.apply(ctx)

  const tree = openPopover(registrations[0], react)
  findButton(tree, '窄').props.onClick()
  assert.equal(dom.html.getAttribute(WIDTH_ATTR), 'narrow')

  dom.dispatch('pointerdown', {
    target: { closest: (selector) => (selector.includes('_handle') ? {} : null) },
  })

  assert.equal(dom.html.getAttribute(WIDTH_ATTR), null, 'the override must stand down')
  assert.equal(JSON.parse(dom.store.get(STORE_KEY)).width, 'auto')
})

test('a pointerdown that is not on the handle leaves the width alone', () => {
  const { dom, react, plugin } = loadBundle()
  const { ctx, registrations } = createCtx()
  plugin.apply(ctx)

  const tree = openPopover(registrations[0], react)
  findButton(tree, '宽').props.onClick()
  assert.equal(dom.html.getAttribute(WIDTH_ATTR), 'wide')

  dom.dispatch('pointerdown', { target: { closest: () => null } })
  assert.equal(dom.html.getAttribute(WIDTH_ATTR), 'wide')
})

test('disposing the effect removes the sheet and every attribute', () => {
  const { dom, react, plugin } = loadBundle()
  const { ctx, effects, registrations } = createCtx()
  plugin.apply(ctx)

  const tree = openPopover(registrations[0], react)
  findButton(tree, '紧凑').props.onClick()
  findButton(react.tree, '导航').props.onClick()
  assert.equal(dom.html.getAttribute(PRESET_ATTR), 'compact')

  for (const effect of effects) effect.dispose()

  assert.equal(
    dom.head.children.find((child) => child.id === 'dsh-sidebar-density-css'),
    undefined,
    'the sheet must be gone',
  )
  for (const attr of [...TOGGLE_ATTRS, PRESET_ATTR, WIDTH_ATTR]) {
    assert.equal(dom.html.getAttribute(attr), null, `${attr} must be cleared`)
  }
  assert.equal(dom.store.get(STORE_KEY) !== undefined, true, 'the saved choice survives a dispose')
})

test('the sheet hides the import and mobile footer entries', () => {
  const { dom, plugin } = loadBundle()
  const { ctx } = createCtx()
  plugin.apply(ctx)
  const style = dom.head.children.find((child) => child.id === 'dsh-sidebar-density-css')
  assert.ok(style.textContent.includes('button[aria-label="导入会话"]'))
  assert.ok(style.textContent.includes('button[aria-label="Import Sessions"]'))
  assert.ok(style.textContent.includes('[class*="dsh-mobile-control__trigger"]'))
})

test('the foot bar offers density, import and mobile in one row', () => {
  const { dom, react, plugin } = loadBundle()
  dom.document.querySelector = () => ({ click() {} })
  const { ctx, registrations } = createCtx()
  plugin.apply(ctx)
  const { tree } = mount(registrations[0], react)
  assert.ok(findButton(tree, '侧栏密度'), 'the density entry must render')
  assert.ok(findButton(tree, '导入会话'), 'the import quick entry must render')
  assert.ok(findButton(tree, '移动访问'), 'the mobile quick entry must render')
  const bar = walk(tree).find((node) => node.props !== undefined && 'data-dsd-bar' in node.props)
  assert.ok(bar, 'the three entries must share one bar')
  assert.equal(bar.type, 'div')
})

test('an absent plugin leaves no quick entry behind', () => {
  const { react, plugin } = loadBundle()
  const { ctx, registrations } = createCtx()
  plugin.apply(ctx)
  const { tree } = mount(registrations[0], react)
  assert.ok(findButton(tree, '侧栏密度'), 'the density entry always renders')
  assert.equal(findButton(tree, '导入会话'), undefined)
  assert.equal(findButton(tree, '移动访问'), undefined)
})

test('the import quick entry prefers the native right-bar service', () => {
  const { dom, react, plugin } = loadBundle()
  const calls = []
  dom.document.querySelector = (selector) => ({ click: () => calls.push(selector) })
  const { ctx, registrations } = createCtx()
  ctx.get = (name) =>
    name === 'sidebarRight' ? { openTab: (id) => calls.push(`openTab:${id}`) } : undefined
  plugin.apply(ctx)

  const { tree } = mount(registrations[0], react)
  findButton(tree, '导入会话').props.onClick()
  assert.deepEqual(calls, ['openTab:chat-import'], 'the service wins over the DOM click')
})

test('the import quick entry falls back to clicking the original footer button', () => {
  const { dom, react, plugin } = loadBundle()
  const calls = []
  dom.document.querySelector = (selector) => ({ click: () => calls.push(selector) })
  const { ctx, registrations } = createCtx()
  plugin.apply(ctx)

  const { tree } = mount(registrations[0], react)
  findButton(tree, '导入会话').props.onClick()
  assert.equal(calls.length, 1)
  assert.ok(
    calls[0].includes('导入会话'),
    `expected the import trigger selector, got ${calls[0]}`,
  )
})

test('the mobile quick entry clicks the mobile trigger', () => {
  const { dom, react, plugin } = loadBundle()
  const calls = []
  dom.document.querySelector = (selector) => ({ click: () => calls.push(selector) })
  const { ctx, registrations } = createCtx()
  plugin.apply(ctx)

  const { tree } = mount(registrations[0], react)
  findButton(tree, '移动访问').props.onClick()
  assert.equal(calls.length, 1)
  assert.ok(calls[0].includes('dsh-mobile-control__trigger'))
})

test('the settings section also carries the folded-entry tools', () => {
  const { dom, react, plugin } = loadBundle()
  dom.document.querySelector = () => ({ click() {} })
  const { ctx, registrations } = createCtx()
  plugin.apply(ctx)
  const { tree } = mount(registrations[1], react)
  assert.ok(findButton(tree, '导入会话'), 'the settings page keeps the import tool')
  assert.ok(findButton(tree, '移动访问'), 'the settings page keeps the mobile tool')
})
