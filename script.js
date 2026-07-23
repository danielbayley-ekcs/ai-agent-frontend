const maxBrandSelect = 16

const sessionId = typeof crypto.randomUUID === "function"
  ? crypto.randomUUID()
  : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const random = Math.random() * 16 | 0
    return (char === "x" ? random : (random & 0x3 | 0x8)).toString(16)
  })

const proto = location.protocol === "https:" ? "wss" : "ws"
const ws = new WebSocket(`${proto}://${location.host}/ws/${sessionId}`)

const [messages] = document.getElementsByTagName("main")
const input      = document.querySelector("footer input")
const submit     = document.querySelector("footer button")

function createElement(tagName, attributes = {}, options) {
  const element = document.createElement(tagName, options)
  if (attributes.textContent) attributes["data-content"] ??= attributes.textContent

  for (const name in attributes)
    if (element.setAttribute && element[name] in element)
      element.setAttribute(name, attributes[name])
    else
      element[name] = attributes[name]

  return element
}

function renderMarkdown(text) {
  // Escape HTML to prevent injection
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Convert markdown ** to <strong> tags
  let md = escaped.replace(/\*{2}(.+?)\*{2}/g, '<strong>$1</strong>');

  // Convert markdown ``` to <code> tags
  md = md.replace(/`{2}(.+)`{2}/gm, '<code>$1</code>');

  // Convert markdown images ![alt](url) to plain <img> tags (no link — prevents download on click)
  md = md.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g,
    '<img src="$2" alt="$1" style="max-width:100%;max-height:600px;object-fit:contain;border-radius:6px;margin-top:6px;display:block;">',
  );

  // Convert markdown links [text](url) to <a> tags
  return md.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
    (_, text, url) =>
      `<a href="${url}" target="_blank" rel="noopener">${text}</a>`,
  );
}

function appendMessage(text, type) {
  const tagName = (type?.includes("connect") || type === "error") ? "h5" : "section"
  const element = createElement(tagName, { className: `message ${type}` })

  if (type === "received" || type === "error")
    element.innerHTML = renderMarkdown(text)
  else
    element.textContent = text

  messages.appendChild(element)
  messages.scrollTop = messages.scrollHeight
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
  const section = createElement("section", {className})

  const ok = createElement("button", {
    className: "format-picker-ok",
    textContent: "OK",
    disabled: true,
  })

  function makeSection(key, label, options, multiSelect = false) {
    if (!options || !options.length) return null
    const div = createElement("div", { className: `${className}-section` })

    div.appendChild(createElement("label", {
      className: `${className}-label`,
      textContent: label + (multiSelect ? " (select one or more)" : ""),
    }))

    const chips = createElement("div", { className: `${className}-chips` })
    options.forEach(textContent => {
      const className = "format-chip"
      const chip = createElement("button", { className, textContent })

      chip.addEventListener("click", () => {
        if (multiSelect) {
          chip.classList.toggle("selected")
          if (chip.classList.contains("selected"))
            selections[key].push(textContent)
          else
            selections[key] = selections[key].filter(out => out !== textContent)
        } else {
          const formatChips = chips.querySelectorAll(`.${className}`)
          formatChips.forEach(element => element.classList.remove("selected"))
          chip.classList.add("selected")
          selections[key] = textContent
        }
        const sizeOk  = !hasSizes  || (isDigital ? selections.size.length > 0 : !!selections.size)
        const styleOk = !hasStyles || !!selections.style
        const themeOk = !hasThemes || !!selections.theme

        ok.disabled = !(sizeOk && styleOk && themeOk)
      })
      chips.appendChild(chip)
    })
    div.appendChild(chips)
    return div
  }

  const sizeSection  = makeSection("size",  data.size_label || "Page Size", data.sizes, isDigital) //:",
  const styleSection = makeSection("style", "Style", data.styles)
  const themeSection = makeSection("theme", "Theme", data.themes)

  // Sections in a horizontal row so all are visible at once
  const sectionsRow = createElement("section", { className: "format-picker-columns" })
  if (sizeSection)  sectionsRow.appendChild(sizeSection)
  if (styleSection) sectionsRow.appendChild(styleSection)
  if (themeSection) sectionsRow.appendChild(themeSection)
  section.appendChild(sectionsRow)

  ok.addEventListener("click", () => {
    const chips = section.querySelectorAll(".format-chip")
    chips.forEach(element => element.classList.add("disabled"))
    ok.disabled = true

    const sizeVal = isDigital ? selections.size.join(" + ") : selections.size
    const parts = [sizeVal, selections.style, selections.theme].filter(Boolean)
    sendMessageText(parts.join(", "))
  })

  section.appendChild(ok)

  messages.appendChild(section)
  messages.scrollTop = messages.scrollHeight
}


