const $ = (id) => document.getElementById(id);

const M2_PER_WORKER = 100;
const USERS_STORAGE_KEY = "orcamento_usuarios_v1";
const SESSION_STORAGE_KEY = "orcamento_sessao_v1";
const PROPOSALS_STORAGE_KEY = "propostas_salvas_v1";
const CLIENTS_STORAGE_KEY = "clientes_salvos_v1";
const MACHINE_DB_STORAGE_KEY = "orcamento_banco_estimativas_v1";
const LEGACY_DRAFT_STORAGE_KEY = "proposta_rascunho_v1";
const DRAFT_STORAGE_KEY_PREFIX = "proposta_rascunho_usuario_v1_";
const WORKER_MODE_AUTO = "auto";
const WORKER_MODE_MANUAL = "manual";
const ROLE_ADMIN = "admin";
const ROLE_SELLER = "seller";
const DEFAULT_FILIAL = "Matriz";
const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "password2026";
const PASSWORD_ITERATIONS = 120000;
const FIREBASE_CONFIG = {
 apiKey: "AIzaSyDPBCd-rC-Y9L9DIzFOgWZ0G_B_Ydn5RKM",
  authDomain: "orcapiso.firebaseapp.com",
  databaseURL: "https://orcapiso-default-rtdb.firebaseio.com",
  projectId: "orcapiso",
  storageBucket: "orcapiso.firebasestorage.app",
  messagingSenderId: "966600923508",
  appId: "1:966600923508:web:5f53da4ba834b88a5b3421",
  measurementId: "G-V5YHLBXJB0"
};
const FIRESTORE_COLLECTION = "orcamentoPiso";
const FIRESTORE_USERS_DOC = "users";
const FIRESTORE_PROPOSALS_DOC = "proposals";
const FIRESTORE_CLIENTS_DOC = "clients";
const FIRESTORE_MACHINE_DB_DOC = "machineDatabase";
const FIRESTORE_DRAFT_DOC_PREFIX = "draft_";
const FIRESTORE_SETTINGS = {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false
};
const FIREBASE_INIT_CONNECTION_DELAY_MS = 1000;
const FIREBASE_RECONNECT_DELAY_MS = 3000;
const PRINT_CLEANUP_RETRY_DELAY_MS = 400;
const IFRAME_CLEANUP_DELAY_MS = 600;
const IFRAME_PRINT_FALLBACK_TIMEOUT_MS = 2000;
const DEFAULT_STANDARD_TEXT =
  "Apresentamos nossa proposta comercial para execução do piso industrial conforme dados da obra informados. Os valores contemplam o escopo acordado para a área indicada e permanecem sujeitos à validação final das condições do local antes do início dos serviços.";
const DEFAULT_IMPOSTO_PERCENTUAL = "1";
const PROPOSAL_STATUS_EM_ANDAMENTO = "em_andamento";
const PROPOSAL_STATUS_FECHADA = "fechada";
const PROPOSAL_STATUS_PERDIDA = "perdida";
const PROPOSAL_STATUS_META = {
  [PROPOSAL_STATUS_EM_ANDAMENTO]: {
    label: "Em andamento",
    className: "proposal-status-em_andamento"
  },
  [PROPOSAL_STATUS_FECHADA]: {
    label: "Fechada",
    className: "proposal-status-fechada"
  },
  [PROPOSAL_STATUS_PERDIDA]: {
    label: "Perdida",
    className: "proposal-status-perdida"
  }
};
const EQUIPAMENTOS_TIPO_PROPRIOS = "proprios";
const EQUIPAMENTOS_TIPO_ALUGADOS = "alugados";
const EQUIPAMENTOS_ALUGADOS_OPCOES = [
  { value: "acabadora_simples", label: "Acabadora simples" },
  { value: "acabadora_dupla", label: "Acabadora dupla" },
  { value: "maquina_corte", label: "Máquina de corte" },
  { value: "maquina_laser", label: "Máquina laser" },
  { value: "nivel_laser", label: "Nível laser" },
  { value: "regua_vibratoria", label: "Régua vibratória" }
];
const DEFAULT_MACHINE_DATABASE = {
  rendimentoFacasM2: 300,
  precoFaca: 180,
  rendimentoDiscoM2: 500,
  precoDisco: 220,
  consumoDuplaLitrosM2: 0.11,
  consumoSimplesLitrosM2: 0.08,
  consumoCorteLitrosM2: 0.04
};

const MACHINE_DATABASE_PRESETS = {
  marketBestPractices: {
    rendimentoFacasM2: 280,
    precoFaca: 195,
    rendimentoDiscoM2: 470,
    precoDisco: 235,
    consumoDuplaLitrosM2: 0.12,
    consumoSimplesLitrosM2: 0.085,
    consumoCorteLitrosM2: 0.045
  }
};

