const $ = (id) => document.getElementById(id);

const M2_PER_WORKER = 100;
const ROAD_DISTANCE_FACTOR = 1.25;
const MIN_DISTANCE_FOR_TOLL_KM = 80;
const TOLL_FACTOR_QUALP = 0.18;
const TOLL_FACTOR_MAPS = 0.14;
const AUTO_ROUTE_DEBOUNCE_MS = 500;
const QUALP_ROUTE_SP_RJ = { distanciaKm: 435, pedagio: 98.4, origem: "São Paulo", destino: "Rio de Janeiro" };
const QUALP_ROUTE_RJ_SP = { distanciaKm: 435, pedagio: 98.4, origem: "Rio de Janeiro", destino: "São Paulo" };

const QUALP_ROTAS_DB = {
  "01001000-20040030": QUALP_ROUTE_SP_RJ,
  "20040030-01001000": QUALP_ROUTE_RJ_SP
};

const cacheCoordenadas = new Map();
let rotaAutomaticaTimeout = null;
let ultimaChaveRotaAutomatica = "";

// ── Google Maps ─────────────────────────────────────────────────────────────

const GMAPS_KEY_STORAGE = "gmaps_api_key";
let googleMapsLoaded = false;
let mapInstance = null;
let mapaOverlays = [];

function getGoogleMapsKey() {
  return localStorage.getItem(GMAPS_KEY_STORAGE) || "";
}

function atualizarStatusChave() {
  const key = getGoogleMapsKey();
  const el = $("statusChave");
  if (key) {
    el.textContent = "✅ Chave configurada";
    el.style.color = "var(--success)";
  } else {
    el.textContent = "⚠️ Nenhuma chave configurada";
    el.style.color = "var(--muted)";
  }
}

function salvarChaveGoogleMaps() {
  const key = $("gmapsKey").value.trim();
  if (!key) {
    alert("Informe uma chave de API válida.");
    return;
  }
  localStorage.setItem(GMAPS_KEY_STORAGE, key);
  $("gmapsKey").value = "";
  googleMapsLoaded = false;
  atualizarStatusChave();
}

function limparChaveGoogleMaps() {
  localStorage.removeItem(GMAPS_KEY_STORAGE);
  $("gmapsKey").value = "";
  googleMapsLoaded = false;
  mapInstance = null;
  atualizarStatusChave();
}

