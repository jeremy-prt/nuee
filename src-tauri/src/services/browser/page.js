// Posé dans chaque page et chaque cadre avant ses propres scripts : console, erreurs, requêtes et
// navigation partent vers Nuée par `webkit.messageHandlers.nuee`. Rien ne doit casser la page : chaque
// relevé est entouré d'un try, et les fonctions d'origine restent appelées telles quelles.
;(() => {
  const handler = window.webkit?.messageHandlers?.nuee
  if (!handler || window.__nueePage) return
  Object.defineProperty(window, '__nueePage', { value: true })

  const BODY_LIMIT = 64 * 1024
  const send = (message) => {
    try {
      handler.postMessage(JSON.stringify(message))
    } catch {}
  }

  const describe = (value) => {
    if (typeof value === 'string') return value
    if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`
    if (value instanceof Element) return `<${value.tagName.toLowerCase()}${value.id ? '#' + value.id : ''}>`
    try {
      const json = JSON.stringify(value)
      return json === undefined ? String(value) : json
    } catch {
      return String(value)
    }
  }

  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[level]
    console[level] = function (...args) {
      try {
        send({ t: 'console', level, text: args.map(describe).join(' ').slice(0, 4000) })
      } catch {}
      return original.apply(this, args)
    }
  }

  window.addEventListener('error', (event) => {
    if (event.target && event.target !== window) {
      const element = event.target
      send({ t: 'console', level: 'error', text: `Échec du chargement : ${element.src || element.href || element.tagName}` })
      return
    }
    // Erreur masquée par WebKit (script d'une autre origine, ou essai de `javascript_tool`) : rien à en tirer.
    if (event.message === 'Script error.' && !event.filename) return
    const where = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : ''
    send({ t: 'console', level: 'error', text: `${event.error ? describe(event.error) : event.message}${where}` })
  }, true)
  window.addEventListener('unhandledrejection', (event) => {
    send({ t: 'console', level: 'error', text: `Promesse rejetée sans traitement : ${describe(event.reason)}` })
  })

  // ===== Réseau =====

  const absolute = (url) => {
    try {
      return new URL(url, location.href).href
    } catch {
      return String(url)
    }
  }
  const headersOf = (headers) => {
    const result = {}
    try {
      headers.forEach((value, key) => (result[key] = value))
    } catch {}
    return result
  }
  const bodyOf = (body) => {
    if (body == null) return undefined
    if (typeof body === 'string') return body.slice(0, BODY_LIMIT)
    if (body instanceof URLSearchParams) return body.toString().slice(0, BODY_LIMIT)
    if (body instanceof FormData) {
      const fields = []
      for (const [key, value] of body) fields.push(`${key}=${typeof value === 'string' ? value : '[fichier]'}`)
      return fields.join('&').slice(0, BODY_LIMIT)
    }
    return `[${body.constructor?.name ?? typeof body}]`
  }
  const readable = (mime) => !mime || /json|text|xml|javascript|html|csv|graphql|x-www-form-urlencoded/i.test(mime)

  // Les requêtes vues par fetch/XHR ne sont pas répétées par le relevé des ressources.
  const seen = new Set()

  const originalFetch = window.fetch
  if (originalFetch) {
    window.fetch = function (input, init) {
      const started = performance.now()
      let method = 'GET'
      let url = ''
      let reqHeaders = {}
      let reqBody
      try {
        const request = input instanceof Request ? input : null
        method = (init?.method || request?.method || 'GET').toUpperCase()
        url = absolute(request ? request.url : input)
        reqHeaders = headersOf(new Headers(init?.headers || request?.headers || {}))
        reqBody = bodyOf(init?.body)
        seen.add(url)
      } catch {}
      const promise = originalFetch.apply(this, arguments)
      promise.then(
        (response) => {
          try {
            const mime = response.headers.get('content-type') || ''
            const entry = {
              t: 'net', kind: 'fetch', method, url, status: response.status, statusText: response.statusText, mime,
              reqHeaders, resHeaders: headersOf(response.headers), reqBody,
            }
            if (readable(mime)) {
              response.clone().text().then(
                (text) => send({ ...entry, resBody: text.slice(0, BODY_LIMIT), size: text.length, duration: performance.now() - started }),
                () => send({ ...entry, duration: performance.now() - started }),
              )
            } else {
              send({ ...entry, duration: performance.now() - started })
            }
          } catch {}
        },
        (error) => send({ t: 'net', kind: 'fetch', method, url, reqHeaders, reqBody, error: String(error?.message || error), duration: performance.now() - started }),
      )
      return promise
    }
  }

  const xhr = XMLHttpRequest.prototype
  const originalOpen = xhr.open
  const originalSend = xhr.send
  const originalSetHeader = xhr.setRequestHeader
  xhr.open = function (method, url) {
    try {
      this.__nuee = { method: String(method).toUpperCase(), url: absolute(url), reqHeaders: {} }
      seen.add(this.__nuee.url)
    } catch {}
    return originalOpen.apply(this, arguments)
  }
  xhr.setRequestHeader = function (key, value) {
    try {
      if (this.__nuee) this.__nuee.reqHeaders[key] = value
    } catch {}
    return originalSetHeader.apply(this, arguments)
  }
  xhr.send = function (body) {
    const info = this.__nuee
    if (info) {
      const started = performance.now()
      info.reqBody = bodyOf(body)
      this.addEventListener('loadend', () => {
        try {
          const mime = this.getResponseHeader('content-type') || ''
          const resHeaders = {}
          for (const line of this.getAllResponseHeaders().trim().split(/[\r\n]+/)) {
            const index = line.indexOf(':')
            if (index > 0) resHeaders[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim()
          }
          let resBody
          if ((this.responseType === '' || this.responseType === 'text') && readable(mime)) resBody = this.responseText.slice(0, BODY_LIMIT)
          else if (this.responseType === 'json') resBody = describe(this.response).slice(0, BODY_LIMIT)
          send({
            t: 'net', kind: 'xhr', ...info, status: this.status, statusText: this.statusText, mime, resHeaders, resBody,
            error: this.status === 0 ? 'requête échouée ou annulée' : undefined, duration: performance.now() - started,
          })
        } catch {}
      })
    }
    return originalSend.apply(this, arguments)
  }

  const OriginalSocket = window.WebSocket
  if (OriginalSocket) {
    const Socket = function (url, protocols) {
      const socket = protocols === undefined ? new OriginalSocket(url) : new OriginalSocket(url, protocols)
      const started = performance.now()
      const info = { t: 'net', kind: 'websocket', method: 'GET', url: absolute(url) }
      const frames = []
      const keep = (direction, data) => {
        if (frames.length < 50) frames.push(`${direction} ${typeof data === 'string' ? data.slice(0, 500) : '[binaire]'}`)
      }
      const originalSocketSend = socket.send
      socket.send = function (data) {
        keep('→', data)
        return originalSocketSend.apply(this, arguments)
      }
      socket.addEventListener('message', (event) => keep('←', event.data))
      socket.addEventListener('open', () => send({ ...info, status: 101, statusText: 'ouvert', duration: performance.now() - started }))
      socket.addEventListener('close', (event) =>
        send({ ...info, status: 101, statusText: `fermé (${event.code}${event.reason ? ' ' + event.reason : ''})`, resBody: frames.join('\n'), duration: performance.now() - started }),
      )
      socket.addEventListener('error', () => send({ ...info, error: 'connexion WebSocket échouée', duration: performance.now() - started }))
      return socket
    }
    Socket.prototype = OriginalSocket.prototype
    Object.assign(Socket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })
    window.WebSocket = Socket
  }

  // Images, styles, scripts : seulement leur relevé de temps (le statut quand WebKit le donne). Le document est
  // relevé par Nuée elle-même, avec son statut.
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // fetch et XHR sont déjà relevés, avec leur statut.
        if (seen.has(entry.name) || entry.name.startsWith('data:') || entry.name.startsWith('blob:')) continue
        send({
          t: 'net',
          kind: entry.initiatorType || 'resource',
          method: 'GET',
          url: entry.name,
          status: entry.responseStatus || undefined,
          duration: entry.duration,
          size: entry.transferSize || entry.encodedBodySize || undefined,
        })
      }
    }).observe({ entryTypes: ['resource'] })
  } catch {}

  // ===== Navigation et raccourcis (cadre principal seulement) =====

  if (window !== window.top) return

  const announce = () => send({ t: 'nav', url: location.href, title: document.title, back: history.length > 1 })
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name]
    history[name] = function () {
      const result = original.apply(this, arguments)
      setTimeout(announce)
      return result
    }
  }
  window.addEventListener('popstate', announce)
  window.addEventListener('hashchange', announce)
  document.addEventListener('DOMContentLoaded', () => {
    const title = document.querySelector('title')
    if (title) new MutationObserver(announce).observe(title, { childList: true, characterData: true, subtree: true })
  })

  // Copier, coller, couper, tout sélectionner et annuler restent à la page.
  const pageKeys = new Set(['c', 'v', 'x', 'a', 'z'])
  window.addEventListener('keydown', (event) => {
    if (!event.metaKey && !event.ctrlKey) return
    if (pageKeys.has(event.key.toLowerCase()) && !event.altKey) return
    send({ t: 'key', key: event.key, code: event.code, meta: event.metaKey, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey })
  }, true)
})()
