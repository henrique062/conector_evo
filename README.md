# Dash Evolution

Dashboard web para gerenciar instâncias WhatsApp via [Evolution API v2](https://doc.evolution-api.com/).

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

## Funcionalidades

- Criar, conectar, reiniciar, desconectar e excluir instâncias WhatsApp
- Gerar QR Code para pareamento de novos números
- Monitoramento de status em tempo real (polling automático)
- Estatísticas do painel (total, conectadas, desconectadas)
- Interface responsiva com tema dark (Design System iPPLE)
- Deploy fácil com Docker

## Tecnologias

**Backend:** Node.js, Express, CORS, dotenv
**Frontend:** HTML5, CSS3, JavaScript Vanilla
**Containerização:** Docker (Node.js 20 Alpine)

## Pré-requisitos

- [Node.js](https://nodejs.org/) 20+
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
# URL da sua Evolution API (sem / no final)
EVOLUTION_API_URL=https://sua-evolution-api.com

# Chave de autenticação da Evolution API
EVOLUTION_API_KEY=sua_api_key_aqui

# Porta do servidor (padrão: 3000)
PORT=3000
```

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
| `GET` | `/api/instances` | Listar todas as instâncias |
| `POST` | `/api/instances` | Criar nova instância |
| `GET` | `/api/instances/:name/connect` | Gerar QR Code |
| `GET` | `/api/instances/:name/status` | Verificar status |
| `PUT` | `/api/instances/:name/restart` | Reiniciar instância |
| `DELETE` | `/api/instances/:name/logout` | Desconectar (logout) |
| `DELETE` | `/api/instances/:name` | Excluir instância |

## Estrutura do Projeto

```
├── server.js          # Servidor Express (backend)
├── public/
│   ├── index.html     # Página principal
│   ├── css/
│   │   └── style.css  # Estilos (tema dark)
│   └── js/
│       └── app.js     # Lógica do frontend
├── Dockerfile         # Configuração Docker
├── package.json       # Dependências
└── .env               # Variáveis de ambiente
```

## License

MIT
