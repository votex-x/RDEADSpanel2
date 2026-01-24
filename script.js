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
let charts = { sendChart: null, statusChart: null };
let allAnnouncements = {};

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', () => {
    loadServerData();
    loadAnnouncements();
    setupPresence();
    setupNavigation();
    setupEventListeners();
    updateDashboard();
    setInterval(updateDashboard, 30000); // Atualizar dashboard a cada 30s
});

// ===== NAVEGAÇÃO =====
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            navigateTo(page);
        });
    });
}

function navigateTo(page) {
    // Atualizar botões de navegação
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === page);
    });

    // Esconder todas as páginas
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // Mostrar página selecionada
    const pageEl = document.getElementById(`${page}-page`);
    if (pageEl) {
        pageEl.classList.add('active');
        document.getElementById('page-title').textContent = 
            page === 'dashboard' ? 'Dashboard' :
            page === 'announcements' ? 'Anúncios' :
            page === 'create' ? 'Novo Anúncio' :
            'Configurações';
    }

    // Fechar sidebar em mobile
    closeSidebar();

    // Inicializar gráficos se necessário
    if (page === 'dashboard' && !charts.sendChart) {
        initCharts();
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
}

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

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    // Botões de ação
    document.getElementById('save-btn').addEventListener('click', () => saveAnnouncement(false));
    document.getElementById('send-now-btn').addEventListener('click', sendAnnouncement);
    document.getElementById('delete-btn').addEventListener('click', deleteAnnouncement);
    document.getElementById('new-ann-btn').addEventListener('click', createNewAnnouncement);

    // Campos de entrada
    document.getElementById('ann-active').addEventListener('change', autoSave);
    document.getElementById('cam-mode').addEventListener('change', () => {
        toggleCamouflageConfig();
        autoSave();
    });
    document.getElementById('ann-expiry-date').addEventListener('change', updateExpiryCountdown);

    // Agendamento
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('ann-schedule-type').value = btn.dataset.mode;
            toggleScheduleConfig();
            autoSave();
        });
    });

    // Campos e botões
    document.getElementById('add-field-btn').addEventListener('click', addFieldUI);
    document.getElementById('add-button-btn').addEventListener('click', addButtonUI);

    // Emoji picker
    setupEmojiPicker();

    // Busca
    document.getElementById('search-ann').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.ann-card').forEach(card => {
            const title = card.querySelector('.ann-card-title').textContent.toLowerCase();
            card.style.display = title.includes(query) ? 'block' : 'none';
        });
    });

    // Mobile sidebar
    document.getElementById('open-sidebar').addEventListener('click', () => {
        document.getElementById('sidebar').classList.add('active');
        document.getElementById('sidebar-overlay').classList.add('active');
    });

    document.getElementById('close-sidebar').addEventListener('click', closeSidebar);
    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

    // Atualizar preview em tempo real
    const editableFields = document.querySelectorAll(
        '#embed-title, #embed-desc, #embed-color, #embed-thumb, #embed-image, ' +
        '#embed-footer-text, #embed-footer-icon, #cam-name, #cam-avatar'
    );
    editableFields.forEach(field => {
        field.addEventListener('input', updatePreview);
    });
}

// ===== DATA LOADING =====
function loadServerData() {
    database.ref(`servers/${GUILD_ID}`).on('value', (snap) => {
        serverData = snap.val();
        if (serverData) {
            // Atualizar status do bot
            updateBotStatus();

            // Carregar canais
            if (serverData.channels && Array.isArray(serverData.channels)) {
                const select = document.getElementById('ann-channel');
                const current = select.value;
                select.innerHTML = serverData.channels
                    .map(c => `<option value="${c.id}"># ${c.name}</option>`)
                    .join('');
                if (current) select.value = current;
            }

            // Carregar emojis
            if (serverData.emojis && Array.isArray(serverData.emojis)) {
                renderEmojiPicker(serverData.emojis);
            }

            // Atualizar info do servidor no dashboard
            document.getElementById('server-name').textContent = serverData.name || '--';
            document.getElementById('server-members').textContent = serverData.members_count || '--';
            document.getElementById('server-channels').textContent = serverData.channels?.length || '--';
            document.getElementById('server-emojis').textContent = serverData.emojis?.length || '--';

            updatePreview();
        }
    });
}

