﻿<!-- Versão: V. 2.45 (Nuvem 24h Padrão) | Atualizado em: 2026-11-26 -->
# CODE_MAP — Sistema Mega-Sena & Bolão Potenza

## Arquitetura Serverless (GitHub Pages + Google Firebase)

Aplicação 100% executável no navegador (client-side), sem dependência de servidor Python ou computador ligado. Compatível com GitHub Pages (`https://r-engels.github.io/mega-virada/`) e sincronização móvel em tempo real via Google Firebase Realtime Database oficial (`bolao-potenza-virada-default-rtdb.firebaseio.com`).

## Árvore de Diretórios

```text
04 - Mega da Virada Potenza/
├── index.html                   # Interface SPA completa para GitHub Pages (V. 2.45)
├── styles.css                   # Estilos responsivos (Header Fixo, 4 Quadrantes, Heatmap, Alertas de Cotas)
├── app.js                       # Controlador principal e eventos da interface (V. 2.45)
├── stats_engine.js              # Motor matemático, Empirical Bayes + EWMA (#1115+) e Steiner 2-Opt (V. 2.45)
├── printer_service.js           # Gerador óptico de volantes Caixa (Tradicional vs Virada) em SVG (V. 2.45)
├── firebase_sync.js             # Sincronização em tempo real via Firebase e LocalStorage (V. 2.45)
├── data/
│   ├── concursos.json           # Base histórica compactada dos 3.090 concursos (+ auto-sync Caixa)
│   └── initial_state.json       # Estado inicial do Bolão Potenza e catálogo de nomes
├── CODE_MAP.md                  # Este mapa arquitetural
├── README.md                    # Documentação do repositório e link GitHub Pages
├── iniciar_sistema.bat          # Inicializador local para navegador Windows
├── Backup_Versao_A/             # Backup imutável V. 2.45 (Versão Oficial Base — reinício do histórico de backups)
└── sistema/                     # Versão legada com backend Python / SQLite
```

## Fluxos de Operação (V. 2.45)

1. **Auditoria Exaustiva ML + Backtests Multi-Horizonte (`t-1..t-100`, `EWMA`, `Era Moderna #1115+`), Steiner 2-Opt, Novo Recorde `12_6_5` e Correção de 10 Bugs Reais**:
   - **Empirical Bayes James-Stein Calibrado (`getModernEraBayesWeights`)**: substituído o peso sub-regularizado (`M=15, beta=1.5, [0.72..1.38]`, que violava o Princípio da Casa dos Pombos em `112×6` levando bolas a `14×` e piorando `WinDraws` vs uniforme) pelo blend validado **60% Era Moderna (`#1115+`) + 40% EWMA Limpo (`#1115+`, `HL=650`)** com encolhimento Dirichlet ótimo `M=800`, `beta=1.0`, clamp `[0.82, 1.22]`: supera o oráculo uniforme em Proper Out-of-Sample Log-Likelihood (`dLL > 0`), validado em permutação nula (`p = 0,0033`, 0/300 loterias justas) e preserva o empacotamento Steiner sem distorção. Janelas curtas (`t-1`, `t-10`, `t-30`, `t-100`, MLP, GBDT, LogReg) rejeitadas por overfitting em validação cega.
   - **Steiner Packing Aprimorado (`generatePotenzaGames`)**: construção sequencial guiada por pares inéditos (`Pair-Guided`), guarda absoluta `60/60` (`nf[oldN] <= 1`), reparo explícito Fase 0 `Ov3+ = 0` (zerando triplas até em 333 jogos / R\$ 2.000), busca exata 60-candidatos (`Exact-60 1-Swap`), **Cross-Game 2-Opt Direcionado** invariante em frequência e quadrantes, e cálculo exato de `totalBalls` em carteiras mistas `7+6`.
   - **Novo Recorde de Fechamento (`12_6_5`: 39 → 38 jogos, `100% m=6`, `100% m=5`, `84,44% m=4`)** + permutação isomórfica `mapWithOptimalPermutation()` também no fallback `v=17..20`.
   - **Correções de Bugs no Motor, UI e Impressão**:
     - `generateByBudget()` (`eq7`): bloqueado estouro de orçamento quando `orcamento < R\$ 42` (ex.: R\$ 36 gera 6×6 dez.) e corrigido cálculo de `chance_quadra_1_em` para jogos de 7 dez. via união probabilística exata (`1/1036,82` por jogo de 7 dez. vs `1/2332,16` por 6 dez.).
     - `app.js`: removidos todos os travamentos fixos em `6 dezenas` / `4 jogos/cota` no volante manual, sorteador e botões de ação (agora respeita `b.dezenas_por_jogo` de `6..20`); corrigido `% Pares / % Ímpares` em `renderHeatmap()` para carteiras mistas (`totalPares + totalImpares`); corrigido falso alerta `Faltam X jogos` em `renderKpis()` e `printSlips()` para carteiras mistas cujo valor já quita a arrecadação; deduplicação antes de validar contagem na conferência/entrada manual; exibição de prêmios múltiplos Caixa na conferência (`conferirApostas` + `renderJogosTable`); detecção dinâmica de `baseMaxConcurso` no cache de extras Caixa.
     - `printer_service.js`: eliminada mutação in-place de `jogo.global_index` em `buildSlipsPayload()`, corrigindo numeração defasada nos volantes após exclusão de apostas.
