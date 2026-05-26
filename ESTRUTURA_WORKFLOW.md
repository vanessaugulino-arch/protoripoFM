# Fashion Mind - Estrutura de Workflow

## 📋 Visão Geral

O Fashion Mind é um sistema SaaS de Business Intelligence para moda estruturado como um **workflow sequencial** entre três perfis principais:

1. **Murilo (CEO)** - Nível Estratégico
2. **Renata (Direção Criativa)** - Nível Tático  
3. **Carol (Estilo)** - Nível Operacional

## 🏗️ Arquitetura

### Hierarquia de Dados

```
Grupo (Feminino, Masculino, Infantil)
  └─ Categoria (Blusa, Calça, Vestido)
      └─ Subcategoria (Blusa manga curta, Regata)
          └─ Produto (Blusa manga curta ampla marrom)
```

### Estrutura de Pastas

```
/src/app
├── types/
│   └── workflow.ts          # Tipos TypeScript do sistema
├── utils/
│   └── permissions.ts       # Lógica de permissões
├── contexts/
│   └── WorkflowContext.tsx  # Estado global do workflow
├── components/
│   ├── DashboardHeader.tsx  # Header reutilizável
│   ├── KPICard.tsx          # Cards de KPIs
│   ├── ActionButton.tsx     # Botões de ação
│   ├── ApprovalModal.tsx    # Modal de aprovação
│   └── SectionContainer.tsx # Container de seções
└── pages/
    ├── StrategicPlanning.tsx    # CEO
    ├── TacticalPlanning.tsx     # Direção Criativa
    └── OperationalPlanning.tsx  # Estilo
```

## 🔄 Fluxo de Trabalho

### 1. Criação de Ciclo (CEO - Murilo)

```tsx
// section_murilo_estrategico
- Define Meta de Receita Total
- Define Orçamento OTB
- Define Margem Alvo
- Clica em "btn_aplicar_metas"
  → Gera relatório com observações
  → Libera para Renata
```

### 2. Planejamento Tático (Direção Criativa - Renata)

```tsx
// section_renata_tatico
- Recebe metas do CEO (READ-ONLY)
- Define metas por grupo (Feminino, Masculino, Infantil)
- Define temas e cores
- Clica em "btn_aplicar_metas"
  → Gera relatório com observações
  → Libera para Carol
```

### 3. Planejamento Operacional (Estilo - Carol)

```tsx
// section_carol_operacional
- Recebe direcionamentos da Renata (READ-ONLY)
- Define mix de produtos detalhado
- Clica em "btn_aplicar_plano"
  → Gera relatório final
  → Finaliza ciclo
```

## 🔐 Sistema de Permissões

### Regras de Edição

| Perfil | Pode Editar | Impacta |
|--------|------------|---------|
| CEO | section_murilo_estrategico | Renata + Carol |
| Direção Criativa | section_renata_tatico | Carol |
| Estilo | section_carol_operacional | - |

### Regras de Ajustes

- **CEO ajusta estratégico** → Renata e Carol precisam revisar
- **Renata ajusta tático** → Carol precisa revisar (CEO não é afetado)
- **Carol ajusta operacional** → Ninguém é afetado

## 💡 Como Usar os Componentes

### 1. DashboardHeader

```tsx
import { DashboardHeader } from "../components/DashboardHeader";

<DashboardHeader
  userName={user.name}
  userProfile={user.profile}
  title="Fashion Mind | Planejamento Estratégico"
  subtitle="Defina as metas gerais da coleção"
  showBackButton
  onLogout={handleLogout}
/>
```

### 2. KPICard

```tsx
import { KPICard } from "../components/KPICard";
import { DollarSign } from "lucide-react";

<KPICard
  icon={DollarSign}
  label="Meta de Receita"
  value="1.500.000"
  valuePrefix="R$ "
  subtitle="Total da coleção"
/>
```

### 3. SectionContainer

```tsx
import { SectionContainer } from "../components/SectionContainer";

<SectionContainer
  id="section_murilo_estrategico"
  currentUserProfile={user.profile}
  sectionOwnerProfile="CEO"
  isApproved={cycle?.section_murilo_estrategico.approvedAt !== undefined}
  isEditable={permissions.canEditStrategic}
>
  {/* Conteúdo da seção estratégica */}
</SectionContainer>
```