let _progressCard = null

function renderProgressCard(textContent) {
  if (_progressCard) {
    const __progressCard = _progressCard.querySelector(".progress-label")
    __progressCard.textContent = textContent
    return
  }

  const card  = createElement("section", { className: "progress-card" })
  const div   = createElement("div",     { className: "progress-loader" })
  const label = createElement("label",   { className: "progress-label", textContent })

  card.append(div, label)
  messages.appendChild(card)
  messages.scrollTop = messages.scrollHeight
  _progressCard = card
}

function updateProgressCard(label) {
  if (_progressCard) _progressCard.querySelector(".progress-label").textContent = label
}

function removeProgressCard() {
  if (_progressCard) {
    _progressCard.remove()
    _progressCard = null
  }
}

function renderPreviewCard(data) {
  const card    = createElement("section", { className: "preview-card" })
  const wrapper = createElement("figure",  { className: "preview-card-iframe-wrapper" })

  if (data.stream === "digital" && data.adUrl) {
    const width  = data.adWidth  || 300
    const height = data.adHeight || 250

    const iframe = createElement("iframe", {
      src: data.adUrl,
      width,
      height,
      scrolling: "no",
    })

    wrapper.appendChild(iframe)
    card.appendChild(wrapper)

  } else if (data.jpgUrl) card.appendChild(createElement("img", {
    className: "preview-card-img",
    src: data.jpgUrl,
    alt: "Ad preview",
    //style,
  }))

  if (data.projectId) wrapper.appendChild(createElement("figcaption", {
    className: "preview-card-footer",
    textContent: `Project: ${data.projectId}`,
  }))

  const className = "preview-card-btn"
  const buttons = createElement("div", { className: `${className}s` })

  if (data.stream === "digital") {
    if (data.adUrl && data.showPrimaryButton) {
      buttons.appendChild(createElement("a", {
        className,
        role: "button",
        href: data.adUrl,
        target: "_blank",
        rel: "noopener",
        textContent: "View " + ((data.adName || "").replace(/^Digital_/i, "").trim() || "Ad"),
      }))
    }

    const extraAds = data.extraAds || []
    extraAds.forEach(extra => {
      if (!extra.url) return

      const label = (extra.name || "").replace(/^Digital_/i, "").trim() || "View Ad"

      buttons.appendChild(createElement("a", {
        className,
        role: "button",
        href: extra.url,
        target: "_blank",
        rel: "noopener",
        textContent: `View ${label}`,
      }))
    })

    if (data.previewUrl) buttons.appendChild(createElement("a", {
      className,
      role: "button",
      href: data.previewUrl,
      target: "_blank",
      rel: "noopener",
      textContent: "Preview all sizes",
    }))
  } else {
    if (data.editorUrl) buttons.appendChild(createElement("a", {
      className,
      role: "button",
      href: data.editorUrl,
      target: "_blank",
      rel: "noopener",
      textContent: "Edit",
    }))

    if (data.pdfUrl) buttons.appendChild(createElement("a", {
      className,
      role: "button",
      href: data.pdfUrl,
      target: "_blank",
      rel: "noopener",
      textContent: "Download PDF",
    }))

    if (data.jpgUrl) buttons.appendChild(createElement("a", {
      className,
      role: "button",
      href: data.jpgUrl,
      target: "_blank",
      rel: "noopener",
      textContent: "Download JPG",
    }))

    if (data.shareUrl) {
      const button = createElement("button", {
        className: `${className} ${className}-ghost`,
        role: "button",
        textContent: "Copy share link",
      })
      button.addEventListener("click", () => {
        navigator.clipboard.writeText(data.shareUrl).then(() => {
          button.textContent = "Link copied!"
          setTimeout(() => { button.textContent = "Copy share link" }, 2000)
        })
      })
      buttons.appendChild(button)
    }
  }
  messages.append(card, buttons)
  messages.scrollTop = messages.scrollHeight
}

