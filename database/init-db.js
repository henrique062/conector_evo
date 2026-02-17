require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, testConnection } = require('./db');

async function initializeDatabase() {
  console.log('\n🚀 Iniciando setup do banco de dados...\n');

  try {
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Não foi possível conectar ao banco de dados');
    }

    // 1. Executar schema principal
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    console.log('📝 Executando schema.sql...');
    await pool.query(schema);
    console.log('✅ Schema principal criado');

    // 2. Executar schema de autenticação
    const authSchemaPath = path.join(__dirname, 'auth-schema.sql');
    const authSchema = fs.readFileSync(authSchemaPath, 'utf8');
    console.log('📝 Executando auth-schema.sql...');
    await pool.query(authSchema);
    console.log('✅ Schema de autenticação criado');

    // 3. Verificar tabelas
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log('\n📊 Tabelas no banco:', result.rows.map(r => r.table_name).join(', '));

    // 4. Verificar usuário master
    const users = await pool.query('SELECT id, email, role FROM users');
    console.log('👤 Usuários:', JSON.stringify(users.rows));

    console.log('\n✅ Banco de dados inicializado com sucesso!\n');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
}

if (require.main === module) {
  initializeDatabase();
}

module.exports = { initializeDatabase };
