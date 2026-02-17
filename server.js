require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const { query, testConnection } = require('./database/db');
const { requireAuth, requireMaster, login, logout, hashPassword, getUserInstances, canAccessInstance } = require('./lib/auth');
const WhatsAppAdapter = require('./lib/whatsapp-adapter');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// Provider config
const API_PROVIDER = process.env.API_PROVIDER || 'evolution';

function getAdapter(instanceToken) {
  if (API_PROVIDER === 'evolution') {
    const url = process.env.EVOLUTION_API_URL?.replace(/\/$/, '');
    const key = process.env.EVOLUTION_API_KEY;
    if (!url || !key) {
      throw new Error('EVOLUTION_API_URL e EVOLUTION_API_KEY são obrigatórios');
    }
    return new WhatsAppAdapter('evolution', { baseUrl: url, apiKey: key });
  } else {
    const url = process.env.UAZAPI_URL?.replace(/\/$/, '');
    const adminToken = process.env.UAZAPI_ADMIN_TOKEN;
    if (!url || !adminToken) {
      throw new Error('UAZAPI_URL e UAZAPI_ADMIN_TOKEN são obrigatórios');
    }
    return new WhatsAppAdapter('uazapi', {
      baseUrl: url,
      adminToken: adminToken,
      token: instanceToken || null,
    });
  }
}

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// ===== DATABASE HELPERS =====

async function logActivity(instanceName, action, details = {}, req = null) {
  try {
    const ipAddress = req ? req.ip || req.connection?.remoteAddress : null;
    const userAgent = req ? req.get('user-agent') : null;
    await query(
      `INSERT INTO instance_logs (instance_name, action, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [instanceName, action, JSON.stringify(details), ipAddress, userAgent]
    );
  } catch (error) {
    console.error('Erro ao registrar log:', error.message);
  }
}

async function syncInstanceToDB(instanceData) {
  try {
    let name, status, number, profileName, profilePictureUrl, integration;

    if (API_PROVIDER === 'evolution') {
      name = instanceData.instance?.instanceName;
      status = instanceData.connectionStatus?.state || 'disconnected';
      number = instanceData.instance?.number || null;
      profileName = instanceData.instance?.profileName || null;
      profilePictureUrl = instanceData.instance?.profilePicUrl || null;
      integration = instanceData.instance?.integration || 'WHATSAPP-BAILEYS';
    } else {
      name = instanceData.name;
      status = instanceData.status || 'disconnected';
      number = instanceData.owner || null;
      profileName = instanceData.profileName || null;
      profilePictureUrl = instanceData.profilePicUrl || null;
      integration = 'UAZAPI';
    }

    if (!name) return null;

    // Mapear status para padrão interno
    if (status === 'open') status = 'connected';

    const settingsJson = instanceData.token ? JSON.stringify({ uazapi_token: instanceData.token }) : null;

    const result = await query(
      `INSERT INTO instances (instance_name, integration, number, status, profile_name, profile_picture_url, qrcode, settings)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)
       ON CONFLICT (instance_name)
       DO UPDATE SET status = $4, profile_name = $5, profile_picture_url = $6,
         number = COALESCE($3, instances.number),
         settings = COALESCE($7, instances.settings),
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [name, integration, number, status, profileName, profilePictureUrl, settingsJson]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Erro ao sincronizar instância:', error.message);
    return null;
  }
}

async function updateInstanceStatus(instanceName, status) {
  try {
    await query(
      'UPDATE instances SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE instance_name = $2',
      [status, instanceName]
    );
  } catch (error) {
    console.error('Erro ao atualizar status:', error.message);
  }
}

async function syncAllInstances() {
  try {
    const adapter = getAdapter();
    const { status, data } = await adapter.listInstances();
    if (status === 200 && Array.isArray(data)) {
      for (const instance of data) {
        await syncInstanceToDB(instance);
      }
      console.log(`✅ ${data.length} instâncias sincronizadas`);
    }
  } catch (error) {
    console.error('Erro ao sincronizar instâncias:', error.message);
  }
}

