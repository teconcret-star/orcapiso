const $ = (id) => document.getElementById(id);

const M2_PER_WORKER = 100;
const USERS_STORAGE_KEY = "orcamento_usuarios_v1";
const SESSION_STORAGE_KEY = "orcamento_sessao_v1";
const PROPOSALS_STORAGE_KEY = "propostas_salvas_v1";
const LEGACY_DRAFT_STORAGE_KEY = "proposta_rascunho_v1";
const DRAFT_STORAGE_KEY_PREFIX = "proposta_rascunho_usuario_v1_";
const WORKER_MODE_AUTO = "auto";
const WORKER_MODE_MANUAL = "manual";
const ROLE_ADMIN = "admin";
const ROLE_SELLER = "seller";
const DEFAULT_ADMIN_EMAIL = "admin@example.local";
const DEFAULT_ADMIN_PASSWORD = "TroqueAgora#2026";
const PASSWORD_ITERATIONS = 120000;
const PRINT_CLASS_CLEANUP_DELAY_MS = 500;
const DEFAULT_STANDARD_TEXT =
  "Apresentamos nossa proposta comercial para execução do piso industrial conforme dados da obra informados. Os valores contemplam o escopo acordado para a área indicada e permanecem sujeitos à validação final das condições do local antes do início dos serviços.";

let logoDataUrl = "";
let toastTimeoutId;
let editingProposalId = "";
let editingUserId = "";
let currentUserId = "";
let currentUser = null;

function toNumber(value) {
  const number = parseFloat(value);
  return Number.isNaN(number) ? 0 : number;
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

function formatRole(role) {
  return role === ROLE_ADMIN ? "Administrador" : "Vendedor";
}

function readJsonStorage(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    showToast("Não foi possível salvar os dados neste aparelho.", true);
    return false;
  }
}

function showToast(message, isError = false) {
  const toast = $("toast");
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.toggle("error", isError);

  clearTimeout(toastTimeoutId);
  toastTimeoutId = window.setTimeout(() => {
    toast.hidden = true;
  }, 2800);
}

function updateDraftStatus(message, isError = false) {
  const status = $("draftStatus");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function hashLegacyPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  const pairs = hex.match(/.{1,2}/g) || [];
  return new Uint8Array(pairs.map((pair) => parseInt(pair, 16)));
}

function createPasswordSalt() {
  return bytesToHex(window.crypto.getRandomValues(new Uint8Array(16)));
}

async function derivePasswordHash(password, saltHex, iterations = PASSWORD_ITERATIONS) {
  const data = new TextEncoder().encode(password);
  const key = await window.crypto.subtle.importKey("raw", data, "PBKDF2", false, ["deriveBits"]);
  const derivedBits = await window.crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: hexToBytes(saltHex),
    iterations
  }, key, 256);
  return Array.from(new Uint8Array(derivedBits))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

async function createPasswordCredentials(password) {
  const passwordSalt = createPasswordSalt();
  const passwordHash = await derivePasswordHash(password, passwordSalt);
  return {
    passwordHash,
    passwordSalt,
    passwordIterations: PASSWORD_ITERATIONS
  };
}

async function verifyPassword(user, password) {
  if (user.passwordSalt) {
    const derivedHash = await derivePasswordHash(password, user.passwordSalt, user.passwordIterations || PASSWORD_ITERATIONS);
    return derivedHash === user.passwordHash;
  }

  const legacyHash = await hashLegacyPassword(password);
  return legacyHash === user.passwordHash;
}

function getTextoPadraoProposta() {
  return $("propostaTextoPadrao").value.trim() || DEFAULT_STANDARD_TEXT;
}

