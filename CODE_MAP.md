<!-- Versão: V. 2.00 (Serverless) | Atualizado em: 2026-11-19 -->
# CODE_MAP — Sistema Mega-Sena & Bolão Potenza

## Arquitetura Serverless (GitHub Pages + Google Firebase)

Aplicação 100% executável no navegador (client-side), sem dependência de servidor Python ou computador ligado. Compatível com GitHub Pages (`https://r-engels.github.io/<repo>/`) e sincronização móvel em tempo real via Google Firebase Realtime Database.

## Árvore de Diretórios

```text
04 - Mega da Virada Potenza/
├── index.html                   # Interface SPA completa para GitHub Pages (V. 2.00)
├── styles.css                   # Estilos responsivos (Mobile, Desktop, @media print)
├── app.js                       # Controlador principal e eventos da interface
├── stats_engine.js              # Motor matemático e sorteador com regra recomendada em JS
├── printer_service.js           # Gerador óptico de volantes Caixa (83x185mm) em SVG
├── firebase_sync.js             # Sincronização em tempo real via Firebase e LocalStorage
├── data/
│   ├── concursos.json           # Base histórica compactada dos 3.087 concursos
│   └── initial_state.json       # Estado inicial do Bolão Potenza e catálogo de nomes
├── CODE_MAP.md                  # Este mapa arquitetural
├── iniciar_sistema.bat          # Inicializador local para navegador Windows
├── Backup_Versao_A/             # Backup imutável V. 1.20
├── Backup_Versao_B/             # Backup imutável V. 1.21
└── sistema/                     # Versão legada com backend Python / SQLite
```

## Módulos e Assinaturas (JavaScript Puro)

### `stats_engine.js` (Namespace `StatsEngine`)
- `getQuadrant(n: number) -> number`: Retorna 1..4 no volante 6x10 da Mega-Sena.
- `getBetPrice(dezenas: number, basePrice6?: number) -> number`: Calcula valor oficial da aposta.
- `scoreNumbers(concursos: Array, windowRecent?: number) -> Array<Object>`: Calcula frequências, atrasos e scores.
- `getOverview(concursos: Array, windowRecent?: number) -> Object`: Visão geral com quentes, frias e top pares.
- `checkFilters(cand: number[], lastDraw?: Object, rules?: Object) -> boolean`: Validação de soma, paridade e quadrantes.
- `generatePotenzaGames(params: Object) -> Object`: Gerador oficial com Regra Recomendada (cobertura máxima de dezenas zeradas, pares inéditos, balanceamento anti-divisão e bloqueio de duplicadas).
- `conferirApostas(apostas: Array, dezenasSorteadas: number[]) -> Object`: Apuração de acertos, quadras, quinas e senas.
- `getExcelHeatmapColor(value: number, min: number, max: number) -> string`: Gradiente de 3 cores estilo Excel (Verde -> Amarelo -> Vermelho).

### `printer_service.js` (Namespace `PrinterService`)
- `getProfile() -> Object`: Obtém perfil de calibração ativo.
- `saveProfile(prof: Object) -> void`: Salva calibração no LocalStorage.
- `buildSlipsPayload(games: Array, options?: Object) -> Object`: Agrupa jogos em volantes de até 3 e calcula coordenadas milimétricas das marcas ópticas.
- `renderSlipSvg(slip: Object, profile: Object, showOutline?: boolean) -> string`: Gera SVG óptico oficial do volante Caixa.
- `renderPrintArea(slipsPayload: Object) -> string`: Gera páginas A4 prontas para o leitor óptico.

### `firebase_sync.js` (Namespace `FirebaseSync`)
- `init(callback: Function) -> void`: Inicializa conexão com Google Firebase Realtime Database ou fallback para LocalStorage.
- `saveState(data: Object) -> Promise`: Transmite alterações em tempo real para todos os celulares e computadores conectados.
- `getSavedConfig() -> Object | null`: Retorna credenciais do Firebase salvas.
- `saveConfig(cfg: Object | null) -> void`: Persiste ou remove configuração da nuvem.
- `isLocal() -> boolean`: Indica se opera em modo puramente offline/local.
- `isConnected() -> boolean`: Indica se há conexão de WebSocket ativa com o Firebase.

### `app.js`
- `state`: Objeto com concursos, bolões, catálogo de nomes, picker de quadrantes e resultados.
- `renderAll()`: Re-renderização reativa completa da interface.
- `addApostaManual()`: Inserção manual de 6 dezenas com validação de cota e duplicadas.
- `sortearUmaAposta()`: Sorteio ou complemento unitário com Regra Recomendada.
- `sortearCotaInteira()`: Sorteio de 4 jogos inteiros (ou restantes) da cota do participante.
- `togglePagamento(partId: number)`: Alternância instantânea de status PAGO / PENDENTE com sincronização imediata.
- `atualizarResultadoCaixa()`: Consumo direto de espelho CORS da Caixa para atualizar novos concursos.