// Buscar token Uazapi de uma instância
async function getUazapiToken(instanceName) {
  if (API_PROVIDER !== 'uazapi') return null;
  try {
    const result = await query('SELECT settings FROM instances WHERE instance_name = $1', [instanceName]);
    if (result.rows.length > 0 && result.rows[0].settings) {
      return result.rows[0].settings.uazapi_token || null;
    }
  } catch (e) { /* ignore */ }
  return null;
}

// ===== AUTH ROUTES =====

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const result = await login(email, password, req.ip, req.get('user-agent'));

    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }

    res.cookie('token', result.token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
      sameSite: 'lax',
    });

    res.json({ user: result.user, token: result.token });
  } catch (error) {
    console.error('Erro no login:', error.message);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    await logout(token);
    res.clearCookie('token');
    res.json({ message: 'Logout realizado' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao fazer logout' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user, provider: API_PROVIDER });
});

// ===== PROFILE ROUTES =====

app.put('/api/profile', requireAuth, async (req, res) => {
  try {
    const { name, email, profile_picture } = req.body;
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name) { updates.push(`name = $${paramIndex++}`); values.push(name); }
    if (email) { updates.push(`email = $${paramIndex++}`); values.push(email); }
    if (profile_picture !== undefined) { updates.push(`profile_picture = $${paramIndex++}`); values.push(profile_picture); }

    if (updates.length === 0) return res.status(400).json({ error: 'Nenhum dado para atualizar' });

    values.push(req.user.id);
    const result = await query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING id, email, name, role, profile_picture`,
      values
    );
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Email ja em uso' });
    res.status(500).json({ error: 'Falha ao atualizar perfil' });
  }
});

app.put('/api/profile/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Senha atual e nova sao obrigatorias' });
    }

    const bcrypt = require('bcrypt');
    const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });

    const newHash = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newHash, req.user.id]);
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Falha ao alterar senha' });
  }
});

// ===== USER MANAGEMENT (MASTER ONLY) =====

app.get('/api/users', requireAuth, requireMaster, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, name, role, is_active, last_login, created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Falha ao buscar usuários' });
  }
});

app.post('/api/users', requireAuth, requireMaster, async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const passwordHash = await hashPassword(password);
    const userRole = role === 'master' ? 'master' : 'user';

    const result = await query(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, created_at`,
      [email, passwordHash, name || email.split('@')[0], userRole]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }
    res.status(500).json({ error: 'Falha ao criar usuário' });
  }
});

