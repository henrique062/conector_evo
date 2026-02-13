// ===== Evolution Dashboard — app.js =====

// State
let instances = [];
let statusPollingInterval = null;
let qrPollingInterval = null;
let currentQrInstance = null;

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    checkApiStatus();
    loadInstances();

    // Start status polling every 15s
    statusPollingInterval = setInterval(refreshStatuses, 15000);
});

// ===== API Fetch Helper =====
async function api(method, path, body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`/api${path}`, options);
    const data = await res.json().catch(() => null);

    if (!res.ok) {
        throw new Error(data?.error || `Erro ${res.status}`);
    }
    return data;
}

// ===== Check API Status =====
async function checkApiStatus() {
    const el = document.getElementById('apiStatus');
    try {
        await api('GET', '/instances');
        el.innerHTML = `
      <div class="status-dot connected"></div>
      <span>API Conectada</span>
    `;
    } catch {
        el.innerHTML = `
      <div class="status-dot disconnected"></div>
      <span>API Offline</span>
    `;
    }
}

// ===== Load Instances =====
async function loadInstances() {
    const grid = document.getElementById('instancesGrid');
    const empty = document.getElementById('emptyState');
    const loading = document.getElementById('loadingState');

    loading.classList.add('visible');
    grid.style.display = 'none';
    empty.style.display = 'none';

    try {
        const data = await api('GET', '/instances');
        // Evolution API v2 returns { value: [...], Count: N }
        instances = Array.isArray(data) ? data : (data?.value || data || []);
        if (!Array.isArray(instances)) instances = [];

        loading.classList.remove('visible');

        if (instances.length === 0) {
            empty.style.display = 'flex';
            grid.style.display = 'none';
        } else {
            empty.style.display = 'none';
            grid.style.display = 'grid';
            renderInstances();
        }

        updateStats();
    } catch (err) {
        loading.classList.remove('visible');
        empty.style.display = 'flex';
        grid.style.display = 'none';
        showToast('Erro ao carregar instâncias: ' + err.message, 'error');
    }
}

// ===== Render Instances =====
function renderInstances() {
    const grid = document.getElementById('instancesGrid');
    grid.innerHTML = '';

    instances.forEach((inst, index) => {
        const name = inst.name || inst.instance?.instanceName || inst.instanceName || 'Sem nome';
        const status = inst.connectionStatus || inst.instance?.status || inst.status || 'close';
        const integration = inst.integration || inst.instance?.integration || 'WHATSAPP-BAILEYS';
        const ownerJid = inst.ownerJid || inst.instance?.owner || '';
        const owner = inst.number || ownerJid.replace(/@.*/, '') || '—';
        const profileName = inst.profileName || inst.instance?.profileName || '';
        const profilePicUrl = inst.profilePicUrl || inst.instance?.profilePicUrl || '';

        const isOpen = status === 'open';
        const isConnecting = status === 'connecting';
        const initials = name.substring(0, 2);

        const avatarClass = isOpen ? 'connected' : 'disconnected';
        const badgeClass = isOpen ? 'badge-open' : isConnecting ? 'badge-connecting' : 'badge-close';
        const badgeText = isOpen ? 'Conectado' : isConnecting ? 'Conectando' : 'Desconectado';

        const avatarContent = profilePicUrl
            ? `<img src="${profilePicUrl}" alt="${name}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`
            : initials;

        const card = document.createElement('div');
        card.className = 'instance-card';
        card.style.animationDelay = `${index * 0.06}s`;
        card.innerHTML = `
      <div class="card-header">
        <div class="card-identity">
          <div class="card-avatar ${avatarClass}">${avatarContent}</div>
          <div>
            <div class="card-name">${escapeHtml(name)}</div>
            <div class="card-integration">${integration}</div>
          </div>
        </div>
        <div class="card-status-badge ${badgeClass}">
          <div class="status-dot ${isOpen ? 'connected' : isConnecting ? '' : 'disconnected'}"></div>
          ${badgeText}
        </div>
      </div>

      <div class="card-details">
        ${profileName ? `
          <div class="detail-row">
            <span class="detail-label">Perfil</span>
            <span class="detail-value">${escapeHtml(profileName)}</span>
          </div>
        ` : ''}
        <div class="detail-row">
          <span class="detail-label">Número</span>
          <span class="detail-value">${owner !== '—' ? formatPhone(owner) : '—'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Status</span>
          <span class="detail-value">${badgeText}</span>
        </div>
      </div>

      <div class="card-actions">
        ${!isOpen ? `
          <button class="btn btn-sm btn-connect" onclick="connectInstance('${escapeAttr(name)}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
              <polyline points="10 17 15 12 10 7"/>
              <line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
            Conectar
          </button>
        ` : ''}
        <button class="btn btn-sm btn-restart" onclick="restartInstance('${escapeAttr(name)}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Restart
        </button>
        ${isOpen ? `
          <button class="btn btn-sm btn-logout" onclick="logoutInstance('${escapeAttr(name)}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Logout
          </button>
        ` : ''}
        <button class="btn btn-sm btn-delete" onclick="deleteInstance('${escapeAttr(name)}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Excluir
        </button>
      </div>
    `;

        grid.appendChild(card);
    });
}

