# Mega-Sena Potenza — V. 2.06 (Serverless)

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

## ☁️ Como Ativar a Sincronização em Tempo Real (Celular e PC 24h)

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) (gratuito) e crie um projeto.
2. No menu lateral, clique em **Criação** → **Realtime Database** → **Criar banco de dados**.
3. Na aba **Regras**, configure:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```
4. Copie a URL gerada (ex: `https://seu-projeto-default-rtdb.firebaseio.com/`).
5. Abra a aplicação em [https://r-engels.github.io/mega-virada/](https://r-engels.github.io/mega-virada/).
6. Clique no botão **☁️ Sincronização Nuvem (Firebase)** no cabeçalho, cole a URL e clique em **Salvar e Conectar**.

---

## 🎯 Principais Recursos (V. 2.06)

1. **Volante Caixa em 4 Quadrantes Oficiais**:
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
