// ===== Conector WhatsApp — app.js =====

// State
let currentUser = null;
let instances = [];
let allInstances = []; // For admin binding
let statusPollingInterval = null;
let qrPollingInterval = null;
let currentQrInstance = null;
let bindingUserId = null;

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  loadSavedCredentials();
  checkAuth();
});

// ===== API Helper =====
async function api(method, path, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`/api${path}`, options);

  if (res.status === 401) {
    showLoginScreen();
    throw new Error('Sessao expirada');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
  return data;
}

// ===== Auth =====
async function checkAuth() {
  try {
    const data = await api('GET', '/auth/me');
    currentUser = data.user;
    showDashboard();
  } catch {
    showLoginScreen();
  }
}

function showLoginScreen() {
  currentUser = null;
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('dashboard').style.display = 'none';
  if (statusPollingInterval) clearInterval(statusPollingInterval);
}

function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'flex';

  // Update user info
  document.getElementById('userName').textContent = currentUser.name || currentUser.email;
  document.getElementById('userRole').textContent = currentUser.role === 'master' ? 'Administrador' : 'Usuario';
  document.getElementById('sidebarRole').textContent = currentUser.role === 'master' ? 'Admin' : 'Dashboard';

  // Profile picture ou iniciais no sidebar
  const avatarEl = document.getElementById('userAvatar');
  if (currentUser.profile_picture) {
    avatarEl.innerHTML = `<img src="${currentUser.profile_picture}" alt="Avatar">`;
  } else {
    avatarEl.innerHTML = '';
    avatarEl.textContent = (currentUser.name || currentUser.email).charAt(0).toUpperCase();
  }

  // Show/hide admin elements
  const isMaster = currentUser.role === 'master';
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isMaster ? '' : 'none';
  });

  // Load data
  loadInstances();
  statusPollingInterval = setInterval(refreshStatuses, 15000);

  // Settings
  api('GET', '/auth/me').then(data => {
    const provEl = document.getElementById('settingsProvider');
    if (provEl) provEl.value = (data.provider || 'evolution').toUpperCase();
  }).catch(() => {});
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('btnLogin');
  const errorEl = document.getElementById('loginError');
  errorEl.style.display = 'none';

  btn.querySelector('.btn-text').style.display = 'none';
  btn.querySelector('.btn-loader').style.display = 'inline-flex';

  try {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const remember = document.getElementById('rememberMe').checked;
    const data = await api('POST', '/auth/login', { email, password });
    currentUser = data.user;

    // Salvar ou limpar credenciais
    if (remember) {
      localStorage.setItem('savedEmail', email);
      localStorage.setItem('savedPassword', btoa(password));
      localStorage.setItem('rememberMe', 'true');
    } else {
      localStorage.removeItem('savedEmail');
      localStorage.removeItem('savedPassword');
      localStorage.removeItem('rememberMe');
    }

    showDashboard();
  } catch (error) {
    errorEl.textContent = error.message || 'Credenciais invalidas';
    errorEl.style.display = 'block';
  } finally {
    btn.querySelector('.btn-text').style.display = 'inline';
    btn.querySelector('.btn-loader').style.display = 'none';
  }
}

function loadSavedCredentials() {
  const saved = localStorage.getItem('rememberMe');
  if (saved === 'true') {
    const email = localStorage.getItem('savedEmail');
    const password = localStorage.getItem('savedPassword');
    if (email) document.getElementById('loginEmail').value = email;
    if (password) document.getElementById('loginPassword').value = atob(password);
    document.getElementById('rememberMe').checked = true;
  }
}

async function handleLogout() {
  try {
    await api('POST', '/auth/logout');
  } catch { /* ignore */ }
  showLoginScreen();
}

