const sessionId = typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${proto}://${location.host}/ws/${sessionId}`);

const messagesEl = document.getElementById('messages');
const inputEl    = document.getElementById('message-input');
const sendBtn    = document.getElementById('send-btn');

function renderMarkdown(text) {
  // Escape HTML to prevent injection
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Convert markdown ** to <strong> tags
  let md = escaped.replace(/\*{2}(.+?)\*{2}/g, '<strong>$1</strong>');

  // TODO: Render `-` lists as <ul>/<li>
  //md = md.replace(/^-\s+(.+)\s*$/g, '<li>$1</li>');

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
  const div = document.createElement('div');
  div.className = `message ${type}`;
  if (type === 'received' || type === 'error') {
    div.innerHTML = renderMarkdown(text);
  } else {
    div.textContent = text;
  }
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderFormatPicker(data) {
  // Must match the "Picture + Offer" compatibility rule in prompts.py.
  const PICTURE_OFFER_STYLES = new Set(['Classic', 'Chic', 'Modern']);
  const isDigital = data.size_label === 'Ad Format';
  // Digital sizes are multi-select (array); print size and style/theme are single-select.
  const selections = {
    size:  isDigital ? (data.preselected_size ? [data.preselected_size] : []) : (data.preselected_size || null),
    style: data.preselected_style || null,
    theme: data.preselected_theme || null,
  };

  const hasSizes  = Array.isArray(data.sizes)  && data.sizes.length  > 0;
  const hasStyles = Array.isArray(data.styles) && data.styles.length > 0;
  const hasThemes = Array.isArray(data.themes) && data.themes.length > 0;

  // If nothing needs selecting, send immediately without showing a picker
  if (!hasSizes && !hasStyles && !hasThemes) {
    const sizeVal = isDigital ? selections.size.join(' + ') : selections.size;
    const parts = [sizeVal, selections.style, selections.theme].filter(Boolean);
    if (parts.length) sendMessageText(parts.join(', '));
    return;
  }

  const container = document.createElement('div');
  container.className = 'format-picker';

  const validationMsg = document.createElement('div');
  validationMsg.className = 'format-picker-validation';

  const okBtn = document.createElement('button');
  okBtn.className = 'format-picker-ok';
  okBtn.textContent = 'OK';
  okBtn.disabled = true;

  function updateOk() {
    const sizeOk  = !hasSizes  || (isDigital ? selections.size.length > 0 : !!selections.size);
    const styleOk = !hasStyles || !!selections.style;
    const themeOk = !hasThemes || !!selections.theme;
    const incompatible = selections.theme === 'Picture + Offer'
                      && !!selections.style
                      && !PICTURE_OFFER_STYLES.has(selections.style);
    if (incompatible) {
      validationMsg.textContent = '"Picture + Offer" is only available with Classic, Chic, or Modern.';
      validationMsg.style.display = 'block';
    } else {
      validationMsg.style.display = 'none';
    }
    okBtn.disabled = !(sizeOk && styleOk && themeOk && !incompatible);
  }

  function makeSection(key, label, options, multiSelect) {
    if (!options || !options.length) return null;
    const section = document.createElement('div');
    section.className = 'format-picker-section';
    const lbl = document.createElement('div');
    lbl.className = 'format-picker-label';
    lbl.textContent = label + (multiSelect ? ' (select one or more)' : '');
    section.appendChild(lbl);
    const chips = document.createElement('div');
    chips.className = 'format-picker-chips';
    options.forEach(opt => {
      const chip = document.createElement('div');
      chip.className = 'format-chip';
      chip.textContent = opt;
      chip.addEventListener('click', () => {
        if (multiSelect) {
          chip.classList.toggle('selected');
          if (chip.classList.contains('selected')) {
            selections[key].push(opt);
          } else {
            selections[key] = selections[key].filter(v => v !== opt);
          }
        } else {
          chips.querySelectorAll('.format-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
          selections[key] = opt;
        }
        updateOk();
      });
      chips.appendChild(chip);
    });
    section.appendChild(chips);
    return section;
  }

  const sizeSection  = makeSection('size',  data.size_label || 'Page Size', data.sizes, isDigital);
  const styleSection = makeSection('style', 'Style',     data.styles, false);
  const themeSection = makeSection('theme', 'Theme',     data.themes, false);

  // Sections in a horizontal row so all are visible at once
  const sectionsRow = document.createElement('div');
  sectionsRow.className = 'format-picker-sections';
  if (sizeSection)  sectionsRow.appendChild(sizeSection);
  if (styleSection) sectionsRow.appendChild(styleSection);
  if (themeSection) sectionsRow.appendChild(themeSection);
  container.appendChild(sectionsRow);

  container.appendChild(validationMsg);

  okBtn.addEventListener('click', () => {
    container.querySelectorAll('.format-chip').forEach(c => c.classList.add('disabled'));
    okBtn.disabled = true;
    const sizeVal = isDigital ? selections.size.join(' + ') : selections.size;
    const parts = [sizeVal, selections.style, selections.theme].filter(Boolean);
    sendMessageText(parts.join(', '));
  });

  const footer = document.createElement('div');
  footer.className = 'format-picker-footer';
  footer.appendChild(okBtn);
  container.appendChild(footer);

  messagesEl.appendChild(container);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  // Initialise button state in case preselected values already satisfy all requirements
  updateOk();
}

let _progressCard = null;

function renderProgressCard(label) {
  if (_progressCard) {
    _progressCard.querySelector('.progress-label').textContent = label;
    return;
  }
  const card = document.createElement('div');
  card.className = 'progress-card';
  const spinner = document.createElement('div');
  spinner.className = 'progress-spinner';
  card.appendChild(spinner);
  const lbl = document.createElement('div');
  lbl.className = 'progress-label';
  lbl.textContent = label;
  card.appendChild(lbl);
  messagesEl.appendChild(card);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  _progressCard = card;
}

function updateProgressCard(label) {
  if (_progressCard) _progressCard.querySelector('.progress-label').textContent = label;
}

function removeProgressCard() {
  if (_progressCard) { _progressCard.remove(); _progressCard = null; }
}

function renderPreviewCard(data) {
  const card = document.createElement('div');
  card.className = 'preview-card';

  if (data.stream === 'digital' && data.adUrl) {
    const w = data.adWidth || 300;
    const h = data.adHeight || 250;
    const wrapper = document.createElement('div');
    wrapper.className = 'preview-card-iframe-wrapper';
    wrapper.style.cssText = `width:${w}px;height:${h}px;`;
    const iframe = document.createElement('iframe');
    iframe.src = data.adUrl;
    iframe.width = w;
    iframe.height = h;
    iframe.style.cssText = 'border:none;display:block;';
    iframe.setAttribute('scrolling', 'no');
    wrapper.appendChild(iframe);
    card.appendChild(wrapper);
  } else if (data.jpgUrl) {
    const img = document.createElement('img');
    img.className = 'preview-card-img';
    img.style.cssText = 'display:block;max-width:100%;max-height:450px;width:auto;height:auto;margin:0 auto;';
    img.src = data.jpgUrl;
    img.alt = 'Ad preview';
    card.appendChild(img);
  }

  const footer = document.createElement('div');
  footer.className = 'preview-card-footer';

  const id = document.createElement('div');
  id.className = 'preview-card-id';
  id.textContent = data.projectId ? `Project: ${data.projectId}` : '';
  footer.appendChild(id);

  const btns = document.createElement('div');
  btns.className = 'preview-card-btns';

  if (data.stream === 'digital') {
    if (data.adUrl && data.showPrimaryButton) {
      const btn = document.createElement('a');
      btn.className = 'preview-card-btn';
      btn.href = data.adUrl;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.textContent = 'View ' + ((data.adName || '').replace(/^Digital_/i, '').trim() || 'Ad');
      btns.appendChild(btn);
    }
    (data.extraAds || []).forEach(extra => {
      if (!extra.url) return;
      const label = (extra.name || '').replace(/^Digital_/i, '').trim() || 'View Ad';
      const btn = document.createElement('a');
      btn.className = 'preview-card-btn';
      btn.href = extra.url;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.textContent = `View ${label}`;
      btns.appendChild(btn);
    });
    if (data.previewUrl) {
      const btn = document.createElement('a');
      btn.className = 'preview-card-btn';
      btn.href = data.previewUrl;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.textContent = 'Preview all sizes';
      btns.appendChild(btn);
    }
  } else {
    if (data.editorUrl) {
      const btn = document.createElement('a');
      btn.className = 'preview-card-btn';
      btn.href = data.editorUrl;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.textContent = 'Edit';
      btns.appendChild(btn);
    }
    if (data.pdfUrl) {
      const btn = document.createElement('a');
      btn.className = 'preview-card-btn';
      btn.href = data.pdfUrl;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.textContent = 'Download PDF';
      btns.appendChild(btn);
    }
    if (data.jpgUrl) {
      const btn = document.createElement('a');
      btn.className = 'preview-card-btn';
      btn.href = data.jpgUrl;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.textContent = 'Download JPG';
      btns.appendChild(btn);
    }
    if (data.shareUrl) {
      const btn = document.createElement('button');
      btn.className = 'preview-card-btn preview-card-btn-ghost';
      btn.textContent = 'Copy share link';
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(data.shareUrl).then(() => {
          btn.textContent = 'Link copied!';
          setTimeout(() => { btn.textContent = 'Copy share link'; }, 2000);
        });
      });
      btns.appendChild(btn);
    }
  }

  footer.appendChild(btns);
  card.appendChild(footer);
  messagesEl.appendChild(card);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderBrandPicker(brands) {
  const container = document.createElement('div');
  container.className = 'brand-picker';

  const label = document.createElement('div');
  label.className = 'brand-picker-label';
  label.textContent = 'Select a Brand';
  container.appendChild(label);

  const chips = document.createElement('div');
  chips.className = 'brand-picker-chips';

  brands.forEach(name => {
    const chip = document.createElement('div');
    chip.className = 'format-chip';
    chip.textContent = name;
    chip.addEventListener('click', () => {
      container.querySelectorAll('.format-chip').forEach(c => c.classList.add('disabled'));
      chip.classList.add('selected');
      sendMessageText(name);
    });
    chips.appendChild(chip);
  });

  container.appendChild(chips);
  messagesEl.appendChild(container);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderTemplatePicker(templates, stream) {
  const container = document.createElement('div');
  container.className = 'template-picker';
  let systemChooseBtn = null;

  templates.forEach(t => {
    const cell = document.createElement('div');
    cell.className = 'template-cell';

    if (t.thumbnail) {
      const img = document.createElement('img');
      img.src = t.thumbnail;
      img.alt = t.name;
      img.loading = 'lazy';
      cell.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'template-cell-placeholder';
      placeholder.textContent = 'No preview';
      cell.appendChild(placeholder);
    }

    const nameEl = document.createElement('div');
    nameEl.className = 'template-cell-name';
    nameEl.textContent = t.name;
    cell.appendChild(nameEl);

    cell.addEventListener('click', () => {
      container.querySelectorAll('.template-cell').forEach(c => c.classList.add('disabled'));
      if (systemChooseBtn) { systemChooseBtn.disabled = true; systemChooseBtn.classList.add('used'); }
      cell.classList.add('selected');
      sendMessageText(t.name);
    });

    container.appendChild(cell);
  });

  const wrapper = document.createElement('div');
  wrapper.appendChild(container);
  if (stream === 'digital') {
    systemChooseBtn = document.createElement('button');
    systemChooseBtn.className = 'system-choose-btn';
    systemChooseBtn.textContent = 'Let the system choose a template';
    systemChooseBtn.addEventListener('click', () => {
      container.querySelectorAll('.template-cell').forEach(c => c.classList.add('disabled'));
      systemChooseBtn.disabled = true;
      systemChooseBtn.classList.add('used');
      sendMessageText('Let the system choose a template');
    });
    wrapper.appendChild(systemChooseBtn);
  }
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderQuickChips(chips) {
  const row = document.createElement('div');
  row.className = 'quick-chips';
  chips.forEach(label => {
    const btn = document.createElement('button');
    btn.className = 'quick-chip';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      row.querySelectorAll('.quick-chip').forEach(c => {
        c.classList.add('used');
        c.disabled = true;
      });
      sendMessageText(label);
    });
    row.appendChild(btn);
  });
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

ws.onopen = () => {
  sendBtn.disabled = false;
  appendMessage('Connected', 'system');
};

ws.onclose = () => {
  sendBtn.disabled = true;
  appendMessage('Disconnected', 'system');
};

ws.onerror = () => {
  appendMessage('Connection error', 'system');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'template_picker') {
    renderTemplatePicker(data.templates, data.stream);
  } else if (data.type === 'format_picker') {
    renderFormatPicker(data);
  } else if (data.type === 'brand_picker') {
    renderBrandPicker(data.brands);
  } else if (data.type === 'preview_card') {
    renderPreviewCard(data);
  } else if (data.type === 'progress') {
    if (data.status === 'start') renderProgressCard(data.label || 'Working…');
    else if (data.status === 'update') updateProgressCard(data.label || '');
    else if (data.status === 'end') removeProgressCard();
  } else {
    sendBtn.disabled = false;
    inputEl.disabled = false;
    appendMessage(data.text, data.type === 'error' ? 'error' : 'received');
    if (data.chips && data.chips.length) renderQuickChips(data.chips);
  }
};

function sendMessageText(text) {
  appendMessage(text, 'sent');
  sendBtn.disabled = true;
  inputEl.disabled = true;
  ws.send(JSON.stringify({ type: 'message', text }));
}

function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || ws.readyState !== WebSocket.OPEN) return;
  sendMessageText(text);
  inputEl.value = '';
}

sendBtn.onclick = sendMessage;
inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
