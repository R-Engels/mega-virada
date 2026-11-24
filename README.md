# Mega-Sena Potenza — V. 2.26 (Nuvem 24h Padrão)

Aplicação 100% estática para gestão e conferência de bolões da Mega da Virada, gerador estatístico com regras recomendadas oficiais Caixa, conferência visual integrada e impressão óptica de volantes oficiais (83×185mm).

Hospedada gratuitamente no **GitHub Pages** e sincronizada em tempo real (celular e computador 24h) via **Google Firebase Realtime Database**.

---

## 🌐 Acesso Online (GitHub Pages)

- **Link da Aplicação:** [https://r-engels.github.io/mega-virada/](https://r-engels.github.io/mega-virada/)
- **Repositório GitHub:** [https://github.com/R-Engels/mega-virada](https://github.com/R-Engels/mega-virada)

---

## ⚡ Como Ativar o GitHub Pages no Repositório

Caso o link exiba erro 404, ative a publicação nas configurações do repositório:
1. Acesse: [https://github.com/R-Engels/mega-virada/settings/pages](https://github.com/R-Engels/mega-virada/settings/pages)
2. Em **"Build and deployment"** → **Source**: selecione **Deploy from a branch**.
3. Em **Branch**: selecione **`main`** e diretório **`/ (root)`**.
4. Clique em **Save**.
5. Aguarde cerca de 30 a 60 segundos para o deploy automático ser concluído.

---

## ☁️ Sincronização em Tempo Real na Nuvem (Google Firebase)

A sincronização 24h na nuvem já está pré-configurada e ativa por padrão no banco:
`https://bolao-potenza-virada-default-rtdb.firebaseio.com`

Ao abrir a aplicação no celular ou computador, ela conecta automaticamente via WebSocket em tempo real. Qualquer aposta criada, sorteada ou pagamento registrado reflete instantaneamente em todos os dispositivos conectados.

---

## 🎯 Principais Recursos (V. 2.26)

1. **Backtesting Histórico (3.087 Concursos) e Fechamentos Matemáticos (6, 7 ou 8 Dezenas)**:
   - Simulador histórico instantâneo de todas as apostas contra todos os concursos passados da Mega-Sena (incluindo prêmios múltiplos oficiais Caixa para jogos de 7 e 8 dezenas).
   - Gerador de fechamentos matemáticos para 7 a 20 dezenas em jogos de **6, 7 ou 8 números** com garantia verificada de Quadra ou Quina, cálculo de economia e envio direto para o bolão.
2. **Impressão Óptica A4 Reestruturada (Scanner Caixa 83×185mm)**:
   - Prévia visual proporcional sem cortes com grade guia Caixa (`01..60` e `Qtd`) na tela, mantendo a impressão física 100% limpa para o sensor óptico.
   - Layout A4 Paisagem blindado contra cortes de margem e páginas em branco, além de calibração milimétrica e teste de alinhamento funcionais.
2. **Alerta Visual de Cotas Incompletas e Recálculo Automático ao Excluir Jogos**:
   - Destaque visual em vermelho e âmbar em caso de participante com cotas acima dos jogos registrados (ex: 2 cotas = 8 jogos, mas apenas 4 cadastrados), com alertas no controle de cotas, badge no participante e alerta no KPI.
   - Recálculo automático de cotas ao excluir jogos: se jogos suficientes forem removidos (ex: exclusão de 4 jogos), a cota diminui automaticamente e atualiza as cotas do bolão.
2. **Barra de Atalhos Fixa no Celular e Cabeçalho Otimizado**:
   - Barra de navegação e atalhos (Bolão, Registrar & Sortear, Jogos, Estatísticas, Impressão) fixa no topo no celular, cabeçalho limpo sem ícone MS e indicador de nuvem compacto (apenas bolinha verde).
2. **Numeração Contínua e Prévia sem Duplicações**:
   - Cada jogo é numerado de acordo com a sequência global do bolão (1, 2, 3, 4, 5...) no cabeçalho do volante óptico, e a prévia na tela exibe apenas o volante real sem blocos redundantes.
2. **Cabeçalho Exclusivo de Dados no Volante Impresso**:
   - Identificação padronizada apenas no topo do volante (`1: NOME:  dezenas`), deixando o corpo e as grades 100% livres de textos que possam interferir na leitora da Caixa.
2. **Impressão Óptica em Lote A4 Paisagem (3 Volantes por Folha)**:
   - Layout travado em A4 Landscape (297x210mm) com 3 volantes oficiais Caixa (83x185mm) lado a lado na mesma folha sem quebra indesejada.
2. **Identificação de Participante e Jogo no Volante Impresso**:
   - Cabeçalho e seções de cada volante (J1, J2, J3) impressos com o nome do participante, número do jogo e dezenas em zonas seguras de leitura óptica.
2. **Volante Caixa em 4 Quadrantes Oficiais**:
   - Marcação rápida dividida nos quadrantes Q1 (01–25), Q2 (06–30), Q3 (31–55) e Q4 (36–60).
2. **Completar Aposta Staged**:
   - Ao marcar de 1 a 5 dezenas e clicar em "Completar no Cartão", o sistema preenche as dezenas restantes diretamente no cartão para conferência e aprovação do operador antes de salvar no bolão.
3. **Sorteador com Regra Recomendada Oficial**:
   - Geração balanceada com cobertura prioritária de dezenas zeradas no bolão, pares inéditos e bloqueio de jogos duplicados.
4. **Conferência Visual Direta no Registro de Jogos**:
   - Conferência integrada na própria tabela de jogos com destaque luminoso neon para dezenas sorteadas (`.ball.hit`), atenuação das não sorteadas (`.ball.dim`) e badges de premiação (Sena, Quina e Quadra).
   - Marcação das dezenas sorteadas diretamente no cartão volante (`★`).
5. **Destaque em Jogos / Meta**:
   - Alerta visual em vermelho pulsante quando o participante ainda não completou os jogos da sua cota.
6. **Mapa de Calor Oficial em 4 Quadrantes**:
   - Distribuição das 60 dezenas com escala de cores Excel tricolor (Verde → Amarelo → Vermelho).
7. **Impressão Óptica A4**:
   - Renderização SVG milimétrica dos volantes oficiais Caixa (83×185mm) para leitoras lotéricas.