function formatarCep(value) {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function formatarDocumento(value) {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatarTelefone(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

function calcularFuncionariosPorMetragem(metragem) {
  return metragem > 0 ? Math.ceil(metragem / M2_PER_WORKER) : 0;
}

function getModoFuncionarios() {
  return $("modoFuncionarios").value === WORKER_MODE_MANUAL ? WORKER_MODE_MANUAL : WORKER_MODE_AUTO;
}

function atualizarModoFuncionarios({ preserveManualValue = true } = {}) {
  const modo = getModoFuncionarios();
  const funcionariosEl = $("funcionarios");
  const funcionariosAutomaticos = calcularFuncionariosPorMetragem(toNumber($("metragem").value));

  funcionariosEl.readOnly = modo !== WORKER_MODE_MANUAL;

  if (modo === WORKER_MODE_MANUAL) {
    $("infoFuncionarios").textContent = "Modo manual: informe a quantidade desejada para esta obra.";

    if (!preserveManualValue || !funcionariosEl.value) {
      funcionariosEl.value = funcionariosAutomaticos;
    }
  } else {
    $("infoFuncionarios").textContent = "Regra automática: 1 funcionário a cada 100 m²";
    funcionariosEl.value = funcionariosAutomaticos;
  }
}

async function buscarDadosCep(cep) {
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  if (!response.ok) throw new Error("Falha ao consultar CEP.");
  const data = await response.json();
  if (data.erro) throw new Error("CEP não encontrado.");
  return data;
}

async function preencherEnderecoPorCepInput({ cepFieldId, enderecoFieldId, labelErro, alertOnError = true }) {
  const cepEl = $(cepFieldId);
  const enderecoEl = $(enderecoFieldId);
  const cep = onlyDigits(cepEl.value).slice(0, 8);

  if (cep.length !== 8) {
    if (alertOnError) showToast(`Informe um CEP válido de 8 dígitos para ${labelErro}.`, true);
    return false;
  }

  try {
    const dados = await buscarDadosCep(cep);
    const endereco = [dados.logradouro, dados.bairro, `${dados.localidade}/${dados.uf}`]
      .filter(Boolean)
      .join(" - ");
    cepEl.value = formatarCep(cep);
    enderecoEl.value = endereco || enderecoEl.value;
    return true;
  } catch (error) {
    if (alertOnError) showToast(error.message || "Não foi possível buscar o CEP.", true);
    return false;
  }
}

async function preencherEnderecosPorCep() {
  const preenchido = await preencherEnderecoPorCepInput({
    cepFieldId: "cep",
    enderecoFieldId: "endereco",
    labelErro: "a obra",
    alertOnError: false
  });

  if (preenchido) {
    showToast("Endereço atualizado com sucesso.");
  } else {
    showToast("Não foi possível preencher o endereço da obra. Revise o CEP informado.", true);
  }
}

function getUsers() {
  return readJsonStorage(USERS_STORAGE_KEY, []);
}

function saveUsers(list) {
  return writeJsonStorage(USERS_STORAGE_KEY, list);
}

function getSavedProposals() {
  return readJsonStorage(PROPOSALS_STORAGE_KEY, []);
}

function saveProposals(list) {
  return writeJsonStorage(PROPOSALS_STORAGE_KEY, list);
}

function getDraftStorageKey(userId = currentUserId) {
  return `${DRAFT_STORAGE_KEY_PREFIX}${userId}`;
}

function getSession() {
  return readJsonStorage(SESSION_STORAGE_KEY, null);
}

function saveSession(userId) {
  return writeJsonStorage(SESSION_STORAGE_KEY, { userId });
}

function clearSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function isAdmin(user = currentUser) {
  return user?.role === ROLE_ADMIN;
}

function getCurrentUserFromStorage() {
  return getUsers().find((item) => item.id === currentUserId) || null;
}

function buildDefaultProfile(user = {}) {
  return {
    nomeVendedor: user.name || "",
    telefoneVendedor: "",
    emailVendedor: user.email || "",
    empresa: "",
    cnpj: "",
    enderecoEmpresa: "",
    logoDataUrl: ""
  };
}

function mergeUserProfile(user) {
  return {
    ...user,
    profile: {
      ...buildDefaultProfile(user),
      ...(user.profile || {})
    }
  };
}

function refreshCurrentUser() {
  if (!currentUserId) {
    currentUser = null;
    return null;
  }

  const storedUser = getCurrentUserFromStorage();
  if (!storedUser || !storedUser.active) {
    handleLogout({ silent: true });
    return null;
  }

  currentUser = mergeUserProfile(storedUser);
  currentUserId = currentUser.id;
  return currentUser;
}

async function ensureAdminExists() {
  const users = getUsers();
  if (users.length) return;

  const now = Date.now();
  const adminUser = {
    id: createUniqueId(),
    name: "Administrador",
    email: DEFAULT_ADMIN_EMAIL,
    role: ROLE_ADMIN,
    active: true,
    ...(await createPasswordCredentials(DEFAULT_ADMIN_PASSWORD)),
    mustChangePassword: true,
    profile: buildDefaultProfile({
      name: "Administrador",
      email: DEFAULT_ADMIN_EMAIL
    }),
    createdAt: now,
    updatedAt: now
  };

  saveUsers([adminUser]);
}

function updateSessionInfo() {
  if (!currentUser) {
    $("sessionUserName").textContent = "-";
    $("sessionUserMeta").textContent = "-";
    $("senhaUsuarioEmail").value = "";
    $("securityNotice").hidden = true;
    return;
  }

  $("sessionUserName").textContent = currentUser.name;
  $("sessionUserMeta").textContent = `${formatRole(currentUser.role)} • ${currentUser.email} • ${currentUser.active ? "Ativo" : "Inativo"}`;
  $("senhaUsuarioEmail").value = currentUser.email || "";
  $("securityNotice").hidden = !currentUser.mustChangePassword;
  $("securityNotice").textContent = "Para sua segurança, altere sua senha provisória em Meu Perfil.";
}

function updateTabVisibility() {
  const adminOnlyButtons = document.querySelectorAll(".tab-btn[data-admin-only='true']");
  adminOnlyButtons.forEach((button) => {
    button.hidden = !isAdmin();
  });

  const activeButton = document.querySelector(".tab-btn.active");
  if (activeButton?.hidden) {
    const firstVisibleButton = Array.from(document.querySelectorAll(".tab-btn")).find((button) => !button.hidden);
    if (firstVisibleButton) {
      activateTab(firstVisibleButton.dataset.tab);
    }
  }
}

function updateAppVisibility() {
  const authenticated = Boolean(currentUser);
  $("authSection").hidden = authenticated;
  $("appContent").hidden = !authenticated;
}

function activateTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabId);
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
  });
}

function getProfileFromForm() {
  return {
    nomeVendedor: $("perfilNomeVendedor").value.trim(),
    telefoneVendedor: $("perfilTelefoneVendedor").value.trim(),
    emailVendedor: $("perfilEmailVendedor").value.trim(),
    empresa: $("perfilEmpresa").value.trim(),
    cnpj: $("perfilCnpj").value.trim(),
    enderecoEmpresa: $("perfilEndereco").value.trim(),
    logoDataUrl
  };
}

function applyProfileToForm(profile = {}) {
  const mergedProfile = {
    ...buildDefaultProfile(currentUser || {}),
    ...profile
  };

  $("perfilNomeVendedor").value = mergedProfile.nomeVendedor || "";
  $("perfilTelefoneVendedor").value = mergedProfile.telefoneVendedor || "";
  $("perfilEmailVendedor").value = mergedProfile.emailVendedor || "";
  $("perfilEmpresa").value = mergedProfile.empresa || "";
  $("perfilCnpj").value = mergedProfile.cnpj || "";
  $("perfilEndereco").value = mergedProfile.enderecoEmpresa || "";
  $("perfilLogo").value = "";
  logoDataUrl = mergedProfile.logoDataUrl || "";
  atualizarPreviaPerfil();
}

