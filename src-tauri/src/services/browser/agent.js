// Outils de l'agent, dans un monde JavaScript à part (`nuee`) : même DOM que la page, mais ni ses
// variables ni ses retouches de prototypes. Les refs (`ref_12`) désignent un élément d'un appel à l'autre.
globalThis.__nuee = (() => {
  let counter = 0
  const refs = new Map()
  const ids = new WeakMap()

  const refOf = (element) => {
    let id = ids.get(element)
    if (!id) {
      id = `ref_${++counter}`
      ids.set(element, id)
      refs.set(id, new WeakRef(element))
    }
    return id
  }
  const byRef = (ref) => {
    const element = refs.get(ref)?.deref()
    if (!element || !element.isConnected) throw new Error(`${ref} n'existe plus dans la page : relire la page (read_page ou find)`)
    return element
  }

  // ===== Rôle et nom accessibles (version courte de l'algorithme ARIA) =====

  const INPUT_ROLES = {
    button: 'button', submit: 'button', reset: 'button', image: 'button', checkbox: 'checkbox', radio: 'radio',
    range: 'slider', number: 'spinbutton', search: 'searchbox', email: 'textbox', tel: 'textbox', text: 'textbox',
    url: 'textbox', password: 'textbox', date: 'textbox', 'datetime-local': 'textbox', month: 'textbox',
    time: 'textbox', week: 'textbox', color: 'button', file: 'button',
  }
  const TAG_ROLES = {
    a: (el) => (el.hasAttribute('href') ? 'link' : null), area: (el) => (el.hasAttribute('href') ? 'link' : null),
    article: 'article', aside: 'complementary', button: 'button', dialog: 'dialog', fieldset: 'group',
    figure: 'figure', footer: (el) => (el.closest('article,aside,main,nav,section') ? null : 'contentinfo'),
    form: 'form', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
    header: (el) => (el.closest('article,aside,main,nav,section') ? null : 'banner'), hr: 'separator',
    img: (el) => (el.getAttribute('alt') === '' ? 'presentation' : 'img'), svg: (el) => (nameOf(el) ? 'img' : null),
    input: (el) => (el.type === 'hidden' ? null : el.hasAttribute('list') ? 'combobox' : INPUT_ROLES[el.type] ?? 'textbox'),
    li: 'listitem', main: 'main', menu: 'list', nav: 'navigation', ol: 'list', ul: 'list', option: 'option',
    output: 'status', p: 'paragraph', progress: 'progressbar', section: (el) => (nameOf(el) ? 'region' : null),
    select: (el) => (el.multiple || el.size > 1 ? 'listbox' : 'combobox'), summary: 'button', table: 'table',
    tbody: 'rowgroup', thead: 'rowgroup', tfoot: 'rowgroup', td: 'cell', th: 'columnheader', tr: 'row',
    textarea: 'textbox', label: 'label', details: 'group', meter: 'meter', blockquote: 'blockquote', code: 'code',
  }
  const NAME_FROM_CONTENT = new Set([
    'button', 'cell', 'checkbox', 'columnheader', 'heading', 'link', 'menuitem', 'menuitemcheckbox',
    'menuitemradio', 'option', 'radio', 'row', 'rowheader', 'switch', 'tab', 'tooltip', 'treeitem', 'label',
  ])
  const INTERACTIVE = new Set([
    'button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'listbox', 'slider',
    'spinbutton', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'treeitem',
  ])

  const roleOf = (el) => {
    const explicit = el.getAttribute('role')?.trim().split(/\s+/)[0]
    if (explicit && explicit !== 'none' && explicit !== 'presentation') return explicit
    if (explicit) return null
    const implicit = TAG_ROLES[el.localName]
    const role = typeof implicit === 'function' ? implicit(el) : implicit ?? null
    if (!role && el.isContentEditable && el.parentElement && !el.parentElement.isContentEditable) return 'textbox'
    return role
  }

  const clean = (text) => (text || '').replace(/\s+/g, ' ').trim()

  const textOf = (el, depth = 0) => {
    if (depth > 20) return ''
    let text = ''
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent
      else if (node.nodeType === Node.ELEMENT_NODE && !hidden(node)) {
        const label = node.getAttribute('aria-label') || (node.localName === 'img' ? node.getAttribute('alt') : '')
        text += ' ' + (label || textOf(node, depth + 1)) + ' '
      }
    }
    return text
  }

  function nameOf(el) {
    const labelledBy = el.getAttribute('aria-labelledby')
    if (labelledBy) {
      const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map((node) => textOf(node)).join(' ')
      if (clean(text)) return clean(text)
    }
    const label = el.getAttribute('aria-label')
    if (clean(label)) return clean(label)
    if (el.labels?.length) return clean([...el.labels].map((node) => textOf(node)).join(' '))
    if (el.localName === 'img' || el.localName === 'area') return clean(el.getAttribute('alt') || el.getAttribute('title'))
    if (el.localName === 'input' && ['button', 'submit', 'reset'].includes(el.type)) return clean(el.value || (el.type === 'submit' ? 'Submit' : ''))
    if (el.localName === 'svg') return clean(el.querySelector(':scope > title')?.textContent)
    const role = roleOf(el)
    if (role && NAME_FROM_CONTENT.has(role)) {
      const text = clean(textOf(el))
      if (text) return text.slice(0, 200)
    }
    return clean(el.getAttribute('title') || el.getAttribute('placeholder'))
  }

  function hidden(el) {
    if (el.hidden || el.getAttribute('aria-hidden') === 'true' || el.inert) return true
    if (['script', 'style', 'noscript', 'template', 'head', 'meta', 'link'].includes(el.localName)) return true
    const style = getComputedStyle(el)
    return style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse'
  }

  const clickable = (el) => {
    if (el.hasAttribute('onclick') || el.hasAttribute('tabindex') && el.tabIndex >= 0) return true
    try {
      return getComputedStyle(el).cursor === 'pointer' && getComputedStyle(el.parentElement || el).cursor !== 'pointer'
    } catch {
      return false
    }
  }

  const describeState = (el, role) => {
    const parts = []
    if (role === 'heading') parts.push(`level=${el.localName.match(/^h(\d)$/)?.[1] ?? el.getAttribute('aria-level') ?? 2}`)
    if (role === 'link' && el.getAttribute('href')) parts.push(`href="${el.getAttribute('href').slice(0, 120)}"`)
    if (['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider'].includes(role) && el.localName !== 'select') {
      const value = el.isContentEditable ? el.textContent : el.value
      if (value) parts.push(`value="${clean(String(value)).slice(0, 120)}"`)
      if (el.type && el.localName === 'input' && el.type !== 'text') parts.push(`type=${el.type}`)
      if (el.placeholder && !nameOf(el)) parts.push(`placeholder="${el.placeholder}"`)
    }
    if (el.localName === 'select') {
      const chosen = [...el.selectedOptions].map((option) => clean(option.textContent)).join(', ')
      parts.push(`value="${chosen}"`)
      parts.push(`options=[${[...el.options].slice(0, 30).map((option) => `"${clean(option.textContent)}"`).join(', ')}]`)
    }
    if (el.checked || el.getAttribute('aria-checked') === 'true') parts.push('checked')
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') parts.push('disabled')
    if (el.getAttribute('aria-expanded')) parts.push(`expanded=${el.getAttribute('aria-expanded')}`)
    if (el.getAttribute('aria-selected') === 'true') parts.push('selected')
    if (el.required) parts.push('required')
    if (document.activeElement === el) parts.push('focused')
    return parts.join(' ')
  }

  const quote = (text) => `"${text.replace(/"/g, '\\"')}"`

  // Arbre lisible : une ligne par élément utile, refs sur ce qui se clique ou se remplit.
  function tree(root, { filter = 'all', depth = 40 } = {}) {
    const lines = []
    const walk = (el, level, indent) => {
      if (level > depth || hidden(el)) return
      const role = roleOf(el)
      const interactive = (role && INTERACTIVE.has(role)) || el.isContentEditable && role === 'textbox' || clickable(el)
      let printed = false
      if (role && role !== 'label' && (filter === 'all' || interactive)) {
        const name = nameOf(el)
        const state = describeState(el, role)
        const generic = ['paragraph', 'listitem', 'cell', 'row', 'rowgroup', 'group', 'list', 'code', 'blockquote'].includes(role)
        if (filter === 'interactive' || !generic || name || state) {
          lines.push(`${'  '.repeat(indent)}- ${role}${name ? ' ' + quote(name.slice(0, 160)) : ''} [${refOf(el)}]${state ? ' ' + state : ''}`)
          printed = true
        }
      } else if (!role && interactive && filter === 'interactive' || !role && clickable(el) && filter === 'all') {
        const name = clean(textOf(el)).slice(0, 120) || nameOf(el)
        lines.push(`${'  '.repeat(indent)}- clickable${name ? ' ' + quote(name) : ''} [${refOf(el)}]`)
        printed = true
      }
      const childIndent = printed ? indent + 1 : indent
      if (filter === 'all' && !(role && NAME_FROM_CONTENT.has(role) && printed)) {
        for (const node of el.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = clean(node.textContent)
            if (text) lines.push(`${'  '.repeat(childIndent)}- text: ${text.slice(0, 300)}`)
          }
        }
      }
      for (const child of el.children) walk(child, level + 1, childIndent)
      if (el.shadowRoot) for (const child of el.shadowRoot.children) walk(child, level + 1, childIndent)
      if (el.localName === 'iframe') {
        try {
          const body = el.contentDocument?.body
          if (body) walk(body, level + 1, childIndent)
        } catch {}
      }
    }
    walk(root, 0, 0)
    return lines
  }

  const viewport = () => ({
    width: innerWidth,
    height: innerHeight,
    scrollX: Math.round(scrollX),
    scrollY: Math.round(scrollY),
    pageHeight: document.documentElement.scrollHeight,
  })

  const header = () => {
    const v = viewport()
    return `Page: ${document.title || '(sans titre)'} — ${location.href}\nViewport ${v.width}x${v.height}, défilé à ${v.scrollY}/${v.pageHeight}px`
  }

  // ===== Ce que l'agent appelle =====

  function read_page({ filter = 'all', depth = 40, ref_id, max_chars = 50000 } = {}) {
    const root = ref_id ? byRef(ref_id) : document.body || document.documentElement
    const lines = tree(root, { filter, depth })
    let text = `${header()}\n\n${lines.join('\n') || '(rien à afficher)'}`
    if (text.length > max_chars) text = `${text.slice(0, max_chars)}\n… coupé à ${max_chars} caractères : passer ref_id ou filter="interactive"`
    return text
  }

  function find({ query }) {
    const needle = clean(query).toLowerCase()
    if (!needle) throw new Error('query vide')
    const matches = []
    const walk = (el) => {
      if (matches.length >= 20 || hidden(el)) return
      const role = roleOf(el)
      const name = nameOf(el)
      const own = [...el.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(' ')
      const line = clean(`${role ?? el.localName} ${name} ${own} ${el.getAttribute('placeholder') ?? ''} ${el.id ? '#' + el.id : ''}`)
      if (line.toLowerCase().includes(needle)) {
        matches.push(`- ${role ?? el.localName}${name ? ' ' + quote(name.slice(0, 160)) : own.trim() ? ' ' + quote(clean(own).slice(0, 160)) : ''} [${refOf(el)}] ${describeState(el, role)}`.trim())
      }
      for (const child of el.children) walk(child)
      if (el.shadowRoot) for (const child of el.shadowRoot.children) walk(child)
    }
    walk(document.body || document.documentElement)
    return matches.length ? matches.join('\n') : `Aucun élément ne correspond à ${quote(query)}.`
  }

  const kindOf = (el) => {
    if (!el) return null
    if (el.localName === 'select') return 'select'
    if (el.localName === 'input' && ['file', 'color', 'date', 'datetime-local', 'month', 'time', 'week'].includes(el.type)) return `input-${el.type}`
    return null
  }

  const label = (el) => {
    const role = roleOf(el) ?? el.localName
    const name = nameOf(el) || clean(textOf(el)).slice(0, 80)
    return `${role}${name ? ' ' + quote(name.slice(0, 80)) : ''}`
  }

  // Centre visible de l'élément, après l'avoir amené à l'écran.
  function target({ ref }) {
    const el = byRef(ref)
    let rect = el.getBoundingClientRect()
    if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
      rect = el.getBoundingClientRect()
    }
    if (!rect.width && !rect.height) throw new Error(`${ref} n'a pas de taille à l'écran`)
    const x = Math.min(Math.max(rect.left + rect.width / 2, 1), innerWidth - 1)
    const y = Math.min(Math.max(rect.top + rect.height / 2, 1), innerHeight - 1)
    return { x, y, label: label(el), kind: kindOf(el) }
  }

  function at({ x, y }) {
    const el = document.elementFromPoint(x, y)
    if (!el) return { label: null, kind: null }
    return { label: label(el), kind: kindOf(el) }
  }

  // Comme une frappe : `beforeinput` et `input` de confiance, que React et Vue suivent.
  function type({ text }) {
    const el = deepActive()
    if (!el || el === document.body) throw new Error('aucun champ n\'a le focus : cliquer d\'abord dans un champ')
    if (!document.execCommand('insertText', false, text)) {
      if ('value' in el) {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set
        const start = el.selectionStart ?? el.value.length
        const end = el.selectionEnd ?? el.value.length
        const value = el.value.slice(0, start) + text + el.value.slice(end)
        setter ? setter.call(el, value) : (el.value = value)
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }))
      } else {
        throw new Error(`${label(el)} n'accepte pas de texte`)
      }
    }
    return label(el)
  }

  function deepActive() {
    let el = document.activeElement
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement
    if (el?.localName === 'iframe') {
      try {
        return el.contentDocument?.activeElement ?? el
      } catch {}
    }
    return el
  }

  const setValue = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set
    setter ? setter.call(el, value) : (el.value = value)
  }

  function form_input({ ref, value }) {
    const el = byRef(ref)
    if (el.localName === 'select') {
      const wanted = [].concat(value).map(String)
      const options = [...el.options]
      let found = 0
      for (const option of options) {
        const match = wanted.includes(option.value) || wanted.some((text) => clean(option.textContent) === clean(text))
        if (match) found++
        if (el.multiple) option.selected = match
        else if (match) el.value = option.value
      }
      if (!found) throw new Error(`aucune option ${quote(wanted.join(', '))} ; options : ${options.map((o) => quote(clean(o.textContent))).join(', ')}`)
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      const checked = value === true || value === 'true' || value === 'on' || value === 1
      if (el.checked !== checked) el.click()
      return `${label(el)} ${el.checked ? 'coché' : 'décoché'}`
    } else if (el.isContentEditable) {
      el.focus()
      document.execCommand('selectAll', false)
      document.execCommand('insertText', false, String(value))
      return `${label(el)} = ${quote(String(value))}`
    } else if ('value' in el) {
      el.focus()
      setValue(el, String(value))
    } else {
      throw new Error(`${label(el)} n'est pas un champ de formulaire`)
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return `${label(el)} = ${quote(String(value))}`
  }

  const scrollableAt = (el) => {
    while (el && el !== document.documentElement) {
      const style = getComputedStyle(el)
      if (/(auto|scroll)/.test(style.overflowY + style.overflowX) && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)) return el
      el = el.parentElement
    }
    return null
  }

  function scroll({ x, y, direction = 'down', amount = 3 }) {
    const step = amount * 100
    const dx = direction === 'left' ? -step : direction === 'right' ? step : 0
    const dy = direction === 'up' ? -step : direction === 'down' ? step : 0
    const box = x != null ? scrollableAt(document.elementFromPoint(x, y)) : null
    const before = box ? box.scrollTop : scrollY
    if (box) box.scrollBy({ left: dx, top: dy, behavior: 'instant' })
    else scrollBy({ left: dx, top: dy, behavior: 'instant' })
    const after = box ? box.scrollTop : scrollY
    return `${box ? label(box) : 'page'} défilée de ${Math.round(after - before)}px (${direction})`
  }

  function scroll_to({ ref }) {
    const el = byRef(ref)
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
    return `${label(el)} à l'écran`
  }

  function get_page_text({ max_chars = 50000 } = {}) {
    const main = document.querySelector('main, article, [role=main]')
    const text = (main && clean(main.innerText).length > 200 ? main : document.body)?.innerText ?? ''
    const out = `${header()}\n\n${text.replace(/\n{3,}/g, '\n\n').trim()}`
    return out.length > max_chars ? `${out.slice(0, max_chars)}\n… coupé à ${max_chars} caractères` : out
  }

  // Mesures : position, taille, marges et styles calculés (tous ceux demandés, ou une sélection courante).
  const COMMON_STYLES = [
    'display', 'position', 'width', 'height', 'margin', 'padding', 'border', 'border-radius', 'box-sizing',
    'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
    'text-align', 'opacity', 'z-index', 'overflow', 'flex-direction', 'justify-content', 'align-items', 'gap',
    'grid-template-columns', 'box-shadow', 'transform', 'visibility',
  ]
  function inspect({ ref, selector, properties }) {
    const elements = ref ? [byRef(ref)] : [...document.querySelectorAll(selector)].slice(0, 10)
    if (!elements.length) throw new Error(`aucun élément pour ${quote(selector ?? ref)}`)
    return elements.map((el) => {
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      const styles = {}
      for (const name of properties?.length ? properties : COMMON_STYLES) styles[name] = style.getPropertyValue(name)
      return {
        ref: refOf(el),
        element: label(el),
        rect: { x: Math.round(rect.x * 10) / 10, y: Math.round(rect.y * 10) / 10, width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10 },
        page: { x: Math.round(rect.x + scrollX), y: Math.round(rect.y + scrollY) },
        styles,
      }
    })
  }

  // Curseur de l'agent dessiné dans la page : l'utilisateur voit où il clique.
  function cursor({ x, y, click = false }) {
    let host = document.querySelector('nuee-cursor')
    if (!host) {
      host = document.createElement('nuee-cursor')
      const shadow = host.attachShadow({ mode: 'closed' })
      shadow.innerHTML = `<style>:host{all:initial;position:fixed;z-index:2147483647;pointer-events:none;left:0;top:0;transition:transform .18s ease-out,opacity .4s}
        .dot{width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:rgba(217,119,87,.9);box-shadow:0 0 0 3px rgba(217,119,87,.3)}
        .ring{position:absolute;inset:-13px;border-radius:50%;border:2px solid rgba(217,119,87,.8);opacity:0}
        .ring.go{animation:p .45s ease-out}@keyframes p{from{opacity:1;transform:scale(.4)}to{opacity:0;transform:scale(1.4)}}</style><div class="dot"><div class="ring"></div></div>`
      host.__ring = shadow.querySelector('.ring')
      document.documentElement.appendChild(host)
    }
    host.style.opacity = '1'
    host.style.transform = `translate(${x}px, ${y}px)`
    if (click && host.__ring) {
      host.__ring.classList.remove('go')
      void host.__ring.offsetWidth
      host.__ring.classList.add('go')
    }
    clearTimeout(host.__timer)
    host.__timer = setTimeout(() => (host.style.opacity = '0'), 2500)
    return true
  }

  return { read_page, find, target, at, type, form_input, scroll, scroll_to, get_page_text, inspect, cursor, viewport }
})()
