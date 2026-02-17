-- Schema de Autenticação e Permissões

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    profile_picture TEXT,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('master', 'user')),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para usuários
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- Tabela de vinculação usuário-instância
CREATE TABLE IF NOT EXISTS user_instances (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    instance_id INTEGER REFERENCES instances(id) ON DELETE CASCADE,
    can_connect BOOLEAN DEFAULT true,
    can_disconnect BOOLEAN DEFAULT true,
    can_delete BOOLEAN DEFAULT false,
    can_restart BOOLEAN DEFAULT false,
    can_send_messages BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, instance_id)
);

-- Índices para permissões
CREATE INDEX IF NOT EXISTS idx_user_instances_user ON user_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_user_instances_instance ON user_instances(instance_id);

-- Tabela de sessões (tokens JWT)
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para sessões
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Trigger para atualizar updated_at em users
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inserir usuário master padrão
-- Email: henriquedev062@gmail.com
-- Senha: b91318244
INSERT INTO users (email, password_hash, name, role) VALUES
    ('henriquedev062@gmail.com', '$2b$10$/E8yjaTffux6TpWRJeLlJ.OfzSrsImz5QWTmeajy95QRA2RbLEc9K', 'Henrique Dev', 'master')
ON CONFLICT (email) DO NOTHING;