function carregarScriptGoogleMaps() {
  if (googleMapsLoaded && window.google && window.google.maps) {
    return Promise.resolve();
  }

  const key = getGoogleMapsKey();
  if (!key) {
    return Promise.reject(
      new Error(
        'Chave da API do Google Maps não configurada. Expanda "⚙️ Configuração — Google Maps API" no topo da página para configurar.'
      )
    );
  }

  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      googleMapsLoaded = true;
      resolve();
      return;
    }

    window._gmapsReady = () => {
      googleMapsLoaded = true;
      resolve();
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry&callback=_gmapsReady`;
    script.async = true;
    script.onerror = () =>
      reject(
        new Error(
          "Falha ao carregar a API do Google Maps. Verifique se a chave de API está correta e se as APIs 'Routes API' e 'Maps JavaScript API' estão ativadas no Google Cloud Console."
        )
      );
    document.head.appendChild(script);
  });
}

async function calcularRotaGoogleMaps(cepOrigem, cepDestino) {
  const key = getGoogleMapsKey();
  if (!key) throw new Error("Chave da API do Google Maps não configurada.");

  const fmt = (cep) => `${cep.slice(0, 5)}-${cep.slice(5)}, Brasil`;

  const response = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.travelAdvisory.tollInfo,routes.polyline.encodedPolyline"
      },
      body: JSON.stringify({
        origin: { address: fmt(cepOrigem) },
        destination: { address: fmt(cepDestino) },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        extraComputations: ["TOLLS"],
        routeModifiers: {
          vehicleInfo: { emissionType: "DIESEL" }
        }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      err?.error?.message || `Erro ao consultar Google Maps (HTTP ${response.status}).`
    );
  }

  const data = await response.json();
  const route = data?.routes?.[0];
  if (!route) throw new Error("Nenhuma rota encontrada pelo Google Maps para os CEPs informados.");

  const distanciaKm = (route.distanceMeters || 0) / 1000;

  const tollPrices = route.travelAdvisory?.tollInfo?.estimatedPrice || [];
  const brlToll = tollPrices.find((p) => p.currencyCode === "BRL");
  let pedagio = 0;
  if (brlToll) {
    const units = Number(brlToll.units || "0");
    const nanos = Number(brlToll.nanos || "0");
    pedagio = units + nanos / 1_000_000_000;
  }

  return {
    distanciaKm,
    pedagio,
    semPedagio: !brlToll,
    polyline: route.polyline?.encodedPolyline || null
  };
}

function exibirRotaNoMapa(encodedPolyline, info) {
  const container = $("mapaContainer");
  const mapaEl = $("mapa");
  container.style.display = "block";

  mapaOverlays.forEach((o) => o.setMap(null));
  mapaOverlays = [];

  if (!mapInstance) {
    mapInstance = new google.maps.Map(mapaEl, {
      zoom: 8,
      center: { lat: -15.7801, lng: -47.9292 },
      mapTypeId: "roadmap"
    });
  } else {
    google.maps.event.trigger(mapInstance, "resize");
  }

  const path = google.maps.geometry.encoding.decodePath(encodedPolyline);

  const polyline = new google.maps.Polyline({
    path,
    geodesic: true,
    strokeColor: "#0f766e",
    strokeOpacity: 1.0,
    strokeWeight: 5
  });
  polyline.setMap(mapInstance);
  mapaOverlays.push(polyline);

  const bounds = new google.maps.LatLngBounds();
  path.forEach((p) => bounds.extend(p));
  mapInstance.fitBounds(bounds);

  const markerOrigem = new google.maps.Marker({
    position: path[0],
    map: mapInstance,
    title: "Origem"
  });
  const markerDestino = new google.maps.Marker({
    position: path[path.length - 1],
    map: mapInstance,
    title: "Destino"
  });
  mapaOverlays.push(markerOrigem, markerDestino);

  $("mapaInfo").textContent = info || "";
  container.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function calcularFuncionariosPorMetragem(metragem) {
  return metragem > 0 ? Math.ceil(metragem / M2_PER_WORKER) : 0;
}

function isModoManualLogistica() {
  const modoLogistica = $("modoLogistica");
  return modoLogistica ? modoLogistica.value === "MANUAL" : false;
}

function atualizarModoLogistica() {
  const manual = isModoManualLogistica();
  $("btnRota").disabled = manual;

  if (manual) {
    ultimaChaveRotaAutomatica = "";
    if (rotaAutomaticaTimeout) {
      clearTimeout(rotaAutomaticaTimeout);
      rotaAutomaticaTimeout = null;
    }
    $("mapaContainer").style.display = "none";
    $("mapaInfo").textContent = "";
    mapaOverlays.forEach((o) => o.setMap(null));
    mapaOverlays = [];
    return;
  }

  agendarCalculoRotaAutomatica();
}

async function preencherEnderecoPorCepInput({
  cepFieldId,
  enderecoFieldId,
  labelErro,
  alertOnError = true
}) {
  const cepEl = $(cepFieldId);
  const enderecoEl = $(enderecoFieldId);
  if (!cepEl || !enderecoEl) {
    if (alertOnError) {
      alert("Não foi possível localizar os campos de CEP/endereço para preencher automaticamente.");
    }
    return;
  }

  const cep = normalizarCep(cepEl.value);
  if (cep.length !== 8) {
    if (alertOnError) {
      alert(`Informe um CEP válido de 8 dígitos para ${labelErro}.`);
    }
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
    if (alertOnError) {
      alert(error.message || "Não foi possível buscar o CEP.");
    }
  }
}

async function preencherEnderecoPorCep(alertOnError = true) {
  await preencherEnderecoPorCepInput({
    cepFieldId: "cep",
    enderecoFieldId: "endereco",
    labelErro: "a obra",
    alertOnError
  });
}

async function preencherEnderecoOrigemPorCep(alertOnError = true) {
  await preencherEnderecoPorCepInput({
    cepFieldId: "cepOrigem",
    enderecoFieldId: "enderecoOrigem",
    labelErro: "a unidade base",
    alertOnError
  });
}

async function preencherEnderecosPorCep() {
  await Promise.all([
    preencherEnderecoOrigemPorCep(false),
    preencherEnderecoPorCep(false)
  ]);
}

function agendarCalculoRotaAutomatica() {
  if (isModoManualLogistica()) {
    return;
  }

  const cepOrigem = normalizarCep($("cepOrigem").value);
  const cepDestino = normalizarCep($("cep").value);
  if (cepOrigem.length !== 8 || cepDestino.length !== 8) {
    return;
  }

  const chave = `${cepOrigem}-${cepDestino}-${$("tipoMapa").value}`;
  if (chave === ultimaChaveRotaAutomatica) {
    return;
  }

  if (rotaAutomaticaTimeout) {
    clearTimeout(rotaAutomaticaTimeout);
  }

  rotaAutomaticaTimeout = setTimeout(async () => {
    const sucesso = await calcularRotaAutomatica({ silent: true });
    if (sucesso) {
      ultimaChaveRotaAutomatica = chave;
    }
  }, AUTO_ROUTE_DEBOUNCE_MS);
}

async function calcularRotaAutomatica(options = {}) {
  const { silent = false } = options;

  if (isModoManualLogistica()) {
    if (!silent) {
      alert("Modo manual ativo: informe distância e pedágio manualmente.");
    }
    return false;
  }

  const cepOrigem = normalizarCep($("cepOrigem").value);
  const cepDestino = normalizarCep($("cep").value);
  const tipoMapa = $("tipoMapa").value;

  if (cepOrigem.length !== 8 || cepDestino.length !== 8) {
    if (!silent) {
      alert("Informe o CEP de origem e o CEP da obra (ambos com 8 dígitos) para calcular a rota.");
    }
    return false;
  }

  $("cepOrigem").value = formatarCep(cepOrigem);
  $("cep").value = formatarCep(cepDestino);

  const btn = $("btnRota");
  const textoOriginal = btn.textContent;
  btn.textContent = "Calculando…";
  btn.disabled = true;

  try {
    if (tipoMapa === "GOOGLEMAPS") {
      await carregarScriptGoogleMaps();
      const resultado = await calcularRotaGoogleMaps(cepOrigem, cepDestino);

      $("distancia").value = resultado.distanciaKm.toFixed(2);
      $("pedagio").value = resultado.pedagio.toFixed(2);

      const infoMapa = resultado.semPedagio
        ? `Distância: ${formatNumber(resultado.distanciaKm)} km — Pedágio: R$ 0,00 (nenhum pedágio identificado nesta rota pelo Google Maps)`
        : `Distância: ${formatNumber(resultado.distanciaKm)} km — Pedágio estimado: ${formatMoney(resultado.pedagio)}`;

      if (resultado.polyline) {
        exibirRotaNoMapa(resultado.polyline, infoMapa);
      }

      calcularOrcamento();
      return true;
    }

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
        if (!silent) {
          alert("Não foi possível localizar coordenadas para um ou ambos os CEPs. Verifique os CEPs ou preencha distância e pedágio manualmente.");
        }
        return false;
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
    return true;
  } catch (error) {
    if (!silent) {
      alert(error.message || "Erro ao calcular rota.");
    }
    return false;
  } finally {
    btn.textContent = textoOriginal;
    btn.disabled = false;
  }
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
    "lucro"
  ];

  ids.forEach((id) => {
    $(id).value = "";
  });

  $("viagens").value = 1;
  $("tipoMapa").value = "QUALP";
  $("modoLogistica").value = "AUTOMATICO";
  $("btnRota").disabled = false;
  ultimaChaveRotaAutomatica = "";
  if (rotaAutomaticaTimeout) {
    clearTimeout(rotaAutomaticaTimeout);
    rotaAutomaticaTimeout = null;
  }

  $("mapaContainer").style.display = "none";
  mapaOverlays.forEach((o) => o.setMap(null));
  mapaOverlays = [];

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

$("cepOrigem").addEventListener("blur", async () => {
  await preencherEnderecoOrigemPorCep();
  agendarCalculoRotaAutomatica();
});
$("cep").addEventListener("blur", async () => {
  await preencherEnderecoPorCep();
  agendarCalculoRotaAutomatica();
});

$("metragem").addEventListener("input", () => {
  const metragem = toNumber($("metragem").value);
  $("funcionarios").value = calcularFuncionariosPorMetragem(metragem);
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
  "lucro"
].forEach((id) => {
  $(id).addEventListener("input", calcularOrcamento);
});

$("cep").addEventListener("input", agendarCalculoRotaAutomatica);
$("cepOrigem").addEventListener("input", agendarCalculoRotaAutomatica);
$("tipoMapa").addEventListener("change", () => {
  ultimaChaveRotaAutomatica = "";
  agendarCalculoRotaAutomatica();
});
$("modoLogistica").addEventListener("change", atualizarModoLogistica);

$("btnCalcular").addEventListener("click", calcularOrcamento);
$("btnLimpar").addEventListener("click", limparCampos);
$("btnBuscarCep").addEventListener("click", async () => {
  await preencherEnderecosPorCep();
  agendarCalculoRotaAutomatica();
});
$("btnRota").addEventListener("click", calcularRotaAutomatica);
$("btnSalvarChave").addEventListener("click", salvarChaveGoogleMaps);
$("btnLimparChave").addEventListener("click", limparChaveGoogleMaps);

// Initialize Google Maps key status on load
atualizarStatusChave();
atualizarModoLogistica();