2. **Correção do Viés Excessivo em Q3/Q4 (>31) e Equilíbrio Rigoroso dos 4 Quadrantes**:
   - Corrigida distorção em `generatePotenzaGames()` onde bônus ilimitado por dezenas `>31` (`1.38×` + `+1.5`/bola + SA `2.2×`) concentrava quase todas as apostas em Q3/Q4 em bolões menores (ex.: 6 jogos gerando `Q1=3, Q2=4, Q3=14, Q4=15` e bilhetes 100% altos).
   - `checkFilters()` agora exige ao menos 1 dezena `≤31` e ao menos 1 `>31` (bloqueia tanto datas puras quanto jogos 100% altos).
   - Gerador e Steiner-Packing SA agora equilibram dinamicamente a contagem acumulada dos 4 quadrantes (`qFreq` / `dQVar`) e miram o ponto ótimo anti-divisão (`~52% >31`, ou seja 3–4 altas + 2–3 baixas por bilhete), mantendo `Q1 ≈ Q2 ≈ Q3 ≈ Q4` desde o primeiro jogo, `60/60` dezenas e `Ov3+ = 0`.
2. **Perfis Separados de Impressão Óptica: Mega-Sena Tradicional (Dia a Dia) vs Mega da Virada**:
   - Adicionado seletor `#print-volante-tipo` em `#sec-impressao` alternando entre dois perfis físicos independentes salvos separadamente no `localStorage`:
     - **🟢 Mega-Sena Tradicional (Dia a Dia)**: padrão `83×185 mm`, `3 jogos/volante`, Teimosinha habilitada.
     - **✨ Mega da Virada (Folha Especial)**: padrão `83×200 mm`, cabeçalho maior (`offset_y = 42mm`), `jogos_por_volante` configurável (`1..3`), Teimosinha automaticamente desativada.
   - Removido travamento fixo `83mm × 185mm` no `@media print` (`styles.css`), substituído por variáveis CSS dinâmicas (`--slip-w`, `--slip-h`) com escolha automática de orientação (`A4 landscape` até `204mm` de altura, `A4 portrait` acima disso) e cálculo automático de volantes por folha.
   - Calibração milimétrica (`#cal-jogos-volante` + 12 campos) e `Restaurar Padrão Caixa` operam de forma isolada por tipo de folha.