### 4. ActionButton com Naming Convention

```tsx
import { ActionButton } from "../components/ActionButton";
import { Check } from "lucide-react";

<ActionButton
  id="btn_aplicar_metas"  // ID para RBAC
  icon={Check}
  label="Aplicar Metas"
  onClick={handleApprove}
  variant="primary"
/>
```

### 5. ApprovalModal

```tsx
import { ApprovalModal } from "../components/ApprovalModal";

<ApprovalModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onApprove={handleApprove}
  title="Aprovar Planejamento Estratégico"
  currentUser={user.name}
  nextProfile="Direção Criativa"
  summaryData={[
    { label: "Meta de Receita", value: "R$ 1.500.000" },
    { label: "Orçamento OTB", value: "R$ 850.000" },
    { label: "Margem Alvo", value: "48%" },
  ]}
/>
```

### 6. useWorkflow Hook

```tsx
import { useWorkflow } from "../contexts/WorkflowContext";

function MyComponent() {
  const {
    cycle,
    currentUser,
    permissions,
    approveCycle,
    updateCycle,
  } = useWorkflow();

  const handleApprove = async (observations: string) => {
    await approveCycle(observations);
  };

  return (
    <div>
      {permissions.canEditStrategic && (
        <button onClick={() => updateCycle({...})}>
          Editar
        </button>
      )}
    </div>
  );
}
```

## 🎨 Naming Conventions (RBAC)

### IDs de Botões

- `btn_aplicar_metas` - Aprovar metas do ciclo
- `btn_aplicar_plano` - Aprovar plano operacional
- `btn_ajustar_orcamento` - Ajustar orçamento
- `btn_exportar_relatorio` - Exportar relatório

### IDs de Seções

- `section_murilo_estrategico` - Seção do CEO
- `section_renata_tatico` - Seção da Direção Criativa
- `section_carol_operacional` - Seção do Estilo

### IDs de Inputs (consistência entre telas)

- `input_meta_receita` - Meta de receita total
- `input_orcamento_otb` - Orçamento OTB
- `input_margem_alvo` - Margem alvo
- `input_meta_grupo_feminino` - Meta do grupo feminino
- `input_meta_grupo_masculino` - Meta do grupo masculino
- `input_meta_grupo_infantil` - Meta do grupo infantil

## 🔄 Estados do Ciclo

```typescript
type WorkflowStatus = 
  | "draft"              // Rascunho (CEO editando)
  | "pending_creative"   // Aguardando Direção Criativa
  | "pending_style"      // Aguardando Estilo
  | "completed"          // Completo
  | "in_revision"        // Em revisão (após ajuste)
```

## 📊 Exemplo Completo: Tela de Planejamento Estratégico

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import { DollarSign, TrendingUp } from "lucide-react";
import { useWorkflow } from "../contexts/WorkflowContext";
import { DashboardHeader } from "../components/DashboardHeader";
import { KPICard } from "../components/KPICard";
import { SectionContainer } from "../components/SectionContainer";
import { ActionButton } from "../components/ActionButton";
import { ApprovalModal } from "../components/ApprovalModal";

