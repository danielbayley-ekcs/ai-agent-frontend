import snarkdown from "https://esm.sh/snarkdown@2.0.0"

const maxBrandSelect = 16
const ms = 2000 // 2s

// https://lucide.dev/icons
const color = "currentcolor"
const symbol = "%"
const svg = `
  <svg xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="24"
    height="24"
    fill="none"
    stroke="${color}"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="lucide lucide-copy-icon lucide-copy"
    role="img">
    ${symbol}
  </svg>`

// https://lucide.dev/icons/copy
const copy = `
  <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
`
// https://lucide.dev/icons/copy-check
const copied = `
  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
  <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
  <path pathLength="100" d="m12 15 2 2 4-4"/>
`
// https://lucide.dev/icons/share
const share = `
  <path d="M12 2v13"/>
  <path d="m16 6-4-4-4 4"/>
  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
`

const shared = `
  <path d="M12 2v8"/>
  <path d="m16 6-4-4-4 4"/>
  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
  <path d="m9 15 2 2 4-4"/>
`
// https://lucide.dev/icons/eye
const eye = `
  <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>
  <circle cx="12" cy="12" r="3"/>
`

const icons = {
  copy:    svg.replace(symbol, copy),
  copied:  svg.replace(symbol, copied),
  share:   svg.replace(symbol, share),
  shared:  svg.replace(symbol, shared),
  preview: svg.replace(symbol, eye),
}

const sessionId = typeof crypto.randomUUID === "function"
  ? crypto.randomUUID()
  : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const random = Math.random() * 16 | 0
    return (char === "x" ? random : (random & 0x3 | 0x8)).toString(16)
  })

const proto = location.protocol === "https:" ? "wss" : "ws"
const origin = `${proto}://${location.host}`
const ws = new WebSocket(`${origin}/ws/${sessionId}`)

const [messages] = document.getElementsByTagName("main")
const input      = document.querySelector("footer input")
const submit     = document.querySelector("footer button")

function createElement(tag, attributes = {}) {
  if (attributes.textContent) attributes.dataContent ??= attributes.textContent

  const element = document.createElement(tag, attributes)

  for (const name in attributes)
    if (element.setAttribute && element[name] in element)
      element.setAttribute(name, attributes[name])
    else
      element[name] = attributes[name]

  return element
}

const postMessage = object =>
  window.parent?.postMessage(object, "*")

let ariaPosInSet = 0
function createArticle(attributes) {
  postMessage({ messageCount: ariaPosInSet++ })
  return createElement("article", { ariaSetSize: "-1", ariaPosInSet, ...attributes })
}

const createLabel   = attributes => createElement("label", attributes)
const createDiv     = attributes => createElement("div", { role: "group", ...attributes })
const createToolbar = attributes => createElement("menu", { role: "toolbar", ...attributes })

function createButton(attributes, icon, onClick) {
  attributes.type ??= "button"
  if (icon) attributes.innerHTML ??= icon
  const button = createElement("button", attributes)
  if (onClick) button.addEventListener("click", onClick)
  return button
}

function createToggleButton(attributes, icon, onClick, timeout) {
  let pressed
  if (icon) [icon, pressed] = [icon].flat()

  const button = createButton(attributes, icon)
  button.ariaPressed ??= false

  button.addEventListener("click", event => {
    event.target.ariaPressed = event.target.ariaPressed !== "true"
    onClick?.call?.(null, event)
    if (!pressed) return

    if (timeout)
      setTimeout(() => event.target.innerHTML = icon, timeout)
    else
      event.target.innerHTML = pressed
  })
  return button
}

const createLink = (className, href, textContent) =>
  createElement("a", {
    className,
    role: "button",
    href,
    target: "_blank",
    rel: "noopener",
    textContent,
  })

const disable = (...elements) =>
  elements.forEach(element => {
    element.disabled = true
    element.ariaDisabled = true
  })

const enable = (...elements) =>
  elements.forEach(element => {
    element.disabled = false
    element.ariaDisabled = false
  })

const autoScroll = () => messages.scrollTop = messages.scrollHeight

const clipboardCopy = content => content && navigator.clipboard.writeText(content)

function renderMarkdown(text) {
  // Escape HTML to prevent injection
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  return snarkdown(escaped)
}