let logoDataUrl = "";
let toastTimeoutId;
let editingProposalId = "";
let editingUserId = "";
let editingClientId = "";
let currentUserId = "";
let currentUser = null;
let printProposalPendingCleanup = false;
let printCleanupRetryTimeoutId = null;
let usersCache = [];
let firestoreDb = null;
let firebaseSyncEnabled = false;
let firestoreUnsubscribers = [];
let firestoreSettingsApplied = false;
let firebaseReconnectTimeoutId = null;
let firebaseReconnectPromise = null;
let chartPropostasPorVendedor = null;
let chartValorPorVendedor = null;
let chartParticipacaoVendedor = null;
let chartPropostasPorStatus = null;
let chartValorPorStatus = null;
let pendingSyncCheckIntervalId = null;
const runtimeStorage = new Map();
const pendingSyncQueue = new Map(); 
const SYNC_RETRY_DELAYS_MS = [1000, 3000, 5000, 10000, 30000]; 
const SYNC_MAX_RETRIES = 5;
let documentSyncCheckIntervalId = null;

function cloneStorageValue(value) {
  if (value === undefined) return undefined;
  if (typeof window.structuredClone === "function") {
    try {
      return window.structuredClone(value);
    } catch {
      // Fallback
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  const normalizedRaw = raw
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");

  let normalized = normalizedRaw;
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const commasCount = (normalized.match(/,/g) || []).length;
    normalized = commasCount > 1
      ? normalized.replace(/,/g, "")
      : normalized.replace(",", ".");
  } else if (lastDot >= 0) {
    const dotsCount = (normalized.match(/\./g) || []).length;
    if (dotsCount > 1) {
      normalized = normalized.replace(/\./g, "");
    }
  }

  const number = parseFloat(normalized);
  return Number.isNaN(number) ? 0 : number;
}

function normalizeProposalStatus(value) {
  if (value === PROPOSAL_STATUS_FECHADA) return PROPOSAL_STATUS_FECHADA;
  if (value === PROPOSAL_STATUS_PERDIDA) return PROPOSAL_STATUS_PERDIDA;
  return PROPOSAL_STATUS_EM_ANDAMENTO;
}

function getProposalStatusMeta(status) {
  return PROPOSAL_STATUS_META[normalizeProposalStatus(status)] || PROPOSAL_STATUS_META[PROPOSAL_STATUS_EM_ANDAMENTO];
}

function onlyDigits(value) {
  return (value || "").replace(/\D/g, "");
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function getCssVarColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function formatDate(value = new Date()) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function createUniqueId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeEmail(value) {
  return (value || "").trim().toLowerCase();
}

function normalizeFilterText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function getFilterQuery(fieldId) {
  const field = $(fieldId);
  return normalizeFilterText(field?.value || "");
}

function matchesFilter(values, query) {
  if (!query) return true;
  return normalizeFilterText(values.join(" ")).includes(query);
}

function formatRole(role) {
  if (normalizeUserRole(role) === ROLE_ADMIN) return "Administrador";
  return "Vendedor";
}

function normalizeUserRole(role) {
  return role === ROLE_ADMIN ? role : ROLE_SELLER;
}

function normalizeClientRecord(client = {}) {
  if (!client || typeof client !== "object" || Array.isArray(client)) return null;
  return {
    ...client,
    id: client.id || "",
    name: String(client.name || client.cliente || "").trim(),
    document: String(client.document || client.documento || "").trim(),
    email: normalizeEmail(client.email || ""),
    phone: String(client.phone || client.telefone || "").trim(),
    project: String(client.project || client.obra || "").trim(),
    cep: String(client.cep || "").trim(),
    address: String(client.address || client.endereco || "").trim(),
    ownerId: client.ownerId || "",
    ownerName: String(client.ownerName || "").trim(),
    ownerEmail: normalizeEmail(client.ownerEmail || ""),
    filial: String(client.filial || DEFAULT_FILIAL).trim() || DEFAULT_FILIAL,
    createdAt: toNumber(client.createdAt),
    updatedAt: toNumber(client.updatedAt)
  };
}

function readJsonStorage(key, fallback) {
  try {
    if (runtimeStorage.has(key)) {
      const value = cloneStorageValue(runtimeStorage.get(key));
      return value === undefined ? fallback : value;
    }
    
    if (window.localStorage) {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const value = JSON.parse(raw);
        runtimeStorage.set(key, cloneStorageValue(value));
        return value === undefined ? fallback : value;
      }
    }
    
    return fallback;
  } catch {
    runtimeStorage.delete(key);
    if (window.localStorage) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Ignore
      }
    }
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  try {
    const cloned = cloneStorageValue(value);
    runtimeStorage.set(key, cloned);
    
    if (window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(cloned));
    }
    
    return true;
  } catch {
    showToast("Falha ao processar os dados em memória.", true);
    return false;
  }
}

function removeStorageItem(key) {
  runtimeStorage.delete(key);
  if (window.localStorage) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  }
}

