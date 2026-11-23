// -*- coding: utf-8 -*-
/**
 * Mega-Sena Potenza — V. 2.00 (Serverless)
 * Sincronização em Tempo Real via Google Firebase Realtime Database & LocalStorage
 */

const FirebaseSync = (() => {
  let dbRef = null;
  let isConnected = false;
  let isLocalMode = false;
  let onDataCallback = null;
  let currentBolaoId = 2; // Padrão Bolão Potenza

  // Configuração padrão ou customizada do usuário
  const STORAGE_KEY_CONFIG = 'megasena_firebase_config';
  const STORAGE_KEY_STATE = 'megasena_local_bolao_data';

  function getSavedConfig() {
    try {
      const c = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (c) return JSON.parse(c);
    } catch (e) {}
    return null;
  }

  function saveConfig(cfg) {
    if (!cfg) {
      localStorage.removeItem(STORAGE_KEY_CONFIG);
    } else {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(cfg));
    }
  }

  // Inicializa o Firebase
  function init(callback) {
    onDataCallback = callback;
    const cfg = getSavedConfig();

    if (!cfg || !cfg.databaseURL) {
      setLocalMode(true);
      loadLocalState();
      return;
    }

    try {
      if (!window.firebase || !window.firebase.database) {
        console.warn('Firebase SDK não carregado. Operando em Modo Local.');
        setLocalMode(true);
        loadLocalState();
        return;
      }

      // Evita duplicar instâncias
      if (!window.firebase.apps.length) {
        window.firebase.initializeApp(cfg);
      }

      const db = window.firebase.database();
      dbRef = db.ref('bolao_potenza');

      // Monitor de conexão
      const connectedRef = db.ref('.info/connected');
      connectedRef.on('value', (snap) => {
        isConnected = !!snap.val();
        updateStatusBadge();
      });

      // Ouvir alterações em tempo real do banco na nuvem
      dbRef.on('value', (snapshot) => {
        const val = snapshot.val();
        if (val) {
          saveLocalBackup(val);
          if (onDataCallback) onDataCallback(val);
        } else {
          // Se banco na nuvem estiver vazio, inicializa com os dados locais
          loadLocalState(true);
        }
      }, (err) => {
        console.error('Erro de permissão ou conexão Firebase:', err);
        setLocalMode(true);
        loadLocalState();
      });

      setLocalMode(false);
    } catch (err) {
      console.error('Falha ao inicializar Firebase:', err);
      setLocalMode(true);
      loadLocalState();
    }
  }

  function setLocalMode(val) {
    isLocalMode = val;
    updateStatusBadge();
  }

  function updateStatusBadge() {
    const pill = document.getElementById('cloud-status-pill');
    if (!pill) return;

    if (!isLocalMode && isConnected) {
      pill.className = 'badge badge-cloud-active';
      pill.innerHTML = '🟢 Nuvem Ativa (Tempo Real)';
      pill.title = 'Sincronização 24h ativa via Firebase';
    } else if (!isLocalMode && !isConnected) {
      pill.className = 'badge badge-cloud-connecting';
      pill.innerHTML = '🟡 Conectando Nuvem...';
      pill.title = 'Tentando conectar ao banco de dados em tempo real...';
    } else {
      pill.className = 'badge badge-cloud-local';
      pill.innerHTML = '💾 Modo Local (Nuvem Desconectada)';
      pill.title = 'Dados salvos neste dispositivo. Clique para configurar sincronização na nuvem.';
    }
  }

  // Carrega estado salvo localmente
  function loadLocalState(pushToCloudIfPossible = false) {
    let data = null;
    try {
      const s = localStorage.getItem(STORAGE_KEY_STATE);
      if (s) data = JSON.parse(s);
    } catch (e) {}

    if (data) {
      if (onDataCallback) onDataCallback(data);
      if (pushToCloudIfPossible && dbRef) {
        dbRef.set(data).catch(() => {});
      }
    }
  }

  function saveLocalBackup(data) {
    try {
      localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(data));
    } catch (e) {}
  }

  // Salva no banco (nuvem + local)
  function saveState(data) {
    saveLocalBackup(data);
    if (dbRef && !isLocalMode) {
      return dbRef.set(data).catch((err) => {
        console.warn('Erro ao salvar na nuvem (salvo localmente):', err);
      });
    }
    return Promise.resolve();
  }

  return {
    init,
    saveState,
    getSavedConfig,
    saveConfig,
    isLocal: () => isLocalMode,
    isConnected: () => isConnected,
  };
})();

// Export global
window.FirebaseSync = FirebaseSync;