function updateBotStatus() {
    if (!serverData) return;

    const lastPing = serverData.last_ping ? new Date(serverData.last_ping).getTime() : 0;
    const now = Date.now();
    const isOnline = (now - lastPing) < 300000; // 5 minutos

    const dot = document.getElementById('bot-online-dot');
    const text = document.getElementById('bot-status-text');
    const lastPingEl = document.getElementById('bot-last-ping');

    dot.classList.toggle('online', isOnline);
    text.innerText = isOnline ? 'Bot Online' : 'Bot Offline';

    if (serverData.last_ping) {
        const date = new Date(serverData.last_ping);
        lastPingEl.textContent = `Último ping: ${date.toLocaleTimeString('pt-BR')}`;
    }
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

function setupEmojiPicker() {
    const emojiBtn = document.getElementById('emoji-btn');
    const emojiPicker = document.getElementById('emoji-picker');

    if (emojiBtn && emojiPicker) {
        emojiBtn.addEventListener('click', (e) => {
            e.preventDefault();
            emojiPicker.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!emojiBtn.contains(e.target) && !emojiPicker.contains(e.target)) {
                emojiPicker.classList.remove('active');
            }
        });
    }

    document.querySelectorAll('.emoji-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.emoji-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterEmojis(btn.dataset.filter);
        });
    });
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
        const data = snap.val();
        allAnnouncements = data || {};
        renderAnnouncementsList(data);
        updateDashboard();
    });
}

function renderAnnouncementsList(data) {
    const list = document.getElementById('announcements-list');
    list.innerHTML = '';

    if (!data) {
        list.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);"><i class="fas fa-inbox" style="font-size: 32px; margin-bottom: 10px; display: block;"></i>Nenhum anúncio criado</div>';
        return;
    }

    Object.keys(data).forEach(id => {
        const ann = data[id];
        const card = createAnnouncementCard(id, ann);
        list.appendChild(card);
    });
}

function createAnnouncementCard(id, ann) {
    const card = document.createElement('div');
    card.className = `ann-card ${currentAnnId === id ? 'active' : ''}`;

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
        }
    }

    const lastSent = ann.last_sent ? new Date(ann.last_sent).toLocaleDateString('pt-BR') : 'Nunca';

    card.innerHTML = `
        <div class="ann-card-header">
            <span class="ann-card-title">${ann.title || ann.embed?.title || 'Sem título'}</span>
            <span class="ann-card-status ${statusClass}">
                <i class="fas fa-${statusClass === 'active' ? 'check-circle' : statusClass === 'expired' ? 'times-circle' : 'pause-circle'}"></i>
                ${statusLabel}
            </span>
        </div>
        <div class="ann-card-meta">
            <span>${ann.schedule_type || 'smart'}</span>
            <span>${lastSent}</span>
        </div>
    `;

    card.addEventListener('click', () => selectAnnouncement(id, ann));
    return card;
}

function selectAnnouncement(id, data) {
    currentAnnId = id;
    database.ref(`presence/${sessionID}/editing`).set(id);

    // Mostrar botão de deletar
    document.getElementById('delete-btn').style.display = 'flex';

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

    // Corrigir: Usar interval_minutes como valor principal
    const totalMinutes = (data.interval_hours || 0) * 60 + (data.interval_minutes || 0);
    document.getElementById('ann-interval-hours').value = data.interval_hours || 0;
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

    // Campos e botões
    loadFields(embed.fields || []);
    loadButtons(embed.buttons || []);

    // Camuflagem
    document.getElementById('cam-mode').checked = data.camouflage_mode || false;
    document.getElementById('cam-name').value = data.cam_name || '';
    document.getElementById('cam-avatar').value = data.cam_avatar || '';

    toggleScheduleConfig();
    toggleCamouflageConfig();
    updatePreview();
    navigateTo('create');
}