// ===== Page Navigation =====
function switchPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1));
  const navEl = document.querySelector(`[data-page="${page}"]`);

  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');

  const titles = {
    instances: ['Instancias WhatsApp', 'Gerencie suas conexoes'],
    users: ['Usuarios', 'Gerenciar acessos e permissoes'],
    logs: ['Logs de Atividade', 'Historico de operacoes'],
    settings: ['Configuracoes', 'Informacoes do sistema'],
    profile: ['Meu Perfil', 'Gerencie suas informacoes pessoais'],
  };

  const [title, sub] = titles[page] || ['Dashboard', ''];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSubtitle').textContent = sub;

  if (page === 'users') loadUsers();
  if (page === 'logs') loadLogs();
  if (page === 'profile') loadProfile();
}

// ===== Instances =====
async function loadInstances() {
  const grid = document.getElementById('instancesGrid');
  const empty = document.getElementById('emptyState');
  const loading = document.getElementById('loadingState');

  loading.style.display = 'block';
  empty.style.display = 'none';
  grid.innerHTML = '';

  try {
    instances = await api('GET', '/instances');
    allInstances = instances; // Store for binding

    loading.style.display = 'none';

    if (instances.length === 0) {
      empty.style.display = 'flex';
    } else {
      renderInstances();
    }

    updateStats();
  } catch (error) {
    loading.style.display = 'none';
    showToast(error.message, 'error');
  }
}

function renderInstances() {
  const grid = document.getElementById('instancesGrid');
  grid.innerHTML = instances.map(inst => createInstanceCard(inst)).join('');
}

function createInstanceCard(inst) {
  const name = inst.instance_name || '';
  const status = normalizeStatus(inst.status || inst.apiData?.connectionStatus?.state);
  const number = inst.number || '';
  const profileName = inst.profile_name || name;
  const profilePic = inst.profile_picture_url;
  const isMaster = currentUser?.role === 'master';

  const statusClass = status === 'connected' || status === 'open' ? 'connected' : status === 'connecting' ? 'connecting' : 'disconnected';
  const statusLabel = statusClass === 'connected' ? 'Conectado' : statusClass === 'connecting' ? 'Conectando...' : 'Desconectado';
  const badgeClass = statusClass === 'connected' ? 'badge-open' : statusClass === 'connecting' ? 'badge-connecting' : 'badge-close';
  const isConnected = statusClass === 'connected';

  const initials = profileName.slice(0, 2).toUpperCase();
  const avatarHtml = profilePic
    ? `<img src="${escapeHtml(profilePic)}" alt="${escapeHtml(name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="avatar-initials" style="display:none">${initials}</span>`
    : `<span class="avatar-initials">${initials}</span>`;

  // Escape name for safe use in onclick (replace ' with \')
  const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  // User normal: apenas connect e disconnect
  const actions = [];
  if (!isConnected) {
    actions.push(`<button class="btn btn-sm btn-connect" onclick="connectInstance('${safeName}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5 12 10 17 20 7"/></svg> Conectar</button>`);
  }
  if (isMaster) {
    actions.push(`<button class="btn btn-sm btn-restart" onclick="restartInstance('${safeName}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Restart</button>`);
  }
  if (isConnected) {
    actions.push(`<button class="btn btn-sm btn-logout" onclick="logoutInstance('${safeName}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Desconectar</button>`);
  }
  if (isMaster) {
    actions.push(`<button class="btn btn-sm btn-delete" onclick="deleteInstance('${safeName}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Excluir</button>`);
  }

  return `
    <div class="instance-card" data-instance="${escapeHtml(name)}">
      <div class="card-header">
        <div class="card-identity">
          <div class="card-avatar ${statusClass}">${avatarHtml}</div>
          <div class="card-info">
            <h3 class="card-name">${escapeHtml(profileName)}</h3>
            <span class="card-integration">${escapeHtml(name)}</span>
          </div>
        </div>
        <div class="card-status-badge ${badgeClass}">
          <div class="status-dot ${statusClass === 'connected' ? 'connected' : statusClass === 'connecting' ? '' : 'disconnected'}"></div>
          <span>${statusLabel}</span>
        </div>
      </div>
      <div class="card-details">
        ${number ? `<div class="detail-row"><span class="detail-label">Telefone</span><span class="detail-value">${formatPhone(number)}</span></div>` : `<div class="detail-row"><span class="detail-label">Telefone</span><span class="detail-value" style="color:var(--text-tertiary);">Nao vinculado</span></div>`}
        <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value" style="color:${isConnected ? 'var(--green)' : 'var(--red)'};">${statusLabel}</span></div>
      </div>
      <div class="card-actions">${actions.join('')}</div>
    </div>
  `;
}

