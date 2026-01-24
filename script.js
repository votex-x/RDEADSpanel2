const firebaseConfig = {
    apiKey: "AIzaSyCQEWuN7HENN_HkS2pU4EJ2mnB1EgIVRVQ",
    authDomain: "reino-do-extase.firebaseapp.com",
    databaseURL: "https://reino-do-extase-default-rtdb.firebaseio.com",
    projectId: "reino-do-extase",
    storageBucket: "reino-do-extase.firebasestorage.app",
    messagingSenderId: "528850283325",
    appId: "1:528850283325:web:8fa079f20e6fc493b6f354",
    measurementId: "G-SRT7KJL2XM"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const GUILD_ID = "1300572902319722559";

let currentAnnId = null;
let serverData = null;
let isRemoteUpdate = false;
const sessionID = Math.random().toString(36).substring(7);
let botStatusCheckInterval = null;

// ===== PRESENCE =====
function setupPresence() {
    const ref = database.ref(`presence/${sessionID}`);
    ref.set({ 
        id: sessionID, 
        last_active: firebase.database.ServerValue.TIMESTAMP, 
        editing: currentAnnId 
    });
    ref.onDisconnect().remove();
}

database.ref('presence').on('value', (snap) => {
    const container = document.getElementById('active-admins');
    container.innerHTML = '';
    const data = snap.val();
    if (data) {
        Object.values(data).forEach(p => {
            if (p.id !== sessionID && p.editing === currentAnnId) {
                const img = document.createElement('img');
                img.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.id}`;
                img.className = 'admin-avatar';
                img.title = "Outro admin editando...";
                container.appendChild(img);
            }
        });
    }
});

// ===== UI HELPERS =====
function format(cmd) {
    const area = document.getElementById('embed-desc');
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const text = area.value;
    const selected = text.substring(start, end);
    let tag = cmd === 'bold' ? '**' : (cmd === 'italic' ? '*' : '__');
    area.value = text.substring(0, start) + tag + selected + tag + text.substring(end);
    updatePreview();
    autoSave();
}

function insertTemplate(template) {
    const area = document.getElementById('embed-desc');
    const start = area.selectionStart;
    area.value = area.value.substring(0, start) + template + area.value.substring(start);
    area.selectionStart = area.selectionEnd = start + template.length;
    area.focus();
    updatePreview();
    autoSave();
}

function toggleConfigs() {
    const type = document.getElementById('ann-schedule-type').value;
    document.getElementById('smart-info').style.display = type === 'smart' ? 'flex' : 'none';
    document.getElementById('interval-config').style.display = type === 'interval' ? 'block' : 'none';
    document.getElementById('fixed-config').style.display = type === 'fixed' ? 'block' : 'none';
    document.getElementById('cam-config').style.display = document.getElementById('cam-mode').checked ? 'block' : 'none';
}

function updateExpiryCountdown() {
    const expiryInput = document.getElementById('ann-expiry-date');
    const warningBox = document.getElementById('expiry-warning');
    const countdown = document.getElementById('expiry-countdown');
    
    if (!expiryInput.value) {
        warningBox.style.display = 'none';
        return;
    }
    
    const expiryDate = new Date(expiryInput.value);
    const now = new Date();
    const diff = expiryDate - now;
    
    if (diff <= 0) {
        countdown.textContent = 'Expirado';
        warningBox.style.display = 'flex';
        warningBox.style.borderColor = 'rgba(255, 59, 48, 0.2)';
        warningBox.style.background = 'rgba(255, 59, 48, 0.1)';
        warningBox.style.color = 'var(--danger)';
    } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        let timeStr = '';
        if (days > 0) timeStr += `${days}d `;
        if (hours > 0) timeStr += `${hours}h `;
        timeStr += `${minutes}m`;
        
        countdown.textContent = timeStr;
        warningBox.style.display = 'flex';
    }
}

// ===== DATA LOADING =====
function loadServerData() {
    database.ref(`servers/${GUILD_ID}`).on('value', (snap) => {
        serverData = snap.val();
        if (serverData) {
            // Verificar status do bot com melhor lógica
            const lastPing = serverData.last_ping ? new Date(serverData.last_ping).getTime() : 0;
            const now = Date.now();
            const isOnline = (now - lastPing) < 300000; // 5 minutos
            
            const dot = document.getElementById('bot-online-dot');
            const text = document.getElementById('bot-status-text');
            
            dot.classList.toggle('online', isOnline);
            text.innerText = isOnline ? 'Bot Online' : 'Bot Offline';
            
            // Carregar canais
            const select = document.getElementById('ann-channel');
            const current = select.value;
            if (serverData.channels && Array.isArray(serverData.channels)) {
                select.innerHTML = serverData.channels
                    .map(c => `<option value="${c.id}"># ${c.name}</option>`)
                    .join('');
                if (current) select.value = current;
            }
            
            // Carregar emojis com filtro
            if (serverData.emojis && Array.isArray(serverData.emojis)) {
                renderEmojiPicker(serverData.emojis);
            }
            
            updatePreview();
        }
    });
}

function renderEmojiPicker(emojis) {
    const pickerGrid = document.getElementById('emoji-picker-grid');
    if (!pickerGrid) return;
    
    const emojiHtml = emojis.map(e => {
        const emojiCode = e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`;
        return `
            <img src="${e.url}" 
                 class="emoji-picker-item" 
                 title=":${e.name}:" 
                 data-emoji="${emojiCode}"
                 data-animated="${e.animated || false}"
                 onclick="insertEmoji('${emojiCode.replace(/'/g, "\\'")}')"
                 alt="${e.name}">
        `;
    }).join('');
    
    pickerGrid.innerHTML = emojiHtml;
}

function filterEmojis(filter) {
    if (!serverData?.emojis) return;
    
    const filtered = serverData.emojis.filter(e => {
        if (filter === 'all') return true;
        if (filter === 'static') return !e.animated;
        if (filter === 'animated') return e.animated;
        return true;
    });
    
    renderEmojiPicker(filtered);
}

function insertEmoji(code) {
    const area = document.getElementById('embed-desc');
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const text = area.value;
    
    area.value = text.substring(0, start) + code + text.substring(end);
    
    const newPos = start + code.length;
    area.setSelectionRange(newPos, newPos);
    area.focus();
    
    updatePreview();
    autoSave();
}

function loadAnnouncements() {
    database.ref('announcements').on('value', (snap) => {
        const list = document.getElementById('announcements-list');
        const data = snap.val();
        list.innerHTML = '';
        
        let totalCount = 0;
        let activeCount = 0;
        let expiredCount = 0;
        
        if (data) {
            Object.keys(data).forEach(id => {
                totalCount++;
                const ann = data[id];
                
                // Determinar status
                let status = 'active';
                let statusLabel = 'Ativo';
                let statusClass = 'active';
                
                if (!ann.active) {
                    status = 'inactive';
                    statusLabel = 'Inativo';
                    statusClass = 'inactive';
                } else if (ann.expiry_date) {
                    const expiryDate = new Date(ann.expiry_date);
                    if (expiryDate < new Date()) {
                        status = 'expired';
                        statusLabel = 'Expirado';
                        statusClass = 'expired';
                        expiredCount++;
                    } else {
                        activeCount++;
                    }
                } else if (ann.schedule_type === 'fixed' || ann.schedule_type === 'interval') {
                    activeCount++;
                } else {
                    activeCount++;
                }
                
                const div = document.createElement('div');
                div.className = `ann-item ${currentAnnId === id ? 'active' : ''}`;
                div.innerHTML = `
                    <div class="ann-item-header">
                        <span class="ann-item-title">${ann.title || ann.embed?.title || 'Sem título'}</span>
                        <span class="ann-item-status ${statusClass}">
                            <i class="fas fa-${statusClass === 'active' ? 'check-circle' : statusClass === 'expired' ? 'times-circle' : 'pause-circle'}"></i>
                            ${statusLabel}
                        </span>
                    </div>
                    <div class="ann-item-meta">
                        <span>${ann.schedule_type || 'smart'}</span>
                        <span>${ann.last_sent ? new Date(ann.last_sent).toLocaleDateString('pt-BR') : 'Nunca'}</span>
                    </div>
                `;
                div.onclick = () => selectAnnouncement(id, data[id]);
                list.appendChild(div);
            });
        }
        
        // Atualizar estatísticas
        document.getElementById('stat-total').textContent = totalCount;
        document.getElementById('stat-active').textContent = activeCount;
        document.getElementById('stat-expired').textContent = expiredCount;
    });
}

function selectAnnouncement(id, data) {
    currentAnnId = id;
    database.ref(`presence/${sessionID}/editing`).set(id);
    
    // Atualizar título
    const title = data.title || data.embed?.title || 'Editando Anúncio';
    document.getElementById('current-ann-title').innerText = title;
    
    // Informações básicas
    document.getElementById('ann-title').value = data.title || '';
    document.getElementById('ann-active').checked = data.active !== false;
    document.getElementById('ann-start-date').value = data.start_date || '';
    document.getElementById('ann-expiry-date').value = data.expiry_date || '';
    updateExpiryCountdown();
    
    // Agendamento
    document.getElementById('ann-channel').value = data.channel_id || '';
    
    const type = data.schedule_type || 'smart';
    document.getElementById('ann-schedule-type').value = type;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === type));
    
    document.getElementById('ann-interval-hours').value = data.interval_hours || 1;
    document.getElementById('ann-interval-minutes').value = data.interval_minutes || 0;
    document.getElementById('ann-fixed-times').value = (data.fixed_times || []).join(', ');
    
    // Embed
    const embed = data.embed || {};
    document.getElementById('embed-title').value = embed.title || '';
    document.getElementById('embed-desc').value = embed.description || '';
    document.getElementById('embed-color').value = embed.color || '#5865f2';
    document.getElementById('embed-thumb').value = embed.thumbnail || '';
    document.getElementById('embed-image').value = embed.image || '';
    document.getElementById('embed-footer-text').value = embed.footer_text || '';
    document.getElementById('embed-footer-icon').value = embed.footer_icon || '';
    
    // Campos customizáveis
    loadFields(embed.fields || []);
    
    // Botões
    loadButtons(embed.buttons || []);
    
    // Camuflagem
    document.getElementById('cam-mode').checked = data.camouflage_mode || false;
    document.getElementById('cam-user-id').value = data.cam_user_id || '';
    document.getElementById('cam-name').value = data.cam_name || '';
    document.getElementById('cam-avatar').value = data.cam_avatar || '';
    
    toggleConfigs();
    updatePreview();
    loadLogs(id);
}

function loadFields(fields) {
    const container = document.getElementById('fields-container');
    container.innerHTML = '';
    
    fields.forEach((field, index) => {
        addFieldUI(index, field);
    });
}

function addFieldUI(index, field = {}) {
    const container = document.getElementById('fields-container');
    const div = document.createElement('div');
    div.className = 'field-item';
    div.innerHTML = `
        <input type="text" placeholder="Nome do campo" value="${field.name || ''}" class="field-name-input" data-index="${index}">
        <input type="text" placeholder="Valor do campo" value="${field.value || ''}" class="field-value-input" data-index="${index}">
        <label style="display:flex; align-items:center; gap:4px; margin:0; padding:0;">
            <input type="checkbox" ${field.inline ? 'checked' : ''} class="field-inline-input" data-index="${index}">
            <span style="font-size:11px;">Inline</span>
        </label>
        <button onclick="removeField(${index})" title="Remover"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(div);
}

function removeField(index) {
    const container = document.getElementById('fields-container');
    const items = container.querySelectorAll('.field-item');
    if (items[index]) {
        items[index].remove();
    }
    autoSave();
}

function loadButtons(buttons) {
    const container = document.getElementById('buttons-container');
    container.innerHTML = '';
    
    buttons.forEach((button, index) => {
        addButtonUI(index, button);
    });
}

function addButtonUI(index, button = {}) {
    const container = document.getElementById('buttons-container');
    const div = document.createElement('div');
    div.className = 'button-item';
    div.innerHTML = `
        <input type="text" placeholder="Label do botão" value="${button.label || ''}" class="button-label-input" data-index="${index}">
        <input type="text" placeholder="URL do botão" value="${button.url || ''}" class="button-url-input" data-index="${index}">
        <select class="button-style-input" data-index="${index}">
            <option value="primary" ${button.style === 'primary' ? 'selected' : ''}>Azul (Primary)</option>
            <option value="secondary" ${button.style === 'secondary' ? 'selected' : ''}>Cinza (Secondary)</option>
            <option value="success" ${button.style === 'success' ? 'selected' : ''}>Verde (Success)</option>
            <option value="danger" ${button.style === 'danger' ? 'selected' : ''}>Vermelho (Danger)</option>
        </select>
        <button onclick="removeButton(${index})" title="Remover"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(div);
}

function removeButton(index) {
    const container = document.getElementById('buttons-container');
    const items = container.querySelectorAll('.button-item');
    if (items[index]) {
        items[index].remove();
    }
    autoSave();
}

function loadLogs(id) {
    const container = document.getElementById('ann-logs');
    database.ref(`logs/${id}`).limitToLast(10).on('value', (snap) => {
        const logs = snap.val();
        if (!logs) {
            container.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:10px;">Nenhum log encontrado.</div>';
            return;
        }
        container.innerHTML = Object.values(logs).reverse().map(log => {
            const date = new Date(log.timestamp).toLocaleString('pt-BR');
            const statusClass = log.status === 'success' ? 'success' : (log.status === 'error' ? 'error' : '');
            return `<div class="log-item ${statusClass}">
                [${date}] ${log.type.toUpperCase()}: ${log.status || log.message}
            </div>`;
        }).join('');
    });
}

// ===== PREVIEW & SAVE =====
function updatePreview() {
    document.getElementById('p-title').innerText = document.getElementById('embed-title').value;
    
    let desc = document.getElementById('embed-desc').value;
    if (serverData?.emojis) {
        serverData.emojis.forEach(e => {
            const emojiCode = e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`;
            desc = desc.split(emojiCode).join(`<img src="${e.url}" class="d-emoji">`);
        });
    }
    document.getElementById('p-desc').innerHTML = desc
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .replace(/__(.*?)__/g, '<u>$1</u>')
        .replace(/\n/g, '<br>');
    
    document.getElementById('p-color').style.background = document.getElementById('embed-color').value;
    
    const thumb = document.getElementById('embed-thumb').value;
    document.getElementById('p-thumb').src = thumb;
    document.getElementById('p-thumb').style.display = thumb ? 'block' : 'none';
    
    const img = document.getElementById('embed-image').value;
    document.getElementById('p-image').src = img;
    document.getElementById('p-image').style.display = img ? 'block' : 'none';
    
    document.getElementById('p-footer-text').innerText = document.getElementById('embed-footer-text').value;
    const fIcon = document.getElementById('embed-footer-icon').value;
    document.getElementById('p-footer-icon').src = fIcon;
    document.getElementById('p-footer-icon').style.display = fIcon ? 'block' : 'none';
    
    // Preview de campos
    const fieldsContainer = document.getElementById('p-fields');
    const fieldItems = document.querySelectorAll('.field-item');
    let fieldsHtml = '';
    fieldItems.forEach(item => {
        const name = item.querySelector('.field-name-input').value;
        const value = item.querySelector('.field-value-input').value;
        if (name && value) {
            fieldsHtml += `<div class="d-field"><div class="d-field-name">${name}</div><div class="d-field-value">${value}</div></div>`;
        }
    });
    fieldsContainer.innerHTML = fieldsHtml;
    
    // Preview de botões
    const buttonsContainer = document.getElementById('p-buttons');
    const buttonItems = document.querySelectorAll('.button-item');
    let buttonsHtml = '';
    buttonItems.forEach(item => {
        const label = item.querySelector('.button-label-input').value;
        const style = item.querySelector('.button-style-input').value;
        if (label) {
            buttonsHtml += `<div class="d-button ${style}">${label}</div>`;
        }
    });
    buttonsContainer.innerHTML = buttonsHtml;
    
    // Camuflagem
    if (document.getElementById('cam-mode').checked) {
        document.getElementById('p-name').innerText = document.getElementById('cam-name').value || 'Vendedora';
        document.getElementById('p-avatar').src = document.getElementById('cam-avatar').value || 'https://cdn.discordapp.com/embed/avatars/0.png';
    } else {
        document.getElementById('p-name').innerText = 'Bot de Anúncios';
        document.getElementById('p-avatar').src = 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
}