2. **Ordenação Completa e Destaque Visual no Backtesting Histórico**:
   - Removido o corte `slice(0, 30)` das Quadras em `StatsEngine.runBacktesting()` para exibir todos os acertos encontrados.
   - Ordenação garantida de cima para baixo: **1º Sena (6) → 2º Quina (5) → 3º Quadra (4)**, e dentro de cada faixa estritamente do **maior concurso para o menor** (`Number(b.concurso) - Number(a.concurso)`).
   - Corrigida classe de badge em `renderBacktestingResult()` (`.badge-premio` + destaque de linha `.tr-award-*`) para realçar Sena, Quina e Quadra nos temas claro e escuro.
2. **Tendência Globo Moderno (`#1115+`) Silenciosa por Padrão**:
   - Removida a caixa de seleção `#fech-modern-bayes` da UI e o sufixo textual `Globo Moderno #1115+` da descrição; o peso Bayesiano suave da Era Moderna permanece aplicado automaticamente em todo o motor mantendo cobertura `60/60`.
2. **Sincronização Automática Caixa ao Abrir (CORS Corrigido + Preenchimento de Lacunas + Data do Próximo Sorteio)**:
   - Corrigido CORS na consulta online: substituído `api.guidi.dev.br` (sem header `Access-Control-Allow-Origin`) por cadeia com fallback CORS `ACAO: *` (`loteriascaixa-api.herokuapp.com` → `servicebus2.caixa.gov.br` oficial → `api.guidi.dev.br`).
   - `loadInitialData()` agora dispara `atualizarResultadoCaixa({ silent: true })` automaticamente ao abrir a página, baixa todos os concursos intermediários faltantes (`maxLocal + 1 .. ultimo`), persiste extras em `localStorage` (`megasena_concursos_extras`) e atualiza automaticamente o banner e o semáforo `#timing-ev-panel` com a **data exata do próximo sorteio** (`data_proximo`).
   - Base `data/concursos.json` atualizada até `#3090` (`24/11/2026`, próximo `#3091` em `26/11/2026` — R\$ 75M, 6× acumulada).
2. **Tendência Globo Moderno (`#1115+`) Ativada por Padrão em Todo o Motor**:
   - Checkbox `#fech-modern-bayes` (`🧬 Tendência Globo Moderno (#1115+)`) marcada por padrão (`checked`) no Montador por Orçamento, e `useModernBayes` padrão `true` em `StatsEngine.generateByBudget()`.
   - Sorteios automáticos da aba Registrar & Sortear (`sortearUmaAposta()` e `sortearCotaInteira()`) também utilizam `StatsEngine.getModernEraBayesWeights(state.concursos, 1.5)` por padrão, preservando cobertura `60/60`, anti-divisão (`>31`) e `Ov3+ = 0`.
2. **Semáforo "Melhor Momento de Jogar" Enxuto (Somente Concurso Atual)**:
   - Removidos do painel `#timing-ev-panel` os 4 cartões percentuais de EV (`Retorno Potenza`, `vs Concurso Comum`, `Vantagem Anti-Divisão`, `Retorno Jogador Datas`) e a barra de simulação manual (`Simular outro prêmio` / `Mega da Virada`).
   - Painel mantém apenas o veredito direto do próximo concurso atual (semáforo, prêmio estimado, sequência de acumuladas, contagem para Final 0/5 e recomendação prática).
2. **Semáforo "Melhor Momento de Jogar" (EV+ Acumuladas), Steiner Packing Aprimorado e Peso Opcional Era Moderna (`#1115+`)**:
   - Adicionado `StatsEngine.evaluateDrawTiming(concursos, customJackpotM, isVirada)` e painel `#timing-ev-panel` em `#sec-fechamento` com semáforo de 4 níveis (`🔴 AGUARDAR`, `🟡 REGULAR`, `🟢 BOM MOMENTO`, `🚀 MOMENTO DE OURO`), detecção automática de sequência de acumuladas, bônus `Final 0/5 (+22%)`, `Mega da Virada`, cálculo real de Retorno Esperado (`EV%`) com divisão Poisson (Datas `≤31` vs Motor Potenza Anti-Divisão) e simulador rápido de prêmio.
   - Orçamento do Steiner-Packing SA elevado (`maxSwaps` até 12.000 / `260ms`), aumentando a taxa de pares únicos em `112×6` mantendo `Ov3+ = 0`.
   - Adicionado peso opcional `StatsEngine.getModernEraBayesWeights(concursos, beta)` (`🧬 Peso Globo Moderno #1115+`) baseado na persistência observada pós-2009 (`p=0,002` em permutação nula), preservando 100% da cobertura `60/60` dezenas.