function readLegacyJsonStorage(key, fallback) {
  try {
    const raw = window.localStorage?.getItem?.(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    removeLegacyStorageItem(key);
    return fallback;
  }
}

function removeLegacyStorageItem(key) {
  try {
    window.localStorage?.removeItem?.(key);
  } catch {
    // Ignore
  }
}

function clearLegacyDraftStorage(userId = currentUserId) {
  if (userId) {
    removeLegacyStorageItem(getDraftStorageKey(userId));
  }
  removeLegacyStorageItem(LEGACY_DRAFT_STORAGE_KEY);
}

function getDraftFirestoreDocId(userId = currentUserId) {
  return userId ? `${FIRESTORE_DRAFT_DOC_PREFIX}${userId}` : "";
}

function toTimestampMillis(value) {
  if (value?.toMillis) {
    return value.toMillis();
  }
  if (value == null || value === "") {
    return null;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function createFirestoreServerTimestamp() {
  return window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || null;
}

function normalizeDraftPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value.snapshot && typeof value.snapshot === "object" && !Array.isArray(value.snapshot)
    ? value.snapshot
    : value;
  const updatedAtClient = toTimestampMillis(value.updatedAtClient) ?? toTimestampMillis(value.updatedAt) ?? Date.now();
  const updatedAtServer = toTimestampMillis(value.updatedAtServer);
  return {
    updatedAt: updatedAtClient,
    updatedAtClient,
    updatedAtServer,
    pendingSync: (updatedAtServer === null || updatedAtServer === undefined) ? Boolean(value.pendingSync) : false,
    snapshot
  };
}

function readDraftPayloadFromStorage(userId = currentUserId) {
  if (!userId) return null;
  return normalizeDraftPayload(readJsonStorage(getDraftStorageKey(userId), null));
}

function writeDraftPayloadToStorage(payload, userId = currentUserId) {
  if (!userId) return false;
  const normalized = normalizeDraftPayload(payload);
  if (!normalized) return false;
  return writeJsonStorage(getDraftStorageKey(userId), normalized);
}

function updateFirebaseStatus(connected) {
  const el = $("firebaseStatus");
  if (!el) return;
  el.textContent = connected ? "☁ Firebase: conectado" : "⚠ Firebase: desconectado";
  el.className = connected ? "firebase-status firebase-status-ok" : "firebase-status firebase-status-off";
  el.title = connected
    ? "Dados sincronizados com o servidor"
    : "Sem conexão com o servidor — novas alterações ficam só em memória e podem ser perdidas ao recarregar a página";
}

function clearFirestoreListeners() {
  firestoreUnsubscribers.forEach((unsub) => unsub());
  firestoreUnsubscribers = [];
}

function clearFirebaseReconnectTimeout() {
  if (firebaseReconnectTimeoutId == null) return;
  window.clearTimeout(firebaseReconnectTimeoutId);
  firebaseReconnectTimeoutId = null;
}

function startPendingSyncCheck() {
  if (documentSyncCheckIntervalId) return;
  
  documentSyncCheckIntervalId = window.setInterval(() => {
    if (currentUserId && firebaseSyncEnabled && firestoreDb) {
      const draftPayload = readDraftPayloadFromStorage();
      if (draftPayload?.pendingSync) {
        console.log("[Firebase Sync] Tentando sincronizar rascunho pendente...");
        syncFirestoreDraftPayload(draftPayload);
      }
    }
    
    if (firebaseSyncEnabled && firestoreDb && navigator.onLine && pendingSyncQueue.size > 0) {
      const now = Date.now();
      for (const [docId, entry] of pendingSyncQueue.entries()) {
        if (now >= entry.nextRetryTime) {
          console.log(`[Firebase Sync] Retentando sincronizar ${docId} (tentativa ${entry.retries + 1}/${SYNC_MAX_RETRIES})...`);
          syncFirestoreDoc(docId, entry.value);
        }
      }
    }
  }, 5000); 
}

function stopPendingSyncCheck() {
  if (documentSyncCheckIntervalId) {
    window.clearInterval(documentSyncCheckIntervalId);
    documentSyncCheckIntervalId = null;
  }
  if (pendingSyncCheckIntervalId) {
    window.clearInterval(pendingSyncCheckIntervalId);
    pendingSyncCheckIntervalId = null;
  }
}

function refreshAppFromStorage() {
  refreshCurrentUser();
  renderUsersTable();
  renderClientsTable();
  populateProposalClientSelect();
  updateSessionInfo();
  updateAppVisibility();
  renderizarTabelaPropostas();
  renderDashboard();
  applyMachineDatabaseToForm();
}

async function reconnectFirebase() {
  if (firebaseReconnectPromise) return firebaseReconnectPromise;

  firebaseReconnectPromise = (async () => {
    const connected = initializeFirebaseConnection();
    if (!connected) return false;
    try {
      await new Promise((resolve) => setTimeout(resolve, FIREBASE_INIT_CONNECTION_DELAY_MS));
      await bootstrapStorageFromFirebase();
      subscribeFirestoreChanges();
      
      if (pendingSyncQueue.size > 0) {
        console.log(`[Firebase Sync] Sincronizando ${pendingSyncQueue.size} documentos da fila de retentativa...`);
        for (const [docId, entry] of pendingSyncQueue.entries()) {
          console.log(`[Firebase Sync] Sincronizando ${docId} da fila de retentativa...`);
          syncFirestoreDoc(docId, entry.value);
        }
      }
      
      if (currentUserId) {
        startPendingSyncCheck();
        refreshAppFromStorage();
        await carregarRascunhoLocal();
      }
      return true;
    } catch (error) {
      handleFirebaseConnectionError("Falha ao sincronizar dados após reconectar Firebase:", error);
      return false;
    } finally {
      firebaseReconnectPromise = null;
    }
  })();

  return firebaseReconnectPromise;
}

function scheduleFirebaseReconnect() {
  if (firebaseReconnectTimeoutId != null) return;
  if (!window.firebase?.firestore) {
    updateFirebaseStatus(false);
    return;
  }
  updateFirebaseStatus(false);
  firebaseReconnectTimeoutId = window.setTimeout(async () => {
    firebaseReconnectTimeoutId = null;
    try {
      const connected = await reconnectFirebase();
      if (!connected) scheduleFirebaseReconnect();
    } catch (error) {
      handleFirebaseConnectionError("Falha ao tentar reconectar Firebase automaticamente:", error);
      scheduleFirebaseReconnect();
    }
  }, FIREBASE_RECONNECT_DELAY_MS);
}

function handleFirebaseConnectionError(message, error) {
  console.error(message, error);
  firestoreDb = null;
  firebaseSyncEnabled = false;
  clearFirestoreListeners();
  updateFirebaseStatus(false);
  scheduleFirebaseReconnect();
}

function handleFirebaseSyncError(docId, error, value) {
  console.warn(`Falha ao sincronizar ${docId}, agendando retentativa:`, error);
  
  if (!pendingSyncQueue.has(docId)) {
    pendingSyncQueue.set(docId, {
      value: value,
      retries: 0,
      nextRetryTime: Date.now() + SYNC_RETRY_DELAYS_MS[0]
    });
    console.log(`[Firebase Sync] Adicionado à fila de retentativa: ${docId}`);
  } else {
    const entry = pendingSyncQueue.get(docId);
    entry.value = value; 
    entry.retries = Math.min(entry.retries + 1, SYNC_MAX_RETRIES);
    const delayIndex = Math.min(entry.retries, SYNC_RETRY_DELAYS_MS.length - 1);
    entry.nextRetryTime = Date.now() + SYNC_RETRY_DELAYS_MS[delayIndex];
    console.log(`[Firebase Sync] Retentativa ${entry.retries}/${SYNC_MAX_RETRIES} para ${docId}, próxima em ${SYNC_RETRY_DELAYS_MS[delayIndex]}ms`);
  }
  
  if (!firebaseSyncEnabled) {
    scheduleFirebaseReconnect();
  }
}

function getUserCreatorName(user = {}) {
  return user.createdByName || "Sistema";
}

function canDeleteUser(user, actor = currentUser) {
  if (!isAdmin(actor) || !user) return false;
  if (user.id === actor.id) return false;
  if (isAdmin(actor)) return user.createdBy === actor.id;
  return false;
}

function initializeFirebaseConnection() {
  if (!window.firebase?.firestore) {
    console.warn("[Firebase Init] Firebase Firestore SDK não carregado");
    updateFirebaseStatus(false);
    return false;
  }

  try {
    console.log("[Firebase Init] Inicializando Firebase...");
    if (!window.firebase.apps?.length) {
      console.debug("[Firebase Init] Inicializando app Firebase com config...");
      window.firebase.initializeApp(FIREBASE_CONFIG);
    }
    firestoreDb = window.firebase.firestore();
    if (!firestoreSettingsApplied) {
      console.debug("[Firebase Init] Aplicando configurações Firestore...");
      firestoreDb.settings(FIRESTORE_SETTINGS);
      firestoreSettingsApplied = true;
    }
    firebaseSyncEnabled = true;
    clearFirebaseReconnectTimeout();
    console.log("[Firebase Init] ✓ Firebase conectado com sucesso");
    updateFirebaseStatus(true);
    return true;
  } catch (error) {
    console.error("[Firebase Init] ✗ Erro ao inicializar Firebase:", error?.code, error?.message);
    handleFirebaseConnectionError("Falha ao inicializar Firebase:", error);
    return false;
  }
}

function getFirestoreDoc(docId) {
  if (!firebaseSyncEnabled || !firestoreDb) return null;
  return firestoreDb.collection(FIRESTORE_COLLECTION).doc(docId);
}

async function readFirestoreDoc(docId, fallback) {
  const ref = getFirestoreDoc(docId);
  if (!ref) {
    console.warn(`[Firebase Read] Não foi possível obter referência para ${docId}`);
    return fallback;
  }
  try {
    console.debug(`[Firebase Read] Lendo ${docId}...`);
    const snap = await ref.get();
    if (snap.exists) {
      console.log(`[Firebase Read] ✓ Sucesso ao ler ${docId}`);
      return snap.data()?.data ?? fallback;
    } else {
      console.debug(`[Firebase Read] Documento não existe: ${docId}, usando fallback`);
      return fallback;
    }
  } catch (error) {
    console.error(`[Firebase Read] ✗ Erro ao ler ${docId}:`, error?.code, error?.message);
    handleFirebaseConnectionError(`Falha ao ler ${docId}:`, error);
    return fallback;
  }
}

function syncFirestoreDoc(docId, value) {
  const ref = getFirestoreDoc(docId);
  if (!ref) {
    console.debug(`[Firebase Sync] Firestore não conectado, adicionando ${docId} à fila de retentativa`);
    handleFirebaseSyncError(docId, new Error("Firestore not connected"), value);
    return;
  }
  
  console.debug(`[Firebase Sync] Sincronizando ${docId}...`);
  ref.set({ data: value })
    .then(() => {
      console.log(`[Firebase Sync] ✓ Sucesso ao sincronizar ${docId}`);
      if (pendingSyncQueue.has(docId)) {
        pendingSyncQueue.delete(docId);
        console.log(`[Firebase Sync] Removido ${docId} da fila de retentativa`);
      }
    })
    .catch((error) => {
      console.warn(`[Firebase Sync] ✗ Erro ao sincronizar ${docId}:`, error?.code, error?.message);
      handleFirebaseSyncError(docId, error, value);
    });
}

function syncFirestoreDocAsync(docId, value) {
  return new Promise((resolve) => {
    const ref = getFirestoreDoc(docId);
    if (!ref) {
      console.debug(`[Firebase Sync] Firestore não conectado, agendando retentativa para ${docId}`);
      handleFirebaseSyncError(docId, new Error("Firestore not connected"), value);
      resolve();
      return;
    }
    
    console.debug(`[Firebase Sync] Sincronizando ${docId} (async)...`);
    ref.set({ data: value })
      .then(() => {
        console.log(`[Firebase Sync] ✓ Sucesso ao sincronizar ${docId} (async)`);
        if (pendingSyncQueue.has(docId)) {
          pendingSyncQueue.delete(docId);
          console.log(`[Firebase Sync] Removido ${docId} da fila de retentativa`);
        }
        resolve();
      })
      .catch((error) => {
        console.warn(`[Firebase Sync] ✗ Erro ao sincronizar ${docId} (async):`, error?.code, error?.message);
        handleFirebaseSyncError(docId, error, value);
        resolve();
      });
  });
}

async function readFirestoreDraftPayload(userId = currentUserId) {
  const docId = getDraftFirestoreDocId(userId);
  if (!docId) return null;
  const ref = getFirestoreDoc(docId);
  if (!ref) return null;
  try {
    const snap = await ref.get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    return normalizeDraftPayload({
      ...(data.data && typeof data.data === "object" ? data.data : {}),
      updatedAtServer: data.updatedAtServer
    });
  } catch (error) {
    handleFirebaseConnectionError(`Falha ao ler ${docId}:`, error);
    return null;
  }
}

function syncFirestoreDraftPayload(payload, userId = currentUserId) {
  const docId = getDraftFirestoreDocId(userId);
  const normalized = normalizeDraftPayload(payload);
  if (!docId || !normalized) return;
  const ref = getFirestoreDoc(docId);
  if (!ref) {
    scheduleFirebaseReconnect();
    return;
  }
  const serverTimestamp = createFirestoreServerTimestamp();
  if (!serverTimestamp) {
    scheduleFirebaseReconnect();
    return;
  }
  ref.set({
    data: {
      updatedAt: normalized.updatedAtClient,
      updatedAtClient: normalized.updatedAtClient,
      pendingSync: false,
      snapshot: normalized.snapshot
    },
    updatedAtServer: serverTimestamp
  }).catch((error) => {
    console.error(`Falha ao sincronizar ${docId}:`, error);
    handleFirebaseConnectionError(`Falha ao sincronizar ${docId}:`, error);
    const payloadWithPending = {
      ...normalized,
      pendingSync: true,
      updatedAtClient: normalized.updatedAtClient
    };
    writeDraftPayloadToStorage(payloadWithPending, userId);
  });
}

function clearFirestoreDraft(userId = currentUserId) {
  const docId = getDraftFirestoreDocId(userId);
  if (!docId) return;
  removeStorageItem(getDraftStorageKey(userId));
  clearLegacyDraftStorage(userId);
  const ref = getFirestoreDoc(docId);
  if (!ref) {
    scheduleFirebaseReconnect();
    return;
  }
  ref.delete().catch((error) => {
    handleFirebaseConnectionError(`Falha ao remover ${docId}:`, error);
  });
}

function subscribeFirestoreChanges() {
  clearFirestoreListeners();

  if (!firebaseSyncEnabled || !firestoreDb) return;

  const col = firestoreDb.collection(FIRESTORE_COLLECTION);

  const initializeDocument = (docId, defaultValue) => {
    col.doc(docId).get().then((snap) => {
      if (!snap.exists) {
        col.doc(docId).set({ data: defaultValue }).catch((error) => {
          console.warn(`Falha ao inicializar documento ${docId}:`, error);
        });
      }
    }).catch((error) => {
      console.warn(`Falha ao verificar documento ${docId}:`, error);
    });
  };

  initializeDocument(FIRESTORE_USERS_DOC, usersCache);
  initializeDocument(FIRESTORE_PROPOSALS_DOC, readJsonStorage(PROPOSALS_STORAGE_KEY, []));
  initializeDocument(FIRESTORE_CLIENTS_DOC, readJsonStorage(CLIENTS_STORAGE_KEY, []));
  initializeDocument(FIRESTORE_MACHINE_DB_DOC, readJsonStorage(MACHINE_DB_STORAGE_KEY, DEFAULT_MACHINE_DATABASE));

  firestoreUnsubscribers.push(
    col.doc(FIRESTORE_USERS_DOC).onSnapshot((snap) => {
      if (!snap.exists) return;
      const data = snap.data()?.data;
      if (!Array.isArray(data)) return;
      usersCache = normalizeUsersForStorage(data);
      removeLegacyStorageItem(USERS_STORAGE_KEY);
      if (currentUserId) {
        refreshCurrentUser();
        renderUsersTable();
        renderClientsTable();
        populateProposalClientSelect();
        updateSessionInfo();
        updateAppVisibility();
      }
    }, (error) => {
      handleFirebaseConnectionError("Erro ao escutar usuários:", error);
    })
  );

  firestoreUnsubscribers.push(
    col.doc(FIRESTORE_PROPOSALS_DOC).onSnapshot((snap) => {
      if (!snap.exists) return;
      const data = snap.data()?.data;
      if (!Array.isArray(data)) return;
      writeJsonStorage(PROPOSALS_STORAGE_KEY, data);
      removeLegacyStorageItem(PROPOSALS_STORAGE_KEY);
      if (currentUserId) {
        renderizarTabelaPropostas();
        renderDashboard();
      }
    }, (error) => {
      handleFirebaseConnectionError("Erro ao escutar propostas:", error);
    })
  );

  firestoreUnsubscribers.push(
    col.doc(FIRESTORE_CLIENTS_DOC).onSnapshot((snap) => {
      if (!snap.exists) return;
      const data = snap.data()?.data;
      if (!Array.isArray(data)) return;
      writeJsonStorage(CLIENTS_STORAGE_KEY, data);
      removeLegacyStorageItem(CLIENTS_STORAGE_KEY);
      if (currentUserId) {
        renderClientsTable();
        populateProposalClientSelect();
      }
    }, (error) => {
      handleFirebaseConnectionError("Erro ao escutar clientes:", error);
    })
  );

  firestoreUnsubscribers.push(
    col.doc(FIRESTORE_MACHINE_DB_DOC).onSnapshot((snap) => {
      if (!snap.exists) return;
      const data = snap.data()?.data;
      if (!data || typeof data !== "object" || Array.isArray(data)) return;
      writeJsonStorage(MACHINE_DB_STORAGE_KEY, normalizeMachineDatabase(data));
      removeLegacyStorageItem(MACHINE_DB_STORAGE_KEY);
      if (currentUserId) {
        applyMachineDatabaseToForm();
      }
    }, (error) => {
      handleFirebaseConnectionError("Erro ao escutar banco de máquinas:", error);
    })
  );

  const draftDocId = getDraftFirestoreDocId();
  if (!draftDocId) return;

  firestoreUnsubscribers.push(
    col.doc(draftDocId).onSnapshot((snap) => {
      if (!snap.exists) {
        removeStorageItem(getDraftStorageKey());
        clearLegacyDraftStorage();
        updateDraftStatus("Rascunho limpo.");
        return;
      }
      if (snap.metadata?.hasPendingWrites) return;

      const data = snap.data() || {};
      const payload = normalizeDraftPayload({
        ...(data.data && typeof data.data === "object" ? data.data : {}),
        updatedAtServer: data.updatedAtServer
      });
      if (!payload) return;

      const localPayload = readDraftPayloadFromStorage();
      if (
        localPayload?.pendingSync
        && localPayload.updatedAtClient !== null
        && localPayload.updatedAtClient !== undefined
        && localPayload.updatedAtClient > payload.updatedAtClient
      ) return;

      writeDraftPayloadToStorage(payload);
      clearLegacyDraftStorage();
      if (!currentUserId) return;

      if (JSON.stringify(payload.snapshot) !== JSON.stringify(proposalFieldsSnapshot())) {
        applyProposalSnapshot(payload.snapshot);
      }
      updateDraftStatus("Rascunho sincronizado com o Firestore.");
    }, (error) => {
      handleFirebaseConnectionError("Erro ao escutar rascunho:", error);
    })
  );
}

async function bootstrapStorageFromFirebase() {
  if (!firebaseSyncEnabled) return;

  try {
    const [users, proposals, clients, machineDb] = await Promise.all([
      readFirestoreDoc(FIRESTORE_USERS_DOC, null),
      readFirestoreDoc(FIRESTORE_PROPOSALS_DOC, null),
      readFirestoreDoc(FIRESTORE_CLIENTS_DOC, null),
      readFirestoreDoc(FIRESTORE_MACHINE_DB_DOC, null)
    ]);

    if (users && Array.isArray(users)) {
      usersCache = normalizeUsersForStorage(users);
    } else {
      const legacyUsers = readLegacyJsonStorage(USERS_STORAGE_KEY, null);
      if (legacyUsers && Array.isArray(legacyUsers) && legacyUsers.length) {
        usersCache = normalizeUsersForStorage(legacyUsers);
      } else {
        usersCache = [];
      }
    }
    removeLegacyStorageItem(USERS_STORAGE_KEY);

    if (proposals && Array.isArray(proposals)) {
      writeJsonStorage(PROPOSALS_STORAGE_KEY, proposals);
    } else {
      const legacyProposals = readLegacyJsonStorage(PROPOSALS_STORAGE_KEY, null);
      if (legacyProposals && Array.isArray(legacyProposals) && legacyProposals.length) {
        writeJsonStorage(PROPOSALS_STORAGE_KEY, legacyProposals);
      } else {
        writeJsonStorage(PROPOSALS_STORAGE_KEY, []);
      }
    }
    removeLegacyStorageItem(PROPOSALS_STORAGE_KEY);

    if (clients && Array.isArray(clients)) {
      writeJsonStorage(CLIENTS_STORAGE_KEY, clients);
    } else {
      const legacyClients = readLegacyJsonStorage(CLIENTS_STORAGE_KEY, null);
      if (legacyClients && Array.isArray(legacyClients) && legacyClients.length) {
        writeJsonStorage(CLIENTS_STORAGE_KEY, legacyClients);
      } else {
        writeJsonStorage(CLIENTS_STORAGE_KEY, []);
      }
    }
    removeLegacyStorageItem(CLIENTS_STORAGE_KEY);

    if (machineDb && !Array.isArray(machineDb) && typeof machineDb === "object") {
      writeJsonStorage(MACHINE_DB_STORAGE_KEY, normalizeMachineDatabase(machineDb));
    } else {
      const legacyMachineDb = readLegacyJsonStorage(MACHINE_DB_STORAGE_KEY, null);
      if (legacyMachineDb && !Array.isArray(legacyMachineDb) && typeof legacyMachineDb === "object") {
        writeJsonStorage(MACHINE_DB_STORAGE_KEY, normalizeMachineDatabase(legacyMachineDb));
      } else {
        writeJsonStorage(MACHINE_DB_STORAGE_KEY, DEFAULT_MACHINE_DATABASE);
      }
    }
    removeLegacyStorageItem(MACHINE_DB_STORAGE_KEY);

    console.log("[Firebase Bootstrap] Armazenamento local sincronizado com sucesso a partir do Firestore.");
    return true;
  } catch (error) {
    console.error("[Firebase Bootstrap] Erro ao carregar dados iniciais:", error);
    return false;
  }
}

function saveProposalsToDatabase(proposalsList) {
  if (!Array.isArray(proposalsList)) return false;
  const success = writeJsonStorage(PROPOSALS_STORAGE_KEY, proposalsList);
  if (success) {
    syncFirestoreDoc(FIRESTORE_PROPOSALS_DOC, proposalsList);
    if (currentUserId) {
      renderizarTabelaPropostas();
      renderDashboard();
    }
  }
  return success;
}

function saveClientsToDatabase(clientsList) {
  if (!Array.isArray(clientsList)) return false;
  const success = writeJsonStorage(CLIENTS_STORAGE_KEY, clientsList);
  if (success) {
    syncFirestoreDoc(FIRESTORE_CLIENTS_DOC, clientsList);
    if (currentUserId) {
      renderClientsTable();
      populateProposalClientSelect();
    }
  }
  return success;
}

function saveUsersToDatabase(usersList) {
  if (!Array.isArray(usersList)) return false;
  usersCache = normalizeUsersForStorage(usersList);
  syncFirestoreDoc(FIRESTORE_USERS_DOC, usersCache);
  if (currentUserId) {
    refreshCurrentUser();
    renderUsersTable();
  }
  return true;
}

function saveMachineDatabaseToDatabase(machineDbObj) {
  if (!machineDbObj || typeof machineDbObj !== "object") return false;
  const normalized = normalizeMachineDatabase(machineDbObj);
  const success = writeJsonStorage(MACHINE_DB_STORAGE_KEY, normalized);
  if (success) {
    syncFirestoreDoc(FIRESTORE_MACHINE_DB_DOC, normalized);
    if (currentUserId) {
      applyMachineDatabaseToForm();
    }
  }
  return success;
}

function normalizeMachineDatabase(data) {
  return {
    rendimentoFacasM2: toNumber(data?.rendimentoFacasM2 ?? DEFAULT_MACHINE_DATABASE.rendimentoFacasM2),
    precoFaca: toNumber(data?.precoFaca ?? DEFAULT_MACHINE_DATABASE.precoFaca),
    rendimentoDiscoM2: toNumber(data?.rendimentoDiscoM2 ?? DEFAULT_MACHINE_DATABASE.rendimentoDiscoM2),
    precoDisco: toNumber(data?.precoDisco ?? DEFAULT_MACHINE_DATABASE.precoDisco),
    consumoDuplaLitrosM2: toNumber(data?.consumoDuplaLitrosM2 ?? DEFAULT_MACHINE_DATABASE.consumoDuplaLitrosM2),
    consumoSimplesLitrosM2: toNumber(data?.consumoSimplesLitrosM2 ?? DEFAULT_MACHINE_DATABASE.consumoSimplesLitrosM2),
    consumoCorteLitrosM2: toNumber(data?.consumoCorteLitrosM2 ?? DEFAULT_MACHINE_DATABASE.consumoCorteLitrosM2)
  };
}

function normalizeUsersForStorage(users) {
  if (!Array.isArray(users)) return [];
  return users.map(u => ({
    id: u.id || "",
    username: String(u.username || "").trim(),
    password: u.password || "",
    role: normalizeUserRole(u.role),
    filial: String(u.filial || DEFAULT_FILIAL).trim(),
    createdAt: toNumber(u.createdAt),
    updatedAt: toNumber(u.updatedAt)
  })).filter(u => u.username !== "");
}

function getDraftStorageKey(userId = currentUserId) {
  return userId ? `${DRAFT_STORAGE_KEY_PREFIX}${userId}` : "";
}

function isAdmin(user = currentUser) {
  return normalizeUserRole(user?.role) === ROLE_ADMIN;
}

function updateDraftStatus(msg) {
  const el = $("draftStatus");
  if (el) el.textContent = msg;
}

function showToast(message, isError = false) {
  if (toastTimeoutId) clearTimeout(toastTimeoutId);
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.className = isError ? "toast toast-error toast-show" : "toast toast-show";
  toastTimeoutId = setTimeout(() => {
    el.className = "toast";
  }, 4000);
}

function bindStaticEvents() {
  window.addEventListener("focus", () => {
    if (!firebaseSyncEnabled && window.firebase?.firestore) {
      reconnectFirebase().catch((error) => {
        console.error("Erro ao restabelecer Firebase ao voltar para o app:", error);
      });
    }
  });

  window.addEventListener("online", () => {
    reconnectFirebase().then((connected) => {
      if (!connected) {
        scheduleFirebaseReconnect();
      } else if (currentUserId) {
        refreshAppFromStorage();
      }
    }).catch((error) => {
      handleFirebaseConnectionError("Falha ao sincronizar dados ao voltar a conexão:", error);
    });
  });

  window.addEventListener("offline", () => {
    updateFirebaseStatus(false);
  });
}

async function init() {
  bindStaticEvents();
  initializeFirebaseConnection();
  await new Promise((resolve) => setTimeout(resolve, FIREBASE_INIT_CONNECTION_DELAY_MS));
  await bootstrapStorageFromFirebase();
  subscribeFirestoreChanges();
  await ensureAdminExists();
  applyMachineDatabaseToForm();
  updateAppVisibility();
  await restoreSession();
  atualizarTextoBotaoProposta();
  atualizarModoFuncionarios({ preserveManualValue: false });
  atualizarCampoPisoTela({ preserveValueWhenDisabled: false });
  atualizarCampoCuraQuimica({ preserveValueWhenDisabled: false });
  atualizarCampoEquipamentosAlugados({ preserveValuesWhenHidden: true, syncFromSnapshot: true });
  atualizarCampoStatusProposta({ preserveValueWhenHidden: false });
  if (!$(\"propostaTextoPadrao\").value.trim()) {
    $(\"propostaTextoPadrao\").value = DEFAULT_STANDARD_TEXT;
  }
  calcularOrcamento();
}

// Inicializadores заглушки (Placeholders para compatibilidade com o resto do seu script)
function refreshCurrentUser() { console.log("refreshCurrentUser chamado"); }
function renderUsersTable() { console.log("renderUsersTable chamado"); }
function renderClientsTable() { console.log("renderClientsTable chamado"); }
function populateProposalClientSelect() { console.log("populateProposalClientSelect chamado"); }
function updateSessionInfo() { console.log("updateSessionInfo chamado"); }
function updateAppVisibility() { console.log("updateAppVisibility chamado"); }
function renderizarTabelaPropostas() { console.log("renderizarTabelaPropostas chamado"); }
function renderDashboard() { console.log("renderDashboard chamado"); }
function applyMachineDatabaseToForm() { console.log("applyMachineDatabaseToForm chamado"); }
function carregarRascunhoLocal() { return Promise.resolve(); }
function ensureAdminExists() { return Promise.resolve(); }
function restoreSession() { return Promise.resolve(); }
function atualizarTextoBotaoProposta() {}
function atualizarModoFuncionarios() {}
function atualizarCampoPisoTela() {}
function atualizarCampoCuraQuimica() {}
function atualizarCampoEquipamentosAlugados() {}
function atualizarCampoStatusProposta() {}
function calcularOrcamento() {}
function proposalFieldsSnapshot() { return {}; }
function applyProposalSnapshot() {}

init();
