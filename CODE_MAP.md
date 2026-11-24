﻿<!-- Versão: V. 2.17 (Nuvem 24h Padrão) | Atualizado em: 2026-11-24 -->
# CODE_MAP — Sistema Mega-Sena & Bolão Potenza

## Arquitetura Serverless (GitHub Pages + Google Firebase)

Aplicação 100% executável no navegador (client-side), sem dependência de servidor Python ou computador ligado. Compatível com GitHub Pages (`https://r-engels.github.io/mega-virada/`) e sincronização móvel em tempo real via Google Firebase Realtime Database oficial (`bolao-potenza-virada-default-rtdb.firebaseio.com`).

## Árvore de Diretórios

```text
04 - Mega da Virada Potenza/
├── index.html                   # Interface SPA completa para GitHub Pages (V. 2.08)
├── styles.css                   # Estilos responsivos (Header Fixo, 4 Quadrantes, Heatmap, Conferência)
├── app.js                       # Controlador principal e eventos da interface (V. 2.08)
├── stats_engine.js              # Motor matemático e sorteador com regra recomendada em JS
├── printer_service.js           # Gerador óptico de volantes Caixa (83x185mm) em SVG
├── firebase_sync.js             # Sincronização em tempo real via Firebase e LocalStorage (V. 2.08)
├── data/
│   ├── concursos.json           # Base histórica compactada dos 3.087 concursos
│   └── initial_state.json       # Estado inicial do Bolão Potenza e catálogo de nomes
├── CODE_MAP.md                  # Este mapa arquitetural
├── README.md                    # Documentação do repositório e link GitHub Pages
├── iniciar_sistema.bat          # Inicializador local para navegador Windows
├── Backup_Versao_A/             # Backup imutável V. 1.20
├── Backup_Versao_B/             # Backup imutável V. 1.21
├── Backup_Versao_C/             # Backup imutável V. 2.03
├── Backup_Versao_D/             # Backup imutável V. 2.04
├── Backup_Versao_E/             # Backup imutável V. 2.05
├── Backup_Versao_F/             # Backup imutável V. 2.06
├── Backup_Versao_G/             # Backup imutável V. 2.07
├── Backup_Versao_H/             # Backup imutável V. 2.08
│   ├── Backup_Versao_I/             # Backup imutável V. 2.09
│   ├── Backup_Versao_J/             # Backup imutável V. 2.10
│   ├── Backup_Versao_K/             # Backup imutável V. 2.11
│   ├── Backup_Versao_L/             # Backup imutável V. 2.12
│   ├── Backup_Versao_M/             # Backup imutável V. 2.13
│   ├── Backup_Versao_N/             # Backup imutável V. 2.14
│   ├── Backup_Versao_O/             # Backup imutável V. 2.15
│   ├── Backup_Versao_P/             # Backup imutável V. 2.16
│   ├── Backup_Versao_Q/             # Backup imutável V. 2.17
└── sistema/                     # Versão legada com backend Python / SQLite
```

## Fluxos de Operação (V. 2.17)