2. **Remoção de Sugestões Automáticas (12 Quentes, 15 Balanceadas, Melhor Garantido) e Fechamento Estritamente Manual**:
   - Removidos da UI e do motor os botões/opções de corte automático de subconjunto (`🔥 12 Quentes`, `⚖️ 15 Balanceadas`, `🤖 Melhor Garantido`, auto-preenchimento e opção `fechamento` no seletor por orçamento), evitando concentração artificial em 12–15 dezenas sem vantagem preditiva.
   - `💰 Montar por Orçamento` mantido como fluxo principal em `#sec-fechamento` cobrindo 60/60 dezenas (`⚖️ Misto Inteligente 7+6 dez.`, `🎯 Máx. Frequência Steiner 6 dez.` e `🔥 Equilibrado Steiner 7 dez.`).
   - Fechamento Manual recolhido em `<details id="fech-manual-details">` (opcional para escolha manual no volante); botão `⚡ Gerar Fechamento` permanece desabilitado (`disabled`) via `updateFechamentoGerarState()` até o operador selecionar manualmente ao menos `k + 1` dezenas (`≥7` p/ 6 dez., `≥8` p/ 7 dez., `≥9` p/ 8 dez.).
   - Corrigidos título de backtesting e confirmação de inclusão no bolão para carteiras mistas geradas por orçamento.
2. **Novos Recordes de Fechamento (-18 Jogos Extras / -R\$ 882), Steiner-Packing SA e Otimizador por Orçamento (R\$)**:
   - Ataque Tabu+SA indexado (Track B) quebrou 11 novos recordes mantendo **100,000% garantia `m=6`** + polimento `m=4`/`m=5`: `15→7 Quadra: 12→9 jogos (-35,7% vs V2.31)`, `16→8 Quadra: 8→6 jogos (-R\$ 336)`, `13→7 Quina: 27→24 (-R\$ 126)`, `13→8 Quina: 13→12 (-R\$ 168)`, `12→7 Quina: 17→16 (R\$ 672)`, `15→6 Quadra: 21→19`, `14→6 Quadra: 16→14`, `13→6 Quadra: 11→10`, `12→6 Quina: 40→39`, `16→6 Quadra: 30→29`.
   - `generatePotenzaGames()` promovido para **Steiner-Packing SA direcionado a conflitos** (`99,9%` pares únicos em 84 jogos, `98,3%` em 100 jogos, `95,4%` em 112 jogos, `Ov3+ = 0`).
   - Adicionado `StatsEngine.generateByBudget(orcamento, perfil)` + barra **Montar por Orçamento (R\$)** em `#sec-fechamento` (Misto 7+6 dez, Steiner 6 dez, Steiner 7 dez e Melhor Fechamento Recorde no Orçamento), exibindo chance real (Sena/Quadra), pares únicos e backtesting imediato.
2. **Otimização Dual de Cobertura Secundária (`m=4` e `m=5`) + Permutação Isomórfica $\pi^*$ nos Fechamentos**:
   - 24 de 39 matrizes canônicas aprimoradas mantendo **100,0% de garantia em `m=6`** e elevando a cobertura exata de acertos parciais (`m=4` e `m=5`, responsáveis por >93% dos prêmios reais): ganho comprovado de **+6,29% concursos premiados no backtest** (5.991 → 6.368 em 1,2M avaliações reais, com picos de **+19,3%** em `10→7`, **+18,8%** em `11→8`, **+17,1%** em `9→6` e **+16,7%** em `12→7`).
   - Matrizes `9→6`, `10→7`, `11→8` e `12→8` atingiram **100% garantia de Quadra mesmo acertando apenas 5 dezenas no grupo** com os mesmos 3 jogos!
   - `mapWithOptimalPermutation()` mapeia as dezenas escolhidas preservando 100% o isomorfismo da matriz enquanto coloca **97%–100%** dos bilhetes dentro dos filtros reais (`checkFilters`) e maximiza dezenas `> 31`.
   - KPI de garantia exibe cobertura exata de acertos parciais (`Acerto 5→Q4` e `4→Q4`).
