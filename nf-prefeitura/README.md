# NF Prefeitura - Sistema de Gestão de Notas Fiscais

Sistema SaaS para gestão de notas fiscais em prefeituras. Permite que prefeituras cadastrem fornecedores, que enviam notas fiscais através do sistema e as acompanham em tempo real conforme passam pelos setores.

## 🎯 Features

- **Multi-tenant**: Cada prefeitura tem seus próprios dados isolados
- **Cadastro de Fornecedores**: Gestão centralizada de fornecedores
- **Upload de Notas Fiscais**: Fornecedores enviam NF pelo sistema
- **Fluxo de Aprovação**: NF passa por Compras → Controle Interno → Financeiro
- **Status em Tempo Real**: Cores indicam em qual setor está a NF
- **Dashboard Intuitiva**: Interface minimalista e moderna

## 🔧 Setup

### Pré-requisitos

- Node.js 18+
- npm ou yarn
- Conta Supabase

### 1. Clonar e instalar

```bash
npm install
```

### 2. Configurar Supabase

1. Criar conta em [supabase.com](https://supabase.com)
2. Criar novo projeto
3. Copiar `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Criar arquivo `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=seu_projeto_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon
```

### 3. Criar tabelas no Supabase

Executar o SQL abaixo no Supabase SQL Editor:

```sql
-- Tabela de prefeituras
CREATE TABLE prefeituras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR NOT NULL,
  cnpj VARCHAR UNIQUE NOT NULL,
  email VARCHAR NOT NULL,
  telefone VARCHAR,
  endereco VARCHAR,
  cidade VARCHAR,
  estado VARCHAR(2),
  status VARCHAR DEFAULT 'ativa',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de usuários (admin, secretários, fornecedores)
CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prefeitura_id UUID REFERENCES prefeituras(id) ON DELETE CASCADE,
  email VARCHAR UNIQUE NOT NULL,
  nome VARCHAR NOT NULL,
  perfil VARCHAR NOT NULL,
  setor VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de fornecedores
CREATE TABLE fornecedores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prefeitura_id UUID REFERENCES prefeituras(id) ON DELETE CASCADE,
  nome VARCHAR NOT NULL,
  cnpj VARCHAR NOT NULL,
  email VARCHAR NOT NULL,
  telefone VARCHAR,
  contato VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(prefeitura_id, cnpj)
);

-- Tabela de notas fiscais
CREATE TABLE notas_fiscais (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prefeitura_id UUID REFERENCES prefeituras(id) ON DELETE CASCADE,
  fornecedor_id UUID REFERENCES fornecedores(id) ON DELETE CASCADE,
  numero VARCHAR NOT NULL,
  serie VARCHAR,
  data_emissao DATE,
  valor DECIMAL(15, 2),
  descricao TEXT,
  arquivo_url VARCHAR,
  status_atual VARCHAR DEFAULT 'protocolo',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(prefeitura_id, numero, serie)
);

-- Tabela de histórico de status
CREATE TABLE nf_historico (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nf_id UUID REFERENCES notas_fiscais(id) ON DELETE CASCADE,
  status_anterior VARCHAR,
  status_novo VARCHAR NOT NULL,
  setor VARCHAR,
  usuario_id UUID REFERENCES usuarios(id),
  observacoes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_prefeituras_status ON prefeituras(status);
CREATE INDEX idx_usuarios_prefeitura_id ON usuarios(prefeitura_id);
CREATE INDEX idx_fornecedores_prefeitura_id ON fornecedores(prefeitura_id);
CREATE INDEX idx_notas_fiscais_prefeitura_id ON notas_fiscais(prefeitura_id);
CREATE INDEX idx_notas_fiscais_status ON notas_fiscais(status_atual);
CREATE INDEX idx_nf_historico_nf_id ON nf_historico(nf_id);
```

### 4. Rodar desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000)

## 📁 Estrutura

```
├── app/
│   ├── page.tsx          # Dashboard principal
│   ├── layout.tsx        # Layout com Sidebar
│   └── globals.css       # Estilos globais
├── components/
│   ├── Sidebar.tsx       # Navegação
│   ├── Card.tsx          # Componente de card
│   └── PrefeituraModal.tsx # Modal de cadastro
├── lib/
│   └── supabase.ts       # Cliente Supabase
```

## 🎨 Design

- **Paleta de cores**: Azul escuro (sidebar) + Teal (primária) + Branco/Cinza (fundo)
- **Framework**: Tailwind CSS
- **Tipografia**: Geist (Sans e Mono)

## 📝 Próximas etapas

- [ ] Autenticação de usuários
- [ ] Página de fornecedores
- [ ] Fluxo de NF com status por setor
- [ ] Upload de arquivos
- [ ] Notificações em tempo real
- [ ] Relatórios e analytics
