/**
 * Sistema de Autenticação com JWT
 */
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'dash-evolution-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d'; // Token expira em 7 dias

/**
 * Gerar hash de senha
 */
async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

/**
 * Verificar senha
 */
async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Gerar JWT token
 */
function generateToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verificar JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Login de usuário
 */
async function login(email, password, ip, userAgent) {
  try {
    // Buscar usuário
    const result = await query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'Credenciais inválidas' };
    }

    const user = result.rows[0];

    // Verificar senha
    const validPassword = await verifyPassword(password, user.password_hash);

    if (!validPassword) {
      return { success: false, error: 'Credenciais inválidas' };
    }

    // Gerar token
    const token = generateToken(user);

    // Calcular expiração (7 dias)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Salvar sessão no banco
    await query(
      `INSERT INTO sessions (user_id, token, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, token, ip, userAgent, expiresAt]
    );

    // Atualizar last_login
    await query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Remover senha do retorno
    delete user.password_hash;

    return {
      success: true,
      user,
      token,
    };
  } catch (error) {
    console.error('Erro no login:', error);
    return { success: false, error: 'Erro ao fazer login' };
  }
}

/**
 * Logout (invalidar token)
 */
async function logout(token) {
  try {
    await query('DELETE FROM sessions WHERE token = $1', [token]);
    return { success: true };
  } catch (error) {
    console.error('Erro no logout:', error);
    return { success: false, error: 'Erro ao fazer logout' };
  }
}

/**
 * Verificar se token é válido e não expirou
 */
async function validateSession(token) {
  try {
    // Verificar JWT
    const payload = verifyToken(token);
    if (!payload) {
      return null;
    }

    // Verificar se existe no banco e não expirou
    const result = await query(
      `SELECT s.*, u.email, u.role, u.name, u.is_active
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = $1 AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = true`,
      [token]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      id: payload.id,
      email: result.rows[0].email,
      role: result.rows[0].role,
      name: result.rows[0].name,
    };
  } catch (error) {
    console.error('Erro ao validar sessão:', error);
    return null;
  }
}

/**
 * Middleware para proteger rotas
 */
function requireAuth(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Autenticação necessária' });
  }

  validateSession(token).then((user) => {
    if (!user) {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    req.user = user;
    next();
  }).catch((error) => {
    console.error('Erro no middleware de autenticação:', error);
    res.status(500).json({ error: 'Erro ao validar autenticação' });
  });
}

/**
 * Middleware para rotas que requerem papel de master
 */
function requireMaster(req, res, next) {
  if (req.user.role !== 'master') {
    return res.status(403).json({ error: 'Acesso negado. Apenas usuários master.' });
  }
  next();
}

/**
 * Verificar se usuário tem permissão para acessar instância
 */
async function canAccessInstance(userId, instanceId, action = 'read') {
  try {
    // Master tem acesso total
    const userResult = await query('SELECT role FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length > 0 && userResult.rows[0].role === 'master') {
      return true;
    }

    // Verificar permissão específica
    const permissionColumn = {
      connect: 'can_connect',
      disconnect: 'can_disconnect',
      delete: 'can_delete',
      restart: 'can_restart',
      send: 'can_send_messages',
    }[action] || 'can_connect'; // Default: pode apenas conectar

    const result = await query(
      `SELECT ${permissionColumn} FROM user_instances
       WHERE user_id = $1 AND instance_id = $2`,
      [userId, instanceId]
    );

    return result.rows.length > 0 && result.rows[0][permissionColumn];
  } catch (error) {
    console.error('Erro ao verificar permissão:', error);
    return false;
  }
}

/**
 * Obter instâncias acessíveis por um usuário
 */
async function getUserInstances(userId) {
  try {
    const userResult = await query('SELECT role FROM users WHERE id = $1', [userId]);

    // Master vê todas
    if (userResult.rows.length > 0 && userResult.rows[0].role === 'master') {
      const result = await query('SELECT * FROM instances ORDER BY created_at DESC');
      return result.rows;
    }

    // Usuário normal vê apenas as vinculadas
    const result = await query(
      `SELECT i.*, ui.can_connect, ui.can_disconnect, ui.can_delete, ui.can_restart, ui.can_send_messages
       FROM instances i
       JOIN user_instances ui ON i.id = ui.instance_id
       WHERE ui.user_id = $1
       ORDER BY i.created_at DESC`,
      [userId]
    );

    return result.rows;
  } catch (error) {
    console.error('Erro ao buscar instâncias do usuário:', error);
    return [];
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  login,
  logout,
  validateSession,
  requireAuth,
  requireMaster,
  canAccessInstance,
  getUserInstances,
};
