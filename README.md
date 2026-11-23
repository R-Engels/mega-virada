# Mega-Sena Potenza — V. 2.00 (Serverless)

Aplicação 100% estática para gestão e conferência de bolões da Mega da Virada, gerador estatístico com regras recomendadas, conferência e impressão óptica de volantes oficiais Caixa (83x185mm).

Hospedada gratuitamente no **GitHub Pages** e sincronizada em tempo real (celular e computador 24h) via **Google Firebase Realtime Database**.

---

## Como Publicar no seu GitHub (`R-Engels`)

1. Crie um novo repositório público no seu GitHub (ex: `mega-virada-potenza`) em [github.com/new](https://github.com/new).
2. No terminal desta pasta, execute:
```bash
git init
git add index.html styles.css app.js stats_engine.js printer_service.js firebase_sync.js data/ CODE_MAP.md README.md
git commit -m "Mega-Sena Potenza V. 2.00 Serverless"
git branch -M main
git remote add origin https://github.com/R-Engels/mega-virada-potenza.git
git push -u origin main
```
3. No seu repositório no GitHub:
   - Vá em **Settings** → **Pages**.
   - Em **Build and deployment → Branch**, selecione `main` e pasta `/ (root)`.
   - Clique em **Save**.

Sua aplicação estará online 24h em:
`https://r-engels.github.io/mega-virada-potenza/`

---

## Como Ativar a Sincronização em Tempo Real (24h com PC desligado)

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) (gratuito) e crie um projeto.
2. No menu lateral, clique em **Criação** → **Realtime Database** → **Criar banco de dados**.
3. Na aba **Regras**, substitua por:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```
4. Copie a URL do banco (ex: `https://seu-projeto-default-rtdb.firebaseio.com/`).
5. Abra a aplicação no navegador, clique no botão **☁️ Sincronização Nuvem (Firebase)** no topo, cole a URL e clique em **Salvar e Conectar**.

Pronto! Qualquer celular ou computador verá as apostas e pagamentos atualizarem na mesma hora.
