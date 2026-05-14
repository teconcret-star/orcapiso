const $ = (id) => document.getElementById(id);

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

function calcularOrcamento() {
  const cliente = $("cliente").value.trim() || "-";
  const obra = $("obra").value.trim() || "-";
  const metragem = toNumber($("metragem").value);
  const distancia = toNumber($("distancia").value);
  const consumo = toNumber($("consumo").value);
  const precoCombustivel = toNumber($("precoCombustivel").value);
  const pedagio = toNumber($("pedagio").value);
  const viagens = toNumber($("viagens").value);
  const funcionarios = toNumber($("funcionarios").value);
  const valorDia = toNumber($("valorDia").value);
  const dias = toNumber($("dias").value);
  const encargos = toNumber($("encargos").value);
  const outrosCustos = toNumber($("outrosCustos").value);
  const lucroPercentual = toNumber($("lucro").value);

  const distanciaTotal = distancia * (viagens > 0 ? viagens : 1);
  const custoCombustivel = consumo > 0 ? (distanciaTotal / consumo) * precoCombustivel : 0;
  const custoPedagio = pedagio * (viagens > 0 ? viagens : 1);
  const custoDeslocamento = custoCombustivel + custoPedagio;
  const custoMaoDeObra = funcionarios * valorDia * dias;
  const subtotal = custoDeslocamento + custoMaoDeObra + encargos + outrosCustos;
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
    "obra",
    "endereco",
    "metragem",
    "distancia",
    "consumo",
    "precoCombustivel",
    "pedagio",
    "funcionarios",
    "valorDia",
    "dias",
    "encargos",
    "outrosCustos",
    "lucro"
  ];

  ids.forEach((id) => {
    $(id).value = "";
  });

  $("viagens").value = 1;

  $("resCliente").textContent = "-";
  $("resObra").textContent = "-";
  $("resArea").textContent = "0,00 m²";
  $("resCombustivel").textContent = "R$ 0,00";
  $("resPedagio").textContent = "R$ 0,00";
  $("resDeslocamento").textContent = "R$ 0,00";
  $("resMaoDeObra").textContent = "R$ 0,00";
  $("resEncargos").textContent = "R$ 0,00";
  $("resOutros").textContent = "R$ 0,00";
  $("resSubtotal").textContent = "R$ 0,00";
  $("resLucro").textContent = "R$ 0,00";
  $("resTotal").textContent = "R$ 0,00";
  $("resValorM2").textContent = "R$ 0,00";
}

$("btnCalcular").addEventListener("click", calcularOrcamento);
$("btnLimpar").addEventListener("click", limparCampos);