// ===== Update Stats =====
function updateStats() {
    const total = instances.length;
    let connected = 0;
    let disconnected = 0;

    instances.forEach(inst => {
        const status = inst.connectionStatus || inst.instance?.status || inst.status || 'close';
        if (status === 'open') connected++;
        else disconnected++;
    });

    animateCounter('statTotal', total);
    animateCounter('statConnected', connected);
    animateCounter('statDisconnected', disconnected);
}

function animateCounter(elementId, target) {
    const el = document.getElementById(elementId);
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;

    const duration = 400;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        const value = Math.round(current + (target - current) * eased);
        el.textContent = value;
        if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
}

// ===== Refresh Connection Statuses =====
async function refreshStatuses() {
    if (instances.length === 0) return;

    let changed = false;

    for (const inst of instances) {
        const name = inst.name || inst.instance?.instanceName || inst.instanceName;
        if (!name) continue;

        try {
            const data = await api('GET', `/instances/${encodeURIComponent(name)}/status`);
            const newStatus = data?.instance?.state || data?.state || 'close';
            const oldStatus = inst.connectionStatus || inst.instance?.status || inst.status;

            if (newStatus !== oldStatus) {
                inst.connectionStatus = newStatus;
                changed = true;
            }
        } catch {
            // Silently fail status checks
        }
    }

    if (changed) {
        renderInstances();
        updateStats();
    }
}

// ===== Create Instance =====
function openCreateModal() {
    document.getElementById('instanceName').value = '';
    document.getElementById('instanceNumber').value = '';
    document.getElementById('createModal').classList.add('active');
    setTimeout(() => document.getElementById('instanceName').focus(), 300);
}

function closeCreateModal() {
    document.getElementById('createModal').classList.remove('active');
}

async function createInstance() {
    const nameInput = document.getElementById('instanceName');
    const number = document.getElementById('instanceNumber').value.trim();
    const name = nameInput.value.trim();

    if (!name) {
        showToast('Digite um nome para a instância', 'error');
        nameInput.focus();
        return;
    }

    // Validate name: no spaces or special chars
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        showToast('O nome deve conter apenas letras, números, _ e -', 'error');
        nameInput.focus();
        return;
    }

    const btn = document.getElementById('btnCreateInstance');
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');
    btn.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'inline-flex';

    try {
        const payload = { instanceName: name, integration: 'WHATSAPP-BAILEYS', qrcode: true };
        if (number) payload.number = number;

        const data = await api('POST', '/instances', payload);

        closeCreateModal();
        showToast(`Instância "${name}" criada com sucesso!`, 'success');

        // If QR code returned, show it directly
        if (data?.qrcode?.base64) {
            showQrCode(name, data.qrcode.base64);
        }

        await loadInstances();
    } catch (err) {
        showToast('Erro ao criar: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
    }
}