function normalizeStatus(status) {
  if (!status) return 'disconnected';
  if (status === 'open') return 'connected';
  return status;
}

function updateStats() {
  let total = instances.length;
  let connected = instances.filter(i => normalizeStatus(i.status) === 'connected').length;
  let disconnected = total - connected;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statConnected').textContent = connected;
  document.getElementById('statDisconnected').textContent = disconnected;
}

async function refreshStatuses() {
  let hasChanges = false;

  for (const inst of instances) {
    try {
      const name = encodeURIComponent(inst.instance_name);
      const data = await api('GET', `/instances/${name}/status`);
      const newStatus = normalizeStatus(data?.state || data?.instance?.status);
      if (newStatus && newStatus !== inst.status) {
        const oldStatus = inst.status;
        inst.status = newStatus;
        hasChanges = true;

        // Atualizar apenas o card que mudou (SPA)
        const card = document.querySelector(`.instance-card[data-instance="${CSS.escape(inst.instance_name)}"]`);
        if (card) {
          updateCardStatus(card, inst);
        }
      }
    } catch { /* ignore */ }
  }

  if (hasChanges) {
    updateStats();
  }
}

function updateCardStatus(card, inst) {
  const status = normalizeStatus(inst.status);
  const statusClass = status === 'connected' || status === 'open' ? 'connected' : status === 'connecting' ? 'connecting' : 'disconnected';
  const statusLabel = statusClass === 'connected' ? 'Conectado' : statusClass === 'connecting' ? 'Conectando...' : 'Desconectado';
  const badgeClass = statusClass === 'connected' ? 'badge-open' : statusClass === 'connecting' ? 'badge-connecting' : 'badge-close';
  const isConnected = statusClass === 'connected';
  const isMaster = currentUser?.role === 'master';
  const name = inst.instance_name || '';
  const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  // Atualizar avatar border color
  const avatar = card.querySelector('.card-avatar');
  if (avatar) {
    avatar.className = `card-avatar ${statusClass}`;
  }

  // Atualizar badge de status
  const badge = card.querySelector('.card-status-badge');
  if (badge) {
    badge.className = `card-status-badge ${badgeClass}`;
    const dot = badge.querySelector('.status-dot');
    if (dot) dot.className = `status-dot ${statusClass === 'connected' ? 'connected' : statusClass === 'connecting' ? '' : 'disconnected'}`;
    const span = badge.querySelector('span');
    if (span) span.textContent = statusLabel;
  }

  // Atualizar detalhe de status
  const details = card.querySelectorAll('.detail-row');
  const statusRow = details[details.length - 1];
  if (statusRow) {
    const val = statusRow.querySelector('.detail-value');
    if (val) {
      val.textContent = statusLabel;
      val.style.color = isConnected ? 'var(--green)' : 'var(--red)';
    }
  }

  // Reconstruir botões de ação
  const actionsContainer = card.querySelector('.card-actions');
  if (actionsContainer) {
    const actions = [];
    if (!isConnected) {
      actions.push(`<button class="btn btn-sm btn-connect" onclick="connectInstance('${safeName}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5 12 10 17 20 7"/></svg> Conectar</button>`);
    }
    if (isMaster) {
      actions.push(`<button class="btn btn-sm btn-restart" onclick="restartInstance('${safeName}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Restart</button>`);
    }
    if (isConnected) {
      actions.push(`<button class="btn btn-sm btn-logout" onclick="logoutInstance('${safeName}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Desconectar</button>`);
    }
    if (isMaster) {
      actions.push(`<button class="btn btn-sm btn-delete" onclick="deleteInstance('${safeName}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Excluir</button>`);
    }
    actionsContainer.innerHTML = actions.join('');
  }
}