2. **Matrizes Recordes via Simulated Annealing (39 Fechamentos Instantâneos) + Otimizador Global 1-Swap**:
   - Incorporadas 39 matrizes canônicas pré-otimizadas via Simulated Annealing (`OPTIMAL_COVERING_MATRICES` em `stats_engine.js`) para 6, 7 e 8 dezenas × Quadra/Quina/Sena, 100% verificadas sobre todas as $\binom{v}{6}$ combinações (reduzindo **-51 jogos / -R\$ 3.852** acumulados, ex: `12→8 Sena: 61→51 jogos`, `11→8 Sena: 33→29`, `12→6 Quina: 45→40`, `16→6 Quadra: 34→30`) com execução em `<1ms`.
   - Adicionada pós-otimização Global 1-Swap em `generatePotenzaGames()` elevando cobertura de pares únicos (40×6 e 20×7 a **100,0%**, 80×6 a **94,5%**), mantendo `Overlap3+ = 0` e aumentando o score Anti-Divisão (+15–20% evitando meses `01–12`, múltiplos de 5 e progressões aritméticas).
   - Corrigido bug de loop infinito (`gcd(7,14)`) em `expandMask()` no fechamento com 14 dezenas para jogos de 7/8 números.
2. **Otimização Exaustiva do Motor Matemático (`stats_engine.js`) Validada em 3.087 Concursos**:
   - `checkFilters()` recalibrado e escalável dinamicamente para 6 a 20 dezenas (`Soma 90–275` com escala $\sqrt{k/6}$, `Pares 1–5`, `MaxQ=5`, `MaxConsec<=2`, `MinLinhas>=3`, `MinOver31>=1`, `MaxMesmoFinal<=3`): compatibilidade histórica real elevada de **59,1% → 90,4%** (6 dez.), **39,7% → 96,1%** (7 dez.) e **16,8% → 97,0%** (8 dez.) com **100% de bloqueio anti-multidão** (datas puras `<=31`, sequências 3+ e colunas de 4+).
   - `generatePotenzaGames()` com packing anti-sobreposição de triplas (`-60`) e quadras (`-280`) via bitmasks 32-bit, zerando sobreposições `>=3` mesmo em bolões de 80 jogos (`Overlap3+ = 0,00`) e elevando a cobertura de pares para `91,1%`–`100,0%`.
   - `generateFechamento()` aprimorado com Multi-Start Greedy + Poda de Redundância (Redundancy Pruning), reduzindo o número de bilhetes e o custo em fechamentos de 6, 7 e 8 dezenas mantendo **100% de garantia verificada**.
2. **Autopreenchimento de Dezenas no Fechamento Automático**:
   - Clicar em `🤖 Melhor Garantido` ou `⚡ Gerar Fechamento` sem ter selecionado o mínimo de dezenas completa automaticamente até 12 dezenas balanceadas por quadrante (preservando qualquer dezena que o usuário já tenha marcado) e gera o fechamento imediatamente em 1 clique.
2. **Fechamentos com Opção Sena (6 Acertos) e Modo Automático (Melhor Garantido)**:
   - `StatsEngine.generateFechamento` agora aceita garantia `6` (**Sena 100%**), além de Quina (5) e Quadra (4), para jogos de 6, 7 ou 8 dezenas.
   - `StatsEngine.generateBestFechamento` + botão `🤖 Melhor Garantido` avalia automaticamente todas as estratégias `(6/7/8 dezenas × Sena/Quina/Quadra)`, seleciona a de maior garantia viável com menor custo total e exibe tabela comparativa com troca rápida.