function createNewAnnouncement() {
    currentAnnId = null;
    document.getElementById('delete-btn').style.display = 'none';
    document.getElementById('current-ann-title').innerText = 'Novo Anúncio';
    document.querySelectorAll('input:not([type=hidden]), textarea, select').forEach(el => {
        if (el.id !== 'ann-channel') el.value = '';
    });
    document.getElementById('ann-active').checked = true;
    document.getElementById('ann-schedule-type').value = 'smart';
    document.getElementById('embed-color').value = '#5865f2';
    document.getElementById('fields-container').innerHTML = '';
    document.getElementById('buttons-container').innerHTML = '';
    document.getElementById('cam-mode').checked = false;
    document.getElementById('ann-channel').value = '';
    toggleScheduleConfig();
    toggleCamouflageConfig();
    updatePreview();
    navigateTo('create');
}

// ===== FIELDS & BUTTONS =====
function loadFields(fields) {
    const container = document.getElementById('fields-container');
    container.innerHTML = '';
    fields.forEach((field, index) => {
        addFieldUI(index, field);
    });
}

function addFieldUI(index = null, field = {}) {
    const container = document.getElementById('fields-container');
    const idx = index !== null ? index : container.children.length;

    const div = document.createElement('div');
    div.className = 'field-item';
    div.innerHTML = `
        <input type="text" placeholder="Nome" value="${field.name || ''}" class="field-name-input">
        <input type="text" placeholder="Valor" value="${field.value || ''}" class="field-value-input">
        <label style="display:flex; align-items:center; gap:4px; margin:0; padding:0; white-space:nowrap;">
            <input type="checkbox" ${field.inline ? 'checked' : ''} class="field-inline-input">
            <span style="font-size:11px;">Inline</span>
        </label>
        <button type="button" onclick="this.parentElement.remove(); autoSave();" title="Remover"><i class="fas fa-trash"></i></button>
    `;

    div.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', autoSave);
    });

    container.appendChild(div);
}

function loadButtons(buttons) {
    const container = document.getElementById('buttons-container');
    container.innerHTML = '';
    buttons.forEach((button, index) => {
        addButtonUI(index, button);
    });
}

function addButtonUI(index = null, button = {}) {
    const container = document.getElementById('buttons-container');
    const idx = index !== null ? index : container.children.length;

    const div = document.createElement('div');
    div.className = 'button-item';
    div.innerHTML = `
        <input type="text" placeholder="Label" value="${button.label || ''}" class="button-label-input">
        <input type="text" placeholder="URL" value="${button.url || ''}" class="button-url-input">
        <select class="button-style-input">
            <option value="primary" ${button.style === 'primary' ? 'selected' : ''}>Azul</option>
            <option value="secondary" ${button.style === 'secondary' ? 'selected' : ''}>Cinza</option>
            <option value="success" ${button.style === 'success' ? 'selected' : ''}>Verde</option>
            <option value="danger" ${button.style === 'danger' ? 'selected' : ''}>Vermelho</option>
        </select>
        <button type="button" onclick="this.parentElement.remove(); autoSave();" title="Remover"><i class="fas fa-trash"></i></button>
    `;

    div.querySelectorAll('input, select').forEach(inp => {
        inp.addEventListener('input', autoSave);
        inp.addEventListener('change', autoSave);
    });

    container.appendChild(div);
}

// ===== TOGGLE CONFIGS =====
function toggleScheduleConfig() {
    const type = document.getElementById('ann-schedule-type').value;
    document.getElementById('smart-info').style.display = type === 'smart' ? 'flex' : 'none';
    document.getElementById('interval-config').style.display = type === 'interval' ? 'block' : 'none';
    document.getElementById('fixed-config').style.display = type === 'fixed' ? 'block' : 'none';
}