let autoSaveTimeout;
function autoSave() {
    if (!currentAnnId) return;
    document.getElementById('save-status').innerText = 'Digitando...';
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => saveData(true), 1500);
}

function saveData(isAuto = false) {
    if (!currentAnnId) return;
    
    // Coletar campos
    const fields = [];
    document.querySelectorAll('.field-item').forEach(item => {
        const name = item.querySelector('.field-name-input').value;
        const value = item.querySelector('.field-value-input').value;
        const inline = item.querySelector('.field-inline-input').checked;
        if (name && value) {
            fields.push({ name, value, inline });
        }
    });
    
    // Coletar botões
    const buttons = [];
    document.querySelectorAll('.button-item').forEach(item => {
        const label = item.querySelector('.button-label-input').value;
        const url = item.querySelector('.button-url-input').value;
        const style = item.querySelector('.button-style-input').value;
        if (label && url) {
            buttons.push({ label, url, style });
        }
    });
    
    const data = {
        title: document.getElementById('ann-title').value,
        active: document.getElementById('ann-active').checked,
        start_date: document.getElementById('ann-start-date').value,
        expiry_date: document.getElementById('ann-expiry-date').value,
        channel_id: document.getElementById('ann-channel').value,
        schedule_type: document.getElementById('ann-schedule-type').value,
        interval_hours: parseInt(document.getElementById('ann-interval-hours').value) || 0,
        interval_minutes: parseInt(document.getElementById('ann-interval-minutes').value) || 0,
        fixed_times: document.getElementById('ann-fixed-times').value.split(',').map(t => t.trim()).filter(t => t),
        camouflage_mode: document.getElementById('cam-mode').checked,
        cam_user_id: document.getElementById('cam-user-id').value,
        cam_name: document.getElementById('cam-name').value,
        cam_avatar: document.getElementById('cam-avatar').value,
        embed: {
            title: document.getElementById('embed-title').value,
            description: document.getElementById('embed-desc').value,
            color: document.getElementById('embed-color').value,
            image: document.getElementById('embed-image').value,
            thumbnail: document.getElementById('embed-thumb').value,
            footer_text: document.getElementById('embed-footer-text').value,
            footer_icon: document.getElementById('embed-footer-icon').value,
            fields: fields,
            buttons: buttons
        },
        last_editor: sessionID
    };
    
    database.ref('announcements/' + currentAnnId).update(data).then(() => {
        document.getElementById('save-status').innerText = 'Salvo';
        setTimeout(() => {
            if (document.getElementById('save-status').innerText === 'Salvo') {
                document.getElementById('save-status').innerText = 'Pronto';
            }
        }, 2000);
    }).catch(err => {
        document.getElementById('save-status').innerText = 'Erro ao salvar';
        console.error('Erro ao salvar:', err);
    });
}