function atualizarPreviaPerfil() {
  const profile = getProfileFromForm();
  const prevLogo = $("prevLogo");

  $("prevEmpresa").textContent = profile.empresa || "Sua empresa";
  $("prevEmpresaCnpj").textContent = `CNPJ: ${profile.cnpj || "-"}`;
  $("prevEmpresaEndereco").textContent = `Endereço: ${profile.enderecoEmpresa || "-"}`;
  $("prevVendedorNome").textContent = profile.nomeVendedor || currentUser?.name || "-";
  $("prevVendedorContato").textContent = profile.telefoneVendedor || "-";
  $("prevVendedorEmail").textContent = profile.emailVendedor || currentUser?.email || "-";

  if (profile.logoDataUrl) {
    prevLogo.src = profile.logoDataUrl;
    prevLogo.alt = profile.empresa ? `Logo da empresa ${profile.empresa}` : "Logo da empresa";
    prevLogo.hidden = false;
  } else {
    prevLogo.hidden = true;
    prevLogo.removeAttribute("src");
  }
}

function resetPasswordForm() {
  $("senhaAtual").value = "";
  $("novaSenha").value = "";
  $("confirmarNovaSenha").value = "";
}

function loadCurrentUserProfile() {
  if (!refreshCurrentUser()) {
    applyProfileToForm({});
    return;
  }

  applyProfileToForm(currentUser.profile || buildDefaultProfile(currentUser));
  resetPasswordForm();
}

function getVisibleProposals() {
  const allProposals = getSavedProposals();
  if (isAdmin()) return allProposals;
  return allProposals.filter((item) => item.ownerId === currentUserId);
}

function getProposalById(id) {
  return getVisibleProposals().find((item) => item.id === id) || null;
}

function proposalFieldsSnapshot() {
  const ids = [
    "cliente",
    "documento",
    "email",
    "telefone",
    "obra",
    "cep",
    "endereco",
    "metragem",
    "distancia",
    "consumo",
    "precoCombustivel",
    "pedagio",
    "consumoMaquinas",
    "quantidadeVeiculos",
    "modoFuncionarios",
    "funcionarios",
    "valorDia",
    "dias",
    "encargos",
    "alimentacaoFuncionario",
    "hotelFuncionario",
    "outrosCustos",
    "lucro",
    "viagens",
    "propostaTitulo",
    "propostaNumero",
    "propostaValidade",
    "propostaCidade",
    "propostaPagamento",
    "propostaPrazo",
    "propostaResponsavel",
    "propostaTextoPadrao",
    "propostaObservacoes"
  ];

  return ids.reduce((acc, id) => {
    acc[id] = $(id).value;
    return acc;
  }, {});
}

function applyProposalSnapshot(snapshot = {}) {
  Object.keys(snapshot).forEach((id) => {
    if ($(id)) $(id).value = snapshot[id];
  });
  atualizarModoFuncionarios();
  calcularOrcamento();
}