export default function StrategicPlanning() {
  const navigate = useNavigate();
  const { currentUser, cycle, permissions, approveCycle, updateCycle } = useWorkflow();
  const [showModal, setShowModal] = useState(false);
  
  // Dados estratégicos
  const [metaReceita, setMetaReceita] = useState(1500000);
  const [orcamentoOTB, setOrcamentoOTB] = useState(850000);
  const [margemAlvo, setMargemAlvo] = useState(48);

  const handleApprove = async (observations: string) => {
    await approveCycle(observations);
    setShowModal(false);
    navigate("/dashboard");
  };

  const handleSave = async () => {
    await updateCycle({
      section_murilo_estrategico: {
        metaReceitaTotal: metaReceita,
        orcamentoOTB: orcamentoOTB,
        margemAlvo: margemAlvo,
      },
    });
  };

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-[#E7E7E6]">
      <DashboardHeader
        userName={currentUser.name}
        userProfile={currentUser.profile}
        title="Fashion Mind | Planejamento Estratégico"
        subtitle="Defina as metas gerais da nova coleção"
        showBackButton
        onLogout={() => {
          sessionStorage.removeItem("currentUser");
          navigate("/");
        }}
      />

      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-6 mb-6">
          <KPICard
            icon={DollarSign}
            label="Meta de Receita"
            value={metaReceita.toLocaleString('pt-BR')}
            valuePrefix="R$ "
          />
          <KPICard
            icon={DollarSign}
            label="Orçamento OTB"
            value={orcamentoOTB.toLocaleString('pt-BR')}
            valuePrefix="R$ "
          />
          <KPICard
            icon={TrendingUp}
            label="Margem Alvo"
            value={margemAlvo}
            valueSuffix="%"
          />
        </div>

        {/* Seção Estratégica do CEO */}
        <SectionContainer
          id="section_murilo_estrategico"
          currentUserProfile={currentUser.profile}
          sectionOwnerProfile="CEO"
          isApproved={cycle?.section_murilo_estrategico.approvedAt !== undefined}
          isEditable={permissions.canEditStrategic}
          className="bg-white p-6 mb-6"
        >
          <h2 className="text-[#28071C] text-xl font-bold mb-4">
            Metas Estratégicas
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-[#28071C] font-semibold mb-2">
                Meta de Receita Total
              </label>
              <input
                id="input_meta_receita"
                type="number"
                value={metaReceita}
                onChange={(e) => setMetaReceita(Number(e.target.value))}
                disabled={!permissions.canEditStrategic}
                className="w-full px-4 py-3 border-2 border-[#E7E7E6] rounded-lg focus:border-[#7598CF] focus:outline-none disabled:bg-gray-100"
              />
            </div>

            <div>
              <label className="block text-[#28071C] font-semibold mb-2">
                Orçamento OTB
              </label>
              <input
                id="input_orcamento_otb"
                type="number"
                value={orcamentoOTB}
                onChange={(e) => setOrcamentoOTB(Number(e.target.value))}
                disabled={!permissions.canEditStrategic}
                className="w-full px-4 py-3 border-2 border-[#E7E7E6] rounded-lg focus:border-[#7598CF] focus:outline-none disabled:bg-gray-100"
              />
            </div>

            <div>
              <label className="block text-[#28071C] font-semibold mb-2">
                Margem Alvo (%)
              </label>
              <input
                id="input_margem_alvo"
                type="number"
                value={margemAlvo}
                onChange={(e) => setMargemAlvo(Number(e.target.value))}
                disabled={!permissions.canEditStrategic}
                className="w-full px-4 py-3 border-2 border-[#E7E7E6] rounded-lg focus:border-[#7598CF] focus:outline-none disabled:bg-gray-100"
              />
            </div>
          </div>
        </SectionContainer>

        {/* Botões de Ação */}
        {permissions.canEditStrategic && (
          <div className="flex space-x-4">
            <ActionButton
              label="Salvar Rascunho"
              onClick={handleSave}
              variant="outline"
            />
            <ActionButton
              id="btn_aplicar_metas"
              label="Aplicar Metas"
              onClick={() => setShowModal(true)}
              variant="primary"
            />
          </div>
        )}

        {/* Modal de Aprovação */}
        <ApprovalModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onApprove={handleApprove}
          title="Aprovar Planejamento Estratégico"
          currentUser={currentUser.name}
          nextProfile="Direção Criativa"
          summaryData={[
            { label: "Meta de Receita", value: `R$ ${metaReceita.toLocaleString('pt-BR')}` },
            { label: "Orçamento OTB", value: `R$ ${orcamentoOTB.toLocaleString('pt-BR')}` },
            { label: "Margem Alvo", value: `${margemAlvo}%` },
          ]}
        />
      </main>
    </div>
  );
}
```

## 🚀 Próximos Passos

1. **Backend Integration**: Conectar com Supabase ou API própria
2. **Real-time Updates**: Notificar usuários quando ciclo é liberado
3. **Histórico**: Manter registro de todas as aprovações e ajustes
4. **Relatórios**: Gerar PDFs dos relatórios de aprovação
5. **Dashboard Analytics**: Visualizar performance de ciclos anteriores