// ===== EVENTS =====
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('ann-schedule-type').value = btn.dataset.mode;
        toggleConfigs();
        autoSave();
    };
});

document.getElementById('ann-active').onchange = autoSave;
document.getElementById('cam-mode').onchange = () => { toggleConfigs(); autoSave(); };
document.getElementById('ann-expiry-date').onchange = () => { updateExpiryCountdown(); autoSave(); };

document.querySelectorAll('input, textarea, select').forEach(el => {
    el.oninput = () => { updatePreview(); autoSave(); };
});

document.getElementById('save-btn').onclick = () => saveData(false);

document.getElementById('send-now-btn').onclick = () => {
    if (!currentAnnId) return alert('Selecione um anúncio!');
    database.ref(`announcements/${currentAnnId}/trigger_send`).set(true);
    alert('Comando enviado!');
};

document.getElementById('new-announcement-btn').onclick = () => {
    const id = database.ref().child('announcements').push().key;
    currentAnnId = id;
    document.querySelectorAll('input:not([type=hidden]), textarea').forEach(el => el.value = '');
    document.getElementById('ann-active').checked = true;
    document.getElementById('ann-schedule-type').value = 'smart';
    document.getElementById('fields-container').innerHTML = '';
    document.getElementById('buttons-container').innerHTML = '';
    saveData(true);
};