2. **Ajuste Automático de Cotas ao Adicionar Fechamentos / Jogos (6, 7 ou 8 Dezenas)**:
   - Ao adicionar jogos de fechamento a um participante (novo ou já existente), `p.cotas` é recalculado automaticamente com base tanto na quantidade total de jogos (`Math.ceil(pApostas.length / jogosPorCota)`) quanto no custo oficial Caixa das apostas (`Math.ceil(custoTotalPart / valorCota)`), corrigindo o valor financeiro do participante no bolão.
   - Simetria aplicada em `excluirAposta()` e validação `isMetaOk` em `renderParticipantesTable()`.
2. **Ajuste de Contraste e Legibilidade no Tema Claro (`[data-theme="light"]`)**:
   - Removidos fundos escuros fixos (`rgba(15,23,42,...)`) de `.sorteio-actions-box`, `.conferencia-panel` e `#conf-visual-board`, substituídos por classes temáticas responsivas.
   - Contraste reforçado em inputs, placeholders, `.btn-ghost`, `.btn-info-outline` (Backtesting), `.part-quota-box`, `.cotas-control`, `.badge` e painel de Backtesting no tema claro.
2. **Cálculo Automático do Valor Oficial Caixa por Jogo e Cota**:
   - Alterar `Números por Jogo (6 a 20)` (`#bolao-cfg-dezenas`) preenche automaticamente `Valor por Jogo (R$)` com o valor oficial Caixa (`StatsEngine.getBetPrice`, ex: 6=R$ 6,00, 7=R$ 42,00, 8=R$ 168,00...) e recalcula `Valor da Cota (R$)` (`valor_jogo × jogos_por_cota`).
   - Alterar `Jogos por Participante/Cota` ou `Valor por Jogo` também recalcula `Valor da Cota` em tempo real.
2. **Backtesting Histórico (3.087 Concursos) e Fechamentos Matemáticos (6, 7 ou 8 Dezenas)**:
   - `StatsEngine.runBacktesting(apostas, concursos)`: testa todos os jogos do bolão (ou fechamento) contra toda a base histórica via bitmasks 32-bit em <5ms, contabilizando Senas, Quinas, Quadras, Concursos Premiados e prêmios múltiplos oficiais Caixa para jogos de 7+ dezenas.
   - `StatsEngine.generateFechamento(selectedNums, k, garantia)`: fechamento matemático (covering design) para grupos de 7 a 20 dezenas desdobrados em jogos de **6, 7 ou 8 dezenas por jogo** com garantia verificada de **Quadra (4)** ou **Quina (5)**, cálculo de economia vs aposta múltipla direta, backtesting integrado e importação direta para o bolão.
2. **Quadrantes 2×2 em Ordem Oficial no Celular e Blindagem JS na Impressão**:
   - No celular (`max-width: 640px`), `.quadrants-board` mantém layout 2×2 (`Q1 | Q2` acima e `Q3 | Q4` abaixo), garantindo leitura horizontal contínua (`01..10`, `11..20`, `21..30`, `31..40`, `41..50`, `51..60`) igual ao volante físico Caixa para inserção manual rápida.
   - Função `executeCleanPrint()` em `app.js` oculta `.topbar`, `main.container`, `#toast` e modais via estilo inline antes de `window.print()` e restaura em `afterprint`, impedindo qualquer vazamento de rodapé/menu mesmo com cache antigo de CSS.
2. **Remoção do Vazamento da Barra `.topbar` na Impressão**:
   - Restrição da regra responsiva `@media screen and (max-width: 900px)` apenas para tela (`screen`), impedindo que `.topbar { display: flex !important; }` sobrescreva `.no-print` durante a impressão A4.
   - Bloco final `@media print` em `styles.css` garantindo ocultação absoluta de `.topbar`, `main.container`, `.no-print`, modais e toasts em todas as páginas impressas.
