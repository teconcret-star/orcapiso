const $ = (id) => document.getElementById(id);

const AREA_PER_WORKER_M2 = 100;
const ROAD_DISTANCE_FACTOR = 1.25;
const MIN_DISTANCE_FOR_TOLL_KM = 80;
const TOLL_FACTOR_QUALP = 0.18;
const TOLL_FACTOR_MAPS = 0.14;

const QUALP_ROTAS_DB = {
  "01001000-20040030": { distanciaKm: 435, pedagio: 98.4, origem: "São Paulo", destino: "Rio de Janeiro" },
  "20040030-01001000": { distanciaKm: 435, pedagio: 98.4, origem: "Rio de Janeiro", destino: "São Paulo" }
};

const cacheCoordenadas = new Map();

function toNumber(value) {
  const number = parseFloat(value);
  return isNaN(number) ? 0 : number;
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

function onlyDigits(value) {
  return value.replace(/\D/g, "");
}

function normalizarCep(value) {
  return onlyDigits(value).slice(0, 8);
}

function formatarCep(value) {
  const digits = normalizarCep(value);
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

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function buscarDadosCep(cep) {
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  if (!response.ok) throw new Error("Falha ao consultar CEP.");
  const data = await response.json();
  if (data.erro) throw new Error("CEP não encontrado.");
  return data;
}

async function buscarCoordenadasCep(cep) {
  if (cacheCoordenadas.has(cep)) {
    return cacheCoordenadas.get(cep);
  }

  try {
    const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
    if (!response.ok) {
      cacheCoordenadas.set(cep, null);
      return null;
    }
    const data = await response.json();
    const coords = data?.location?.coordinates;
    if (!coords?.latitude || !coords?.longitude) {
      cacheCoordenadas.set(cep, null);
      return null;
    }
    const parsed = {
      lat: Number(coords.latitude),
      lon: Number(coords.longitude)
    };
    cacheCoordenadas.set(cep, parsed);
    return parsed;
  } catch {
    cacheCoordenadas.set(cep, null);
    return null;
  }
}

async function buscarDistanciaMaps(coordsOrigem, coordsDestino) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsOrigem.lon},${coordsOrigem.lat};${coordsDestino.lon},${coordsDestino.lat}?overview=false`;
    const response = await fetch(url);
    if (!response.ok) return 0;
    const data = await response.json();
    return data?.routes?.[0]?.distance ? data.routes[0].distance / 1000 : 0;
  } catch {
    return 0;
  }
}

function estimarPedagio(distanciaKm, tipoMapa) {
  if (distanciaKm < MIN_DISTANCE_FOR_TOLL_KM) return 0;
  const fator = tipoMapa === "QUALP" ? TOLL_FACTOR_QUALP : TOLL_FACTOR_MAPS;
  return distanciaKm * fator;
}

async function preencherEnderecoPorCep() {
  const cep = normalizarCep($("cep").value);
  if (cep.length !== 8) {
    alert("Informe um CEP válido da obra.");
    return;
  }

  try {
    const dados = await buscarDadosCep(cep);
    const endereco = [dados.logradouro, dados.bairro, `${dados.localidade}/${dados.uf}`]
      .filter(Boolean)
      .join(" - ");
    $("cep").value = formatarCep(cep);
    $("endereco").value = endereco || $("endereco").value;
  } catch (error) {
    alert(error.message || "Não foi possível buscar o CEP.");
  }
}

async function calcularRotaAutomatica() {
  const cepOrigem = normalizarCep($("cepOrigem").value);
  const cepDestino = normalizarCep($("cep").value);
  const tipoMapa = $("tipoMapa").value;

  if (cepOrigem.length !== 8 || cepDestino.length !== 8) {
    alert("Informe CEP de origem e CEP da obra para calcular a rota.");
    return;
  }

  $("cepOrigem").value = formatarCep(cepOrigem);
  $("cep").value = formatarCep(cepDestino);

  const chaveRota = `${cepOrigem}-${cepDestino}`;
  const rotaQualp = QUALP_ROTAS_DB[chaveRota];
  let distanciaKm = rotaQualp?.distanciaKm || 0;
  let pedagio = rotaQualp?.pedagio || 0;

  if (!distanciaKm) {
    const [coordsOrigem, coordsDestino] = await Promise.all([
      buscarCoordenadasCep(cepOrigem),
      buscarCoordenadasCep(cepDestino)
    ]);

    if (!coordsOrigem || !coordsDestino) {
      alert("Não foi possível localizar coordenadas para calcular a rota automática.");
      return;
    }

    const distanciaMaps = await buscarDistanciaMaps(coordsOrigem, coordsDestino);
    if (distanciaMaps > 0) {
      distanciaKm = distanciaMaps;
    } else {
      distanciaKm = haversineKm(
        coordsOrigem.lat,
        coordsOrigem.lon,
        coordsDestino.lat,
        coordsDestino.lon
      ) * ROAD_DISTANCE_FACTOR;
    }

    pedagio = estimarPedagio(distanciaKm, tipoMapa);
  }

  $("distancia").value = distanciaKm.toFixed(2);
  $("pedagio").value = pedagio.toFixed(2);
  calcularOrcamento();
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

  const funcionariosCalculados = metragem > 0 ? Math.ceil(metragem / AREA_PER_WORKER_M2) : 0;
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
    custoDeslocamento +
    custoMaoDeObra +
    custoAlimentacao +
    custoCombustivelMaquinas +
    encargos +
    outrosCustos;
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
}

function limparCampos() {
  const ids = [
    "cliente",
    "documento",
    "email",
    "telefone",
    "obra",
    "cepOrigem",
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
    "lucro"
  ];

  ids.forEach((id) => {
    $(id).value = "";
  });

  $("viagens").value = 1;
  $("tipoMapa").value = "QUALP";

  $("resCliente").textContent = "-";
  $("resObra").textContent = "-";
  $("resArea").textContent = "0,00 m²";
  $("resCombustivel").textContent = "R$ 0,00";
  $("resPedagio").textContent = "R$ 0,00";
  $("resDeslocamento").textContent = "R$ 0,00";
  $("resMaoDeObra").textContent = "R$ 0,00";
  $("resFuncionarios").textContent = "0";
  $("resAlimentacao").textContent = "R$ 0,00";
  $("resCombustivelMaquinas").textContent = "R$ 0,00";
  $("resEncargos").textContent = "R$ 0,00";
  $("resOutros").textContent = "R$ 0,00";
  $("resSubtotal").textContent = "R$ 0,00";
  $("resLucro").textContent = "R$ 0,00";
  $("resTotal").textContent = "R$ 0,00";
  $("resValorM2").textContent = "R$ 0,00";
}

$("documento").addEventListener("input", (event) => {
  event.target.value = formatarDocumento(event.target.value);
});

$("telefone").addEventListener("input", (event) => {
  event.target.value = formatarTelefone(event.target.value);
});

$("cep").addEventListener("input", (event) => {
  event.target.value = formatarCep(event.target.value);
});

$("cepOrigem").addEventListener("input", (event) => {
  event.target.value = formatarCep(event.target.value);
});

$("cep").addEventListener("blur", preencherEnderecoPorCep);

$("metragem").addEventListener("input", () => {
  const metragem = toNumber($("metragem").value);
  $("funcionarios").value = metragem > 0 ? Math.ceil(metragem / AREA_PER_WORKER_M2) : 0;
});

$("btnCalcular").addEventListener("click", calcularOrcamento);
$("btnLimpar").addEventListener("click", limparCampos);
$("btnBuscarCep").addEventListener("click", preencherEnderecoPorCep);
$("btnRota").addEventListener("click", calcularRotaAutomatica);
