require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { query, testConnection } = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Evolution API config
const EVO_URL = process.env.EVOLUTION_API_URL?.replace(/\/$/, '');
const EVO_KEY = process.env.EVOLUTION_API_KEY;

if (!EVO_URL || !EVO_KEY) {
  console.error('❌ EVOLUTION_API_URL e EVOLUTION_API_KEY devem ser definidos nas variáveis de ambiente ou no .env');
  console.error('   Defina as variáveis no painel do EasyPanel ou crie um arquivo .env na raiz do projeto.');
  process.exit(1);
}

// ===== DATABASE HELPERS =====

// Registrar log de atividade
async function logActivity(instanceName, action, details = {}, req = null) {
  try {
    const ipAddress = req ? req.ip || req.connection.remoteAddress : null;
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

// Sincronizar instância no banco
async function syncInstanceToDB(instanceData) {
  try {
    const {
      instance,
      instance: { instanceName },
      hash,
      connectionStatus,
    } = instanceData;

    // Buscar dados adicionais do perfil se conectado
    let profileName = null;
    let profilePictureUrl = null;

    // Upsert da instância no banco
    const result = await query(
      `INSERT INTO instances (
        instance_name, integration, number, status, profile_name,
        profile_picture_url, qrcode, owner, webhook_url, settings
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (instance_name)
      DO UPDATE SET
        status = $4,
        profile_name = $5,
        profile_picture_url = $6,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        instanceName,
        instance.integration || 'WHATSAPP-BAILEYS',
        instance.number || null,
        connectionStatus?.state || 'disconnected',
        profileName,
        profilePictureUrl,
        true,
        instance.owner || null,
        instance.webhook || null,
        instance.settings ? JSON.stringify(instance.settings) : null,
      ]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Erro ao sincronizar instância no banco:', error.message);
    return null;
  }
}

// Buscar todas as instâncias do banco
async function getInstancesFromDB() {
  try {
    const result = await query(
      `SELECT * FROM instances ORDER BY created_at DESC`
    );
    return result.rows;
  } catch (error) {
    console.error('Erro ao buscar instâncias do banco:', error.message);
    return [];
  }
}

// Atualizar status da instância
async function updateInstanceStatus(instanceName, status) {
  try {
    await query(
      `UPDATE instances SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE instance_name = $2`,
      [status, instanceName]
    );
  } catch (error) {
    console.error('Erro ao atualizar status:', error.message);
  }
}

// ===== EVOLUTION API HELPERS =====

// Helper: proxy fetch to Evolution API
async function evoFetch(method, endpoint, body = null) {
  const url = `${EVO_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVO_KEY,
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type');

  let data;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return { status: response.status, data };
}

// Sincronizar todas as instâncias da Evolution API com o banco
async function syncAllInstances() {
  try {
    const { status, data } = await evoFetch('GET', '/instance/fetchInstances');

    if (status === 200 && Array.isArray(data)) {
      for (const instance of data) {
        await syncInstanceToDB(instance);
      }
      console.log(`✅ ${data.length} instâncias sincronizadas com o banco`);
    }
  } catch (error) {
    console.error('Erro ao sincronizar instâncias:', error.message);
  }
}

// ===== API ROUTES =====

// GET /api/instances — Fetch all instances (do banco + sync com Evolution API)
app.get('/api/instances', async (req, res) => {
  try {
    // Buscar da Evolution API
    const { status, data } = await evoFetch('GET', '/instance/fetchInstances');

    // Sincronizar com o banco
    if (status === 200 && Array.isArray(data)) {
      for (const instance of data) {
        await syncInstanceToDB(instance);
      }
    }

    // Retornar dados do banco (fonte única da verdade)
    const instances = await getInstancesFromDB();

    // Mesclar com dados da Evolution API
    const mergedData = data.map(evoInstance => {
      const dbInstance = instances.find(
        db => db.instance_name === evoInstance.instance.instanceName
      );
      return {
        ...evoInstance,
        dbData: dbInstance,
      };
    });

    res.status(200).json(mergedData);
  } catch (error) {
    console.error('Erro ao buscar instâncias:', error.message);
    res.status(500).json({ error: 'Falha ao buscar instâncias' });
  }
});

// POST /api/instances — Create a new instance
app.post('/api/instances', async (req, res) => {
  try {
    const { instanceName, integration, number, qrcode, settings } = req.body;

    if (!instanceName) {
      return res.status(400).json({ error: 'instanceName é obrigatório' });
    }

    const payload = {
      instanceName,
      integration: integration || 'WHATSAPP-BAILEYS',
      qrcode: qrcode !== undefined ? qrcode : true,
    };

    if (number) payload.number = number;
    if (settings) payload.settings = settings;

    // Criar na Evolution API
    const { status, data } = await evoFetch('POST', '/instance/create', payload);

    if (status === 201 || status === 200) {
      // Salvar no banco
      await query(
        `INSERT INTO instances (instance_name, integration, number, status, qrcode, settings)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (instance_name) DO NOTHING`,
        [
          instanceName,
          payload.integration,
          number || null,
          'disconnected',
          payload.qrcode,
          settings ? JSON.stringify(settings) : null,
        ]
      );

      // Registrar log
      await logActivity(instanceName, 'create', { payload }, req);
    }

    res.status(status).json(data);
  } catch (error) {
    console.error('Erro ao criar instância:', error.message);
    res.status(500).json({ error: 'Falha ao criar instância' });
  }
});

// GET /api/instances/:name/connect — Get QR Code
app.get('/api/instances/:name/connect', async (req, res) => {
  try {
    const { status, data } = await evoFetch('GET', `/instance/connect/${req.params.name}`);

    if (status === 200) {
      await updateInstanceStatus(req.params.name, 'connecting');
      await logActivity(req.params.name, 'connect', { qrcode: true }, req);
    }

    res.status(status).json(data);
  } catch (error) {
    console.error('Erro ao conectar instância:', error.message);
    res.status(500).json({ error: 'Falha ao gerar QR Code' });
  }
});

// GET /api/instances/:name/status — Connection state
app.get('/api/instances/:name/status', async (req, res) => {
  try {
    const { status, data } = await evoFetch('GET', `/instance/connectionState/${req.params.name}`);

    if (status === 200 && data.state) {
      await updateInstanceStatus(req.params.name, data.state);
    }

    res.status(status).json(data);
  } catch (error) {
    console.error('Erro ao verificar status:', error.message);
    res.status(500).json({ error: 'Falha ao verificar status' });
  }
});

// PUT /api/instances/:name/restart — Restart instance
app.put('/api/instances/:name/restart', async (req, res) => {
  try {
    const { status, data } = await evoFetch('PUT', `/instance/restart/${req.params.name}`);

    if (status === 200) {
      await updateInstanceStatus(req.params.name, 'connecting');
      await logActivity(req.params.name, 'restart', {}, req);
    }

    res.status(status).json(data);
  } catch (error) {
    console.error('Erro ao reiniciar instância:', error.message);
    res.status(500).json({ error: 'Falha ao reiniciar instância' });
  }
});

// DELETE /api/instances/:name/logout — Logout instance
app.delete('/api/instances/:name/logout', async (req, res) => {
  try {
    const { status, data } = await evoFetch('DELETE', `/instance/logout/${req.params.name}`);

    if (status === 200) {
      await updateInstanceStatus(req.params.name, 'disconnected');
      await logActivity(req.params.name, 'logout', {}, req);
    }

    res.status(status).json(data);
  } catch (error) {
    console.error('Erro ao desconectar instância:', error.message);
    res.status(500).json({ error: 'Falha ao desconectar instância' });
  }
});

// DELETE /api/instances/:name — Delete instance
app.delete('/api/instances/:name', async (req, res) => {
  try {
    const { status, data } = await evoFetch('DELETE', `/instance/delete/${req.params.name}`);

    if (status === 200) {
      // Remover do banco
      await query('DELETE FROM instances WHERE instance_name = $1', [req.params.name]);
      await logActivity(req.params.name, 'delete', {}, req);
    }

    res.status(status).json(data);
  } catch (error) {
    console.error('Erro ao deletar instância:', error.message);
    res.status(500).json({ error: 'Falha ao deletar instância' });
  }
});

// GET /api/logs — Buscar logs de atividades
app.get('/api/logs', async (req, res) => {
  try {
    const limit = req.query.limit || 100;
    const result = await query(
      `SELECT * FROM instance_logs ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar logs:', error.message);
    res.status(500).json({ error: 'Falha ao buscar logs' });
  }
});

// GET /api/stats — Estatísticas do dashboard
app.get('/api/stats', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as connected,
        COUNT(CASE WHEN status != 'open' THEN 1 END) as disconnected
      FROM instances
    `);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error.message);
    res.status(500).json({ error: 'Falha ao buscar estatísticas' });
  }
});

// Fallback: serve index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== STARTUP =====

async function startServer() {
  try {
    // Testar conexão com o banco
    console.log('\n🔍 Testando conexão com PostgreSQL...');
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.error('❌ Não foi possível conectar ao banco de dados');
      console.error('   Verifique a variável DATABASE_URL no .env');
      process.exit(1);
    }

    // Sincronizar instâncias na inicialização
    console.log('🔄 Sincronizando instâncias...');
    await syncAllInstances();

    // Iniciar servidor
    app.listen(PORT, () => {
      console.log(`\n🚀 Dashboard Evolution API rodando em http://localhost:${PORT}`);
      console.log(`📡 Conectado a: ${EVO_URL}`);
      console.log(`💾 Banco de dados: Conectado\n`);
    });

    // Sincronizar instâncias a cada 5 minutos
    setInterval(syncAllInstances, 5 * 60 * 1000);
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error.message);
    process.exit(1);
  }
}

startServer();
