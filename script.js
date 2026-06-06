const $ = (id) => document.getElementById(id);

const M2_PER_WORKER = 100;
const PROFILE_STORAGE_KEY = "proposta_perfil_v1";
const PROFILES_STORAGE_KEY = "proposta_perfis_v1";
const PROPOSALS_STORAGE_KEY = "propostas_salvas_v1";
const DRAFT_STORAGE_KEY = "proposta_rascunho_v1";
const WORKER_MODE_AUTO = "auto";
const WORKER_MODE_MANUAL = "manual";
// Fallback delay to clear print mode when canceling print in browsers that may skip afterprint (e.g. some Safari/Firefox flows).
const PRINT_CLASS_CLEANUP_DELAY_MS = 500;

let logoDataUrl = "";
let toastTimeoutId;
let editingProfileId = "";
let editingProposalId = "";

function toNumber(value) {
  const number = parseFloat(value);
  return Number.isNaN(number) ? 0 : number;
}

function onlyDigits(value) {
  return (value || "").replace(/\D/g, "");
}

function formatMoney(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatNumber(value) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function createUniqueId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
    return;
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
  const results = await Promise.all([
    preencherEnderecoPorCepInput({
      cepFieldId: "cepOrigem",
      enderecoFieldId: "enderecoOrigem",
      labelErro: "a unidade base",
      alertOnError: false
    }),
    preencherEnderecoPorCepInput({
      cepFieldId: "cep",
      enderecoFieldId: "endereco",
      labelErro: "a obra",
      alertOnError: false
    })
  ]);

  if (results.some(Boolean)) {
    showToast("Endereços atualizados com sucesso.");
  } else {
    showToast("Não foi possível preencher os endereços. Revise os CEPs informados.", true);
  }
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

function getSavedProfiles() {
  const profiles = readJsonStorage(PROFILES_STORAGE_KEY, null);
  if (Array.isArray(profiles)) return profiles;

  const legacyProfile = readJsonStorage(PROFILE_STORAGE_KEY, null);
  if (!legacyProfile || typeof legacyProfile !== "object") return [];

  const migratedProfiles = [{
    id: createUniqueId(),
    ...legacyProfile,
    data: new Date().toLocaleDateString("pt-BR")
  }];

  saveProfiles(migratedProfiles);
  localStorage.removeItem(PROFILE_STORAGE_KEY);
  return migratedProfiles;
}

function saveProfiles(list) {
  return writeJsonStorage(PROFILES_STORAGE_KEY, list);
}

function atualizarTextoBotaoPerfil() {
  $("btnSalvarPerfil").textContent = editingProfileId ? "Atualizar perfil" : "Salvar perfil";
}

function applyProfileToForm(profile = {}) {
  $("perfilNomeVendedor").value = profile.nomeVendedor || "";
  $("perfilTelefoneVendedor").value = profile.telefoneVendedor || "";
  $("perfilEmailVendedor").value = profile.emailVendedor || "";
  $("perfilEmpresa").value = profile.empresa || "";
  $("perfilCnpj").value = profile.cnpj || "";
  $("perfilEndereco").value = profile.enderecoEmpresa || "";
  logoDataUrl = profile.logoDataUrl || "";
  atualizarPreviaPerfil();
}

function atualizarPreviaPerfil() {
  const profile = getProfileFromForm();
  const prevLogo = $("prevLogo");

  $("prevEmpresa").textContent = profile.empresa || "Sua empresa";
  $("prevEmpresaCnpj").textContent = `CNPJ: ${profile.cnpj || "-"}`;
  $("prevEmpresaEndereco").textContent = `Endereço: ${profile.enderecoEmpresa || "-"}`;
  $("prevVendedorNome").textContent = profile.nomeVendedor || "-";
  $("prevVendedorContato").textContent = profile.telefoneVendedor || "-";
  $("prevVendedorEmail").textContent = profile.emailVendedor || "-";

  if (profile.logoDataUrl) {
    prevLogo.src = profile.logoDataUrl;
    prevLogo.alt = profile.empresa ? `Logo da empresa ${profile.empresa}` : "Logo da empresa";
    prevLogo.hidden = false;
  } else {
    prevLogo.hidden = true;
    prevLogo.removeAttribute("src");
  }
}

function renderizarTabelaPerfis() {
  const tbody = $("tabelaPerfisBody");
  const list = getSavedProfiles();

  tbody.innerHTML = "";

  if (!list.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "Nenhum perfil salvo.";
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  const fragment = document.createDocumentFragment();

  list.forEach((item) => {
    const row = document.createElement("tr");
    const vendedor = document.createElement("td");
    vendedor.textContent = item.nomeVendedor || "-";

    const empresa = document.createElement("td");
    empresa.textContent = item.empresa || "-";

    const contato = document.createElement("td");
    contato.textContent = item.telefoneVendedor || item.emailVendedor || "-";

    const actions = document.createElement("td");
    actions.className = "table-actions";

    const btnEditar = document.createElement("button");
    btnEditar.className = "btn btn-table btn-secondary";
    btnEditar.dataset.action = "editar-perfil";
    btnEditar.dataset.id = item.id;
    btnEditar.textContent = "Editar";

    const btnExcluir = document.createElement("button");
    btnExcluir.className = "btn btn-table btn-danger";
    btnExcluir.dataset.action = "excluir-perfil";
    btnExcluir.dataset.id = item.id;
    btnExcluir.textContent = "Excluir";

    actions.append(btnEditar, btnExcluir);
    row.append(vendedor, empresa, contato, actions);
    fragment.appendChild(row);
  });

  tbody.appendChild(fragment);
}

function salvarPerfil() {
  const profile = getProfileFromForm();
  const list = getSavedProfiles();
  const now = Date.now();

  if (editingProfileId) {
    const index = list.findIndex((item) => item.id === editingProfileId);
    if (index >= 0) {
      list[index] = {
        ...list[index],
        ...profile
      };
    }
  } else {
    editingProfileId = createUniqueId();
    list.unshift({
      id: editingProfileId,
      ...profile,
      data: new Date(now).toLocaleDateString("pt-BR"),
      timestamp: now
    });
  }

  if (!saveProfiles(list)) return;
  atualizarPreviaPerfil();
  renderizarTabelaPerfis();
  atualizarTextoBotaoPerfil();
  showToast("Perfil salvo com sucesso.");
}

function carregarPerfil() {
  const profile = getSavedProfiles()[0];
  if (!profile) return;
  editingProfileId = profile.id;
  applyProfileToForm(profile);
  atualizarTextoBotaoPerfil();
}

function carregarPerfilPorId(id) {
  const profile = getSavedProfiles().find((item) => item.id === id);
  if (!profile) return;
  editingProfileId = id;
  applyProfileToForm(profile);
  atualizarTextoBotaoPerfil();
  showToast("Perfil carregado para edição.");
}

function excluirPerfilPorId(id) {
  const list = getSavedProfiles().filter((item) => item.id !== id);
  if (!saveProfiles(list)) return;
  if (editingProfileId === id) {
    editingProfileId = "";
    applyProfileToForm({});
    $("perfilLogo").value = "";
  }
  renderizarTabelaPerfis();
  atualizarTextoBotaoPerfil();
  showToast("Perfil excluído com sucesso.");
}

function limparPerfil() {
  editingProfileId = "";
  applyProfileToForm({});
  $("perfilLogo").value = "";
  renderizarTabelaPerfis();
  atualizarTextoBotaoPerfil();
  showToast("Campos do perfil limpos.");
}

function calcularOrcamento() {
  const cliente = $("cliente").value.trim() || "-";
  const obra = $("obra").value.trim() || "-";
  const metragem = toNumber($("metragem").value);
  const distancia = toNumber($("distancia").value);
  const consumo = toNumber($("consumo").value);
  const precoCombustivel = toNumber($("precoCombustivel").value);
  const pedagio = toNumber($("pedagio").value);
  const viagens = toNumber($("viagens").value);
  const valorDia = toNumber($("valorDia").value);
  const dias = toNumber($("dias").value);
  const encargos = toNumber($("encargos").value);
  const alimentacaoFuncionario = toNumber($("alimentacaoFuncionario").value);
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
  const custoCombustivel = consumo > 0 ? (distanciaTotal / consumo) * precoCombustivel : 0;
  const custoPedagio = pedagio * multiplicadorViagens;
  const custoDeslocamento = custoCombustivel + custoPedagio;
  const custoMaoDeObra = funcionariosSelecionados * valorDia * dias;
  const custoAlimentacao = funcionariosSelecionados * alimentacaoFuncionario * dias;
  const custoCombustivelMaquinas = consumoMaquinas * precoCombustivel;
  const subtotal =
    custoDeslocamento + custoMaoDeObra + custoAlimentacao + custoCombustivelMaquinas + encargos + outrosCustos;
  const valorLucro = subtotal * (lucroPercentual / 100);
  const total = subtotal + valorLucro;
  const valorM2 = metragem > 0 ? total / metragem : 0;

  $("resCliente").textContent = cliente;
  $("resObra").textContent = obra;
  $("resArea").textContent = `${formatNumber(metragem)} m²`;

  $("resCombustivel").textContent = formatMoney(custoCombustivel);
  $("resPedagio").textContent = formatMoney(custoPedagio);
  $("resDeslocamento").textContent = formatMoney(custoDeslocamento);
  $("resMaoDeObra").textContent = formatMoney(custoMaoDeObra);
  $("resFuncionarios").textContent = String(funcionariosSelecionados);
  $("resAlimentacao").textContent = formatMoney(custoAlimentacao);
  $("resCombustivelMaquinas").textContent = formatMoney(custoCombustivelMaquinas);
  $("resEncargos").textContent = formatMoney(encargos);
  $("resOutros").textContent = formatMoney(outrosCustos);
  $("resSubtotal").textContent = formatMoney(subtotal);
  $("resLucro").textContent = formatMoney(valorLucro);
  $("resTotal").textContent = formatMoney(total);
  $("resValorM2").textContent = formatMoney(valorM2);

  $("prevTitulo").textContent = $("propostaTitulo").value.trim() || "-";
  $("prevValidade").textContent = $("propostaValidade").value.trim() || "-";
  $("prevPrazo").textContent = $("propostaPrazo").value.trim() || "-";
  $("prevPagamento").textContent = $("propostaPagamento").value.trim() || "-";
  $("prevObservacoes").textContent = `Observações: ${$("propostaObservacoes").value.trim() || "-"}`;
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

function limparCampos() {
  const ids = [
    "cliente",
    "documento",
    "email",
    "telefone",
    "obra",
    "cepOrigem",
    "enderecoOrigem",
    "cep",
    "endereco",
    "metragem",
    "distancia",
    "consumo",
    "precoCombustivel",
    "pedagio",
    "consumoMaquinas",
    "modoFuncionarios",
    "funcionarios",
    "valorDia",
    "dias",
    "encargos",
    "alimentacaoFuncionario",
    "outrosCustos",
    "lucro",
    "propostaTitulo",
    "propostaValidade",
    "propostaPagamento",
    "propostaPrazo",
    "propostaObservacoes"
  ];

  ids.forEach((id) => {
    $(id).value = "";
  });

  $("viagens").value = 1;
  $("modoFuncionarios").value = WORKER_MODE_AUTO;
  editingProposalId = "";
  atualizarModoFuncionarios({ preserveManualValue: false });
  atualizarTextoBotaoProposta();
  localStorage.removeItem(DRAFT_STORAGE_KEY);
  updateDraftStatus("Rascunho limpo deste aparelho.");
  calcularOrcamento();
  showToast("Campos limpos com sucesso.");
}

function proposalFieldsSnapshot() {
  const ids = [
    "cliente",
    "documento",
    "email",
    "telefone",
    "obra",
    "cepOrigem",
    "enderecoOrigem",
    "cep",
    "endereco",
    "metragem",
    "distancia",
    "consumo",
    "precoCombustivel",
    "pedagio",
    "consumoMaquinas",
    "modoFuncionarios",
    "funcionarios",
    "valorDia",
    "dias",
    "encargos",
    "alimentacaoFuncionario",
    "outrosCustos",
    "lucro",
    "viagens",
    "propostaTitulo",
    "propostaValidade",
    "propostaPagamento",
    "propostaPrazo",
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

function getSavedProposals() {
  return readJsonStorage(PROPOSALS_STORAGE_KEY, []);
}

function saveProposals(list) {
  return writeJsonStorage(PROPOSALS_STORAGE_KEY, list);
}

function salvarRascunhoLocal() {
  const saved = writeJsonStorage(DRAFT_STORAGE_KEY, proposalFieldsSnapshot());

  if (saved) {
    updateDraftStatus(`Rascunho salvo automaticamente às ${new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    })}.`);
  }
}

function carregarRascunhoLocal() {
  const snapshot = readJsonStorage(DRAFT_STORAGE_KEY, null);

  if (!snapshot) {
    updateDraftStatus("Os dados do orçamento ficam salvos automaticamente neste aparelho.");
    return;
  }

  applyProposalSnapshot(snapshot);
  updateDraftStatus("Rascunho local restaurado neste aparelho.");
}

function atualizarTextoBotaoProposta() {
  $("btnSalvarProposta").textContent = editingProposalId ? "Atualizar proposta" : "Salvar proposta";
}

function renderizarTabelaPropostas() {
  const tbody = $("tabelaPropostasBody");
  const list = getSavedProposals();

  tbody.innerHTML = "";

  if (!list.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
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
    row.append(titulo, cliente, data, actions);
    fragment.appendChild(row);
  });

  tbody.appendChild(fragment);
}

function salvarProposta() {
  const resumo = calcularOrcamento();

  if (resumo.total <= 0) {
    showToast("Preencha os valores da proposta antes de salvar.", true);
    return;
  }

  const list = getSavedProposals();
  const now = Date.now();
  const propostaAtualizada = {
    titulo: $("propostaTitulo").value.trim() || "Proposta sem título",
    cliente: $("cliente").value.trim() || "Cliente não informado",
    data: new Date(now).toLocaleDateString("pt-BR"),
    timestamp: now,
    snapshot: proposalFieldsSnapshot()
  };

  if (editingProposalId) {
    const index = list.findIndex((item) => item.id === editingProposalId);
    if (index >= 0) {
      list[index] = {
        ...list[index],
        ...propostaAtualizada
      };
    }
  } else {
    editingProposalId = createUniqueId();
    list.unshift({
      id: editingProposalId,
      ...propostaAtualizada
    });
  }

  if (!saveProposals(list)) return;
  renderizarTabelaPropostas();
  atualizarTextoBotaoProposta();
  salvarRascunhoLocal();
  showToast("Proposta salva no armazenamento local.");
}

function carregarPropostaPorId(id) {
  const proposta = getSavedProposals().find((item) => item.id === id);
  if (!proposta) {
    showToast("Proposta não encontrada.", true);
    return;
  }

  editingProposalId = id;
  applyProposalSnapshot(proposta.snapshot);
  atualizarTextoBotaoProposta();
  salvarRascunhoLocal();
  showToast("Proposta carregada para edição.");
}

function excluirPropostaPorId(id) {
  const list = getSavedProposals().filter((item) => item.id !== id);
  if (!saveProposals(list)) return;
  if (editingProposalId === id) {
    editingProposalId = "";
    atualizarTextoBotaoProposta();
  }
  renderizarTabelaPropostas();
  showToast("Proposta excluída do armazenamento local.");
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
    `Área: ${$("resArea").textContent}`,
    `Valor total: ${$("resTotal").textContent}`,
    `Preço por m²: ${$("resValorM2").textContent}`,
    `Validade: ${$("propostaValidade").value.trim() || "-"}`,
    `Prazo: ${$("propostaPrazo").value.trim() || "-"}`,
    `Pagamento: ${$("propostaPagamento").value.trim() || "-"}`,
    `Observações: ${$("propostaObservacoes").value.trim() || "-"}`,
    "",
    `Vendedor: ${profile.nomeVendedor || "-"}`,
    `Contato: ${profile.telefoneVendedor || "-"}`,
    `E-mail: ${profile.emailVendedor || "-"}`
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

function ativarTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((btn) => btn.classList.remove("active"));
      panels.forEach((panel) => panel.classList.remove("active"));
      button.classList.add("active");
      $(button.dataset.tab).classList.add("active");
    });
  });
}

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

