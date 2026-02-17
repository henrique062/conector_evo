-- Schema para Dash Evolution

-- Tabela de instâncias WhatsApp
CREATE TABLE IF NOT EXISTS instances (
    id SERIAL PRIMARY KEY,
    instance_name VARCHAR(100) UNIQUE NOT NULL,
    integration VARCHAR(50) DEFAULT 'WHATSAPP-BAILEYS',
    number VARCHAR(20),
    status VARCHAR(20) DEFAULT 'disconnected',
    profile_name VARCHAR(255),
    profile_picture_url TEXT,
    qrcode BOOLEAN DEFAULT true,
    owner VARCHAR(100),
    webhook_url TEXT,
    webhook_events JSONB,
    settings JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_instances_name ON instances(instance_name);
CREATE INDEX IF NOT EXISTS idx_instances_status ON instances(status);
CREATE INDEX IF NOT EXISTS idx_instances_created ON instances(created_at DESC);

-- Tabela de logs de atividades
CREATE TABLE IF NOT EXISTS instance_logs (
    id SERIAL PRIMARY KEY,
    instance_id INTEGER REFERENCES instances(id) ON DELETE CASCADE,
    instance_name VARCHAR(100),
    action VARCHAR(50) NOT NULL,
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para logs
CREATE INDEX IF NOT EXISTS idx_logs_instance ON instance_logs(instance_id);
CREATE INDEX IF NOT EXISTS idx_logs_created ON instance_logs(created_at DESC);

-- Tabela de configurações globais
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inserir configurações padrão
INSERT INTO settings (key, value, description) VALUES
    ('app_version', '1.0.0', 'Versão do aplicativo'),
    ('max_instances', '50', 'Número máximo de instâncias permitidas'),
    ('auto_reconnect', 'true', 'Reconectar automaticamente instâncias desconectadas')
ON CONFLICT (key) DO NOTHING;

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_instances_updated_at ON instances;
CREATE TRIGGER update_instances_updated_at BEFORE UPDATE ON instances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_settings_updated_at ON settings;
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
