﻿<!-- Versão: V. 2.06 (Serverless) | Atualizado em: 2026-11-23 -->
# CODE_MAP — Sistema Mega-Sena & Bolão Potenza

## Arquitetura Serverless (GitHub Pages + Google Firebase)

Aplicação 100% executável no navegador (client-side), sem dependência de servidor Python ou computador ligado. Compatível com GitHub Pages (`https://r-engels.github.io/mega-virada/`) e sincronização móvel em tempo real via Google Firebase Realtime Database.

## Árvore de Diretórios

```text
04 - Mega da Virada Potenza/
├── index.html                   # Interface SPA completa para GitHub Pages (V. 2.06)
├── styles.css                   # Estilos responsivos (Cartão, 4 Quadrantes, Heatmap, Conferência)
├── app.js                       # Controlador principal e eventos da interface (V. 2.06)
├── stats_engine.js              # Motor matemático e sorteador com regra recomendada em JS
├── printer_service.js           # Gerador óptico de volantes Caixa (83x185mm) em SVG
├── firebase_sync.js             # Sincronização em tempo real via Firebase e LocalStorage
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
└── sistema/                     # Versão legada com backend Python / SQLite
```

## Fluxos de Operação (V. 2.06)

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