function toggleCamouflageConfig() {
    const camConfig = document.getElementById('cam-config');
    const isChecked = document.getElementById('cam-mode').checked;
    camConfig.style.display = isChecked ? 'block' : 'none';
}

function updateExpiryCountdown() {
    const expiryInput = document.getElementById('ann-expiry-date');
    const warningBox = document.getElementById('expiry-warning');

    if (!expiryInput.value) {
        if (warningBox) warningBox.style.display = 'none';
        return;
    }

    const expiryDate = new Date(expiryInput.value);
    const now = new Date();
    const diff = expiryDate - now;

    if (diff <= 0) {
        if (warningBox) {
            warningBox.style.display = 'flex';
            warningBox.textContent = 'Expirado';
        }
    } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        let timeStr = '';
        if (days > 0) timeStr += `${days}d `;
        if (hours > 0) timeStr += `${hours}h `;
        timeStr += `${minutes}m`;

        if (warningBox) {
            warningBox.style.display = 'flex';
            warningBox.textContent = timeStr;
        }
    }
}

// ===== PREVIEW =====
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
    const pThumb = document.getElementById('p-thumb');
    if (thumb) {
        pThumb.src = thumb;
        pThumb.onerror = () => { pThumb.style.display = 'none'; };
        pThumb.onload = () => { pThumb.style.display = 'block'; };
    } else {
        pThumb.style.display = 'none';
    }

    const img = document.getElementById('embed-image').value;
    const pImg = document.getElementById('p-image');
    if (img) {
        pImg.src = img;
        pImg.onerror = () => { pImg.style.display = 'none'; };
        pImg.onload = () => { pImg.style.display = 'block'; };
    } else {
        pImg.style.display = 'none';
    }

    document.getElementById('p-footer-text').innerText = document.getElementById('embed-footer-text').value;
    const fIcon = document.getElementById('embed-footer-icon').value;
    const pFooterIcon = document.getElementById('p-footer-icon');
    if (fIcon) {
        pFooterIcon.src = fIcon;
        pFooterIcon.onerror = () => { pFooterIcon.style.display = 'none'; };
        pFooterIcon.onload = () => { pFooterIcon.style.display = 'block'; };
    } else {
        pFooterIcon.style.display = 'none';
    }

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
        const avatar = document.getElementById('cam-avatar').value;
        if (avatar) {
            document.getElementById('p-avatar').src = avatar;
        }
    } else {
        document.getElementById('p-name').innerText = 'Bot de Anúncios';
        document.getElementById('p-avatar').src = 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
}

// ===== SAVE & SEND =====
let autoSaveTimeout;
function autoSave() {
    if (!currentAnnId) return;
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => saveAnnouncement(true), 2000);
}

function saveAnnouncement(isAuto = false) {
    if (!currentAnnId && !isAuto) {
        alert('Crie um novo anúncio primeiro!');
        return;
    }

    // Se for novo anúncio, criar ID
    if (!currentAnnId) {
        currentAnnId = database.ref().child('announcements').push().key;
    }

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
        last_editor: sessionID,
        updated_at: firebase.database.ServerValue.TIMESTAMP
    };

    database.ref('announcements/' + currentAnnId).update(data).then(() => {
        if (!isAuto) {
            showNotification('Anúncio salvo com sucesso!', 'success');
        }
    }).catch(err => {
        console.error('Erro ao salvar:', err);
        showNotification('Erro ao salvar anúncio', 'error');
    });
}