function appendMessage(text, type) {
  const className = `message ${type}`
  const element = type?.includes("connect") || type === "error"
    ? createElement("h5", { className })
    : createArticle({ className })

  if (type === "received" || type === "error") element.innerHTML = renderMarkdown(text)
  else element.textContent = text

  messages.appendChild(element)
  autoScroll()
}

function renderFormatPicker(data) {
  const isDigital = data.size_label === "Ad Format"

  // Digital sizes are multi-select (array) print size and style/theme are single-select.
  const selections = {
    size: isDigital ? (data.preselected_size ? [data.preselected_size] : []) : (data.preselected_size || null),
    style: data.preselected_style || null,
    theme: data.preselected_theme || null,
  }

  const hasSizes  = Array.isArray(data.sizes)  && data.sizes.length  > 0
  const hasStyles = Array.isArray(data.styles) && data.styles.length > 0
  const hasThemes = Array.isArray(data.themes) && data.themes.length > 0

  // If nothing needs selecting, send immediately without showing a picker
  if (!hasSizes && !hasStyles && !hasThemes) {
    const sizeVal = isDigital ? selections.size.join(" + ") : selections.size
    const parts = [sizeVal, selections.style, selections.theme].filter(Boolean)
    if (parts.length) sendMessageText(parts.join(", "))
    return
  }

  const className = "format-picker"
  const article = createArticle({ className })
  const ok = createButton({
    type: "submit",
    className: "format-picker-ok",
    textContent: "OK",
  })

  function makeColumn(key, textContent, options, multiSelect) {
    if (!options?.length) return null

    if (multiSelect) textContent += "(s)"

    const div = createDiv({ className: `${className}-column` })
    div.appendChild(createLabel({ className: `${className}-label`, textContent }))

    const chips = createDiv({ className: `${className}-chips` })
    const buttons = options.map(textContent => {
      const className = "format-chip"
      const button = createToggleButton({ className, textContent }, null, ({ target }) => {
        if (multiSelect) {
          if (target.ariaPressed && !selections[key].includes(textContent))
            selections[key].push(textContent)
          else
            selections[key] = selections[key].filter(out => out !== textContent)
        } else {
          buttons.forEach(button => button.ariaPressed = false)
          target.ariaPressed = true
          selections[key] = textContent
        }
        const sizeOk  = !hasSizes  || (isDigital ? selections.size.length > 0 : !!selections.size)
        const styleOk = !hasStyles || !!selections.style
        const themeOk = !hasThemes || !!selections.theme

        if (sizeOk && styleOk && themeOk) enable(ok)
        else disable(ok)
      })

      chips.appendChild(button)
      return button
    })

    div.appendChild(chips)
    return div
  }

  const sizeSection  = makeColumn("size", data.size_label || "Page Size", data.sizes, isDigital)
  const styleSection = makeColumn("style", "Style", data.styles)
  const themeSection = makeColumn("theme", "Theme", data.themes)

  // Sections in a horizontal row so all are visible at once
  const div = createDiv({ className: "format-picker-columns" })
  if (sizeSection)  div.appendChild(sizeSection)
  if (styleSection) div.appendChild(styleSection)
  if (themeSection) div.appendChild(themeSection)
  article.appendChild(div)

  ok.addEventListener("click", () => {
    const chips = article.querySelectorAll(".format-chip")
    chips.forEach(element => disable(element))
    disable(ok)

    const sizeVal = isDigital ? selections.size.join(" + ") : selections.size
    const parts = [sizeVal, selections.style, selections.theme].filter(Boolean)
    sendMessageText(parts.join(", "))
  })

  article.appendChild(ok)
  messages.appendChild(article)
  autoScroll()
}


let _progressCard = null

function renderProgressCard(textContent) {
  const className = "progress-label"
  if (_progressCard) {
    const __progressCard = _progressCard.querySelector(`.${className}`)
    __progressCard.textContent = textContent
    return
  }

  const card = createArticle({ className: "progress-card" })
  const div = createDiv({ className: "progress-loader" })
  const label = createLabel({ className, textContent })

  card.append(div, label)
  messages.appendChild(card)
  autoScroll()
  _progressCard = card
}

function updateProgressCard(label) {
  const __progressCard = _progressCard.querySelector(".progress-label")
  if (_progressCard) __progressCard.textContent = label
}

function removeProgressCard() {
  if (!_progressCard) return

  _progressCard.remove()
  _progressCard = null

  ariaPosInSet++
  postMessage({ ariaPosInSet })
}