// ===== Connect Instance (QR Code) =====
async function connectInstance(name) {
    const modal = document.getElementById('qrModal');
    const container = document.getElementById('qrContainer');
    const statusEl = document.getElementById('qrStatus');
    const titleEl = document.getElementById('qrModalTitle');

    titleEl.textContent = `Conectar — ${name}`;
    container.innerHTML = `
    <div class="qr-loading">
      <span class="spinner spinner-lg"></span>
      <p>Gerando QR Code...</p>
    </div>
  `;
    statusEl.innerHTML = `
    <div class="status-dot"></div>
    <span>Aguardando QR Code...</span>
  `;

    modal.classList.add('active');
    currentQrInstance = name;

    try {
        const data = await api('GET', `/instances/${encodeURIComponent(name)}/connect`);

        if (data?.base64) {
            showQrCode(name, data.base64);
        } else if (data?.pairingCode) {
            container.innerHTML = `
        <div style="padding: 30px; text-align: center; color: #333;">
          <p style="font-size: 0.85rem; margin-bottom: 12px;">Código de pareamento:</p>
          <p style="font-size: 1.8rem; font-weight: 800; letter-spacing: 0.1em; font-family: monospace;">${data.pairingCode}</p>
        </div>
      `;
            statusEl.innerHTML = `
        <div class="status-dot"></div>
        <span>Use o código de pareamento no seu WhatsApp</span>
      `;
            startQrPolling(name);
        } else {
            container.innerHTML = `
        <div style="padding: 30px; text-align: center; color: #666;">
          <p>QR Code não disponível</p>
          <p style="font-size: 0.8rem; margin-top: 8px;">A instância pode já estar conectada</p>
        </div>
      `;
        }
    } catch (err) {
        container.innerHTML = `
      <div style="padding: 30px; text-align: center; color: #cc0000;">
        <p>Erro ao gerar QR Code</p>
        <p style="font-size: 0.8rem; margin-top: 8px;">${escapeHtml(err.message)}</p>
      </div>
    `;
    }
}

function showQrCode(name, base64) {
    const container = document.getElementById('qrContainer');
    const statusEl = document.getElementById('qrStatus');

    // base64 can be a data URL or raw base64
    const src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
    container.innerHTML = `<img src="${src}" alt="QR Code">`;

    statusEl.innerHTML = `
    <div class="status-dot" style="animation: pulse 1.5s infinite;"></div>
    <span>Escaneie o QR Code com seu WhatsApp</span>
  `;

    startQrPolling(name);
}

function startQrPolling(name) {
    if (qrPollingInterval) clearInterval(qrPollingInterval);

    qrPollingInterval = setInterval(async () => {
        try {
            const data = await api('GET', `/instances/${encodeURIComponent(name)}/status`);
            const state = data?.instance?.state || data?.state || 'close';

            if (state === 'open') {
                clearInterval(qrPollingInterval);
                qrPollingInterval = null;

                const statusEl = document.getElementById('qrStatus');
                statusEl.innerHTML = `
          <div class="status-dot connected"></div>
          <span style="color: var(--green); font-weight: 600;">WhatsApp conectado com sucesso!</span>
        `;

                showToast(`${name} conectado com sucesso!`, 'success');

                setTimeout(() => {
                    closeQrModal();
                    loadInstances();
                }, 2000);
            }
        } catch {
            // ignore polling errors
        }
    }, 3000);
}

function closeQrModal() {
    document.getElementById('qrModal').classList.remove('active');
    currentQrInstance = null;
    if (qrPollingInterval) {
        clearInterval(qrPollingInterval);
        qrPollingInterval = null;
    }
}

// ===== Restart Instance =====
async function restartInstance(name) {
    showConfirm(
        'Reiniciar Instância',
        `Tem certeza que deseja reiniciar a instância "${name}"?`,
        async () => {
            try {
                await api('PUT', `/instances/${encodeURIComponent(name)}/restart`);
                showToast(`Instância "${name}" reiniciada!`, 'success');
                setTimeout(() => loadInstances(), 1500);
            } catch (err) {
                showToast('Erro ao reiniciar: ' + err.message, 'error');
            }
        }
    );
}