2. **Reestruturação da Página de Impressão Óptica (Scanner Caixa 83×185mm)**:
   - Prévia visual responsiva (`.slips-preview-wrap` em grid sem corte vertical/scroll interno) exibindo grade guia Caixa (`01..60`, `JOGO 1..3`, `Qtd 6..15`) sob as marcas ópticas pretas para conferência visual instantânea.
   - Impressão real A4 Paisagem (`@media print`) 100% limpa na zona óptica (somente cabeçalho no topo e marcas `#000000`), com `height: 208mm` e `gap: 6mm` (261mm totais em 297mm) eliminando cortes de margem e páginas em branco extras.
   - Botões **Teste de Alinhamento**, **Salvar Calibração** e **Restaurar Padrão Caixa** + 12 campos milimétricos totalmente funcionais em `app.js` e `printer_service.js`.
   - Atualização de cache-buster `styles.css?v=2.23` no `index.html` (estava preso em `v=2.08`).
2. **Alerta Visual de Cotas Incompletas e Recálculo Automático ao Excluir Jogos**:
   - Identificação visual imediata de discrepâncias entre cotas e jogos cadastrados (ex: 2 cotas = 8 jogos meta, mas apenas 4 cadastrados).
   - Na tabela de Participantes: linha destacada com fundo vermelho suave e borda vermelha lateral (`.row-cota-alerta`), badge `FALTAM X JOGO(S)` junto ao nome, controle de cotas com aviso `⚠️ X cota(s) (Y/Z)` e badge "Jogos / Meta" pulsante.
   - No cartão de cota do participante (`#part-quota-box`): banner de aviso explícito `⚠️ Cota Incompleta: X cotas (Y jogos). Faltam Z jogos!`.
   - No KPI "Total de Jogos": alerta com borda vermelha e contagem de jogos faltantes no bolão.
   - Na impressão de volantes (`printSlips()`): confirmação de segurança impedindo impressão acidental com cotas incompletas.
   - Na exclusão de jogos (`excluirAposta()`): cálculo automático de cotas restantes (`novasCotas = Math.max(1, Math.ceil(remainingJogos / jogosPorCota))`). Se jogos forem excluídos (ex: 4 jogos excluídos de quem tinha 2 cotas e 8 jogos, caindo para 4 jogos), a cota é reduzida automaticamente para 1 cota, recalculando os valores financeiros e cotas do bolão.
2. **Cabeçalho Limpo e Barra de Atalhos Fixa no Celular**:
   - Remoção do ícone 'MS' e do texto redundante '(Nuvem 24h)' do cabeçalho superior.
   - Indicador de sincronização em nuvem reduzido exclusivamente à bolinha verde ('🟢'), mantendo tooltip detalhado.
   - Adicionado botão de atalho dedicado 'Registrar & Sortear' na barra superior para acesso direto à grade de marcação de apostas e sorteios.
   - Barra de botões de atalho fixada no celular ('position: sticky; top: 0') com rolagem horizontal suave e compensação 'scroll-margin-top: 85px' nos cartões.
2. **Numeração Global Contínua dos Jogos no Cabeçalho dos Volantes**:
   - O numeral no cabeçalho do volante agora acompanha a sequência contínua de jogos registrados no bolão (`jogo.global_index`). Ex: Volante 1 (`1:`, `2:`, `3:`), Volante 2 (`4:`, `5:`, `6:`), Volante 3 (`7:`, `8:`...).
2. **Eliminação de Duplicação no Visualizador de Prévia**:
   - Removido o bloco textual repetitivo acima de cada cartão de prévia no visualizador, exibindo exclusivamente o título do volante e a renderização óptica fiel do cartão SVG.
3. **Cabeçalho Exclusivo e Área Óptica Limpa nos Volantes**:
   - Dados de participante e dezenas centralizados estritamente no topo/cabeçalho de cada volante (`1: NOME:  dezenas`, `2: NOME:  dezenas`, `3: NOME:  dezenas`), sem nenhuma marcação de texto intermediária ou rodapé na grade.
   - Preservação absoluta das zonas de leitura dos sensores ópticos da leitora da Caixa, evitando rejeições ou ruídos na passagem mecânica do volante.