app.put('/api/users/:id', requireAuth, requireMaster, async (req, res) => {
  try {
    const { name, email, role, is_active, password } = req.body;
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(name); }
    if (email !== undefined) { updates.push(`email = $${paramIndex++}`); values.push(email); }
    if (role !== undefined) { updates.push(`role = $${paramIndex++}`); values.push(role === 'master' ? 'master' : 'user'); }
    if (is_active !== undefined) { updates.push(`is_active = $${paramIndex++}`); values.push(is_active); }
    if (password) { updates.push(`password_hash = $${paramIndex++}`); values.push(await hashPassword(password)); }

    if (updates.length === 0) return res.status(400).json({ error: 'Nenhum dado para atualizar' });

    values.push(parseInt(req.params.id));
    const result = await query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING id, email, name, role, is_active`,
      values
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario nao encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Email ja em uso' });
    res.status(500).json({ error: 'Falha ao atualizar usuario' });
  }
});

app.delete('/api/users/:id', requireAuth, requireMaster, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Não é possível excluir a si mesmo' });
    }
    await query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ message: 'Usuário excluído' });
  } catch (error) {
    res.status(500).json({ error: 'Falha ao excluir usuário' });
  }
});

// ===== UNBOUND INSTANCES =====

app.get('/api/instances/unbound', requireAuth, requireMaster, async (req, res) => {
  try {
    const result = await query(
      `SELECT i.id, i.instance_name, i.status, i.number
       FROM instances i
       WHERE i.id NOT IN (SELECT instance_id FROM user_instances)
       ORDER BY i.instance_name`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Falha ao buscar instancias disponiveis' });
  }
});

// ===== USER-INSTANCE BINDING (MASTER ONLY) =====

app.get('/api/users/:id/instances', requireAuth, requireMaster, async (req, res) => {
  try {
    const result = await query(
      `SELECT ui.*, i.instance_name, i.status, i.number
       FROM user_instances ui
       JOIN instances i ON ui.instance_id = i.id
       WHERE ui.user_id = $1`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Falha ao buscar vinculações' });
  }
});

app.post('/api/users/:id/instances', requireAuth, requireMaster, async (req, res) => {
  try {
    const { instance_id } = req.body;
    if (!instance_id) {
      return res.status(400).json({ error: 'instance_id é obrigatório' });
    }

    const result = await query(
      `INSERT INTO user_instances (user_id, instance_id, can_connect, can_disconnect)
       VALUES ($1, $2, true, true)
       ON CONFLICT (user_id, instance_id) DO NOTHING
       RETURNING *`,
      [req.params.id, instance_id]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'Vinculação já existe' });
    }

    // Auto-set foto de perfil: se o usuário não tem foto, usar a do WhatsApp da instância
    try {
      const userCheck = await query('SELECT profile_picture FROM users WHERE id = $1', [req.params.id]);
      if (userCheck.rows.length > 0 && !userCheck.rows[0].profile_picture) {
        const instCheck = await query('SELECT profile_picture_url FROM instances WHERE id = $1', [instance_id]);
        if (instCheck.rows.length > 0 && instCheck.rows[0].profile_picture_url) {
          await query('UPDATE users SET profile_picture = $1 WHERE id = $2', [instCheck.rows[0].profile_picture_url, req.params.id]);
        }
      }
    } catch (e) { /* não bloquear a vinculação por erro na foto */ }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Falha ao vincular instância' });
  }
});

app.delete('/api/users/:userId/instances/:instanceId', requireAuth, requireMaster, async (req, res) => {
  try {
    await query(
      'DELETE FROM user_instances WHERE user_id = $1 AND instance_id = $2',
      [req.params.userId, req.params.instanceId]
    );
    res.json({ message: 'Vinculação removida' });
  } catch (error) {
    res.status(500).json({ error: 'Falha ao remover vinculação' });
  }
});

// ===== INSTANCE ROUTES (AUTH REQUIRED) =====

app.get('/api/instances', requireAuth, async (req, res) => {
  try {
    const adapter = getAdapter();
    const { status, data } = await adapter.listInstances();

    if (status === 200 && Array.isArray(data)) {
      for (const instance of data) {
        await syncInstanceToDB(instance);
      }
    }

    // Buscar instâncias do banco filtradas por permissão
    const instances = await getUserInstances(req.user.id);

    // Mesclar com dados da API
    const mergedData = instances.map(dbInst => {
      let apiData = null;
      if (Array.isArray(data)) {
        if (API_PROVIDER === 'evolution') {
          apiData = data.find(d => d.instance?.instanceName === dbInst.instance_name);
        } else {
          apiData = data.find(d => d.name === dbInst.instance_name);
        }
      }
      return { ...dbInst, apiData };
    });

    res.json(mergedData);
  } catch (error) {
    console.error('Erro ao buscar instâncias:', error.message);
    res.status(500).json({ error: 'Falha ao buscar instâncias' });
  }
});

app.post('/api/instances', requireAuth, requireMaster, async (req, res) => {
  try {
    const { instanceName, integration, number } = req.body;
    if (!instanceName) {
      return res.status(400).json({ error: 'instanceName é obrigatório' });
    }

    const adapter = getAdapter();
    const { status, data } = await adapter.createInstance(instanceName, { integration, number });

    if (status === 200 || status === 201) {
      // Salvar no banco - incluindo token uazapi se existir
      const settings = data.token ? JSON.stringify({ uazapi_token: data.token }) : null;
      await query(
        `INSERT INTO instances (instance_name, integration, number, status, qrcode, settings)
         VALUES ($1, $2, $3, 'disconnected', true, $4) ON CONFLICT (instance_name) DO NOTHING`,
        [instanceName, API_PROVIDER === 'uazapi' ? 'UAZAPI' : (integration || 'WHATSAPP-BAILEYS'), number || null, settings]
      );
      await logActivity(instanceName, 'create', { provider: API_PROVIDER }, req);
    }

    res.status(status).json(data);
  } catch (error) {
    console.error('Erro ao criar instância:', error.message);
    res.status(500).json({ error: 'Falha ao criar instância' });
  }
});

app.get('/api/instances/:name/connect', requireAuth, async (req, res) => {
  try {
    const instanceName = req.params.name;

    // Verificar permissão para usuários normais
    if (req.user.role !== 'master') {
      const inst = await query('SELECT id FROM instances WHERE instance_name = $1', [instanceName]);
      if (inst.rows.length === 0) return res.status(404).json({ error: 'Instância não encontrada' });
      const allowed = await canAccessInstance(req.user.id, inst.rows[0].id, 'connect');
      if (!allowed) return res.status(403).json({ error: 'Sem permissão' });
    }

    const token = await getUazapiToken(instanceName);
    const adapter = getAdapter(token);
    const { status, data } = await adapter.connectInstance(instanceName);

    if (status === 200) {
      await updateInstanceStatus(instanceName, 'connecting');
      await logActivity(instanceName, 'connect', { user: req.user.email }, req);
    }

    res.status(status).json(data);
  } catch (error) {
    console.error('Erro ao conectar:', error.message);
    res.status(500).json({ error: 'Falha ao gerar QR Code' });
  }
});

app.get('/api/instances/:name/status', requireAuth, async (req, res) => {
  try {
    const instanceName = req.params.name;
    const token = await getUazapiToken(instanceName);
    const adapter = getAdapter(token);
    const { status, data } = await adapter.getInstanceStatus(instanceName);

    if (status === 200) {
      let normalizedStatus;
      if (API_PROVIDER === 'evolution') {
        normalizedStatus = data.state || data.instance?.state;
        if (normalizedStatus === 'open') normalizedStatus = 'connected';
      } else {
        normalizedStatus = data.instance?.status || data.status;
      }
      if (normalizedStatus) {
        await updateInstanceStatus(instanceName, normalizedStatus);
      }
    }

    res.status(status).json(data);
  } catch (error) {
    console.error('Erro ao verificar status:', error.message);
    res.status(500).json({ error: 'Falha ao verificar status' });
  }
});

app.put('/api/instances/:name/restart', requireAuth, requireMaster, async (req, res) => {
  try {
    const instanceName = req.params.name;
    const token = await getUazapiToken(instanceName);
    const adapter = getAdapter(token);
    const { status, data } = await adapter.restartInstance(instanceName);

    if (status === 200) {
      await updateInstanceStatus(instanceName, 'connecting');
      await logActivity(instanceName, 'restart', { user: req.user.email }, req);
    }

    res.status(status).json(data);
  } catch (error) {
    console.error('Erro ao reiniciar:', error.message);
    res.status(500).json({ error: 'Falha ao reiniciar' });
  }
});

app.delete('/api/instances/:name/logout', requireAuth, async (req, res) => {
  try {
    const instanceName = req.params.name;

    // Verificar permissão para usuários normais
    if (req.user.role !== 'master') {
      const inst = await query('SELECT id FROM instances WHERE instance_name = $1', [instanceName]);
      if (inst.rows.length === 0) return res.status(404).json({ error: 'Instância não encontrada' });
      const allowed = await canAccessInstance(req.user.id, inst.rows[0].id, 'disconnect');
      if (!allowed) return res.status(403).json({ error: 'Sem permissão' });
    }

    const token = await getUazapiToken(instanceName);
    const adapter = getAdapter(token);
    const { status, data } = await adapter.disconnectInstance(instanceName);

    if (status === 200) {
      await updateInstanceStatus(instanceName, 'disconnected');
      await logActivity(instanceName, 'logout', { user: req.user.email }, req);
    }

    res.status(status).json(data);
  } catch (error) {
    console.error('Erro ao desconectar:', error.message);
    res.status(500).json({ error: 'Falha ao desconectar' });
  }
});

app.delete('/api/instances/:name', requireAuth, requireMaster, async (req, res) => {
  try {
    const instanceName = req.params.name;
    const token = await getUazapiToken(instanceName);
    const adapter = getAdapter(token);
    const { status, data } = await adapter.deleteInstance(instanceName);

    if (status === 200) {
      await query('DELETE FROM instances WHERE instance_name = $1', [instanceName]);
      await logActivity(instanceName, 'delete', { user: req.user.email }, req);
    }

    res.status(status).json(data);
  } catch (error) {
    console.error('Erro ao deletar:', error.message);
    res.status(500).json({ error: 'Falha ao deletar' });
  }
});

app.get('/api/logs', requireAuth, requireMaster, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const result = await query('SELECT * FROM instance_logs ORDER BY created_at DESC LIMIT $1', [limit]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Falha ao buscar logs' });
  }
});

app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'connected' OR status = 'open' THEN 1 END) as connected,
        COUNT(CASE WHEN status != 'connected' AND status != 'open' THEN 1 END) as disconnected
      FROM instances
    `);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Falha ao buscar estatísticas' });
  }
});

