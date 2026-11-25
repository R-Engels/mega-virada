// -*- coding: utf-8 -*-
/**
 * Mega-Sena Potenza — V. 2.34 (Nuvem 24h Padrão)
 * Sincronização em Tempo Real via Google Firebase Realtime Database
 */

const FirebaseSync = (() => {
  let dbRef = null;
  let isConnected = false;
  let onDataCallback = null;
  let currentBolaoId = 2; // Padrão Bolão Potenza

  // Configuração padrão oficial do Bolão Potenza na nuvem (Google Firebase)
  const DEFAULT_FIREBASE_CONFIG = {
    databaseURL: 'https://bolao-potenza-virada-default-rtdb.firebaseio.com'
  };

  const STORAGE_KEY_CONFIG = 'megasena_firebase_config';
  const STORAGE_KEY_STATE = 'megasena_local_bolao_data';

  function getSavedConfig() {
    return DEFAULT_FIREBASE_CONFIG;
  }

  function saveConfig(cfg) {
    // Mantém compatibilidade sem alterar URL padrão
  }

  // Inicializa o Firebase
  function init(callback) {
    onDataCallback = callback;
    const cfg = DEFAULT_FIREBASE_CONFIG;

    try {
      if (!window.firebase || !window.firebase.database) {
        console.warn('Firebase SDK não carregado. Operando com cache offline.');
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
        loadLocalState();
        updateStatusBadge();
      });
    } catch (err) {
      console.error('Falha ao inicializar Firebase:', err);
      loadLocalState();
      updateStatusBadge();
    }
  }

  function updateStatusBadge() {
    const pill = document.getElementById('cloud-status-pill');
    if (!pill) return;

    if (isConnected) {
      pill.className = 'badge badge-cloud-active';
      pill.innerHTML = '🟢';
      pill.title = 'Nuvem 24h Conectada (Google Firebase)';
    } else {
      pill.className = 'badge badge-cloud-connecting';
      pill.innerHTML = '🟡';
      pill.title = 'Conectando Nuvem...';
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

  // Salva no banco (nuvem + cache local)
  function saveState(data) {
    saveLocalBackup(data);
    if (dbRef) {
      return dbRef.set(data).catch((err) => {
        console.warn('Erro ao salvar na nuvem (salvo em cache local):', err);
      });
    }
    return Promise.resolve();
  }

  return {
    init,
    saveState,
    getSavedConfig,
    saveConfig,
    isLocal: () => false,
    isConnected: () => isConnected,
  };
})();

// Export global
window.FirebaseSync = FirebaseSync;
