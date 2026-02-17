require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, testConnection } = require('./db');

async function initializeDatabase() {
  console.log('\n🚀 Iniciando setup do banco de dados...\n');

  try {
    // Testar conexão
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Não foi possível conectar ao banco de dados');
    }

    // Ler e executar o schema SQL
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('📝 Executando schema SQL...');
    await pool.query(schema);

    console.log('\n✅ Banco de dados inicializado com sucesso!\n');
    console.log('Tabelas criadas:');
    console.log('  - instances (instâncias WhatsApp)');
    console.log('  - instance_logs (logs de atividades)');
    console.log('  - settings (configurações globais)\n');

    // Verificar tabelas criadas
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('Tabelas no banco:', result.rows.map(r => r.table_name).join(', '));

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao inicializar banco de dados:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  initializeDatabase();
}

module.exports = { initializeDatabase };