function renderPreviewCard(data) {
  const className = "preview-card"
  const article = createArticle({ className })
  const figure  = createElement("figure")

  if (data.stream === "digital" && data.adUrl) {
    const width  = data.adWidth  || 300
    const height = data.adHeight || 250
    const iframe = createElement("iframe", {
      src: data.adUrl,
      width,
      height,
      scrolling: "no",
    })

    figure.appendChild(iframe)
    article.appendChild(figure)

  } else if (data.jpgUrl) {
    const img = createElement("img", {
      className: `${className}-img`,
      src: data.jpgUrl,
      alt: "Ad preview",
    })
    article.appendChild(img)
  }

  if (data.projectId) {
    const caption = createElement("figcaption")
    const id = createElement("code", {
      title: "Project ID",
      textContent: `Project: ${data.projectId}`,
    })

    const toolbar = createToolbar()
    const buttons = []
    buttons.push(createToggleButton({
      className: "inline copy",
      title: "Copy project ID",
    }, [icons.copy, icons.copied], () => clipboardCopy(data.projectId), ms))

    buttons.push(createToggleButton({
      className: "preview",
      title: "Preview template",
    }, icons.preview, () => window.parent
      ? postMessage({ campaign: data.previewUrl })
      : window.open(data.previewUrl, "_blank").focus()))

    toolbar.append(...buttons)
    caption.append(id, toolbar)
    figure.appendChild(caption)
  }

  const buttons = createDiv({ className: `${className}-btns` })

  if (data.stream === "digital") {
    const btn = `${className}-btn`
    const ad = data.adName ? data.adName.replace(/^Digital_/i, "").trim() : "Ad"

    if (data.adUrl && data.showPrimaryButton)
      buttons.appendChild(createLink(btn, data.adUrl, `View ${ad}`))

    const extraAds = data.extraAds || []
    extraAds.forEach(extra => {
      if (!extra.url) return

      const ad = extra.name ? extra.name.replace(/^Digital_/i, "").trim() : "Ad"
      buttons.appendChild(createLink(btn, extra.url, `View ${ad}`))
    })

    if (data.previewUrl) buttons.appendChild(createLink(btn, data.previewUrl, "Preview all sizes"))

  } else {
    if (data.editorUrl) buttons.appendChild(createLink(btn, data.editorUrl, "Edit"))

    if (data.pdfUrl) buttons.appendChild(createLink(btn, data.pdfUrl, "Download PDF"))

    if (data.jpgUrl) buttons.appendChild(createLink(btn, data.jpgUrl, "Download JPG"))

    if (data.shareUrl) {
      const button = createButton({
        title: "Copy share link",
        innerHTML: icons.share,
      })
      button.addEventListener("click", async () => {
        await navigator.clipboard.writeText(data.shareUrl)
        button.innerHTML = icons.shared
        button.ariaPressed = true
        setTimeout(() => {
          button.innerHTML = icons.share
          button.ariaPressed = false
        }, ms)
      })
      buttons.appendChild(button)
    }
  }
  messages.append(article, buttons)
  autoScroll()
}

function renderBrandPicker(brands) {
  const className = "brand-picker"
  const article = createArticle({ id: className })
  const id = "brands"

  article.appendChild(createLabel({
    className: `${className}-label`,
    htmlFor: id,
    textContent: "Select a Brand",
  }))

  if (brands.length > maxBrandSelect) {
    const div = createDiv()
    const select = createElement("select", {
      id,
      required: true,
      autofocus: true,
    })
    select.append(...brands.flatMap((textContent, i) => {
      const options  = []
      const previous = brands[i - 1]
      if (previous && textContent.charAt(0) !== previous.charAt(0)) options.push(createElement("hr"))

      const option = createElement("option", { value: textContent, textContent })
      return options.concat(option)
    }))
    div.appendChild(select)

    const ok = createButton({
      type: "submit",
      className: `${className}-ok`,
      textContent: "OK",
    })
    ok.addEventListener("click", () => {
      disable(select, ok)
      sendMessageText(select.value)
    })
    div.appendChild(ok)
    article.appendChild(div)
  } else {
    const buttons = createDiv({ id })
    brands.forEach(textContent => {
      const className = "brand-chip"
      const button = createButton({ className, textContent })
      button.addEventListener("click", () => {
        const chips = article.querySelectorAll(`.${className}`)
        chips.forEach(button => disable(button))
        sendMessageText(textContent)
      })
      buttons.appendChild(button)
    })
    article.appendChild(buttons)
  }

  messages.appendChild(article)
  autoScroll()
}