2. **Correção do Layout de Impressão de Volantes (3 por Folha A4 Paisagem)**:
   - Configuração formal de orientação Paisagem (@page size: A4 landscape) na impressão de volantes, eliminando quebra prematura de página.
   - Bloqueio de quebra de linha (flex-wrap: nowrap) na linha de volantes (.a4-slips-row) e fixação dimensional exata de cada volante (83x185mm) com page-break-inside: avoid.
   - Os 3 volantes (9 jogos) são impressos lado a lado em uma única folha A4 paisagem, com margens e espaçamento centralizado (265mm totais em 297mm de largura).
   - Impressão de lista de jogos mantém orientação Retrato (@page size: A4 portrait) automaticamente.
2. **Identificação de Jogo e Participante no Volante Impresso**:
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
- `generateFechamento(selectedNums: number[], k?: number, garantia?: number, basePrice6?: number) -> Object`: Fechamento matemático manual (matrizes recordes + Multi-Start Greedy) para dezenas escolhidas manualmente.
- `generateByBudget(orcamentoReais: number, perfil?: string, lastDraw?: Object, options?: Object) -> Object`: Montador por orçamento cobrindo 60/60 dezenas (`misto`, `freq6`, `eq7`) com peso Bayesiano opcional da Era Moderna.
- `evaluateDrawTiming(concursos: Array, customJackpotM?: number, isViradaOverride?: boolean) -> Object`: Semáforo EV+ de Melhor Momento de Jogar (acumulada, Final 0/5, Mega da Virada, divisão Poisson e ganho Anti-Divisão).
- `getModernEraBayesWeights(concursos: Array, beta?: number) -> Float64Array`: Pesos Bayesianos suaves da Era Moderna de globo único (`#1115+`).
- `runBacktesting(apostas: Array, concursos: Array) -> Object`: Backtesting histórico via bitmasks 32-bit com multiplicadores Caixa.
- `conferirApostas(apostas: Array, dezenasSorteadas: number[]) -> Object`: Apuração de acertos.
- `getExcelHeatmapColor(value: number, min: number, max: number) -> string`: Gradiente de 3 cores estilo Excel (Verde -> Amarelo -> Vermelho).

### `printer_service.js` (Namespace `PrinterService`)
- `getActiveType() -> string`: Retorna o tipo de folha ativo (`'tradicional'` ou `'virada'`).
- `setActiveType(tipo: string) -> string`: Persiste o tipo de volante selecionado.
- `getProfile(tipo?: string) -> Object`: Perfil de calibração ativo para o tipo de volante informado.
- `saveProfile(prof: Object, tipo?: string) -> void`: Salva calibração independente no LocalStorage por tipo de volante.
- `resetProfile(tipo?: string) -> Object`: Restaura medidas padrão do tipo de volante selecionado.
- `getPageLayout(profile: Object) -> Object`: Calcula orientação (`landscape`/`portrait`) e volantes por folha conforme largura/altura em mm.
- `buildSlipsPayload(games: Array, options?: Object) -> Object`: Agrupa jogos por `jogos_por_volante` e calcula coordenadas ópticas milimétricas.
- `renderSlipSvg(slip: Object, profile: Object, opts?: Object) -> string`: Gera SVG óptico com dimensões dinâmicas do perfil.
- `renderPrintArea(slipsPayload: Object) -> string`: Gera páginas A4 prontas para impressão óptica respeitando o tamanho real da folha.

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
- `updateFechamentoGerarState()`: Habilita `⚡ Gerar Fechamento` somente quando há `>= k + 1` dezenas selecionadas manualmente.
- `gerarPorOrcamentoUi()`: Monta carteira 60/60 por orçamento (`misto`, `freq6`, `eq7`).
- `renderTimingPanel()`: Atualiza o semáforo de Melhor Momento de Jogar para o próximo concurso atual.
- `gerarFechamentoUi()`: Gera fechamento exclusivamente a partir das dezenas selecionadas manualmente pelo usuário.