function renderBrandPicker(brands) {
  const section = createElement("section", { id: "brand-picker" })
  const id = "brands"

  section.appendChild(createElement("label", {
    className: "brand-picker-label",
    htmlFor: id,
    textContent: "Select a Brand",
  }))

  if (brands.length > maxBrandSelect) {
    const div = createElement("div")

    const select = createElement("select", {
      id,
      required: true,
      autofocus: true,
      onfocus: "this.selectedIndex = -1",
    })

    select.append(...brands.flatMap((textContent, i) => {
      const options  = []
      const previous = brands[i - 1]
      if (previous && textContent.charAt(0) !== previous.charAt(0)) options.push(createElement("hr"))

      return options.concat(createElement("option", { value: textContent, textContent }))
    }))
    div.appendChild(select)

    const ok = createElement("button", {
      className: "brand-picker-ok",
      textContent: "OK",
    })
    ok.addEventListener("click", () => {
      select.disabled = true
      select.classList.add("selected")
      ok.disabled = true
      sendMessageText(select.value)
    })
    div.appendChild(ok)
    section.appendChild(div)
  } else {
    const buttons = createElement("div", {id})
    brands.forEach(textContent => {
      const button = createElement("button", {
        className: "format-chip",
        textContent,
      })
      button.addEventListener("click", () => {
        const buttons = section.querySelectorAll(".format-chip")
        buttons.forEach(button => button.disabled = true)
        button.classList.add("selected")
        sendMessageText(textContent)
      })
      buttons.appendChild(button)
    })
    section.appendChild(buttons)
  }
  messages.appendChild(section)
  messages.scrollTop = messages.scrollHeight
}

function renderTemplatePicker(templates, stream) {
  const section = createElement("section", { className: "template-picker" })
  let systemChooseBtn = null

  const className = "template-cell"
  const cells = []

  templates.forEach(template => {
    const cell = createElement("figure", {className})
    cells.push(cell)

    if (template.thumbnail) cell.appendChild(createElement("img", {
        src: template.thumbnail,
        alt: template.name,
        loading: "lazy",
      }))
    else cell.appendChild(createElement("img", {
      className: `${className}-placeholder`,
      src: "/static/icons/image-no.svg",
      alt: "No preview",
    }))

    cell.appendChild(createElement("figcaption", {
      className: `${className}-name`,
      textContent: template.name,
    }))

    cell.addEventListener("click", () => {
      cells.forEach(element => console.log(element) ?? element.classList.add("disabled"))
      if (systemChooseBtn) {
        systemChooseBtn.disabled = true
        systemChooseBtn.classList.add("used")
      }
      cell.classList.add("selected")
      sendMessageText(template.name)
    })

    section.appendChild(cell)
  })

  if (stream === "digital") {
    const textContent = "Let the system choose a template"

    systemChooseBtn = createElement("button", { className: "system-choose-btn", textContent })
    systemChooseBtn.addEventListener("click", () => {
      cells.forEach(element => element.classList.add("disabled"))
      systemChooseBtn.disabled = true
      systemChooseBtn.classList.add("used")
      sendMessageText(textContent)
    })
  }
  messages.append(section, systemChooseBtn)
  messages.scrollTop = messages.scrollHeight
}

function renderQuickChips(chips) {
  const className = "quick-chip"
  const div = createElement("div", { className: `${className}s` })

  chips.forEach(textContent => {
    const button = createElement("button", { className, textContent })
    button.addEventListener("click", () => {
      const buttons = div.querySelectorAll(`.${className}`)
      buttons.forEach(element => {
        element.classList.add("used")
        element.disabled = true
      })
      sendMessageText(textContent)
    })
    div.appendChild(button)
  })
  messages.appendChild(div)
  messages.scrollTop = messages.scrollHeight
}

ws.onopen = () => {
  submit.disabled = false
  appendMessage("Connected", "connect")
}

ws.onclose = () => {
  submit.disabled = true
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
          break
        case "update": updateProgressCard(data.label || "")
          break
        case "end": removeProgressCard()
      }
      break
    default:
      submit.disabled = false
      input.disabled  = false
      input.focus()

      appendMessage(data.text, data.type === "error" ? "error" : "received")
      if (data.chips?.length > 0) renderQuickChips(data.chips)
  }
}

function sendMessageText(text) {
  ws.send(JSON.stringify({ type: "message", text }))
  appendMessage(text, "sent")
  input.disabled  = true
  submit.disabled = true
}

function sendMessage() {
  const text = input.value.trim()
  if (!text || ws.readyState !== WebSocket.OPEN) return

  sendMessageText(text)
  input.value = ""
}

submit.onclick = sendMessage
input.addEventListener("keydown", e => { if (e.key === "Enter") sendMessage() })
