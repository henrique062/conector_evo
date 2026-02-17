# Dash Evolution

Dashboard web para gerenciar instâncias WhatsApp via [Evolution API v2](https://doc.evolution-api.com/).

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

## Funcionalidades

- ✅ Criar, conectar, reiniciar, desconectar e excluir instâncias WhatsApp
- ✅ Gerar QR Code para pareamento de novos números
- ✅ Monitoramento de status em tempo real (polling automático)
- ✅ Armazenamento persistente em PostgreSQL
- ✅ Sistema de logs de atividades (auditoria completa)
- ✅ Sincronização automática entre Evolution API e banco de dados
- ✅ Estatísticas do painel (total, conectadas, desconectadas)
- ✅ Interface responsiva com tema dark (Design System iPPLE)
- ✅ Deploy fácil com Docker

## Tecnologias

**Backend:** Node.js, Express, PostgreSQL (pg), CORS, dotenv
**Frontend:** HTML5, CSS3, JavaScript Vanilla
**Banco de Dados:** PostgreSQL 14+
**Containerização:** Docker (Node.js 20 Alpine)

## Pré-requisitos

- [Node.js](https://nodejs.org/) 20+
- [PostgreSQL](https://www.postgresql.org/) 14+
- Uma instância da [Evolution API](https://doc.evolution-api.com/) configurada
- Docker (opcional)

## Instalação

```bash
# Clone o repositório
git clone https://github.com/SEU_USUARIO/conector_evo.git
cd conector_evo

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais
```

## Configuração

Crie um arquivo `.env` na raiz do projeto:

```env
# Evolution API
EVOLUTION_API_URL=https://sua-evolution-api.com
EVOLUTION_API_KEY=sua_api_key_aqui

# Database (PostgreSQL)
DATABASE_URL=postgres://usuario:senha@host:porta/database
DB_SSL=false

# Server
PORT=3000
```

### Inicializar o Banco de Dados

Após configurar o `.env`, execute:

```bash
# Criar tabelas no banco de dados
npm run db:init

# Verificar se as tabelas foram criadas
psql $DATABASE_URL -c "\dt"
```

O script criará as seguintes tabelas:
- **instances** - Armazena informações das instâncias WhatsApp
- **instance_logs** - Registra todas as atividades (create, connect, delete, etc.)
- **settings** - Configurações globais do sistema

## Uso

```bash
# Iniciar o servidor
npm start

# Acessar no navegador
# http://localhost:3000
```

## Docker

```bash
# Build da imagem
docker build -t dash-evolution .

# Executar container
docker run -p 3000:3000 \
  -e EVOLUTION_API_URL=https://sua-evolution-api.com \
  -e EVOLUTION_API_KEY=sua_api_key_aqui \
  dash-evolution
```

## Endpoints da API

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/instances` | Listar todas as instâncias (sincroniza com Evolution API) |
| `POST` | `/api/instances` | Criar nova instância |
| `GET` | `/api/instances/:name/connect` | Gerar QR Code |
| `GET` | `/api/instances/:name/status` | Verificar status de conexão |
| `PUT` | `/api/instances/:name/restart` | Reiniciar instância |
| `DELETE` | `/api/instances/:name/logout` | Desconectar (logout) |
| `DELETE` | `/api/instances/:name` | Excluir instância |
| `GET` | `/api/logs` | Buscar logs de atividades (auditoria) |
| `GET` | `/api/stats` | Estatísticas (total, conectadas, desconectadas) |

## Estrutura do Projeto

```
├── server.js               # Servidor Express (backend)
├── database/
│   ├── db.js              # Configuração PostgreSQL
│   ├── schema.sql         # Schema do banco (tabelas)
│   └── init-db.js         # Script de inicialização
├── public/
│   ├── index.html         # Página principal
│   ├── css/
│   │   └── style.css      # Estilos (tema dark iPPLE)
│   └── js/
│       └── app.js         # Lógica do frontend
├── Dockerfile             # Configuração Docker
├── package.json           # Dependências
├── .env                   # Variáveis de ambiente
└── README.md              # Documentação
```

## Banco de Dados

### Schema

O projeto utiliza PostgreSQL com as seguintes tabelas:

#### `instances`
Armazena todas as instâncias WhatsApp criadas.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | SERIAL | ID único da instância |
| instance_name | VARCHAR(100) | Nome da instância (único) |
| integration | VARCHAR(50) | Tipo de integração (WHATSAPP-BAILEYS) |
| number | VARCHAR(20) | Número do WhatsApp |
| status | VARCHAR(20) | Status da conexão (open, close, connecting) |
| profile_name | VARCHAR(255) | Nome do perfil WhatsApp |
| profile_picture_url | TEXT | URL da foto de perfil |
| created_at | TIMESTAMP | Data de criação |
| updated_at | TIMESTAMP | Última atualização |

#### `instance_logs`
Registra todas as atividades realizadas nas instâncias.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | SERIAL | ID único do log |
| instance_name | VARCHAR(100) | Nome da instância |
| action | VARCHAR(50) | Ação realizada (create, connect, delete, etc.) |
| details | JSONB | Detalhes da ação |
| ip_address | VARCHAR(45) | IP do solicitante |
| user_agent | TEXT | User agent do navegador |
| created_at | TIMESTAMP | Data do registro |

#### `settings`
Configurações globais do sistema.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | SERIAL | ID único |
| key | VARCHAR(100) | Chave da configuração |
| value | TEXT | Valor da configuração |
| description | TEXT | Descrição da configuração |
| updated_at | TIMESTAMP | Última atualização |

### Sincronização

O sistema sincroniza automaticamente as instâncias entre a Evolution API e o banco de dados:

- **Na inicialização**: Todas as instâncias são sincronizadas
- **A cada 5 minutos**: Sincronização automática em background
- **Em cada requisição GET /api/instances**: Sincronização sob demanda

## License

MIT