$("cepOrigem").addEventListener("input", (event) => {
  event.target.value = formatarCep(event.target.value);
});

$("cepOrigem").addEventListener("blur", async () => {
  await preencherEnderecoPorCepInput({
    cepFieldId: "cepOrigem",
    enderecoFieldId: "enderecoOrigem",
    labelErro: "a unidade base"
  });
  salvarRascunhoLocal();
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
  "cepOrigem",
  "enderecoOrigem",
  "cep",
  "endereco",
  "distancia",
  "consumo",
  "precoCombustivel",
  "pedagio",
  "consumoMaquinas",
  "viagens",
  "valorDia",
  "dias",
  "encargos",
  "alimentacaoFuncionario",
  "outrosCustos",
  "lucro",
  "propostaTitulo",
  "propostaValidade",
  "propostaPagamento",
  "propostaPrazo",
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

$("btnSalvarPerfil").addEventListener("click", salvarPerfil);
$("btnLimparPerfil").addEventListener("click", limparPerfil);
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
$("tabelaPerfisBody").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;
  if (!id) return;

  if (action === "editar-perfil") carregarPerfilPorId(id);
  if (action === "excluir-perfil") excluirPerfilPorId(id);
});

$("tabelaPropostasBody").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;
  if (!id) return;

  if (action === "editar-proposta") carregarPropostaPorId(id);
  if (action === "excluir-proposta") excluirPropostaPorId(id);
});

window.addEventListener("afterprint", () => {
  limparEstadoImpressao();
});

ativarTabs();
carregarPerfil();
renderizarTabelaPerfis();
renderizarTabelaPropostas();
atualizarTextoBotaoPerfil();
atualizarTextoBotaoProposta();
atualizarModoFuncionarios({ preserveManualValue: false });
carregarRascunhoLocal();
calcularOrcamento();