// Fallback SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== AUTO-MIGRATE =====
async function ensureTables() {
  const fs = require('fs');
  const path = require('path');

  try {
    // Verificar se as tabelas existem
    const check = await query(
      `SELECT COUNT(*) as count FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('instances', 'users', 'sessions')`,
      []
    );

    if (parseInt(check.rows[0].count) < 3) {
      console.log('📝 Tabelas não encontradas, criando schema...');

      const schemaPath = path.join(__dirname, 'database', 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await query(schema);
      console.log('✅ Schema principal criado');

      const authSchemaPath = path.join(__dirname, 'database', 'auth-schema.sql');
      const authSchema = fs.readFileSync(authSchemaPath, 'utf8');
      await query(authSchema);
      console.log('✅ Schema de autenticação criado');
    } else {
      console.log('✅ Tabelas já existem');
    }

    // Migration: adicionar coluna profile_picture se não existir
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'profile_picture') THEN
          ALTER TABLE users ADD COLUMN profile_picture TEXT;
        END IF;
      END $$;
    `);
  } catch (error) {
    console.error('❌ Erro ao criar tabelas:', error.message);
    throw error;
  }
}

// ===== STARTUP =====
async function startServer() {
  try {
    console.log(`\n🔍 Provider: ${API_PROVIDER}`);
    console.log('🔍 Testando conexão com PostgreSQL...');
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('❌ Falha na conexão com o banco');
      process.exit(1);
    }

    // Criar tabelas automaticamente se não existirem
    await ensureTables();

    console.log('🔄 Sincronizando instâncias...');
    await syncAllInstances();

    app.listen(PORT, () => {
      console.log(`\n🚀 Dashboard rodando em http://localhost:${PORT}`);
      console.log(`📡 Provider: ${API_PROVIDER}`);
      console.log(`💾 Banco de dados: Conectado\n`);
    });

    setInterval(syncAllInstances, 5 * 60 * 1000);
  } catch (error) {
    console.error('❌ Erro ao iniciar:', error.message);
    process.exit(1);
  }
}

startServer();