function sendAnnouncement() {
    if (!currentAnnId) {
        alert('Selecione um anúncio para enviar!');
        return;
    }

    if (!confirm('Enviar este anúncio agora?')) return;

    // Salvar antes de enviar
    saveAnnouncement(false);

    // Disparar envio
    database.ref(`announcements/${currentAnnId}/trigger_send`).set(true).then(() => {
        showNotification('Anúncio enviado com sucesso!', 'success');
        addActivityLog(`Anúncio enviado: ${document.getElementById('ann-title').value || 'Sem título'}`, 'success');
    }).catch(err => {
        console.error('Erro ao enviar:', err);
        showNotification('Erro ao enviar anúncio', 'error');
    });
}

function deleteAnnouncement() {
    if (!currentAnnId) return;

    if (!confirm('Excluir este anúncio permanentemente?')) return;

    database.ref('announcements/' + currentAnnId).remove().then(() => {
        showNotification('Anúncio excluído!', 'success');
        currentAnnId = null;
        createNewAnnouncement();
    }).catch(err => {
        console.error('Erro ao excluir:', err);
        showNotification('Erro ao excluir anúncio', 'error');
    });
}

// ===== DASHBOARD =====
function updateDashboard() {
    if (!allAnnouncements) return;

    let total = 0;
    let active = 0;
    let scheduled = 0;
    let expired = 0;

    Object.values(allAnnouncements).forEach(ann => {
        total++;
        if (!ann.active) return;

        if (ann.expiry_date) {
            const expiryDate = new Date(ann.expiry_date);
            if (expiryDate < new Date()) {
                expired++;
            } else {
                active++;
            }
        } else {
            active++;
        }

        if (ann.schedule_type === 'fixed' || ann.schedule_type === 'interval') {
            scheduled++;
        }
    });

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-active').textContent = active;
    document.getElementById('stat-scheduled').textContent = scheduled;
    document.getElementById('stat-expired').textContent = expired;

    updateCharts();
}

function initCharts() {
    // Gráfico de envios por hora
    const sendCtx = document.getElementById('sendChart');
    if (sendCtx) {
        charts.sendChart = new Chart(sendCtx, {
            type: 'line',
            data: {
                labels: ['00h', '04h', '08h', '12h', '16h', '20h'],
                datasets: [{
                    label: 'Envios',
                    data: [12, 8, 15, 20, 18, 25],
                    borderColor: '#007AFF',
                    backgroundColor: 'rgba(0, 122, 255, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    }
                }
            }
        });
    }

    // Gráfico de status
    const statusCtx = document.getElementById('statusChart');
    if (statusCtx) {
        charts.statusChart = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: ['Ativos', 'Inativos', 'Expirados'],
                datasets: [{
                    data: [65, 20, 15],
                    backgroundColor: [
                        '#34C759',
                        '#8E8E93',
                        '#FF3B30'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    }
                }
            }
        });
    }
}

function updateCharts() {
    if (charts.statusChart) {
        const total = parseInt(document.getElementById('stat-total').textContent) || 1;
        const active = parseInt(document.getElementById('stat-active').textContent) || 0;
        const expired = parseInt(document.getElementById('stat-expired').textContent) || 0;
        const inactive = total - active - expired;

        charts.statusChart.data.datasets[0].data = [active, inactive, expired];
        charts.statusChart.update();
    }
}

// ===== ACTIVITY LOG =====
function addActivityLog(message, type = 'info') {
    const container = document.getElementById('recent-activity');
    if (!container) return;

    const item = document.createElement('div');
    item.className = `activity-item ${type}`;
    item.innerHTML = `
        <div>${message}</div>
        <div class="activity-time">${new Date().toLocaleTimeString('pt-BR')}</div>
    `;

    container.insertBefore(item, container.firstChild);

    // Manter apenas últimos 10 itens
    while (container.children.length > 10) {
        container.removeChild(container.lastChild);
    }
}

// ===== NOTIFICATIONS =====
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 20px;
        background: ${type === 'success' ? '#34C759' : type === 'error' ? '#FF3B30' : '#007AFF'};
        color: white;
        border-radius: 8px;
        font-weight: 600;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ===== INICIALIZAR =====
console.log('Painel de Anúncios carregado com sucesso!');