// ===== Instance Actions =====
function openCreateModal() {
  document.getElementById('createModal').classList.add('active');
  document.getElementById('instanceName').value = '';
  document.getElementById('instanceNumber').value = '';
  document.getElementById('instanceName').focus();
}

function closeCreateModal() {
  document.getElementById('createModal').classList.remove('active');
}

async function createInstance() {
  const name = document.getElementById('instanceName').value.trim();
  const number = document.getElementById('instanceNumber').value.trim();

  if (!name) return showToast('Nome e obrigatorio', 'error');
  if (/[^a-zA-Z0-9_-]/.test(name)) return showToast('Nome invalido (use apenas letras, numeros, - e _)', 'error');

  const btn = document.getElementById('btnCreateInstance');
  btn.querySelector('.btn-text').style.display = 'none';
  btn.querySelector('.btn-loader').style.display = 'inline-flex';

  try {
    await api('POST', '/instances', { instanceName: name, number: number || undefined });
    showToast(`Instancia "${name}" criada!`, 'success');
    closeCreateModal();
    loadInstances();
    setTimeout(() => connectInstance(name), 500);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    btn.querySelector('.btn-text').style.display = 'inline';
    btn.querySelector('.btn-loader').style.display = 'none';
  }
}

async function connectInstance(name) {
  currentQrInstance = name;
  document.getElementById('qrModalTitle').textContent = `Conectar: ${name}`;
  document.getElementById('qrModal').classList.add('active');
  document.getElementById('qrContainer').innerHTML = '<div class="qr-loading"><span class="spinner spinner-lg"></span><p>Gerando QR Code...</p></div>';
  document.getElementById('qrStatus').innerHTML = '<div class="status-dot"></div><span>Aguardando leitura do QR Code...</span>';

  try {
    const data = await api('GET', `/instances/${encodeURIComponent(name)}/connect`);
    displayQrCode(data);
    startQrPolling(name);
  } catch (error) {
    document.getElementById('qrContainer').innerHTML = `<p style="color:var(--red);">${error.message}</p>`;
  }
}