// ===== Logout Instance =====
async function logoutInstance(name) {
    showConfirm(
        'Desconectar Instância',
        `Tem certeza que deseja desconectar a instância "${name}"? O WhatsApp será desvinculado.`,
        async () => {
            try {
                // Usa fetch direto pois a Evolution API pode retornar 400 mesmo com logout bem-sucedido
                const res = await fetch(`/api/instances/${encodeURIComponent(name)}/logout`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await res.json().catch(() => null);

                if (res.ok || data?.status === 'SUCCESS' || res.status === 400) {
                    showToast(`Instância "${name}" desconectada!`, 'success');
                } else {
                    showToast(`Erro ao desconectar: ${data?.error || 'Erro desconhecido'}`, 'error');
                }
            } catch (err) {
                showToast('Erro ao desconectar: ' + err.message, 'error');
            }
            // Sempre recarrega a lista
            await loadInstances();
        }
    );
}

// ===== Delete Instance =====
async function deleteInstance(name) {
    showConfirm(
        'Excluir Instância',
        `Tem certeza que deseja excluir a instância "${name}"? Esta ação não pode ser desfeita.`,
        async () => {
            try {
                const res = await fetch(`/api/instances/${encodeURIComponent(name)}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await res.json().catch(() => null);

                if (res.ok || data?.status === 'SUCCESS') {
                    showToast(`Instância "${name}" excluída!`, 'success');
                } else {
                    showToast(`Erro ao excluir: ${data?.response?.message || 'Erro desconhecido'}`, 'error');
                }
            } catch (err) {
                showToast('Erro ao excluir: ' + err.message, 'error');
            }
            await loadInstances();
        }
    );
}

// ===== Confirm Modal =====
function showConfirm(title, message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;

    const btn = document.getElementById('confirmAction');
    // Clone to remove old listeners
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async () => {
        closeConfirmModal();
        await onConfirm();
    });

    modal.classList.add('active');
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
}

// ===== Page Navigation =====
function switchPage(page) {
    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    // Update pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    if (page === 'instances') {
        document.getElementById('pageInstances').classList.add('active');
        document.getElementById('pageTitle').textContent = 'Instâncias WhatsApp';
        document.getElementById('pageSubtitle').textContent = 'Gerencie suas conexões';
        document.getElementById('btnNewInstance').style.display = 'inline-flex';
        loadInstances();
    } else if (page === 'settings') {
        document.getElementById('pageSettings').classList.add('active');
        document.getElementById('pageTitle').textContent = 'Configurações';
        document.getElementById('pageSubtitle').textContent = 'Configurações da API';
        document.getElementById('btnNewInstance').style.display = 'none';
    }
}

// ===== Sidebar Toggle (Mobile) =====
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// Close sidebar on overlay click (mobile)
document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('menuToggle');
    if (
        sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        !toggle.contains(e.target)
    ) {
        sidebar.classList.remove('open');
    }
});

// ===== API Key Visibility Toggle =====
function toggleApiKeyVisibility() {
    const input = document.getElementById('settingsApiKey');
    if (input.type === 'password') {
        input.type = 'text';
        input.value = '(protegida no servidor)';
    } else {
        input.type = 'password';
        input.value = '••••••••••••••••';
    }
}

// ===== Toast Notifications =====
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success'
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
        : type === 'error'
            ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

    toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ===== Utilities =====
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function formatPhone(phone) {
    if (!phone || phone === '—') return '—';
    // Format: +55 (11) 99999-9999
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 13) {
        return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
    }
    if (clean.length === 12) {
        return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 8)}-${clean.slice(8)}`;
    }
    return phone;
}

// Close modals on ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeCreateModal();
        closeQrModal();
        closeConfirmModal();
    }
});

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
            if (overlay.id === 'qrModal') closeQrModal();
        }
    });
});