document.getElementById('delete-btn').onclick = () => {
    if(currentAnnId && confirm('Excluir este anúncio?')) {
        database.ref('announcements/' + currentAnnId).remove().then(() => {
            currentAnnId = null;
            document.querySelectorAll('input:not([type=hidden]), textarea').forEach(el => el.value = '');
            document.getElementById('fields-container').innerHTML = '';
            document.getElementById('buttons-container').innerHTML = '';
        });
    }
};

document.getElementById('add-field-btn').onclick = () => {
    const index = document.querySelectorAll('.field-item').length;
    addFieldUI(index);
    autoSave();
};

document.getElementById('add-button-btn').onclick = () => {
    const index = document.querySelectorAll('.button-item').length;
    addButtonUI(index);
    autoSave();
};

// Emoji picker
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');

if (emojiBtn && emojiPicker) {
    emojiBtn.onclick = (e) => {
        e.preventDefault();
        emojiPicker.classList.toggle('active');
    };
    
    document.addEventListener('click', (e) => {
        if (!emojiBtn.contains(e.target) && !emojiPicker.contains(e.target)) {
            emojiPicker.classList.remove('active');
        }
    });
}

// Emoji filters
document.querySelectorAll('.emoji-filter').forEach(btn => {
    btn.onclick = (e) => {
        document.querySelectorAll('.emoji-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterEmojis(btn.dataset.filter);
    };
});

// Mobile sidebar
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');
const openBtn = document.getElementById('open-sidebar');
const closeBtn = document.getElementById('close-sidebar');

if (openBtn) {
    openBtn.onclick = () => {
        sidebar.classList.add('active');
        overlay.classList.add('active');
    };
}

if (closeBtn) {
    closeBtn.onclick = () => {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    };
}

if (overlay) {
    overlay.onclick = () => {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    };
}

// Search
document.getElementById('search-ann').oninput = (e) => {
    const query = e.target.value.toLowerCase();
    document.querySelectorAll('.ann-item').forEach(item => {
        const title = item.querySelector('.ann-item-title').textContent.toLowerCase();
        item.style.display = title.includes(query) ? 'block' : 'none';
    });
};

// Inicializar
loadServerData();
loadAnnouncements();
setupPresence();

// Atualizar countdown a cada minuto
setInterval(updateExpiryCountdown, 60000);