function displayQrCode(data) {
  const container = document.getElementById('qrContainer');
  // Check multiple possible QR fields
  const qrBase64 = data?.base64 || data?.qrcode?.base64 || data?.qrcode || data?.instance?.qrcode;
  const paircode = data?.paircode || data?.instance?.paircode;

  if (qrBase64) {
    const src = qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`;
    container.innerHTML = `<img src="${src}" alt="QR Code" class="qr-image">`;
  } else if (paircode) {
    container.innerHTML = `<div class="paircode"><p>Codigo de pareamento:</p><h2>${escapeHtml(paircode)}</h2></div>`;
  } else {
    container.innerHTML = '<div class="qr-loading"><span class="spinner spinner-lg"></span><p>Aguardando QR Code...</p></div>';
  }
}

function startQrPolling(name) {
  if (qrPollingInterval) clearInterval(qrPollingInterval);
  qrPollingInterval = setInterval(async () => {
    try {
      const encodedName = encodeURIComponent(name);
      const status = await api('GET', `/instances/${encodedName}/status`);
      const state = normalizeStatus(status?.state || status?.instance?.status);

      if (state === 'connected') {
        clearInterval(qrPollingInterval);
        qrPollingInterval = null;
        document.getElementById('qrStatus').innerHTML = '<div class="status-dot connected"></div><span style="color:var(--green);">Conectado!</span>';
        showToast(`${name} conectado!`, 'success');
        setTimeout(() => { closeQrModal(); loadInstances(); }, 1500);
      } else {
        // Refresh QR
        const qrData = await api('GET', `/instances/${encodedName}/connect`).catch(() => null);
        if (qrData) displayQrCode(qrData);
      }
    } catch { /* ignore */ }
  }, 3000);
}

function closeQrModal() {
  document.getElementById('qrModal').classList.remove('active');
  if (qrPollingInterval) { clearInterval(qrPollingInterval); qrPollingInterval = null; }
  currentQrInstance = null;
}

function restartInstance(name) {
  openConfirmModal('Reiniciar Instancia', `Deseja reiniciar "${name}"?`, async () => {
    try {
      await api('PUT', `/instances/${encodeURIComponent(name)}/restart`);
      showToast(`${name} reiniciada`, 'success');
      loadInstances();
    } catch (error) { showToast(error.message, 'error'); }
  });
}

function logoutInstance(name) {
  openConfirmModal('Desconectar', `Deseja desconectar "${name}"?`, async () => {
    try {
      await api('DELETE', `/instances/${encodeURIComponent(name)}/logout`);
      showToast(`${name} desconectada`, 'success');
      loadInstances();
    } catch (error) { showToast(error.message, 'error'); }
  });
}

function deleteInstance(name) {
  openConfirmModal('Excluir Instancia', `Tem certeza que deseja EXCLUIR "${name}"? Esta acao nao pode ser desfeita.`, async () => {
    try {
      await api('DELETE', `/instances/${encodeURIComponent(name)}`);
      showToast(`${name} excluida`, 'success');
      loadInstances();
    } catch (error) { showToast(error.message, 'error'); }
  });
}

// ===== Users Management (Master) =====
async function loadUsers() {
  try {
    const users = await api('GET', '/users');
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = users.map(u => {
      const roleBadge = u.role === 'master' ? '<span class="badge badge-master">Master</span>' : '<span class="badge badge-user">Usuario</span>';
      const statusBadge = u.is_active ? '<span class="badge badge-active">Ativo</span>' : '<span class="badge badge-inactive">Inativo</span>';
      const isSelf = u.id === currentUser.id;

      const safeName = (u.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const safeEmail = u.email.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

      return `<tr>
        <td>${escapeHtml(u.name || '-')}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${roleBadge}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn-xs btn-xs-primary" onclick="openBindModal(${u.id})">Vincular</button>
        </td>
        <td>
          <div class="table-actions">
            <button class="btn-xs btn-xs-primary" onclick="openEditUserModal(${u.id}, '${safeName}', '${safeEmail}', '${u.role}', ${u.is_active})">Editar</button>
            ${!isSelf ? `<button class="btn-xs btn-xs-danger" onclick="deleteUser(${u.id}, '${safeEmail}')">Excluir</button>` : '<span style="color:var(--text-tertiary);font-size:0.75rem;">Voce</span>'}
          </div>
        </td>
      </tr>`;
    }).join('');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function openCreateUserModal() {
  document.getElementById('createUserModal').classList.add('active');
  document.getElementById('newUserName').value = '';
  document.getElementById('newUserEmail').value = '';
  document.getElementById('newUserPassword').value = '';

  // Populate instances dropdown
  const select = document.getElementById('newUserInstance');
  select.innerHTML = '<option value="">Selecione uma instancia (opcional)</option>';
  allInstances.forEach(i => {
    select.innerHTML += `<option value="${i.id}">${escapeHtml(i.instance_name)}</option>`;
  });
}

function closeCreateUserModal() {
  document.getElementById('createUserModal').classList.remove('active');
}

async function createUser() {
  const name = document.getElementById('newUserName').value.trim();
  const email = document.getElementById('newUserEmail').value.trim();
  const password = document.getElementById('newUserPassword').value;
  const instanceId = document.getElementById('newUserInstance').value;

  if (!email || !password) return showToast('Email e senha sao obrigatorios', 'error');

  try {
    const user = await api('POST', '/users', { email, password, name });

    // Bind instance if selected
    if (instanceId) {
      await api('POST', `/users/${user.id}/instances`, { instance_id: parseInt(instanceId) });
    }

    showToast(`Usuario "${email}" criado!`, 'success');
    closeCreateUserModal();
    loadUsers();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteUser(id, email) {
  openConfirmModal('Excluir Usuario', `Deseja excluir o usuario "${email}"?`, async () => {
    try {
      await api('DELETE', `/users/${id}`);
      showToast('Usuario excluido', 'success');
      loadUsers();
    } catch (error) { showToast(error.message, 'error'); }
  });
}

async function openBindModal(userId) {
  bindingUserId = userId;
  document.getElementById('bindModal').classList.add('active');

  const select = document.getElementById('bindInstance');
  select.innerHTML = '<option value="">Carregando...</option>';

  try {
    const unbound = await api('GET', '/instances/unbound');
    select.innerHTML = '<option value="">Selecione...</option>';
    if (unbound.length === 0) {
      select.innerHTML = '<option value="">Nenhuma instancia disponivel</option>';
    } else {
      unbound.forEach(i => {
        select.innerHTML += `<option value="${i.id}">${escapeHtml(i.instance_name)}</option>`;
      });
    }
  } catch (error) {
    select.innerHTML = '<option value="">Erro ao carregar</option>';
    showToast(error.message, 'error');
  }
}

function closeBindModal() {
  document.getElementById('bindModal').classList.remove('active');
  bindingUserId = null;
}

async function bindInstance() {
  const instanceId = document.getElementById('bindInstance').value;
  if (!instanceId || !bindingUserId) return showToast('Selecione uma instancia', 'error');

  try {
    await api('POST', `/users/${bindingUserId}/instances`, { instance_id: parseInt(instanceId) });
    showToast('Instancia vinculada!', 'success');
    closeBindModal();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ===== Logs =====
async function loadLogs() {
  try {
    const logs = await api('GET', '/logs?limit=100');
    const tbody = document.getElementById('logsTableBody');
    tbody.innerHTML = logs.map(log => {
      const date = new Date(log.created_at).toLocaleString('pt-BR');
      const details = log.details ? JSON.stringify(log.details).substring(0, 50) : '-';
      return `<tr>
        <td>${date}</td>
        <td>${escapeHtml(log.instance_name || '-')}</td>
        <td><span class="badge badge-user">${escapeHtml(log.action)}</span></td>
        <td>${escapeHtml(log.ip_address || '-')}</td>
        <td style="font-size:0.75rem;color:var(--text-secondary);">${escapeHtml(details)}</td>
      </tr>`;
    }).join('');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ===== Modals =====
function openConfirmModal(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmModal').classList.add('active');

  const btn = document.getElementById('confirmAction');
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', () => {
    closeConfirmModal();
    onConfirm();
  });
}

function closeConfirmModal() {
  document.getElementById('confirmModal').classList.remove('active');
}

// ===== Sidebar =====
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ===== Toast =====
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };

  toast.innerHTML = `<div class="toast-icon">${icons[type] || icons.info}</div><div class="toast-message">${escapeHtml(message)}</div>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ===== Helpers =====
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatPhone(number) {
  if (!number) return '';
  const n = number.replace(/\D/g, '');
  if (n.length >= 12) {
    return `+${n.slice(0, 2)} (${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}`;
  }
  return number;
}

// ===== Profile =====
function loadProfile() {
  document.getElementById('profileName').value = currentUser.name || '';
  document.getElementById('profileEmail').value = currentUser.email || '';

  const avatarLarge = document.getElementById('profileAvatarLarge');
  if (currentUser.profile_picture) {
    avatarLarge.innerHTML = `<img src="${currentUser.profile_picture}" alt="Avatar">`;
  } else {
    avatarLarge.innerHTML = '';
    avatarLarge.textContent = (currentUser.name || currentUser.email).charAt(0).toUpperCase();
  }

  // File input listener
  const input = document.getElementById('profilePictureInput');
  input.onchange = function () {
    const file = this.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return showToast('Imagem muito grande (max 2MB)', 'error');

    const reader = new FileReader();
    reader.onload = function (e) {
      const base64 = e.target.result;
      avatarLarge.innerHTML = `<img src="${base64}" alt="Avatar">`;
      avatarLarge.dataset.pendingPicture = base64;
    };
    reader.readAsDataURL(file);
  };
}

async function saveProfile() {
  const name = document.getElementById('profileName').value.trim();
  const email = document.getElementById('profileEmail').value.trim();
  const avatarLarge = document.getElementById('profileAvatarLarge');
  const pendingPicture = avatarLarge.dataset.pendingPicture;

  const body = {};
  if (name) body.name = name;
  if (email) body.email = email;
  if (pendingPicture) body.profile_picture = pendingPicture;

  try {
    const updated = await api('PUT', '/profile', body);
    currentUser.name = updated.name;
    currentUser.email = updated.email;
    currentUser.profile_picture = updated.profile_picture;
    delete avatarLarge.dataset.pendingPicture;

    // Refresh sidebar
    document.getElementById('userName').textContent = currentUser.name || currentUser.email;
    const sidebarAvatar = document.getElementById('userAvatar');
    if (currentUser.profile_picture) {
      sidebarAvatar.innerHTML = `<img src="${currentUser.profile_picture}" alt="Avatar">`;
    } else {
      sidebarAvatar.innerHTML = '';
      sidebarAvatar.textContent = (currentUser.name || currentUser.email).charAt(0).toUpperCase();
    }

    showToast('Perfil atualizado!', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function removeProfilePicture() {
  api('PUT', '/profile', { profile_picture: null }).then(() => {
    currentUser.profile_picture = null;
    const avatarLarge = document.getElementById('profileAvatarLarge');
    avatarLarge.innerHTML = '';
    avatarLarge.textContent = (currentUser.name || currentUser.email).charAt(0).toUpperCase();

    const sidebarAvatar = document.getElementById('userAvatar');
    sidebarAvatar.innerHTML = '';
    sidebarAvatar.textContent = (currentUser.name || currentUser.email).charAt(0).toUpperCase();

    showToast('Foto removida', 'success');
  }).catch(err => showToast(err.message, 'error'));
}

async function changePassword() {
  const current = document.getElementById('currentPassword').value;
  const newPwd = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmPassword').value;

  if (!current || !newPwd) return showToast('Preencha todos os campos', 'error');
  if (newPwd !== confirm) return showToast('As senhas nao conferem', 'error');
  if (newPwd.length < 6) return showToast('A nova senha deve ter pelo menos 6 caracteres', 'error');

  try {
    await api('PUT', '/profile/password', { currentPassword: current, newPassword: newPwd });
    showToast('Senha alterada com sucesso!', 'success');
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ===== Edit User (Master) =====
function openEditUserModal(id, name, email, role, isActive) {
  document.getElementById('editUserId').value = id;
  document.getElementById('editUserName').value = name || '';
  document.getElementById('editUserEmail').value = email || '';
  document.getElementById('editUserRole').value = role || 'user';
  document.getElementById('editUserActive').checked = isActive;
  document.getElementById('editUserPassword').value = '';
  document.getElementById('editUserModal').classList.add('active');
}

function closeEditUserModal() {
  document.getElementById('editUserModal').classList.remove('active');
}

async function saveEditUser() {
  const id = document.getElementById('editUserId').value;
  const name = document.getElementById('editUserName').value.trim();
  const email = document.getElementById('editUserEmail').value.trim();
  const role = document.getElementById('editUserRole').value;
  const is_active = document.getElementById('editUserActive').checked;
  const password = document.getElementById('editUserPassword').value;

  const body = { name, email, role, is_active };
  if (password) body.password = password;

  try {
    await api('PUT', `/users/${id}`, body);
    showToast('Usuario atualizado!', 'success');
    closeEditUserModal();
    loadUsers();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ===== Toggle Login Password =====
function toggleLoginPassword() {
  const input = document.getElementById('loginPassword');
  const eyeIcon = document.getElementById('eyeIcon');
  const eyeOffIcon = document.getElementById('eyeOffIcon');

  if (input.type === 'password') {
    input.type = 'text';
    eyeIcon.style.display = 'none';
    eyeOffIcon.style.display = 'block';
  } else {
    input.type = 'password';
    eyeIcon.style.display = 'block';
    eyeOffIcon.style.display = 'none';
  }
}