1. **Identificação de Jogo e Participante no Volante Impresso**:
   - Cada volante gerado (SVG 83x185mm) agora inclui identificação milimétrica textual e indelével no topo e nas seções de cada jogo (J1, J2, J3), com o nome do participante em destaque, o número do jogo (#1, #2...) e as 6 dezenas.
   - Textos posicionados em zonas seguras que não interferem nos sensores ópticos da leitora da Caixa.
   - Os cartões de preview na interface e as páginas de impressão A4 agrupadas exibem cabeçalho com nome do participante e identificação completa.
2. **Reestruturação de KPIs Financeiros e Término de Redundância**:
   - Removido o indicador redundante de "Total de Cotas" e renomeado o valor matemático da arrecadação.
   - Inclusão dos cartões de "Total Pago (Recebido)" e "Valor Faltante (Pendente)" com alertas claros de cotas a receber.
2. **Compactação da Lista Impressa de Jogos (4 Colunas A4)**:
   - Redução dos cartões de jogos e dezenas para 4 colunas em tamanho reduzido (19px/bolas), multiplicando a capacidade de jogos por folha impressa.
3. **Navegação Rápida entre Concursos (Setas e Teclado)**:
   - Botões "◀ Anterior" e "Próximo ▶" integrados na barra de conferência para alternar instantaneamente entre os 3.087 concursos históricos.
   - Suporte a atalhos de teclado globais (Seta Esquerda `←` e Seta Direita `→`) para conferir sorteios sem necessidade de cliques.
2. **Impressão da Lista de Jogos Formatada em 3 Colunas**:
   - Substituído o botão Exportar TXT por "🖨️ Imprimir Lista de Jogos", gerando folha A4 oficial com cabeçalho do bolão e cartões de jogos distribuídos em 3 colunas organizadas.
2. **Confirmação ao Excluir Jogos**:
   - Adicionado diálogo de confirmação `confirm(...)` com identificação do participante e dezenas antes de apagar qualquer aposta.
3. **Correção Visual de Espaçamento dos KPIs**:
   - Reestruturados os cards de resumo com container `.kpi`, separando adequadamente rótulos e valores.
4. **Remoção de Legendas na Seção de Impressão**:
   - Removidas as legendas "Leitor Oficial" e "⚡ Otimizado..." do painel de impressão óptica.
5. **Remoção da Legenda Redundante do Mapa de Calor**:
   - Removido o badge "Modelo Volante Caixa Oficial (Dividido em 4 Quadrantes) · Escala Excel" do cabeçalho da seção de estatísticas, deixando a interface mais limpa.
2. **Remoção dos Botões de Backup/Restaurar JSON**:
   - Eliminados os botões manuais de Backup JSON e Restaurar JSON da interface, garantindo integridade e dependência exclusiva da nuvem Firebase 24h em tempo real.
2. **Alternância de Tema Claro e Escuro (Light/Dark Mode)**:
   - Botão seletor no topo da janela (`#btn-theme-toggle`) para alternar instantaneamente entre tema escuro padrão e tema claro de alta visibilidade.
   - Variáveis CSS responsivas (`[data-theme="light"]`) aplicadas dinamicamente com persistência no LocalStorage (`megasena_theme`).
2. **Remoção de Caixa e Texto Redundante de Participante**:
   - Eliminada a caixa inicial com o texto "Selecione ou digite um participante para gerenciar seus jogos", liberando espaço vertical e posicionando o volante de quadrantes diretamente abaixo dos inputs.
   - O container de status da cota aparece apenas de forma dinâmica quando um participante específico é selecionado.
2. **Nuvem Firebase 24h como Padrão Único (Redundância Local Eliminada)**:
   - Removida a seleção redundante de modo Local vs Nuvem.
   - O sistema conecta automaticamente e opera exclusivamente no Google Firebase oficial (olao-potenza-virada-default-rtdb.firebaseio.com), mantendo cache local apenas para tolerância a falhas offline.
   - Botões de Backup e Restauração JSON foram movidos diretamente para a seção de administração do Bolão.
   - Banco de dados em tempo real ativo no Google Firebase (`https://bolao-potenza-virada-default-rtdb.firebaseio.com`).
   - O sistema conecta automaticamente ao carregar em qualquer navegador (desktop ou mobile), sem necessidade de digitação de URL pelo usuário final.
   - Qualquer modificação (aposta manual, sorteada, exclusão ou pagamento) propaga para todos os clientes em menos de 100ms.
2. **Menu Superior Fixo (Sticky Header)**:
   - Barra de navegação e botões superiores (`.topbar`) fixos no topo da janela com `position: sticky; top: 0; z-index: 1000`, `backdrop-filter: blur(8px)` e sombra suave, permanecendo acessíveis durante toda a rolagem da página.
3. **Tabela de Jogos Registrados Limpa e Simplificada**:
   - As colunas técnicas "Soma" e "Pares" foram removidas da tabela de jogos registrados (`#jogos-tbody`), concentrando a visualização no que é essencial: `#`, `Participante`, `Dezenas Marcadas`, `Acertos` (com destaque de premiação) e `Ação`.

1. **Conferência Visual Direta no Registro do Bolão**:
   - Barra de conferência integrada diretamente na seção de jogos registrados (`#sec-jogos`), sem dependência de modal popup.
   - Botão de conferência instantânea contra o último concurso oficial Caixa baixado (`⚡ Conferir Último Concurso Oficial Caixa`) e input para qualquer sorteio de 6 dezenas.
   - Painel scoreboard com exibição das dezenas sorteadas e contagem destacada de Senas, Quinas e Quadras.
   - Dezenas acertadas em cada jogo brilham em amarelo-ouro neon (`.ball.hit`), enquanto dezenas não sorteadas são atenuadas (`.ball.dim`).
   - Badges visuais de premiação (`🎉 SENA!`, `🥈 QUINA!`, `🥉 QUADRA!`, `🎯 X acertos`) e realce de linhas premiadas na tabela.
   - Marcação das dezenas sorteadas diretamente no cartão/picker com estrela e contorno dourado (`.ball-pick.draw-num`).
2. **Ênfase Visual em Jogos/Meta Incompleto**:
   - Se o participante possui menos jogos cadastrados do que a meta da sua cota (ex: $0/4$, $1/4$, $2/4$ ou $3/4$), a coluna "Jogos / Meta" exibe badge vermelho pulsante de alerta `⚠️ X / Y (Faltam Z)`.
   - Quando a cota é totalmente preenchida, o indicador muda para verde com ícone `✅ X / Y`.
3. **Completar Aposta Staged no Cartão**:
   - Quando o operador seleciona de 1 a 5 dezenas no volante e clica em `Completar no Cartão (+X dezenas)`, o sistema preenche as dezenas restantes diretamente no cartão/picker para decisão visual do usuário. A aposta **NÃO** vai para o bolão automaticamente.
   - O usuário revisa as dezenas e clica em `Salvar Aposta` para efetivar no bolão, ou desmarca/ajusta se preferir.
4. **Sortear Jogos Direto pro Bolão**:
   - `Sortear 1 Jogo Direto pro Bolão` (0 dezenas marcadas) ou `Sortear X Jogos da Cota`: gera as apostas pela Regra Recomendada e salva diretamente no bolão e Firebase sem etapa intermediária.
5. **Lista de Participantes Invertida**:
   - Os participantes mais recentes ou recém-adicionados são exibidos no topo da tabela (`reverse()`).
6. **Mapa de Calor em 4 Quadrantes Oficiais**:
   - O mapa de calor de 60 dezenas é estruturado exatamente no layout do volante oficial Caixa: dividido nos 4 quadrantes (Q1, Q2, Q3, Q4) em blocos 5x3 com proporção visual de cédula e gradiente Excel tricolor.

## Módulos e Assinaturas (JavaScript Puro)

### `stats_engine.js` (Namespace `StatsEngine`)
- `getQuadrant(n: number) -> number`: Retorna 1..4 no volante da Mega-Sena.
- `getBetPrice(dezenas: number, basePrice6?: number) -> number`: Calcula valor oficial da aposta.
- `scoreNumbers(concursos: Array, windowRecent?: number) -> Array<Object>`: Frequências, atrasos e scores.
- `getOverview(concursos: Array, windowRecent?: number) -> Object`: Visão geral com quentes, frias e top pares.
- `checkFilters(cand: number[], lastDraw?: Object, rules?: Object) -> boolean`: Validação de soma, paridade e quadrantes.
- `generatePotenzaGames(params: Object) -> Object`: Gerador oficial com Regra Recomendada (cobertura de zeradas, pares inéditos, balanceamento e bloqueio de duplicadas).
- `conferirApostas(apostas: Array, dezenasSorteadas: number[]) -> Object`: Apuração de acertos.
- `getExcelHeatmapColor(value: number, min: number, max: number) -> string`: Gradiente de 3 cores estilo Excel (Verde -> Amarelo -> Vermelho).

### `printer_service.js` (Namespace `PrinterService`)
- `getProfile() -> Object`: Perfil de calibração ativo.
- `saveProfile(prof: Object) -> void`: Salva calibração no LocalStorage.
- `buildSlipsPayload(games: Array, options?: Object) -> Object`: Agrupa jogos em volantes de até 3 e calcula coordenadas ópticas milimétricas.
- `renderSlipSvg(slip: Object, profile: Object, showOutline?: boolean) -> string`: Gera SVG óptico oficial do volante Caixa.
- `renderPrintArea(slipsPayload: Object) -> string`: Gera páginas A4 prontas para impressão óptica.

### `firebase_sync.js` (Namespace `FirebaseSync`)
- `init(callback: Function) -> void`: Inicializa conexão com Firebase ou LocalStorage.
- `saveState(data: Object) -> Promise`: Transmite alterações em tempo real via WebSocket.
- `getSavedConfig() -> Object | null`: Retorna credenciais salvas.
- `saveConfig(cfg: Object | null) -> void`: Persiste ou remove credenciais.
- `isLocal() -> boolean`: Verifica se opera puramente em modo local.
- `isConnected() -> boolean`: Status de conectividade.

### `app.js`
- `state`: Objeto de estado global com `bolaoPickerSelected`, `boloes`, `currentBolaoId`, `catalogoNomes`.
- `updatePickerUi()`: Atualiza volante de 4 quadrantes, badges e textos dos botões de ação.
- `updateActionButtonsState(st)`: Alterna rotulagem de Completar no Cartão vs Sorteio Direto pro Bolão.
- `renderParticipantesTable(b)`: Renderização da tabela de participantes em ordem invertida (mais recentes no topo).
- `renderHeatmap(b)`: Renderização das 60 dezenas divididas nos 4 quadrantes com estilo idêntico ao volante.
- `sortearUmaAposta()`: Se 1..5 dezenas marcadas, completa no cartão para decisão. Se 0, sorteia e salva direto pro bolão.
- `sortearCotaInteira()`: Sorteia todos os jogos da cota direto pro bolão.
- `salvarApostaManual()`: Valida e grava aposta montada no cartão (seja manual ou completada).
- `togglePagamento(partId: number)`: Alterna status PAGO / PENDENTE instantaneamente.