function renderTemplatePicker(templates, stream) {
  const article = createArticle({ className: "template-picker", role: "listbox" })
  let button

  const className = "template-cell"
  const cells = []

  templates.forEach(template => {
    const cell = createElement("figure", {
      className,
      role: "option",
      ariaSelected: false,
    })
    cells.push(cell)

    const img = createElement("img", {
      src: template.thumbnail || "/static/icons/image-no.svg",
      alt: template.name || "No preview",
    })
    if (!template.thumbnail) img.classList.add(`${className}-placeholder`)

    img.addEventListener("click", () => {
      cells.forEach(element => disable(element))
      if (button) disable(button)

      cell.ariaSelected = true
      sendMessageText(template.name)
    })

    cell.appendChild(img)

    const caption = createElement("figcaption", { className: `${className}-name` })
    const file    = createElement("code", { textContent: template.name })
    const toolbar = createToolbar()
    const buttons = []
    buttons.push(createToggleButton({
      className: "inline copy",
      title: "Copy template name",
    }, [icons.copy, icons.copied], () => clipboardCopy(template.name), ms))

    buttons.push(createToggleButton({
      className: "preview",
      title: "Preview template",
    }, icons.preview, () =>
      template.thumbnail && window.open(template.thumbnail, "_blank").focus()))

    const buttonPreview = createButton({
      className: "preview",
      title: "Preview template",
      innerHTML: icons.eye,
    })
    buttonPreview.addEventListener("click", async () => {
      if (!template.name) return

      await navigator.clipboard.writeText(template.name)
      buttonPreview.innerHTML = icons.copied
      buttonPreview.ariaPressed = true
    })

    toolbar.append(...buttons)
    caption.append(file, toolbar)

    cell.appendChild(caption)
    article.appendChild(cell)
  })

  if (stream === "digital") {
    const textContent = "Let the system choose a template"

    button = createButton({
      className: "system-choose-btn",
      textContent,
    }, null, () => {
      cells.forEach(cell => disable(cell))
      disable(button)
      button.classList.add("used")
      sendMessageText(textContent)
    })
  }

  messages.append(article, button)
  autoScroll()
}

function renderQuickChips(chips) {
  const className = "quick-chip"
  const div = createDiv({ className: `${className}s` })

  chips.forEach(textContent => {
    const button = createButton({ className, textContent })
    button.addEventListener("click", () => {
      const buttons = div.querySelectorAll(`.${className}`)
      buttons.forEach(button => {
        disable(button)
        button.classList.add("used")
      })
      sendMessageText(textContent)
    })
    div.appendChild(button)
  })
  messages.appendChild(div)
  autoScroll()
}

ws.onopen = () => {
  disable(submit)
  appendMessage("Connected", "connect")
}

ws.onclose = () => {
  disable(input, submit)
  appendMessage("Disconnected", "disconnect")
}

ws.onerror = () => appendMessage("Connection error", "error")

ws.onmessage = event => {
  const data = JSON.parse(event.data)

  switch (data.type) {
    case "template_picker": renderTemplatePicker(data.templates, data.stream)
      break
    case "format_picker": renderFormatPicker(data)
      break
    case "brand_picker": renderBrandPicker(data.brands)
      break
    case "preview_card": renderPreviewCard(data)
      break
    case "progress":
      switch (data.status) {
        case "start": renderProgressCard(data.label || "Working…")
          messages.ariaBusy = true
          break
        case "update": updateProgressCard(data.label || "")
          break
        case "end": removeProgressCard()
          messages.ariaBusy = false
      }
      break
    default:
      enable(input, submit)
      input.focus()

      appendMessage(data.text, data.type === "error" ? "error" : "received")
      if (data.chips?.length > 0) renderQuickChips(data.chips)
  }
}

function sendMessageText(text) {
  ws.send(JSON.stringify({ type: "message", text }))
  appendMessage(text, "sent")
  disable(input, submit)
}

function sendMessage() {
  const text = input.value.trim()
  if (!text || ws.readyState !== WebSocket.OPEN) return

  sendMessageText(text)
  input.value = ""
}

submit.onclick = sendMessage
input.addEventListener("keydown", ({ key }) => key === "Enter" && sendMessage())
