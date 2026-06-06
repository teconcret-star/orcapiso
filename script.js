const $ = (id) => document.getElementById(id);

const M2_PER_WORKER = 100;
const PROFILE_STORAGE_KEY = "proposta_perfil_v1";
const PROPOSALS_STORAGE_KEY = "propostas_salvas_v1";

let logoDataUrl = "";

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
    if (alertOnError) alert(`Informe um CEP válido de 8 dígitos para ${labelErro}.`);
    return;
  }

  try {
    const dados = await buscarDadosCep(cep);
    const endereco = [dados.logradouro, dados.bairro, `${dados.localidade}/${dados.uf}`]
      .filter(Boolean)
      .join(" - ");
    cepEl.value = formatarCep(cep);
    enderecoEl.value = endereco || enderecoEl.value;
  } catch (error) {
    if (alertOnError) alert(error.message || "Não foi possível buscar o CEP.");
  }
}

async function preencherEnderecosPorCep() {
  await Promise.all([
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
    prevLogo.hidden = false;
  } else {
    prevLogo.hidden = true;
    prevLogo.removeAttribute("src");
  }
}

function salvarPerfil() {
  const profile = getProfileFromForm();
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  atualizarPreviaPerfil();
  alert("Perfil salvo com sucesso.");
}

function carregarPerfil() {
  const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) return;
  try {
    applyProfileToForm(JSON.parse(raw));
  } catch {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
  }
}

function limparPerfil() {
  applyProfileToForm({});
  $("perfilLogo").value = "";
  localStorage.removeItem(PROFILE_STORAGE_KEY);
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

  const funcionariosCalculados = calcularFuncionariosPorMetragem(metragem);
  $("funcionarios").value = funcionariosCalculados;

  const multiplicadorViagens = viagens > 0 ? viagens : 1;
  const distanciaTotal = distancia * multiplicadorViagens;
  const custoCombustivel = consumo > 0 ? (distanciaTotal / consumo) * precoCombustivel : 0;
  const custoPedagio = pedagio * multiplicadorViagens;
  const custoDeslocamento = custoCombustivel + custoPedagio;
  const custoMaoDeObra = funcionariosCalculados * valorDia * dias;
  const custoAlimentacao = funcionariosCalculados * alimentacaoFuncionario * dias;
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
  $("resFuncionarios").textContent = String(funcionariosCalculados);
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
  calcularOrcamento();
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
  calcularOrcamento();
}

function getSavedProposals() {
  try {
    return JSON.parse(localStorage.getItem(PROPOSALS_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveProposals(list) {
  localStorage.setItem(PROPOSALS_STORAGE_KEY, JSON.stringify(list));
}

function atualizarListaPropostas() {
  const select = $("propostasSalvas");
  const list = getSavedProposals();

  select.innerHTML = '<option value="">Selecione uma proposta salva</option>';

  list.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.titulo} - ${item.cliente} (${item.data})`;
    select.appendChild(option);
  });
}

function salvarProposta() {
  calcularOrcamento();
  const list = getSavedProposals();
  const now = new Date();
  const proposta = {
    id: String(now.getTime()),
    titulo: $("propostaTitulo").value.trim() || "Proposta sem título",
    cliente: $("cliente").value.trim() || "Cliente não informado",
    data: now.toLocaleDateString("pt-BR"),
    snapshot: proposalFieldsSnapshot()
  };

  list.unshift(proposta);
  saveProposals(list);
  atualizarListaPropostas();
  $("propostasSalvas").value = proposta.id;
  alert("Proposta salva no armazenamento local.");
}

function carregarPropostaSelecionada() {
  const id = $("propostasSalvas").value;
  if (!id) {
    alert("Selecione uma proposta para carregar.");
    return;
  }

  const proposta = getSavedProposals().find((item) => item.id === id);
  if (!proposta) {
    alert("Proposta não encontrada.");
    return;
  }

  applyProposalSnapshot(proposta.snapshot);
}

function excluirPropostaSelecionada() {
  const id = $("propostasSalvas").value;
  if (!id) {
    alert("Selecione uma proposta para excluir.");
    return;
  }

  const list = getSavedProposals().filter((item) => item.id !== id);
  saveProposals(list);
  atualizarListaPropostas();
}

function gerarMensagemWhatsApp() {
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
});

$("cep").addEventListener("blur", async () => {
  await preencherEnderecoPorCepInput({
    cepFieldId: "cep",
    enderecoFieldId: "endereco",
    labelErro: "a obra"
  });
});

$("metragem").addEventListener("input", () => {
  $("funcionarios").value = calcularFuncionariosPorMetragem(toNumber($("metragem").value));
});

[
  "cliente",
  "obra",
  "metragem",
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
  $(id).addEventListener("input", calcularOrcamento);
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
    logoDataUrl = String(reader.result || "");
    atualizarPreviaPerfil();
  };
  reader.readAsDataURL(file);
});

$("btnSalvarPerfil").addEventListener("click", salvarPerfil);
$("btnLimparPerfil").addEventListener("click", limparPerfil);
$("btnCalcular").addEventListener("click", calcularOrcamento);
$("btnLimpar").addEventListener("click", limparCampos);
$("btnBuscarCep").addEventListener("click", async () => {
  await preencherEnderecosPorCep();
});
$("btnSalvarProposta").addEventListener("click", salvarProposta);
$("btnCarregarProposta").addEventListener("click", carregarPropostaSelecionada);
$("btnExcluirProposta").addEventListener("click", excluirPropostaSelecionada);
$("btnWhatsApp").addEventListener("click", gerarMensagemWhatsApp);

ativarTabs();
carregarPerfil();
atualizarListaPropostas();
calcularOrcamento();
