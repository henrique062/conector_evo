require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

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
  console.error('❌ EVOLUTION_API_URL e EVOLUTION_API_KEY devem ser definidos no .env');
  process.exit(1);
}

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

// ===== API Routes =====

// GET /api/instances — Fetch all instances
app.get('/api/instances', async (req, res) => {
  try {
    const { status, data } = await evoFetch('GET', '/instance/fetchInstances');
    res.status(status).json(data);
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

    const { status, data } = await evoFetch('POST', '/instance/create', payload);
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
    res.status(status).json(data);
  } catch (error) {
    console.error('Erro ao deletar instância:', error.message);
    res.status(500).json({ error: 'Falha ao deletar instância' });
  }
});

// Fallback: serve index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Dashboard Evolution API rodando em http://localhost:${PORT}`);
  console.log(`📡 Conectado a: ${EVO_URL}\n`);
});