function renderizarTabelaPropostas() {
  const tbody = $("tabelaPropostasBody");
  const list = getVisibleProposals();
  const showOwner = isAdmin();

  $("colunaPropostaVendedor").hidden = !showOwner;
  $("propostasTituloSecao").textContent = showOwner ? "Todas as propostas geradas" : "Minhas propostas salvas";
  tbody.innerHTML = "";

  if (!list.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = showOwner ? 5 : 4;
    cell.textContent = "Nenhuma proposta salva.";
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  const fragment = document.createDocumentFragment();

  list.forEach((item) => {
    const row = document.createElement("tr");
    const titulo = document.createElement("td");
    titulo.textContent = item.titulo || "-";

    const cliente = document.createElement("td");
    cliente.textContent = item.cliente || "-";

    const data = document.createElement("td");
    data.textContent = item.data || "-";

    const vendedor = document.createElement("td");
    vendedor.textContent = item.ownerName || "Sistema";
    vendedor.hidden = !showOwner;

    const actions = document.createElement("td");
    actions.className = "table-actions";

    const btnEditar = document.createElement("button");
    btnEditar.className = "btn btn-table btn-secondary";
    btnEditar.dataset.action = "editar-proposta";
    btnEditar.dataset.id = item.id;
    btnEditar.textContent = "Editar";

    const btnExcluir = document.createElement("button");
    btnExcluir.className = "btn btn-table btn-danger";
    btnExcluir.dataset.action = "excluir-proposta";
    btnExcluir.dataset.id = item.id;
    btnExcluir.textContent = "Excluir";

    actions.append(btnEditar, btnExcluir);
    row.append(titulo, cliente, data);
    if (showOwner) row.appendChild(vendedor);
    row.appendChild(actions);
    fragment.appendChild(row);
  });

  tbody.appendChild(fragment);
}

function renderDashboard() {
  if (!isAdmin()) return;

  const users = getUsers().map(mergeUserProfile);
  const sellers = users.filter((user) => user.role === ROLE_SELLER);
  const proposals = getSavedProposals();
  const tbody = $("tabelaDashboardBody");

  $("dashboardTotalVendedores").textContent = String(sellers.length);
  $("dashboardVendedoresAtivos").textContent = String(sellers.filter((user) => user.active).length);
  $("dashboardTotalPropostas").textContent = String(proposals.length);
  $("dashboardValorGlobal").textContent = formatMoney(
    proposals.reduce((acc, item) => acc + toNumber(item.total), 0)
  );

  tbody.innerHTML = "";

  if (!sellers.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "Nenhum vendedor cadastrado.";
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  const fragment = document.createDocumentFragment();

  sellers.forEach((seller) => {
    const sellerProposals = proposals.filter((item) => item.ownerId === seller.id);
    const totalValue = sellerProposals.reduce((acc, item) => acc + toNumber(item.total), 0);
    const averageTicket = sellerProposals.length ? totalValue / sellerProposals.length : 0;
    const latestTimestamp = sellerProposals.reduce((latest, item) => Math.max(latest, toNumber(item.timestamp)), 0);
    const row = document.createElement("tr");

    [
      seller.name,
      seller.active ? "Ativo" : "Inativo",
      String(sellerProposals.length),
      formatMoney(totalValue),
      formatMoney(averageTicket),
      latestTimestamp ? formatDate(latestTimestamp) : "-"
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });

    fragment.appendChild(row);
  });

  tbody.appendChild(fragment);
}

function getUserFormData() {
  return {
    name: $("usuarioNome").value.trim(),
    email: normalizeEmail($("usuarioEmail").value),
    role: $("usuarioTipo").value === ROLE_ADMIN ? ROLE_ADMIN : ROLE_SELLER,
    active: $("usuarioAtivo").checked,
    password: $("usuarioSenha").value
  };
}

function resetUserForm() {
  editingUserId = "";
  $("usuarioNome").value = "";
  $("usuarioEmail").value = "";
  $("usuarioTipo").value = ROLE_SELLER;
  $("usuarioSenha").value = "";
  $("usuarioAtivo").checked = true;
  $("btnSalvarUsuario").textContent = "Salvar usuário";
}

function renderUsersTable() {
  if (!isAdmin()) return;

  const tbody = $("tabelaUsuariosBody");
  const users = getUsers();
  tbody.innerHTML = "";

  if (!users.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "Nenhum usuário cadastrado.";
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  const fragment = document.createDocumentFragment();

  users.forEach((user) => {
    const row = document.createElement("tr");
    const actions = document.createElement("td");
    actions.className = "table-actions";

    const btnEditar = document.createElement("button");
    btnEditar.className = "btn btn-table btn-secondary";
    btnEditar.dataset.action = "editar-usuario";
    btnEditar.dataset.id = user.id;
    btnEditar.textContent = "Editar";

    const btnAlternar = document.createElement("button");
    btnAlternar.className = `btn btn-table ${user.active ? "btn-danger" : "btn-secondary"}`;
    btnAlternar.dataset.action = "alternar-usuario";
    btnAlternar.dataset.id = user.id;
    btnAlternar.textContent = user.active ? "Inativar" : "Ativar";

    actions.append(btnEditar, btnAlternar);

    [
      user.name || "-",
      user.email || "-",
      formatRole(user.role),
      user.active ? "Ativo" : "Inativo"
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });

    row.appendChild(actions);
    fragment.appendChild(row);
  });

  tbody.appendChild(fragment);
}

function carregarUsuarioPorId(id) {
  const user = getUsers().find((item) => item.id === id);
  if (!user) return;

  editingUserId = id;
  $("usuarioNome").value = user.name || "";
  $("usuarioEmail").value = user.email || "";
  $("usuarioTipo").value = user.role || ROLE_SELLER;
  $("usuarioAtivo").checked = Boolean(user.active);
  $("usuarioSenha").value = "";
  $("btnSalvarUsuario").textContent = "Atualizar usuário";
  activateTab("tabUsuarios");
  showToast("Usuário carregado para edição.");
}

function countActiveAdmins(users) {
  return users.filter((user) => user.role === ROLE_ADMIN && user.active).length;
}

async function salvarUsuario(event) {
  event?.preventDefault();
  const formData = getUserFormData();
  const users = getUsers();

  if (!formData.name || !formData.email) {
    showToast("Informe nome e e-mail do usuário.", true);
    return;
  }

  if (!editingUserId && formData.password.trim().length < 6) {
    showToast("Defina uma senha com pelo menos 6 caracteres.", true);
    return;
  }

  const duplicatedUser = users.find((user) => user.email === formData.email && user.id !== editingUserId);
  if (duplicatedUser) {
    showToast("Já existe um usuário cadastrado com este e-mail.", true);
    return;
  }

  if (editingUserId === currentUserId && isAdmin() && (!formData.active || formData.role !== ROLE_ADMIN)) {
    showToast("O administrador logado não pode remover o próprio acesso administrativo.", true);
    return;
  }

  const now = Date.now();

  if (editingUserId) {
    const index = users.findIndex((user) => user.id === editingUserId);
    if (index < 0) {
      showToast("Usuário não encontrado.", true);
      return;
    }

    const updatedUser = {
      ...users[index],
      name: formData.name,
      email: formData.email,
      role: formData.role,
      active: formData.active,
      updatedAt: now,
      profile: {
        ...buildDefaultProfile({ name: formData.name, email: formData.email }),
        ...(users[index].profile || {}),
        nomeVendedor: formData.name,
        emailVendedor: formData.email
      }
    };

    if (formData.password.trim()) {
      if (formData.password.trim().length < 6) {
        showToast("A nova senha deve ter pelo menos 6 caracteres.", true);
        return;
      }
      Object.assign(updatedUser, await createPasswordCredentials(formData.password.trim()), {
        mustChangePassword: true
      });
    }

    const nextUsers = users.map((user) => (user.id === editingUserId ? updatedUser : user));
    if (!countActiveAdmins(nextUsers)) {
      showToast("Mantenha ao menos um administrador ativo.", true);
      return;
    }

    if (!saveUsers(nextUsers)) return;
  } else {
    const user = {
      id: createUniqueId(),
      name: formData.name,
      email: formData.email,
      role: formData.role,
      active: formData.active,
      ...(await createPasswordCredentials(formData.password.trim())),
      mustChangePassword: true,
      profile: buildDefaultProfile({ name: formData.name, email: formData.email }),
      createdAt: now,
      updatedAt: now
    };

    if (!saveUsers([user, ...users])) return;
  }

  refreshCurrentUser();
  updateSessionInfo();
  resetUserForm();
  renderUsersTable();
  renderDashboard();
  showToast("Usuário salvo com sucesso.");
}

function alternarStatusUsuario(id) {
  const users = getUsers();
  const index = users.findIndex((user) => user.id === id);
  if (index < 0) return;

  const targetUser = users[index];
  if (targetUser.id === currentUserId && targetUser.role === ROLE_ADMIN) {
    showToast("O administrador logado não pode inativar a própria conta.", true);
    return;
  }

  const nextUsers = users.map((user) => user.id === id ? { ...user, active: !user.active, updatedAt: Date.now() } : user);
  if (!countActiveAdmins(nextUsers)) {
    showToast("Mantenha ao menos um administrador ativo.", true);
    return;
  }

  if (!saveUsers(nextUsers)) return;
  renderUsersTable();
  renderDashboard();
  showToast(`Usuário ${targetUser.active ? "inativado" : "ativado"} com sucesso.`);
}

function salvarPerfil() {
  if (!refreshCurrentUser()) return;

  const users = getUsers();
  const index = users.findIndex((user) => user.id === currentUserId);
  if (index < 0) return;

  const profile = getProfileFromForm();
  users[index] = {
    ...users[index],
    updatedAt: Date.now(),
    profile: {
      ...buildDefaultProfile(users[index]),
      ...profile
    }
  };

  if (!saveUsers(users)) return;
  refreshCurrentUser();
  atualizarPreviaPerfil();
  renderizarTabelaPropostas();
  renderDashboard();
  showToast("Perfil salvo com sucesso.");
}

function limparPerfil() {
  logoDataUrl = "";
  applyProfileToForm(buildDefaultProfile(currentUser || {}));
  showToast("Campos do perfil limpos.");
}

function calcularOrcamento() {
  const cliente = $("cliente").value.trim() || "-";
  const obra = $("obra").value.trim() || "-";
  const documento = $("documento").value.trim() || "-";
  const telefone = $("telefone").value.trim() || "-";
  const endereco = $("endereco").value.trim() || "-";
  const metragem = toNumber($("metragem").value);
  const distancia = toNumber($("distancia").value);
  const consumo = toNumber($("consumo").value);
  const precoCombustivel = toNumber($("precoCombustivel").value);
  const pedagio = toNumber($("pedagio").value);
  const viagens = toNumber($("viagens").value);
  const quantidadeVeiculosDigitada = parseInt($("quantidadeVeiculos").value, 10);
  const quantidadeVeiculos = quantidadeVeiculosDigitada > 0 ? quantidadeVeiculosDigitada : 1;
  const valorDia = toNumber($("valorDia").value);
  const dias = toNumber($("dias").value);
  const encargos = toNumber($("encargos").value);
  const alimentacaoFuncionario = toNumber($("alimentacaoFuncionario").value);
  const hotelFuncionario = toNumber($("hotelFuncionario").value);
  const consumoMaquinas = toNumber($("consumoMaquinas").value);
  const outrosCustos = toNumber($("outrosCustos").value);
  const lucroPercentual = toNumber($("lucro").value);
  const funcionariosAutomaticos = calcularFuncionariosPorMetragem(metragem);
  const modoFuncionarios = getModoFuncionarios();
  const funcionariosSelecionados =
    modoFuncionarios === WORKER_MODE_MANUAL
      ? Math.max(0, Math.round(toNumber($("funcionarios").value)))
      : funcionariosAutomaticos;

  if (modoFuncionarios === WORKER_MODE_AUTO) {
    $("funcionarios").value = funcionariosAutomaticos;
  } else {
    $("funcionarios").value = funcionariosSelecionados;
  }

  const multiplicadorViagens = viagens > 0 ? viagens : 1;
  const distanciaTotal = distancia * multiplicadorViagens;
  const custoCombustivel = consumo > 0 ? ((distanciaTotal / consumo) * precoCombustivel) * quantidadeVeiculos : 0;
  const custoPedagio = pedagio * multiplicadorViagens * quantidadeVeiculos;
  const custoDeslocamento = custoCombustivel + custoPedagio;
  const custoMaoDeObra = funcionariosSelecionados * valorDia * dias;
  const custoAlimentacao = funcionariosSelecionados * alimentacaoFuncionario * dias;
  const custoHotel = funcionariosSelecionados * hotelFuncionario * dias;
  const custoCombustivelMaquinas = consumoMaquinas * precoCombustivel;
  const subtotal =
    custoDeslocamento + custoMaoDeObra + custoAlimentacao + custoHotel + custoCombustivelMaquinas + encargos + outrosCustos;
  const valorLucro = subtotal * (lucroPercentual / 100);
  const total = subtotal + valorLucro;
  const valorM2 = metragem > 0 ? total / metragem : 0;
  const profile = getProfileFromForm();

  $("resCliente").textContent = cliente;
  $("resObra").textContent = `OBRA: ${obra}`;
  $("resArea").textContent = `${formatNumber(metragem)} m²`;
  $("prevClienteDocumento").textContent = `CPF/CNPJ: ${documento}`;
  $("prevClienteTelefone").textContent = `Telefone: ${telefone}`;
  $("prevEnderecoObra").textContent = `Endereço da obra: ${endereco}`;
  $("prevResponsavel").textContent = `A/C: ${$("propostaResponsavel").value.trim() || "-"}`;
  $("prevLocalData").textContent = [$("propostaCidade").value.trim(), formatDate()].filter(Boolean).join(", ");
  $("prevNumeroProposta").textContent = `Proposta Nº ${$("propostaNumero").value.trim() || "-"}`;

  $("resCombustivel").textContent = formatMoney(custoCombustivel);
  $("resPedagio").textContent = formatMoney(custoPedagio);
  $("resDeslocamento").textContent = formatMoney(custoDeslocamento);
  $("resMaoDeObra").textContent = formatMoney(custoMaoDeObra);
  $("resFuncionarios").textContent = String(funcionariosSelecionados);
  $("resAlimentacao").textContent = formatMoney(custoAlimentacao);
  $("resHotel").textContent = formatMoney(custoHotel);
  $("resCombustivelMaquinas").textContent = formatMoney(custoCombustivelMaquinas);
  $("resEncargos").textContent = formatMoney(encargos);
  $("resOutros").textContent = formatMoney(outrosCustos);
  $("resSubtotal").textContent = formatMoney(subtotal);
  $("resLucro").textContent = formatMoney(valorLucro);
  $("resTotal").textContent = formatMoney(total);
  $("resValorM2").textContent = formatMoney(valorM2);

  $("prevTitulo").textContent = $("propostaTitulo").value.trim() || "Proposta Comercial";
  $("prevValidade").textContent = $("propostaValidade").value.trim() || "-";
  $("prevPrazo").textContent = $("propostaPrazo").value.trim() || "-";
  $("prevPagamento").textContent = $("propostaPagamento").value.trim() || "-";
  $("prevTextoPadrao").textContent = getTextoPadraoProposta();
  $("prevObservacoes").textContent = `Observações: ${$("propostaObservacoes").value.trim() || "-"}`;
  $("prevVendedorNome").textContent = profile.nomeVendedor || currentUser?.name || "-";
  atualizarPreviaPerfil();

  return {
    cliente,
    obra,
    metragem,
    total,
    valorM2,
    funcionariosSelecionados
  };
}

function atualizarTextoBotaoProposta() {
  $("btnSalvarProposta").textContent = editingProposalId ? "Atualizar proposta" : "Salvar proposta";
}

function limparCampos() {
  const ids = [
    "cliente",
    "documento",
    "email",
    "telefone",
    "obra",
    "cep",
    "endereco",
    "metragem",
    "distancia",
    "consumo",
    "precoCombustivel",
    "pedagio",
    "consumoMaquinas",
    "quantidadeVeiculos",
    "modoFuncionarios",
    "funcionarios",
    "valorDia",
    "dias",
    "encargos",
    "alimentacaoFuncionario",
    "hotelFuncionario",
    "outrosCustos",
    "lucro",
    "propostaTitulo",
    "propostaNumero",
    "propostaValidade",
    "propostaCidade",
    "propostaPagamento",
    "propostaPrazo",
    "propostaResponsavel",
    "propostaTextoPadrao",
    "propostaObservacoes"
  ];

  ids.forEach((id) => {
    $(id).value = "";
  });

  $("viagens").value = 1;
  $("quantidadeVeiculos").value = 1;
  $("modoFuncionarios").value = WORKER_MODE_AUTO;
  $("propostaTextoPadrao").value = DEFAULT_STANDARD_TEXT;
  editingProposalId = "";
  atualizarModoFuncionarios({ preserveManualValue: false });
  atualizarTextoBotaoProposta();
  if (currentUserId) {
    localStorage.removeItem(getDraftStorageKey());
  }
  updateDraftStatus("Rascunho limpo deste aparelho.");
  calcularOrcamento();
  showToast("Campos limpos com sucesso.");
}

function salvarRascunhoLocal() {
  if (!currentUserId) return;

  const saved = writeJsonStorage(getDraftStorageKey(), proposalFieldsSnapshot());
  if (saved) {
    updateDraftStatus(`Rascunho salvo automaticamente às ${new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    })}.`);
  }
}

function carregarRascunhoLocal() {
  if (!currentUserId) {
    updateDraftStatus("Os dados do orçamento ficam salvos automaticamente neste aparelho.");
    return;
  }

  const currentDraftKey = getDraftStorageKey();
  let snapshot = readJsonStorage(currentDraftKey, null);

  if (!snapshot) {
    const legacySnapshot = readJsonStorage(LEGACY_DRAFT_STORAGE_KEY, null);
    if (legacySnapshot) {
      writeJsonStorage(currentDraftKey, legacySnapshot);
      localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
      snapshot = legacySnapshot;
    }
  }

  if (!snapshot) {
    updateDraftStatus("Os dados do orçamento ficam salvos automaticamente neste aparelho.");
    return;
  }

  applyProposalSnapshot(snapshot);
  updateDraftStatus("Rascunho local restaurado neste aparelho.");
}

async function salvarProposta() {
  if (!refreshCurrentUser()) return;

  const resumo = calcularOrcamento();
  if (resumo.total <= 0) {
    showToast("Preencha os valores da proposta antes de salvar.", true);
    return;
  }

  const list = getSavedProposals();
  const now = Date.now();
  const existingProposal = editingProposalId ? list.find((item) => item.id === editingProposalId) : null;
  const propostaAtualizada = {
    titulo: $("propostaTitulo").value.trim() || "Proposta sem título",
    cliente: $("cliente").value.trim() || "Cliente não informado",
    data: formatDate(now),
    timestamp: now,
    total: resumo.total,
    valorM2: resumo.valorM2,
    ownerId: existingProposal?.ownerId || currentUserId,
    ownerName: existingProposal?.ownerName || currentUser.name,
    ownerEmail: existingProposal?.ownerEmail || currentUser.email,
    snapshot: proposalFieldsSnapshot()
  };

  if (editingProposalId) {
    const index = list.findIndex((item) => item.id === editingProposalId);
    if (index < 0) {
      showToast("Proposta não encontrada.", true);
      return;
    }

    if (!isAdmin() && list[index].ownerId !== currentUserId) {
      showToast("Você não pode editar propostas de outro usuário.", true);
      return;
    }

    list[index] = {
      ...list[index],
      ...propostaAtualizada
    };
  } else {
    editingProposalId = createUniqueId();
    list.unshift({
      id: editingProposalId,
      ...propostaAtualizada
    });
  }

  if (!saveProposals(list)) return;
  renderizarTabelaPropostas();
  renderDashboard();
  atualizarTextoBotaoProposta();
  salvarRascunhoLocal();
  showToast("Proposta salva com sucesso.");
}

function carregarPropostaPorId(id) {
  const proposta = getProposalById(id);
  if (!proposta) {
    showToast("Proposta não encontrada.", true);
    return;
  }

  editingProposalId = id;
  applyProposalSnapshot(proposta.snapshot);
  atualizarTextoBotaoProposta();
  salvarRascunhoLocal();
  activateTab("tabProposta");
  showToast("Proposta carregada para edição.");
}

function excluirPropostaPorId(id) {
  const list = getSavedProposals();
  const proposal = list.find((item) => item.id === id);
  if (!proposal) return;

  if (!isAdmin() && proposal.ownerId !== currentUserId) {
    showToast("Você não pode excluir propostas de outro usuário.", true);
    return;
  }

  const updatedList = list.filter((item) => item.id !== id);
  if (!saveProposals(updatedList)) return;
  if (editingProposalId === id) {
    editingProposalId = "";
    atualizarTextoBotaoProposta();
  }
  renderizarTabelaPropostas();
  renderDashboard();
  showToast("Proposta excluída com sucesso.");
}

function gerarMensagemWhatsApp() {
  const resumo = calcularOrcamento();
  if (resumo.total <= 0) {
    showToast("Calcule um orçamento válido antes de enviar no WhatsApp.", true);
    return;
  }

  const profile = getProfileFromForm();
  const mensagem = [
    `*${$("propostaTitulo").value.trim() || "Proposta Comercial"}*`,
    "",
    `Empresa: ${profile.empresa || "-"}`,
    `CNPJ: ${profile.cnpj || "-"}`,
    `Endereço: ${profile.enderecoEmpresa || "-"}`,
    "",
    `Cliente: ${$("cliente").value.trim() || "-"}`,
    `Obra: ${$("obra").value.trim() || "-"}`,
    `Endereço da obra: ${$("endereco").value.trim() || "-"}`,
    `Área: ${$("resArea").textContent}`,
    `Valor total: ${$("resTotal").textContent}`,
    `Preço por m²: ${$("resValorM2").textContent}`,
    `Número da proposta: ${$("propostaNumero").value.trim() || "-"}`,
    `Validade: ${$("propostaValidade").value.trim() || "-"}`,
    `Prazo: ${$("propostaPrazo").value.trim() || "-"}`,
    `Pagamento: ${$("propostaPagamento").value.trim() || "-"}`,
    `A/C: ${$("propostaResponsavel").value.trim() || "-"}`,
    `Observações: ${$("propostaObservacoes").value.trim() || "-"}`,
    "",
    `Vendedor: ${profile.nomeVendedor || currentUser?.name || "-"}`,
    `Contato: ${profile.telefoneVendedor || "-"}`,
    `E-mail: ${profile.emailVendedor || currentUser?.email || "-"}`
  ].join("\n");

  window.open(`https://wa.me/?text=${encodeURIComponent(mensagem)}`, "_blank");
}

function salvarPropostaEmPdf() {
  const resumo = calcularOrcamento();
  if (resumo.total <= 0) {
    showToast("Calcule um orçamento válido antes de salvar em PDF.", true);
    return;
  }

  document.body.classList.add("print-proposal");
  try {
    window.print();
  } finally {
    window.setTimeout(() => {
      limparEstadoImpressao();
    }, PRINT_CLASS_CLEANUP_DELAY_MS);
  }
}

function limparEstadoImpressao() {
  document.body.classList.remove("print-proposal");
}

async function trocarMinhaSenha(event) {
  event?.preventDefault();
  if (!refreshCurrentUser()) return;

  const senhaAtual = $("senhaAtual").value;
  const novaSenha = $("novaSenha").value;
  const confirmarNovaSenha = $("confirmarNovaSenha").value;

  if (!senhaAtual || !novaSenha || !confirmarNovaSenha) {
    showToast("Preencha todos os campos de senha.", true);
    return;
  }

  if (novaSenha.length < 6) {
    showToast("A nova senha deve ter pelo menos 6 caracteres.", true);
    return;
  }

  if (novaSenha !== confirmarNovaSenha) {
    showToast("A confirmação da nova senha não confere.", true);
    return;
  }

  const senhaAtualValida = await verifyPassword(currentUser, senhaAtual);
  if (!senhaAtualValida) {
    showToast("A senha atual está incorreta.", true);
    return;
  }

  const users = getUsers();
  const index = users.findIndex((user) => user.id === currentUserId);
  if (index < 0) return;

  users[index] = {
    ...users[index],
    ...(await createPasswordCredentials(novaSenha)),
    mustChangePassword: false,
    updatedAt: Date.now()
  };

  if (!saveUsers(users)) return;
  refreshCurrentUser();
  resetPasswordForm();
  showToast("Senha atualizada com sucesso.");
}

async function handleLogin(event) {
  event.preventDefault();

  const email = normalizeEmail($("loginEmail").value);
  const password = $("loginSenha").value;

  if (!email || !password) {
    showToast("Informe e-mail e senha para entrar.", true);
    return;
  }

  const user = getUsers().find((item) => item.email === email);
  if (!user) {
    showToast("Usuário não encontrado.", true);
    return;
  }

  if (!user.active) {
    showToast("Este usuário está inativo. Procure o administrador.", true);
    return;
  }

  const passwordMatches = await verifyPassword(user, password);
  if (!passwordMatches) {
    showToast("Senha inválida.", true);
    return;
  }

  if (!user.passwordSalt) {
    const users = getUsers();
    const index = users.findIndex((item) => item.id === user.id);
    if (index >= 0) {
      users[index] = {
        ...users[index],
        ...(await createPasswordCredentials(password)),
        updatedAt: Date.now()
      };
      saveUsers(users);
      user.passwordHash = users[index].passwordHash;
      user.passwordSalt = users[index].passwordSalt;
      user.passwordIterations = users[index].passwordIterations;
    }
  }

  saveSession(user.id);
  currentUserId = user.id;
  currentUser = mergeUserProfile(user);
  editingProposalId = "";
  logoDataUrl = currentUser.profile.logoDataUrl || "";
  atualizarInterfaceAutenticada();
  $("loginSenha").value = "";
  if (currentUser.mustChangePassword) {
    showToast("Esta conta está com senha provisória. Atualize sua senha em Meu Perfil.");
    activateTab("tabPerfil");
    return;
  }
  showToast("Login realizado com sucesso.");
}

function handleLogout({ silent = false } = {}) {
  clearSession();
  currentUser = null;
  currentUserId = "";
  editingProposalId = "";
  logoDataUrl = "";
  updateAppVisibility();
  $("loginSenha").value = "";
  if (!silent) {
    showToast("Sessão encerrada.");
  }
}

function atualizarInterfaceAutenticada() {
  refreshCurrentUser();
  updateAppVisibility();
  updateSessionInfo();
  updateTabVisibility();
  loadCurrentUserProfile();
  resetUserForm();
  renderUsersTable();
  renderizarTabelaPropostas();
  renderDashboard();
  atualizarTextoBotaoProposta();
  atualizarModoFuncionarios({ preserveManualValue: false });
  carregarRascunhoLocal();
  if (!$("propostaTextoPadrao").value.trim()) {
    $("propostaTextoPadrao").value = DEFAULT_STANDARD_TEXT;
  }
  calcularOrcamento();
}

function restoreSession() {
  const session = getSession();
  if (!session?.userId) {
    updateAppVisibility();
    return;
  }

  const user = getUsers().find((item) => item.id === session.userId && item.active);
  if (!user) {
    clearSession();
    updateAppVisibility();
    return;
  }

  currentUserId = user.id;
  currentUser = mergeUserProfile(user);
  atualizarInterfaceAutenticada();
}

function bindStaticEvents() {
  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => {
      if (!button.hidden) activateTab(button.dataset.tab);
    });
  });

  $("loginForm").addEventListener("submit", handleLogin);
  $("profileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    salvarPerfil();
  });
  $("passwordForm").addEventListener("submit", trocarMinhaSenha);
  $("userForm").addEventListener("submit", salvarUsuario);
  $("btnLogout").addEventListener("click", () => handleLogout());
  $("btnLimparPerfil").addEventListener("click", limparPerfil);
  $("btnLimparUsuario").addEventListener("click", resetUserForm);
  $("btnCalcular").addEventListener("click", () => {
    calcularOrcamento();
    salvarRascunhoLocal();
    showToast("Orçamento atualizado.");
  });
  $("btnLimpar").addEventListener("click", limparCampos);
  $("btnBuscarCep").addEventListener("click", async () => {
    await preencherEnderecosPorCep();
    calcularOrcamento();
    salvarRascunhoLocal();
  });
  $("btnSalvarProposta").addEventListener("click", salvarProposta);
  $("btnSalvarPdf").addEventListener("click", salvarPropostaEmPdf);
  $("btnWhatsApp").addEventListener("click", gerarMensagemWhatsApp);

  $("documento").addEventListener("input", (event) => {
    event.target.value = formatarDocumento(event.target.value);
  });

  $("telefone").addEventListener("input", (event) => {
    event.target.value = formatarTelefone(event.target.value);
  });

  $("perfilTelefoneVendedor").addEventListener("input", (event) => {
    event.target.value = formatarTelefone(event.target.value);
    atualizarPreviaPerfil();
  });

  $("perfilCnpj").addEventListener("input", (event) => {
    event.target.value = formatarDocumento(event.target.value);
    atualizarPreviaPerfil();
  });

  $("cep").addEventListener("input", (event) => {
    event.target.value = formatarCep(event.target.value);
  });

  $("cep").addEventListener("blur", async () => {
    await preencherEnderecoPorCepInput({
      cepFieldId: "cep",
      enderecoFieldId: "endereco",
      labelErro: "a obra"
    });
    salvarRascunhoLocal();
  });

  $("metragem").addEventListener("input", () => {
    atualizarModoFuncionarios();
    calcularOrcamento();
    salvarRascunhoLocal();
  });

  $("modoFuncionarios").addEventListener("change", () => {
    atualizarModoFuncionarios({ preserveManualValue: false });
    calcularOrcamento();
    salvarRascunhoLocal();
  });

  $("funcionarios").addEventListener("input", () => {
    if (getModoFuncionarios() === WORKER_MODE_MANUAL) {
      calcularOrcamento();
      salvarRascunhoLocal();
    }
  });

  [
    "cliente",
    "documento",
    "email",
    "telefone",
    "obra",
    "cep",
    "endereco",
    "distancia",
    "consumo",
    "precoCombustivel",
    "pedagio",
    "consumoMaquinas",
    "quantidadeVeiculos",
    "viagens",
    "valorDia",
    "dias",
    "encargos",
    "alimentacaoFuncionario",
    "hotelFuncionario",
    "outrosCustos",
    "lucro",
    "propostaTitulo",
    "propostaNumero",
    "propostaValidade",
    "propostaCidade",
    "propostaPagamento",
    "propostaPrazo",
    "propostaResponsavel",
    "propostaTextoPadrao",
    "propostaObservacoes"
  ].forEach((id) => {
    $(id).addEventListener("input", () => {
      calcularOrcamento();
      salvarRascunhoLocal();
    });
  });

  ["perfilNomeVendedor", "perfilEmailVendedor", "perfilEmpresa", "perfilEndereco"].forEach((id) => {
    $(id).addEventListener("input", atualizarPreviaPerfil);
  });

  $("perfilLogo").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      logoDataUrl = "";
      atualizarPreviaPerfil();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      logoDataUrl = typeof reader.result === "string" ? reader.result : "";
      atualizarPreviaPerfil();
    };
    reader.readAsDataURL(file);
  });

  $("tabelaPropostasBody").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;
    if (!id) return;

    if (action === "editar-proposta") carregarPropostaPorId(id);
    if (action === "excluir-proposta") excluirPropostaPorId(id);
  });

  $("tabelaUsuariosBody").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;
    if (!id) return;

    if (action === "editar-usuario") carregarUsuarioPorId(id);
    if (action === "alternar-usuario") alternarStatusUsuario(id);
  });

  window.addEventListener("afterprint", () => {
    limparEstadoImpressao();
  });
}

async function init() {
  bindStaticEvents();
  await ensureAdminExists();
  updateAppVisibility();
  restoreSession();
  atualizarTextoBotaoProposta();
  atualizarModoFuncionarios({ preserveManualValue: false });
  if (!$("propostaTextoPadrao").value.trim()) {
    $("propostaTextoPadrao").value = DEFAULT_STANDARD_TEXT;
  }
  calcularOrcamento();
}

init();
