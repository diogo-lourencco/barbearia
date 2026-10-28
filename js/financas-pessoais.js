"use strict";

document.addEventListener("DOMContentLoaded", async () => {

  const KEY = "minhas_financas_pessoais_completo_v2";
  const $ = id => document.getElementById(id);

  const campos = [
    "wallets", "transactions", "bills", "goals",
    "cards", "purchases", "recurring", "transfers",
    "goalMoves", "invoicePayments"
  ];

  const inicial = () => Object.fromEntries(
    campos.map(campo => [campo, []])
  );

  function normalizar(dados) {
    const resultado = inicial();

    for (const chave of campos) {
      resultado[chave] = Array.isArray(dados?.[chave])
        ? dados[chave]
        : [];
    }

    return resultado;
  }

  function lerLocal() {
    try {
      const texto = localStorage.getItem(KEY);
      return texto ? normalizar(JSON.parse(texto)) : inicial();
    } catch {
      return inicial();
    }
  }

  function possuiRegistros(dados) {
    return campos.some(chave => dados[chave]?.length > 0);
  }

  // A cópia antiga é capturada ANTES de qualquer
  // requisição e não pode ser perdida na inicialização.
  const copiaLocalInicial = lerLocal();

  let db = inicial();
  let revisao = 0;
  let carregado = false;
  let salvando = false;
  let pagina = "dashboard";
  let modalTipo = "";
  let editandoId = "";
  let acaoMeta = "deposit";
  let contextoFatura = null;

  const monthInput = $("month");

  const obrigatorios = [
    "month", "stats", "chart", "upcoming",
    "goalOverview", "recent", "txRows",
    "txSearch", "txType", "txWallet",
    "billRows", "billStats", "goalCards",
    "creditCards", "invoices", "recurringRows",
    "recurringStats", "walletCards",
    "transferList", "nav", "pages",
    "pageTitle", "pageSubtitle", "modal",
    "modalTitle", "modalFields", "modalForm",
    "closeModal", "cancelModal", "csvBtn",
    "mobileMenuToggle", "personalSidebar",
    "mobileMenuBackdrop", "toast",
    "financeReferenceLabel", "financeAlertSummary",
    "financeDeadlineAlerts", "financeExportCalendar",
    "financeBillFilter"
  ];

  const ausentes = obrigatorios.filter(id => !$(id));

  if (ausentes.length) {
    console.error(
      "Elementos ausentes no pessoal-app.html:",
      ausentes
    );

    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div style="background:#4b2930;color:white;padding:20px">
        O HTML de Minhas Finanças está incompleto:
        ${ausentes.join(", ")}
      </div>`
    );

    return;
  }

  /* =====================================================
     FUNÇÕES BÁSICAS
  ===================================================== */

  function hoje() {
    const d = new Date();

    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0")
    ].join("-");
  }

  function reais(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function esc(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function dataBR(valor) {
    const texto = String(valor || "").slice(0, 10);

    return /^\d{4}-\d{2}-\d{2}$/.test(texto)
      ? texto.split("-").reverse().join("/")
      : "-";
  }

  function gerarId() {
    return window.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random()}`;
  }

  function mesAtual() {
    return hoje().slice(0, 7);
  }

  function deslocarMes(mes, quantidade) {
    const [ano, numero] = mes.split("-").map(Number);
    const data = new Date(ano, numero - 1 + quantidade, 1);

    return [
      data.getFullYear(),
      String(data.getMonth() + 1).padStart(2, "0")
    ].join("-");
  }

  function valorValido(valor) {
    const numero = Number(valor);

    if (
      String(valor).trim() === "" ||
      !Number.isFinite(numero) ||
      numero <= 0
    ) {
      throw new Error("Informe um valor maior que zero.");
    }

    if (
      Math.abs(numero * 100 - Math.round(numero * 100)) >
      0.000001
    ) {
      throw new Error("Use no máximo duas casas decimais.");
    }

    return Math.round(numero * 100) / 100;
  }

  function saldoInicial(valor) {
    if (String(valor).trim() === "") {
      throw new Error("Informe o saldo inicial.");
    }

    const numero = Number(valor);

    if (!Number.isFinite(numero)) {
      throw new Error("Saldo inicial inválido.");
    }

    if (
      Math.abs(numero * 100 - Math.round(numero * 100)) >
      0.000001
    ) {
      throw new Error("Use no máximo duas casas decimais.");
    }

    return Math.round(numero * 100) / 100;
  }

  function diaValido(valor) {
    const numero = Number(valor);

    if (
      !Number.isInteger(numero) ||
      numero < 1 ||
      numero > 28
    ) {
      throw new Error("Informe um dia entre 1 e 28.");
    }

    return numero;
  }

  function dataValida(valor) {
    const texto = String(valor || "");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
      throw new Error("Data inválida.");
    }

    const [ano, mes, dia] = texto.split("-").map(Number);
    const data = new Date(ano, mes - 1, dia);

    if (
      data.getFullYear() !== ano ||
      data.getMonth() + 1 !== mes ||
      data.getDate() !== dia
    ) {
      throw new Error("Data inválida.");
    }

    return texto;
  }

  function textoObrigatorio(valor, nome) {
    const texto = String(valor || "").trim();

    if (!texto) {
      throw new Error(`Informe ${nome}.`);
    }

    return texto;
  }

  function encontrar(colecao, id) {
    return db[colecao].find(
      item => String(item.id) === String(id)
    );
  }

  function icones() {
    if (window.lucide?.createIcons) {
      window.lucide.createIcons();
    }
  }

  function aviso(mensagem) {
    const el = $("toast");

    el.textContent = mensagem;
    el.classList.add("show");

    clearTimeout(aviso.timer);

    aviso.timer = setTimeout(() => {
      el.classList.remove("show");
    }, 4000);
  }

  // Mensagem permanente: não fica dependente do toast.
  const status = document.createElement("div");

  status.id = "personalSystemStatus";
  status.setAttribute("role", "alert");
  status.style.cssText = [
    "display:none",
    "padding:14px 16px",
    "margin-bottom:18px",
    "border:1px solid #FF7A85",
    "border-radius:12px",
    "background:#40262D",
    "color:#FFFFFF",
    "font-size:13px",
    "line-height:1.6"
  ].join(";");

  $("pages").before(status);

  function mostrarErro(mensagem) {
    status.style.display = "block";
    status.textContent = mensagem;
  }

  function limparErro() {
    status.style.display = "none";
    status.textContent = "";
  }

  function cacheLocal() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (erro) {
      console.warn("Cache local indisponível:", erro);
    }
  }

  /* =====================================================
     API E SEGURANÇA
  ===================================================== */

  async function carregarDados(guardarCache = true) {
    const resposta = await WJ.api("/financas-pessoais");

    if (
      !resposta ||
      typeof resposta !== "object"
    ) {
      throw new Error("Resposta inválida do servidor.");
    }

    const novaRevisao = Number(resposta.revisao ?? 0);

    if (!Number.isFinite(novaRevisao)) {
      throw new Error("Revisão financeira inválida.");
    }

    db = normalizar(resposta.dados);
    revisao = novaRevisao;
    carregado = true;

    if (guardarCache) cacheLocal();
  }

  async function gravarDados() {
    const resposta = await WJ.api("/financas-pessoais", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dados: db,
        revisao
      })
    });

    const novaRevisao = Number(resposta?.revisao);

    if (!Number.isFinite(novaRevisao)) {
      throw new Error(
        "O servidor não confirmou a revisão salva."
      );
    }

    revisao = novaRevisao;
    cacheLocal();
  }

  function erroConflito(erro) {
    return (
      Number(erro?.status) === 409 ||
      /revis[aã]o|outra aba|\b409\b/i.test(
        String(erro?.message || "")
      )
    );
  }

  async function atualizar(operacao) {
    if (!carregado) {
      aviso("Os dados ainda não foram carregados.");
      return false;
    }

    if (salvando) {
      aviso("Aguarde o salvamento anterior.");
      return false;
    }

    salvando = true;
    const copiaAnterior = JSON.stringify(db);

    try {
      operacao();
      await gravarDados();
      limparErro();
      renderizar();
      return true;

    } catch (erro) {
      console.error("Erro financeiro:", erro);

      if (erroConflito(erro)) {
        try {
          await carregarDados();
          renderizar();

          mostrarErro(
            "Os dados foram alterados em outra aba. " +
            "Confira os valores antes de tentar novamente."
          );

        } catch {
          db = JSON.parse(copiaAnterior);
          renderizar();

          mostrarErro(
            "Não foi possível sincronizar os dados. " +
            "Atualize a página antes de continuar."
          );
        }

      } else {
        db = JSON.parse(copiaAnterior);
        renderizar();

        mostrarErro(
          erro.message ||
          "Não foi possível salvar. Confira os dados."
        );
      }

      // Nunca repetimos operações financeiras
      // automaticamente após um conflito.
      return false;

    } finally {
      salvando = false;
    }
  }

  /* =====================================================
     SALDOS E CÁLCULOS
  ===================================================== */

  function nomeCarteira(id) {
    return encontrar("wallets", id)?.name ||
      "Conta removida";
  }

  function nomeCartao(id) {
    return encontrar("cards", id)?.name ||
      "Cartão removido";
  }

  function saldoCarteira(id) {
    const carteira = encontrar("wallets", id);

    if (!carteira) return 0;

    let saldo = Number(carteira.initial || 0);

    db.transactions.forEach(item => {
      if (item.walletId !== id) return;

      saldo += item.type === "Receita"
        ? Number(item.amount)
        : -Number(item.amount);
    });

    db.transfers.forEach(item => {
      if (item.from === id) saldo -= Number(item.amount);
      if (item.to === id) saldo += Number(item.amount);
    });

    db.goalMoves.forEach(item => {
      if (item.walletId !== id) return;

      saldo += item.kind === "withdraw"
        ? Number(item.amount)
        : -Number(item.amount);
    });

    return Math.round(saldo * 100) / 100;
  }

  function saldoMeta(id) {
    return db.goalMoves
      .filter(item => item.goalId === id)
      .reduce((soma, item) => {
        return soma + (
          item.kind === "withdraw"
            ? -Number(item.amount)
            : Number(item.amount)
        );
      }, 0);
  }

  function totaisMes(mes = monthInput.value) {
    const itens = db.transactions.filter(
      item => String(item.date).slice(0, 7) === mes
    );

    const somar = tipo => itens
      .filter(item => item.type === tipo)
      .reduce(
        (soma, item) => soma + Number(item.amount),
        0
      );

    return {
      receitas: somar("Receita"),
      despesas: somar("Despesa")
    };
  }

  /* =====================================================
     PRAZOS E ALERTAS (DATAS LOCAIS SEM FUSO)
  ===================================================== */

  function diferencaDias(data, referencia = hoje()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data))) return NaN;
    const utc = texto => {
      const [ano, mes, dia] = texto.split("-").map(Number);
      return Date.UTC(ano, mes - 1, dia);
    };
    return Math.round((utc(data) - utc(referencia)) / 86400000);
  }

  function rotuloPrazo(dias) {
    if (!Number.isFinite(dias)) return "Data inválida";
    if (dias < 0) return `Atrasado há ${-dias} dia${dias === -1 ? "" : "s"}`;
    if (dias === 0) return "Vence hoje";
    if (dias === 1) return "Vence amanhã";
    return `Faltam ${dias} dias`;
  }

  function urgenciaPrazo(dias) {
    if (dias < 0) return "late";
    if (dias === 0) return "today";
    if (dias <= 3) return "soon";
    return "future";
  }

  // Faturas são calculadas por mês de compra, como no módulo atual.
  // Gera apenas os meses com parcelas efetivamente registradas.
  function mesesComFaturas() {
    const mesesPorCartao = new Map();
    db.purchases.forEach(compra => {
      if (!encontrar("cards", compra.cardId)) return;
      const inicio = String(compra.date || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(inicio)) return;
      const lista = mesesPorCartao.get(compra.cardId) || new Set();
      const numero = Math.min(48, Math.max(0, Number(compra.installments) || 0));
      for (let indice = 0; indice < numero; indice++) {
        lista.add(deslocarMes(inicio, indice));
      }
      mesesPorCartao.set(compra.cardId, lista);
    });
    return mesesPorCartao;
  }

  function prazosPendentes(incluirFuturos = false) {
    const alertas = [];

    db.bills.forEach(item => {
      if (item.status === "done" || !item.due) return;
      const dias = diferencaDias(item.due);
      if (!Number.isFinite(dias) || (!incluirFuturos && dias > 7)) return;
      alertas.push({
        tipo: "bill", id: String(item.id), data: item.due,
        dias, titulo: item.description, valor: Number(item.amount),
        classe: item.type === "Receber" ? "receive" : "pay",
        natureza: item.type === "Receber" ? "A receber" : "A pagar"
      });
    });

    for (const [cartaoId, meses] of mesesComFaturas()) {
      const cartao = encontrar("cards", cartaoId);
      if (!cartao || cartao.archived) continue;
      for (const mes of meses) {
        const data = `${mes}-${String(cartao.dueDay).padStart(2, "0")}`;
        const dias = diferencaDias(data);
        if (!Number.isFinite(dias) || (!incluirFuturos && dias > 7)) continue;
        if (faturaPaga(cartaoId, mes)) continue;
        const valor = Math.round(valorFatura(cartaoId, mes) * 100) / 100;
        if (!(valor > 0)) continue;
        alertas.push({
          tipo: "invoice", id: String(cartaoId), mes, data,
          dias, titulo: `Fatura: ${cartao.name} (${mes.slice(5)}/${mes.slice(0, 4)})`,
          valor, classe: "pay", natureza: "Cartão"
        });
      }
    }

    db.goals.forEach(item => {
      if (!item.deadline) return;
      const falta = Number(item.target) - saldoMeta(item.id);
      if (!(falta > 0.005)) return;
      const dias = diferencaDias(item.deadline);
      if (!Number.isFinite(dias) || (!incluirFuturos && dias > 7)) return;
      alertas.push({
        tipo: "goal", id: String(item.id), data: item.deadline,
        dias, titulo: item.name, valor: falta,
        classe: "goal", natureza: "Meta: falta guardar"
      });
    });

    return alertas.sort((a, b) =>
      a.dias - b.dias || a.data.localeCompare(b.data) ||
      a.titulo.localeCompare(b.titulo, "pt-BR")
    );
  }

  function renderAlertas() {
    const itens = prazosPendentes();
    const atrasados = itens.filter(item => item.dias < 0);
    const hojeItens = itens.filter(item => item.dias === 0);
    const proximos = itens.filter(item => item.dias > 0);
    const aPagar = itens.filter(item => item.classe === "pay" && item.dias >= 0)
      .reduce((soma, item) => soma + item.valor, 0);

    $("financeAlertSummary").innerHTML = `
      <div class="finance-alert-count ${atrasados.length ? "critical" : ""}">
        <strong>${atrasados.length}</strong><span>Atrasados</span>
      </div>
      <div class="finance-alert-count ${hojeItens.length ? "critical" : ""}">
        <strong>${hojeItens.length}</strong><span>Vencem hoje</span>
      </div>
      <div class="finance-alert-count">
        <strong>${proximos.length}</strong><span>Próximos 7 dias</span>
      </div>
      <div class="finance-alert-count">
        <strong>${reais(aPagar)}</strong><span>A pagar nos próximos 7 dias (inclui cartão)</span>
      </div>
    `;

    $("financeDeadlineAlerts").innerHTML = itens.length
      ? itens.slice(0, 12).map(item => {
          const botaoAlerta = item.tipo === "bill"
            ? botao("settle-bill", item.id,
                item.classe === "receive" ? "Confirmar recebimento" : "Confirmar pagamento")
            : item.tipo === "invoice"
              ? `<button type="button" class="small-btn" data-action="pay-alert-invoice"
                   data-id="${esc(item.id)}" data-month="${esc(item.mes)}">
                   <i data-lucide="credit-card"></i><span>Ver e pagar</span>
                 </button>`
              : botao("contribute", item.id, "Guardar dinheiro");
          return `
            <div class="finance-deadline-item ${urgenciaPrazo(item.dias)}">
              <div class="finance-deadline-main">
                <span class="finance-deadline-tag ${urgenciaPrazo(item.dias)}">
                  ${esc(rotuloPrazo(item.dias))}
                </span>
                <strong>${esc(item.titulo)}</strong>
                <small>${esc(item.natureza)} · ${dataBR(item.data)}</small>
              </div>
              <div class="finance-deadline-side">
                <strong>${reais(item.valor)}</strong>
                ${botaoAlerta}
              </div>
            </div>`;
        }).join("") + (itens.length > 12
          ? `<p class="finance-extra-alerts">Mais ${itens.length - 12} compromissos. Confira Contas, Cartões e Metas.</p>`
          : "")
      : `<div class="finance-all-clear"><i data-lucide="check-circle-2"></i>
          Nenhuma conta, fatura ou meta atrasada ou com prazo nos próximos 7 dias.</div>`;
  }

  function textoICal(valor) {
    return String(valor ?? "").replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  }

  function exportarAlertasICal() {
    const eventos = prazosPendentes(true);
    if (!eventos.length) {
      aviso("Cadastre contas, metas com prazo ou compras no cartão primeiro.");
      return;
    }

    const agora = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const proximoDia = data => {
      const [ano, mes, dia] = data.split("-").map(Number);
      return new Date(Date.UTC(ano, mes - 1, dia + 1))
        .toISOString().slice(0, 10).replace(/-/g, "");
    };
    const linhas = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Barbearia WJ//Minhas Financas//PT-BR",
      "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Minhas Financas - prazos"
    ];

    eventos.forEach(item => {
      const identificador = [item.tipo, item.id, item.mes || ""]
        .join("-").replace(/[^a-zA-Z0-9_-]/g, "-");
      linhas.push(
        "BEGIN:VEVENT",
        `UID:wj-financas-${identificador}@local`,
        `DTSTAMP:${agora}`,
        `DTSTART;VALUE=DATE:${item.data.replace(/-/g, "")}`,
        `DTEND;VALUE=DATE:${proximoDia(item.data)}`,
        `SUMMARY:${textoICal(`${item.natureza}: ${item.titulo}`)}`,
        `DESCRIPTION:${textoICal(`${reais(item.valor)} | ${rotuloPrazo(item.dias)}. Confirme no aplicativo Minhas Finanças.`)}`,
        "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY",
        "DESCRIPTION:Compromisso financeiro amanhã", "END:VALARM",
        "END:VEVENT"
      );
    });
    linhas.push("END:VCALENDAR", "");
    const arquivo = new Blob([linhas.join("\r\n")], {
      type: "text/calendar;charset=utf-8"
    });
    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");
    link.href = url;
    link.download = `minhas-financas-prazos-${hoje()}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    aviso(`${eventos.length} compromisso(s) exportados. Importe no calendário para configurar avisos.`);
  }

  /* =====================================================
     CARTÕES E PARCELAS
  ===================================================== */

  function parcelasFatura(cartaoId, mes) {
    return db.purchases.flatMap(compra => {
      if (compra.cardId !== cartaoId) return [];

      const inicio = String(compra.date).slice(0, 7);
      const quantidade = Number(compra.installments);

      const diferenca = (
        Number(mes.slice(0, 4)) -
        Number(inicio.slice(0, 4))
      ) * 12 +
        Number(mes.slice(5)) -
        Number(inicio.slice(5));

      if (
        diferenca < 0 ||
        diferenca >= quantidade ||
        quantidade <= 0
      ) {
        return [];
      }

      return [{
        ...compra,
        installment: diferenca + 1,
        value: Number(compra.amount) / quantidade
      }];
    });
  }

  function valorFatura(cartaoId, mes) {
    return parcelasFatura(cartaoId, mes)
      .reduce((soma, item) => soma + item.value, 0);
  }

  function faturaPaga(cartaoId, mes) {
    return db.invoicePayments.find(
      item =>
        item.cardId === cartaoId &&
        item.month === mes
    );
  }

  function comprometido(cartaoId) {
    let total = 0;

    db.purchases
      .filter(item => item.cardId === cartaoId)
      .forEach(compra => {
        const inicio = String(compra.date).slice(0, 7);
        const parcelas = Number(compra.installments);

        for (let i = 0; i < parcelas; i++) {
          const mes = deslocarMes(inicio, i);

          if (!faturaPaga(cartaoId, mes)) {
            total += Number(compra.amount) / parcelas;
          }
        }
      });

    return total;
  }

  /* =====================================================
     CONTAS RECORRENTES
  ===================================================== */

  function contaDoMes(item, mes) {
    return db.bills.find(
      conta =>
        conta.recurringId === item.id &&
        conta.period === mes
    );
  }

  function criarContaDoMes(item, mes) {
    if (!item.active || contaDoMes(item, mes)) {
      return false;
    }

    const dia = diaValido(item.day);
    const valor = valorValido(item.amount);

    db.bills.push({
      id: gerarId(),
      type: "Pagar",
      due: `${mes}-${String(dia).padStart(2, "0")}`,
      description: item.name,
      category: item.category,
      amount: valor,
      status: "pending",
      recurringId: item.id,
      period: mes
    });

    return true;
  }

  async function gerarFixos() {
    const mes = mesAtual();

    const faltantes = db.recurring.filter(
      item => item.active && !contaDoMes(item, mes)
    );

    if (!faltantes.length) return;

    const sucesso = await atualizar(() => {
      db.recurring.forEach(item => {
        if (item.active && !contaDoMes(item, mes)) {
          criarContaDoMes(item, mes);
        }
      });
    });

    if (sucesso) {
      aviso("Contas fixas do mês atualizadas.");
    }
  }

  /* =====================================================
     COMPONENTES
  ===================================================== */

  const actionIcons = {
    "edit-transaction": "pencil",
    "delete-transaction": "trash-2",
    "settle-bill": "check-circle",
    "edit-bill": "pencil",
    "delete-bill": "trash-2",
    "contribute": "piggy-bank",
    "withdraw-goal": "arrow-up-right",
    "edit-goal": "pencil",
    "delete-goal": "trash-2",
    "new-purchase": "shopping-bag",
    "edit-card": "pencil",
    "delete-card": "archive",
    "pay-invoice": "receipt",
    "generate-recurring": "file-plus",
    "toggle-recurring": "repeat",
    "edit-recurring": "pencil",
    "delete-recurring": "trash-2",
    "edit-wallet": "pencil",
    "delete-wallet": "trash-2"
  };

  function botao(acao, id, nome) {
    return `
      <button
        type="button"
        class="small-btn"
        data-action="${esc(acao)}"
        data-id="${esc(id)}"
      >
        <i data-lucide="${actionIcons[acao] || "circle"}"></i>
        <span>${esc(nome)}</span>
      </button>
    `;
  }

  function vazio(mensagem) {
    return `<div class="empty">${esc(mensagem)}</div>`;
  }

  function linha(titulo, detalhe, conteudo) {
    return `
      <div class="list-row">
        <div>
          <strong>${esc(titulo)}</strong>
          <small>${esc(detalhe)}</small>
        </div>
        <div class="right">${conteudo}</div>
      </div>
    `;
  }

  /* =====================================================
     DASHBOARD
  ===================================================== */

  function renderDashboard() {
    const totais = totaisMes();
    $("financeReferenceLabel").textContent =
      `Resumo de ${monthInput.value.split("-").reverse().join("/")}. ` +
      "Contas futuras não entram nas despesas até serem confirmadas.";
    renderAlertas();

    const disponivel = db.wallets.reduce(
      (soma, carteira) =>
        soma + saldoCarteira(carteira.id),
      0
    );

    const cards = [
      ["Entrou no mês", totais.receitas, "green", "Receitas confirmadas"],
      ["Saiu no mês", totais.despesas, "red", "Despesas já registradas"],
      ["Sobrou no mês", totais.receitas - totais.despesas,
        totais.receitas >= totais.despesas ? "green" : "red",
        "Entradas menos saídas no período"],
      ["Saldo nas contas", disponivel, "", "Saldos atuais de suas carteiras"]
    ];

    $("stats").innerHTML = cards.map(item => `
      <article class="stat">
        <span>${esc(item[0])}</span>
        <strong class="${item[2]}">
          ${reais(item[1])}
        </strong>
        <small>${esc(item[3])}</small>
      </article>
    `).join("");

    const meses = Array.from(
      { length: 6 },
      (_, i) => deslocarMes(monthInput.value, i - 5)
    );

    const maior = Math.max(
      1,
      ...meses.flatMap(mes => {
        const t = totaisMes(mes);
        return [t.receitas, t.despesas];
      })
    );

    $("chart").innerHTML = meses.map(mes => {
      const t = totaisMes(mes);

      const a = Math.max(2, t.receitas / maior * 160);
      const b = Math.max(2, t.despesas / maior * 160);

      return `
        <div class="chart-col">
          <div class="chart-bars">

            <div
              class="chart-bar"
              style="height:${a}px"
              title="Receitas: ${reais(t.receitas)}"
            ></div>

            <div
              class="chart-bar expense"
              style="height:${b}px"
              title="Despesas: ${reais(t.despesas)}"
            ></div>

          </div>
          <span class="chart-label">
            ${mes.slice(5)}/${mes.slice(2, 4)}
          </span>
        </div>
      `;
    }).join("");

    const proximas = db.bills
      .filter(item => item.status !== "done")
      .slice()
      .sort((a, b) => a.due.localeCompare(b.due))
      .slice(0, 5);

    $("upcoming").innerHTML = proximas.length
      ? proximas.map(item =>
          linha(
            item.description,
            `${dataBR(item.due)} · ${item.type} · ${rotuloPrazo(diferencaDias(item.due))}`,
            `<strong>${reais(item.amount)}</strong>`
          )
        ).join("")
      : vazio("Nenhuma conta pendente.");

    $("goalOverview").innerHTML = db.goals.length
      ? db.goals.slice(0, 4).map(item => {
          const saldo = saldoMeta(item.id);

          const percentual = Math.min(
            100,
            Math.max(
              0,
              saldo / Number(item.target) * 100
            )
          );

          return `
            <div style="margin-bottom:14px">
              <div class="list-row">
                <strong>${esc(item.name)}</strong>

                <span>
                  ${reais(saldo)} /
                  ${reais(item.target)}
                </span>
              </div>

              <div class="progress">
                <span style="width:${percentual}%"></span>
              </div>
            </div>
          `;
        }).join("")
      : vazio("Nenhuma meta cadastrada.");

    const recentes = db.transactions
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);

    $("recent").innerHTML = recentes.length
      ? recentes.map(item =>
          linha(
            item.description,
            `${dataBR(item.date)} · ${
              nomeCarteira(item.walletId)
            }`,
            `<strong class="${
              item.type === "Receita" ? "green" : "red"
            }">${reais(item.amount)}</strong>`
          )
        ).join("")
      : vazio("Nenhuma movimentação registrada.");
  }

  /* =====================================================
     MOVIMENTAÇÕES
  ===================================================== */

  function renderTransactions() {
    const filtro = $("txSearch").value
      .trim()
      .toLocaleLowerCase("pt-BR");

    const tipo = $("txType").value;
    const carteira = $("txWallet").value;

    $("txWallet").innerHTML = `

      <option value="">Todas as contas</option>

      ${db.wallets.map(item => `
        <option value="${esc(item.id)}">
          ${esc(item.name)}
        </option>
      `).join("")}
    `;

    $("txWallet").value = carteira;

    const registros = db.transactions
      .filter(item => {
        const texto = [
          item.description,
          item.category
        ].join(" ").toLocaleLowerCase("pt-BR");

        return (
          String(item.date).slice(0, 7) === monthInput.value &&
          (!tipo || item.type === tipo) &&
          (!carteira || item.walletId === carteira) &&
          texto.includes(filtro)
        );
      })
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));

    $("txRows").innerHTML = registros.length
      ? registros.map(item => `
        <tr>
          <td>${dataBR(item.date)}</td>
          <td>${esc(item.description)}</td>
          <td>${esc(item.category)}</td>
          <td>${esc(nomeCarteira(item.walletId))}</td>
          <td>${esc(item.payment || "-")}</td>

          <td class="${
            item.type === "Receita" ? "green" : "red"
          }">
            ${reais(item.amount)}
          </td>

          <td>
            <div class="row-actions">

              ${item.linked
                ? `<span class="pill good">Automático</span>`
                : botao(
                    "edit-transaction",
                    item.id,
                    "Editar"
                  )
              }

              ${botao(
                "delete-transaction",
                item.id,
                "Excluir"
              )}
            </div>
          </td>
        </tr>
      `).join("")
      : `
        <tr>
          <td colspan="7" class="empty">
            Nenhuma movimentação encontrada.
          </td>
        </tr>
      `;
  }

  /* =====================================================
     CONTAS A PAGAR E RECEBER
  ===================================================== */

  function renderBills() {
    const pendentes = db.bills.filter(item => item.status !== "done");
    const filtro = $("financeBillFilter").value;
    const soma = itens => itens.reduce((total, item) => total + Number(item.amount), 0);
    const aPagar = pendentes.filter(item => item.type === "Pagar");
    const aReceber = pendentes.filter(item => item.type === "Receber");
    const atrasados = pendentes.filter(item => diferencaDias(item.due) < 0);
    const proximos = pendentes.filter(item => {
      const dias = diferencaDias(item.due);
      return dias >= 0 && dias <= 7;
    });

    $("billStats").innerHTML = [
      ["A pagar (pendente)", reais(soma(aPagar))],
      ["A receber (pendente)", reais(soma(aReceber))],
      ["Vencidas", `${atrasados.length} · ${reais(soma(atrasados))}`],
      ["Vencem em até 7 dias", `${proximos.length} · ${reais(soma(proximos))}`]
    ].map(item => `
      <div class="mini-stat"><span>${item[0]}</span><strong>${item[1]}</strong></div>
    `).join("");

    const registros = db.bills
      .filter(item => {
        const dias = diferencaDias(item.due);
        if (filtro === "done") return item.status === "done";
        if (filtro === "pending") return item.status !== "done";
        if (filtro === "urgent") return item.status !== "done" && dias <= 7;
        return true;
      })
      .slice()
      .sort((a, b) => {
        const pendencia = Number(a.status === "done") - Number(b.status === "done");
        return pendencia || String(a.due).localeCompare(String(b.due));
      });

    $("billRows").innerHTML = registros.length
      ? registros.map(item => {
          const concluida = item.status === "done";
          const dias = diferencaDias(item.due);
          const classe = concluida ? "good" : dias <= 0 ? "bad" : dias <= 7 ? "warn" : "";
          const situacao = concluida ? "Concluída" :
            dias > 7 ? "Pendente" : rotuloPrazo(dias);
          return `
            <tr>
              <td>${dataBR(item.due)}</td>
              <td>${esc(item.description)}</td>
              <td>${esc(item.type)}</td>
              <td>${reais(item.amount)}</td>
              <td><span class="pill ${classe}">${esc(situacao)}</span></td>
              <td><div class="row-actions">
                ${!concluida
                  ? botao("settle-bill", item.id,
                      item.type === "Receber" ? "Receber" : "Pagar") +
                    botao("edit-bill", item.id, "Editar")
                  : ""}
                ${botao("delete-bill", item.id, "Excluir")}
              </div></td>
            </tr>`;
        }).join("")
      : `<tr><td colspan="6" class="empty">Nenhuma conta neste filtro.</td></tr>`;
  }

  /* =====================================================
     METAS
  ===================================================== */

  function renderGoals() {
    $("goalCards").innerHTML = db.goals.length
      ? db.goals.map(item => {
          const saldo = saldoMeta(item.id);

          const percentual = Math.min(
            100,
            Math.max(
              0,
              saldo / Number(item.target) * 100
            )
          );

          return `
            <article class="tile">
              <span class="eyebrow">META FINANCEIRA</span>

              <h3>${esc(item.name)}</h3>

              <p>Objetivo: ${reais(item.target)}</p>

              <strong>${reais(saldo)}</strong>

              <div class="progress">
                <span style="width:${percentual}%"></span>
              </div>

              <p>${percentual.toFixed(0)}% alcançado</p>
              ${item.deadline ? `
                <p class="finance-goal-deadline">
                  Prazo: ${dataBR(item.deadline)}
                  ${saldo + 0.005 < Number(item.target)
                    ? `· <span class="finance-deadline-tag ${urgenciaPrazo(diferencaDias(item.deadline))}">
                        ${esc(rotuloPrazo(diferencaDias(item.deadline)))}
                      </span>`
                    : '· <span class="green">Meta alcançada</span>'}
                </p>` : ""}

              <div class="row-actions">
                ${botao("contribute", item.id, "Guardar")}

                ${saldo > 0
                  ? botao(
                      "withdraw-goal",
                      item.id,
                      "Retirar"
                    )
                  : ""
                }

                ${botao("edit-goal", item.id, "Editar")}
                ${botao("delete-goal", item.id, "Excluir")}
              </div>
            </article>
          `;
        }).join("")
      : vazio("Nenhuma meta cadastrada.");
  }

  /* =====================================================
     CARTÕES E FATURAS
  ===================================================== */

  function renderCards() {
    const ativos = db.cards.filter(
      item => !item.archived
    );

    $("creditCards").innerHTML = ativos.length
      ? ativos.map(item => `
        <article class="tile">

          <span class="eyebrow">
            CARTÃO DE CRÉDITO
          </span>

          <h3>${esc(item.name)}</h3>

          <p>Vencimento: dia ${item.dueDay}</p>

          <strong>
            ${reais(
              Number(item.limit) -
              comprometido(item.id)
            )}
          </strong>

          <p>Limite total: ${reais(item.limit)}</p>

          <p>
            Compras em aberto:
            ${reais(comprometido(item.id))}
          </p>

          <div class="row-actions">
            ${botao(
              "new-purchase",
              item.id,
              "Nova compra"
            )}

            ${botao("edit-card", item.id, "Editar")}
            ${botao("delete-card", item.id, "Arquivar")}
          </div>

        </article>
      `).join("")
      : vazio("Nenhum cartão ativo.");

    $("invoices").innerHTML = ativos.length
      ? ativos.map(item => {
          const mes = monthInput.value;
          const total = valorFatura(item.id, mes);
          const pago = faturaPaga(item.id, mes);

          return linha(
            item.name,
            `${
              parcelasFatura(item.id, mes).length
            } parcela(s) no mês`,
            `
              <strong>${reais(total)}</strong>

              <div class="row-actions">
                ${pago
                  ? `<span class="pill good">
                      Fatura paga
                    </span>`
                  : total > 0
                    ? botao(
                        "pay-invoice",
                        item.id,
                        "Pagar fatura"
                      )
                    : `<span class="muted">
                        Sem cobrança
                      </span>`
                }
              </div>
            `
          );
        }).join("")
      : vazio("Cadastre um cartão para visualizar faturas.");
  }

  /* =====================================================
     GASTOS FIXOS
  ===================================================== */

  function renderRecurring() {
    const ativos = db.recurring.filter(
      item => item.active
    );

    const custo = ativos.reduce(
      (soma, item) => soma + Number(item.amount),
      0
    );

    const geradas = ativos.filter(
      item => contaDoMes(item, monthInput.value)
    ).length;

    $("recurringStats").innerHTML = [
      ["Custo mensal", reais(custo)],
      ["Gastos ativos", ativos.length],
      ["Contas geradas", geradas]
    ].map(item => `
      <div class="mini-stat">
        <span>${item[0]}</span>
        <strong>${item[1]}</strong>
      </div>
    `).join("");

    $("recurringRows").innerHTML = db.recurring.length
      ? db.recurring.map(item => `
        <tr>
          <td>${esc(item.name)}</td>
          <td>${esc(item.category)}</td>
          <td>Dia ${item.day}</td>
          <td>${reais(item.amount)}</td>

          <td>
            <span class="pill ${
              item.active ? "good" : ""
            }">
              ${item.active ? "Ativo" : "Pausado"}
            </span>
          </td>

          <td>
            <div class="row-actions">

              ${item.active &&
                !contaDoMes(item, monthInput.value)
                  ? botao(
                      "generate-recurring",
                      item.id,
                      "Gerar conta"
                    )
                  : ""
              }

              ${botao(
                "toggle-recurring",
                item.id,
                item.active ? "Pausar" : "Ativar"
              )}

              ${botao(
                "edit-recurring",
                item.id,
                "Editar"
              )}

              ${botao(
                "delete-recurring",
                item.id,
                "Excluir"
              )}
            </div>
          </td>
        </tr>
      `).join("")
      : `
        <tr>
          <td colspan="6" class="empty">
            Nenhum gasto fixo cadastrado.
          </td>
        </tr>
      `;
  }

  /* =====================================================
     CARTEIRAS
  ===================================================== */

  function renderWallets() {
    $("walletCards").innerHTML = db.wallets.length
      ? db.wallets.map(item => `
        <article class="tile">
          <span class="eyebrow">${esc(item.kind)}</span>

          <h3>${esc(item.name)}</h3>

          <strong>${reais(saldoCarteira(item.id))}</strong>

          <p>Saldo inicial: ${reais(item.initial)}</p>

          <div class="row-actions">
            ${botao("edit-wallet", item.id, "Editar")}
            ${botao("delete-wallet", item.id, "Excluir")}
          </div>
        </article>
      `).join("")
      : vazio("Cadastre sua primeira conta ou carteira.");

    $("transferList").innerHTML = db.transfers.length
      ? db.transfers
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 10)
          .map(item =>
            linha(
              `${
                nomeCarteira(item.from)
              } → ${
                nomeCarteira(item.to)
              }`,
              dataBR(item.date),
              `<strong>${reais(item.amount)}</strong>`
            )
          ).join("")
      : vazio("Nenhuma transferência registrada.");
  }

  /* =====================================================
     RENDERIZAÇÃO GERAL
  ===================================================== */

  function renderizar() {
    renderDashboard();
    renderTransactions();
    renderBills();
    renderGoals();
    renderCards();
    renderRecurring();
    renderWallets();

    // Permite exibir as tabelas como cartões mobile.
    document.querySelectorAll(
      ".table-scroll table"
    ).forEach(tabela => {
      const titulos = [
        ...tabela.querySelectorAll("thead th")
      ].map(item => item.textContent.trim());

      tabela.querySelectorAll("tbody tr").forEach(linha => {
        const celulas = [...linha.children].filter(
          item => item.tagName === "TD"
        );

        const vazia = celulas.length !== titulos.length;

        linha.classList.toggle(
          "financial-empty-row",
          vazia
        );

        if (!vazia) {
          celulas.forEach((celula, i) => {
            celula.dataset.label = titulos[i];
          });
        }
      });
    });

    icones();
  }

  /* =====================================================
     NAVEGAÇÃO
  ===================================================== */

  const secoes = {
    dashboard: [
      "Visão geral",
      "Acompanhe seu dinheiro e seus objetivos."
    ],
    transactions: [
      "Movimentações",
      "Receitas e despesas pessoais."
    ],
    bills: [
      "Contas a pagar e receber",
      "Controle seus vencimentos."
    ],
    goals: [
      "Metas financeiras",
      "Organize seus objetivos."
    ],
    cards: [
      "Cartões de crédito",
      "Controle suas faturas."
    ],
    recurring: [
      "Gastos fixos",
      "Despesas e assinaturas mensais."
    ],
    wallets: [
      "Contas e carteiras",
      "Controle seus saldos."
    ]
  };

  function navegar(destino) {
    if (!secoes[destino]) return;

    pagina = destino;

    document.querySelectorAll(".page").forEach(item => {
      item.classList.toggle(
        "active",
        item.id === `page-${destino}`
      );
    });

    document.querySelectorAll("#nav button").forEach(item => {
      item.classList.toggle(
        "active",
        item.dataset.page === destino
      );
    });

    $("pageTitle").textContent = secoes[destino][0];
    $("pageSubtitle").textContent = secoes[destino][1];

    $("personalSidebar").classList.remove("mobile-open");
    $("mobileMenuBackdrop").hidden = true;

    $("mobileMenuToggle").setAttribute(
      "aria-expanded",
      "false"
    );

    document.querySelectorAll(
      "#personalBottomNav [data-go]"

    ).forEach(item => {
      const ativo = item.dataset.go === destino;

      item.classList.toggle("active", ativo);

      if (ativo) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });

    renderizar();
  }

  function criarMenuInferior() {
    if ($("personalBottomNav")) return;

    const nav = document.createElement("nav");

    nav.id = "personalBottomNav";
    nav.className = "personal-bottom-nav";
    nav.setAttribute(
      "aria-label",
      "Navegação financeira"
    );

    nav.innerHTML = `
      <button type="button" data-go="dashboard">
        <i data-lucide="house"></i>
        <span>Início</span>
      </button>

      <button type="button" data-go="transactions">
        <i data-lucide="arrow-left-right"></i>
        <span>Movimentos</span>
      </button>

      <button type="button" data-go="bills">
        <i data-lucide="calendar-clock"></i>
        <span>Contas</span>
      </button>

      <button type="button" data-go="cards">
        <i data-lucide="credit-card"></i>
        <span>Cartões</span>
      </button>

      <button
        type="button"
        id="personalBottomMore"
      >
        <i data-lucide="menu"></i>
        <span>Mais</span>
      </button>
    `;

    document.body.appendChild(nav);

    $("personalBottomMore").addEventListener(
      "click",
      () => $("mobileMenuToggle").click()
    );
  }

  criarMenuInferior();

  $("nav").addEventListener("click", evento => {
    const botao = evento.target.closest("[data-page]");

    if (botao) {
      navegar(botao.dataset.page);
    }
  });

  document.body.addEventListener("click", evento => {
    const botao = evento.target.closest("[data-go]");

    if (botao) {
      navegar(botao.dataset.go);
    }
  });

  /* =====================================================
     FORMULÁRIOS
  ===================================================== */

  function campo(nome, rotulo, tipo = "text", valor = "", extra = "") {
    return `
      <label>
        ${esc(rotulo)}
        <input
          name="${esc(nome)}"
          type="${tipo}"
          value="${esc(valor)}"
          ${extra}
          required
        >
      </label>
    `;
  }

  function selecao(nome, rotulo, lista, selecionado = "") {
    return `
      <label>
        ${esc(rotulo)}
        <select name="${esc(nome)}" required>

          <option value="">Selecione</option>

          ${lista.map(item => `
            <option
              value="${esc(item.id)}"
              ${String(item.id) === String(selecionado)
                ? "selected"
                : ""
              }
            >
              ${esc(item.name)}
            </option>
          `).join("")}

        </select>
      </label>
    `;
  }

  function escolher(nome, rotulo, valores, selecionado) {
    return selecao(
      nome,
      rotulo,
      valores.map(item => ({
        id: item,
        name: item
      })),
      selecionado
    );
  }

  function abrirModal(tipo, id = "", padroes = {}) {
    if (!carregado || salvando) return;

    if (
      [
        "transaction",
        "transfer",
        "contribution",
        "invoice"
      ].includes(tipo) &&
      !db.wallets.length
    ) {
      aviso("Cadastre uma conta ou carteira primeiro.");
      navegar("wallets");
      return;
    }

    if (
      tipo === "purchase" &&
      !db.cards.some(item => !item.archived)
    ) {
      aviso("Cadastre um cartão primeiro.");
      navegar("cards");
      return;
    }

    const mapa = {
      transaction: "transactions",
      bill: "bills",
      goal: "goals",
      card: "cards",
      recurring: "recurring",
      wallet: "wallets"
    };

    const registro = id
      ? encontrar(mapa[tipo], id)
      : null;

    if (id && !registro) {
      aviso("Registro não encontrado.");
      return;
    }

    modalTipo = tipo;
    editandoId = id;

    const dados = {
      ...padroes,
      ...(registro || {})
    };

    const titulos = {
      transaction: "movimentação",
      bill: "conta",
      goal: "meta financeira",
      card: "cartão",
      purchase: "compra parcelada",
      recurring: "gasto fixo",
      wallet: "conta ou carteira",
      transfer: "transferência",
      contribution: "movimentação da meta",
      invoice: "pagamento da fatura"
    };

    $("modalTitle").textContent = (
      `${registro ? "Editar" : "Nova"} ${
        titulos[tipo]
      }`
    );

    const valor = (numero = dados.amount) =>
      campo(
        "amount",
        "Valor (R$)",
        "number",
        numero ?? "",
        'min="0.01" step="0.01"'
      );

    const data = (dia = dados.date) =>
      campo(
        "date",
        "Data",
        "date",
        dia || hoje()
      );

    const carteira = (item = dados.walletId) =>
      selecao(
        "walletId",
        "Conta / carteira",
        db.wallets,
        item
      );

    let html = "";

    switch (tipo) {
      case "transaction":
        html =
          escolher(
            "type",
            "Tipo",
            ["Receita", "Despesa"],
            dados.type || "Despesa"
          ) +
          data() +
          campo(
            "description",
            "Descrição",
            "text",
            dados.description || ""
          ) +
          campo(
            "category",
            "Categoria",
            "text",
            dados.category || "Outros"
          ) +
          valor() +
          carteira() +
          escolher(
            "payment",
            "Pagamento",
            [
              "Pix", "Cartão de débito",
              "Dinheiro", "Transferência", "Boleto"
            ],
            dados.payment || "Pix"
          );
        break;

      case "bill":
        html =
          escolher(
            "type",
            "Tipo",
            ["Pagar", "Receber"],
            dados.type || "Pagar"
          ) +
          campo(
            "due",
            "Vencimento",
            "date",
            dados.due || hoje()
          ) +
          campo(
            "description",
            "Descrição",
            "text",
            dados.description || ""
          ) +
          campo(
            "category",
            "Categoria",
            "text",
            dados.category || "Contas"
          ) +
          valor();
        break;

      case "goal":
        html =
          campo(
            "name",
            "Nome da meta",
            "text",
            dados.name || ""
          ) +
          campo(
            "target",
            "Valor desejado",
            "number",
            dados.target || "",
            'min="0.01" step="0.01"'
          ) +
          `
            <label>
              Prazo (opcional)
              <input
                name="deadline"
                type="date"
                value="${esc(dados.deadline || "")}"
              >
            </label>
          `;
        break;

      case "card":
        html =
          campo(
            "name",
            "Nome do cartão",
            "text",
            dados.name || ""
          ) +
          campo(
            "limit",
            "Limite total",
            "number",
            dados.limit || "",
            'min="0.01" step="0.01"'
          ) +
          campo(
            "dueDay",
            "Dia do vencimento",
            "number",
            dados.dueDay || 10,
            'min="1" max="28"'
          );
        break;

      case "purchase":
        html =
          selecao(
            "cardId",
            "Cartão",
            db.cards.filter(item => !item.archived),
            dados.cardId
          ) +
          data() +
          campo("description", "Descrição da compra") +
          valor() +
          campo(
            "installments",
            "Número de parcelas",
            "number",
            1,
            'min="1" max="48"'
          );
        break;

      case "recurring":
        html =
          campo(
            "name",
            "Nome da despesa",
            "text",
            dados.name || ""
          ) +
          campo(
            "category",
            "Categoria",
            "text",
            dados.category || "Assinaturas"
          ) +
          campo(
            "day",
            "Dia do vencimento",
            "number",
            dados.day || 10,
            'min="1" max="28"'
          ) +
          valor();
        break;

      case "wallet":
        html =
          campo(
            "name",
            "Nome da conta",
            "text",
            dados.name || ""
          ) +
          escolher(
            "kind",
            "Tipo",
            [
              "Conta corrente", "Poupança",
              "Carteira", "Conta digital", "Outro"
            ],
            dados.kind || "Conta corrente"
          ) +
          campo(
            "initial",
            "Saldo inicial",
            "number",
            dados.initial ?? 0,
            'step="0.01"'
          );
        break;

      case "transfer":
        html =
          selecao("from", "Conta de origem", db.wallets) +
          selecao("to", "Conta de destino", db.wallets) +
          data() +
          valor();
        break;

      case "contribution":
        html =
          selecao(
            "goalId",
            "Meta",
            db.goals,
            dados.goalId
          ) +
          carteira() +
          data() +
          valor();
        break;

      case "invoice":
        html =
          `
            <div class="wide muted">
              Fatura:
              ${reais(
                valorFatura(dados.cardId, dados.month)
              )}
            </div>
          ` +
          carteira() +
          data() +
          escolher(
            "payment",
            "Pagamento",
            [
              "Pix", "Transferência",
              "Dinheiro", "Boleto"
            ],
            "Pix"
          );
        break;

      default:
        aviso("Formulário não encontrado.");
        return;
    }

    $("modalFields").innerHTML = html;
    $("modal").hidden = false;

    icones();

    $("modalFields")
      .querySelector("input, select")
      ?.focus();
  }

  function fecharModal() {
    if (salvando) return;

    $("modal").hidden = true;
    $("modalForm").reset();

    modalTipo = "";
    editandoId = "";
    contextoFatura = null;
  }

  $("closeModal").addEventListener("click", fecharModal);
  $("cancelModal").addEventListener("click", fecharModal);

  $("modal").addEventListener("click", evento => {
    if (evento.target === $("modal")) {
      fecharModal();
    }
  });

  document.addEventListener("keydown", evento => {
    if (
      evento.key === "Escape" &&
      !$("modal").hidden
    ) {
      fecharModal();
    }
  });

  document.querySelectorAll("[data-add]").forEach(item => {
    item.addEventListener("click", () => {
      abrirModal(item.dataset.add);
    });
  });

  document.querySelectorAll("[data-quick-add]").forEach(item => {
    item.addEventListener("click", () => {
      const tipo = item.dataset.quickAdd;
      if (tipo === "bill") {

        abrirModal("bill");
      } else {
        abrirModal("transaction", "", {
          type: tipo === "income" ? "Receita" : "Despesa"
        });
      }
    });
  });

  $("financeExportCalendar").addEventListener("click", exportarAlertasICal);
  $("financeBillFilter").addEventListener("change", renderBills);

  /* =====================================================
     GRAVAR FORMULÁRIOS
  ===================================================== */

  function gravarRegistro(colecao, dados, id) {
    if (id) {
      const indice = db[colecao].findIndex(
        item => item.id === id
      );

      if (indice < 0) {
        throw new Error("Registro não encontrado.");
      }

      db[colecao][indice] = {
        ...db[colecao][indice],
        ...dados
      };

    } else {
      db[colecao].push({
        id: gerarId(),
        ...dados
      });
    }
  }

  $("modalForm").addEventListener(
    "submit",
    async evento => {
      evento.preventDefault();

      if (salvando) return;

      const dados = new FormData(evento.currentTarget);
      const ler = nome =>
        String(dados.get(nome) ?? "").trim();

      const tipo = modalTipo;
      const id = editandoId;

      const sucesso = await atualizar(() => {
        switch (tipo) {
          case "transaction": {
            const carteira = ler("walletId");

            if (!encontrar("wallets", carteira)) {
              throw new Error("Conta inválida.");
            }

            if (
              id &&
              encontrar("transactions", id)?.linked
            ) {
              throw new Error(
                "Movimentações automáticas não podem ser editadas."
              );
            }

            gravarRegistro(
              "transactions",
              {
                type: ler("type"),
                date: dataValida(ler("date")),
                description: textoObrigatorio(
                  ler("description"),
                  "a descrição"
                ),
                category: textoObrigatorio(
                  ler("category"),
                  "a categoria"
                ),
                amount: valorValido(ler("amount")),
                walletId: carteira,
                payment: ler("payment")
              },
              id
            );
            break;
          }

          case "bill":
            if (
              id &&
              encontrar("bills", id)?.status === "done"
            ) {
              throw new Error(
                "Reabra a conta antes de editar."
              );
            }

            gravarRegistro(
              "bills",
              {
                type: ler("type"),
                due: dataValida(ler("due")),
                description: textoObrigatorio(
                  ler("description"),
                  "a descrição"
                ),
                category: textoObrigatorio(
                  ler("category"),
                  "a categoria"
                ),
                amount: valorValido(ler("amount")),
                status: id
                  ? encontrar("bills", id).status
                  : "pending"
              },
              id
            );
            break;

          case "goal":
            gravarRegistro(
              "goals",
              {
                name: textoObrigatorio(
                  ler("name"),
                  "o nome da meta"
                ),
                target: valorValido(ler("target")),
                deadline: ler("deadline")
                  ? dataValida(ler("deadline"))
                  : ""
              },
              id
            );
            break;

          case "card": {
            const limite = valorValido(ler("limit"));

            if (
              id &&
              limite < comprometido(id) - 0.001
            ) {
              throw new Error(
                "Limite inferior às parcelas em aberto."
              );
            }

            gravarRegistro(
              "cards",
              {
                name: textoObrigatorio(
                  ler("name"),
                  "o nome do cartão"
                ),
                limit: limite,
                dueDay: diaValido(ler("dueDay"))
              },
              id
            );
            break;
          }

          case "purchase": {
            const cartao = encontrar(
              "cards",
              ler("cardId")
            );

            if (!cartao || cartao.archived) {
              throw new Error("Cartão indisponível.");
            }

            const valor = valorValido(ler("amount"));
            const parcelas = Number(ler("installments"));

            if (
              !Number.isInteger(parcelas) ||
              parcelas < 1 ||
              parcelas > 48
            ) {
              throw new Error(
                "Informe entre 1 e 48 parcelas."
              );
            }

            if (
              comprometido(cartao.id) + valor >
              Number(cartao.limit) + 0.001
            ) {
              throw new Error(
                "Limite insuficiente no cartão."
              );
            }

            db.purchases.push({
              id: gerarId(),
              cardId: cartao.id,
              date: dataValida(ler("date")),
              description: textoObrigatorio(
                ler("description"),
                "a descrição"
              ),
              amount: valor,
              installments: parcelas
            });
            break;
          }

          case "recurring":
            gravarRegistro(
              "recurring",
              {
                name: textoObrigatorio(
                  ler("name"),
                  "o nome da despesa"
                ),
                category: textoObrigatorio(
                  ler("category"),
                  "a categoria"
                ),
                day: diaValido(ler("day")),
                amount: valorValido(ler("amount")),
                active: id
                  ? encontrar("recurring", id).active
                  : true
              },
              id
            );
            break;

          case "wallet":
            gravarRegistro(
              "wallets",
              {
                name: textoObrigatorio(
                  ler("name"),
                  "o nome da conta"
                ),
                kind: ler("kind"),
                initial: saldoInicial(ler("initial"))
              },
              id
            );
            break;

          case "transfer": {
            const origem = ler("from");
            const destino = ler("to");
            const valor = valorValido(ler("amount"));

            if (origem === destino) {
              throw new Error("Escolha contas diferentes.");
            }

            if (
              !encontrar("wallets", origem) ||
              !encontrar("wallets", destino)
            ) {
              throw new Error("Contas inválidas.");
            }

            if (saldoCarteira(origem) < valor) {
              throw new Error("Saldo insuficiente.");
            }

            db.transfers.push({
              id: gerarId(),
              from: origem,
              to: destino,
              date: dataValida(ler("date")),
              amount: valor
            });
            break;
          }

          case "contribution": {
            const meta = ler("goalId");
            const carteira = ler("walletId");
            const valor = valorValido(ler("amount"));

            if (
              !encontrar("goals", meta) ||
              !encontrar("wallets", carteira)
            ) {
              throw new Error(
                "Meta ou carteira inválida."
              );
            }

            if (
              acaoMeta === "deposit" &&
              saldoCarteira(carteira) < valor
            ) {
              throw new Error(
                "Saldo insuficiente na carteira."
              );
            }

            if (
              acaoMeta === "withdraw" &&
              saldoMeta(meta) < valor
            ) {
              throw new Error(
                "Saldo insuficiente na meta."
              );
            }

            db.goalMoves.push({
              id: gerarId(),
              goalId: meta,
              walletId: carteira,
              date: dataValida(ler("date")),
              amount: valor,
              kind: acaoMeta
            });
            break;
          }

          case "invoice": {
            if (!contextoFatura) {
              throw new Error("Fatura não selecionada.");
            }

            const { cardId, month } = contextoFatura;
            const total = valorFatura(cardId, month);
            const carteira = ler("walletId");

            if (!encontrar("wallets", carteira)) {
              throw new Error("Conta inválida.");
            }

            if (
              total <= 0 ||
              faturaPaga(cardId, month)
            ) {
              throw new Error(
                "Fatura já paga ou indisponível."
              );
            }

            if (saldoCarteira(carteira) < total) {
              throw new Error("Saldo insuficiente.");
            }

            const transacaoId = gerarId();

            db.transactions.push({
              id: transacaoId,
              type: "Despesa",
              date: dataValida(ler("date")),
              description: `Fatura ${
                nomeCartao(cardId)
              } ${month}`,
              category: "Cartão de crédito",
              amount: Math.round(total * 100) / 100,
              walletId: carteira,
              payment: ler("payment"),
              linked: true
            });

            db.invoicePayments.push({
              id: gerarId(),
              cardId,
              month,
              date: ler("date"),
              transactionId: transacaoId
            });
            break;
          }

          default:
            throw new Error(
              "Tipo de formulário inválido."
            );
        }
      });

      if (sucesso) {
        fecharModal();
        aviso("Registro salvo com sucesso!");

        if (tipo === "recurring") {
          await gerarFixos();
        }
      }
    }
  );

  /* =====================================================
     CONFIRMAR CONTA
  ===================================================== */

  async function confirmarConta(id) {
    const conta = encontrar("bills", id);

    if (
      !conta ||
      conta.status === "done" ||
      conta.transactionId
    ) {
      aviso("Conta já confirmada ou indisponível.");
      return;
    }

    if (!db.wallets.length) {
      aviso("Cadastre uma conta ou carteira primeiro.");
      navegar("wallets");
      return;
    }

    const nomes = db.wallets.map(
      item => item.name
    ).join(", ");

    const escolha = window.prompt(
      `Qual conta deseja utilizar?\n${nomes}`,
      db.wallets[0].name
    );

    if (escolha === null) return;

    const carteira = db.wallets.find(
      item =>
        item.name.toLocaleLowerCase("pt-BR") ===
        escolha.trim().toLocaleLowerCase("pt-BR")
    );

    if (!carteira) {
      aviso("Conta não encontrada.");
      return;
    }

    if (
      conta.type === "Pagar" &&
      saldoCarteira(carteira.id) < Number(conta.amount)
    ) {
      aviso("Saldo insuficiente.");
      return;
    }

    if (
      !window.confirm(
        `Confirmar ${reais(conta.amount)}?\n` +
        `Descrição: ${conta.description}\n` +
        `Conta: ${carteira.name}`
      )
    ) {
      return;
    }

    const sucesso = await atualizar(() => {
      const atual = encontrar("bills", id);

      if (
        !atual ||
        atual.status === "done" ||
        atual.transactionId
      ) {
        throw new Error("Conta já confirmada.");
      }

      if (
        atual.type === "Pagar" &&
        saldoCarteira(carteira.id) <
        Number(atual.amount)
      ) {
        throw new Error("Saldo insuficiente.");
      }

      const transacaoId = gerarId();

      db.transactions.push({
        id: transacaoId,
        type: atual.type === "Pagar"
          ? "Despesa"
          : "Receita",
        date: hoje(),
        description: atual.description,
        category: atual.category,
        amount: Number(atual.amount),
        walletId: carteira.id,
        payment: "Transferência",
        linked: true
      });

      atual.status = "done";
      atual.transactionId = transacaoId;
    });

    if (sucesso) {
      aviso("Conta confirmada e saldo atualizado.");
    }
  }

  /* =====================================================
     EXCLUIR MOVIMENTAÇÃO
  ===================================================== */

  async function excluirMovimentacao(id) {
    const transacao = encontrar("transactions", id);

    if (!transacao) {
      aviso("Movimentação não encontrada.");
      return;
    }

    const conta = db.bills.find(
      item => item.transactionId === id
    );

    const fatura = db.invoicePayments.find(
      item => item.transactionId === id
    );

    if (transacao.linked && !conta && !fatura) {
      aviso(
        "Movimentação automática antiga sem vínculo. " +
        "Exclusão bloqueada para proteger o histórico."
      );
      return;
    }

    const pergunta = conta

      ? "Excluir a movimentação e reabrir a conta?"
      : fatura
        ? "Excluir o pagamento e reabrir a fatura?"
        : "Excluir esta movimentação?";

    if (!window.confirm(pergunta)) return;

    const sucesso = await atualizar(() => {
      const atual = encontrar("transactions", id);

      if (!atual) {
        throw new Error("Movimentação não encontrada.");
      }

      const contaAtual = db.bills.find(
        item => item.transactionId === id
      );

      const faturaAtual = db.invoicePayments.find(
        item => item.transactionId === id
      );

      if (
        atual.linked &&
        !contaAtual &&
        !faturaAtual
      ) {
        throw new Error(
          "Vínculo automático não encontrado."
        );
      }

      if (contaAtual) {
        contaAtual.status = "pending";
        delete contaAtual.transactionId;
      }

      if (faturaAtual) {
        db.invoicePayments = db.invoicePayments.filter(
          item => item.transactionId !== id
        );
      }

      db.transactions = db.transactions.filter(
        item => item.id !== id
      );
    });

    if (sucesso) {
      aviso("Movimentação excluída.");
    }
  }

  /* =====================================================
     EXCLUIR REGISTROS E ARQUIVAR CARTÃO
  ===================================================== */

  async function excluir(colecao, id) {
    const item = encontrar(colecao, id);

    if (!item) {
      aviso("Registro não encontrado.");
      return;
    }

    if (colecao === "cards") {
      if (item.archived) return;

      if (comprometido(id) > 0.001) {
        aviso(
          "Há parcelas em aberto. " +
          "Quite as faturas antes de arquivar."
        );
        return;
      }

      if (
        !window.confirm(
          `Arquivar o cartão ${item.name}?\n` +
          "Compras e pagamentos serão preservados."
        )
      ) {
        return;
      }

      const sucesso = await atualizar(() => {
        const cartao = encontrar("cards", id);

        if (!cartao || cartao.archived) {
          throw new Error("Cartão indisponível.");
        }

        cartao.archived = true;
      });

      if (sucesso) aviso("Cartão arquivado.");
      return;
    }

    if (
      colecao === "bills" &&
      (item.status === "done" || item.transactionId)
    ) {
      aviso(
        "Reabra a conta pela movimentação " +
        "vinculada antes de excluir."
      );
      return;
    }

    if (
      colecao === "wallets" &&
      (
        db.transactions.some(
          reg => reg.walletId === id
        ) ||
        db.transfers.some(
          reg => reg.from === id || reg.to === id
        ) ||
        db.goalMoves.some(
          reg => reg.walletId === id
        )
      )
    ) {
      aviso("Essa conta possui movimentações vinculadas.");
      return;
    }

    if (
      colecao === "goals" &&
      db.goalMoves.some(reg => reg.goalId === id)
    ) {
      aviso(
        "Essa meta possui aportes e não pode ser excluída."
      );
      return;
    }

    if (!window.confirm("Excluir este registro?")) {
      return;
    }

    const sucesso = await atualizar(() => {
      const atual = encontrar(colecao, id);

      if (!atual) {
        throw new Error("Registro não encontrado.");
      }

      if (
        colecao === "bills" &&
        (atual.status === "done" || atual.transactionId)
      ) {
        throw new Error("Conta não pode ser excluída.");
      }

      db[colecao] = db[colecao].filter(
        reg => reg.id !== id
      );
    });

    if (sucesso) aviso("Registro excluído.");
  }

  /* =====================================================
     AÇÕES DOS BOTÕES
  ===================================================== */

  document.body.addEventListener("click", async evento => {
    const elemento = evento.target.closest(
      "[data-action]"
    );

    if (!elemento || salvando) return;

    const acao = elemento.dataset.action;
    const id = elemento.dataset.id;

    const colecoes = {
      transaction: "transactions",
      bill: "bills",
      goal: "goals",
      card: "cards",
      recurring: "recurring",
      wallet: "wallets"
    };

    if (acao.startsWith("edit-")) {
      abrirModal(
        acao.replace("edit-", ""),
        id
      );
      return;
    }

    if (acao === "delete-transaction") {
      await excluirMovimentacao(id);
      return;
    }

    if (acao.startsWith("delete-")) {
      const tipo = acao.replace("delete-", "");
      const colecao = colecoes[tipo];

      if (colecao) {
        await excluir(colecao, id);
      }

      return;
    }

    switch (acao) {
      case "pay-alert-invoice": {
        const mes = elemento.dataset.month;
        if (!/^\d{4}-\d{2}$/.test(mes || "")) return;
        monthInput.value = mes;
        navegar("cards");
        contextoFatura = { cardId: id, month: mes };
        abrirModal("invoice", "", contextoFatura);
        break;
      }

      case "settle-bill":
        await confirmarConta(id);
        break;

      case "contribute":
      case "withdraw-goal":
        acaoMeta = acao === "contribute"
          ? "deposit"
          : "withdraw";

        abrirModal("contribution", "", {
          goalId: id
        });
        break;

      case "new-purchase":
        abrirModal("purchase", "", {
          cardId: id
        });
        break;

      case "pay-invoice":
        contextoFatura = {
          cardId: id,
          month: monthInput.value
        };

        abrirModal(
          "invoice",
          "",
          contextoFatura
        );
        break;

      case "toggle-recurring": {
        const sucesso = await atualizar(() => {
          const item = encontrar("recurring", id);

          if (!item) {
            throw new Error(
              "Gasto fixo não encontrado."
            );
          }

          item.active = !item.active;
        });

        if (sucesso) {
          aviso("Gasto fixo atualizado.");
        }
        break;
      }

      case "generate-recurring": {
        const mes = monthInput.value;

        const sucesso = await atualizar(() => {
          const item = encontrar("recurring", id);

          if (!item || !item.active) {
            throw new Error(
              "Gasto fixo indisponível."
            );
          }

          if (!criarContaDoMes(item, mes)) {
            throw new Error(
              "Conta deste mês já existente."
            );
          }
        });

        if (sucesso) {
          aviso("Conta do mês gerada.");
        }
        break;
      }
    }
  });

  /* =====================================================
     FILTROS
  ===================================================== */

  ["txSearch", "txType", "txWallet"].forEach(id => {
    $(id).addEventListener(
      id === "txSearch" ? "input" : "change",
      renderTransactions
    );
  });

  monthInput.addEventListener(
    "change",
    renderizar
  );

  /* =====================================================
     EXPORTAÇÃO CSV
  ===================================================== */

  function campoCSV(valor) {
    let texto = String(valor ?? "");

    if (/^\s*[=+\-@]/.test(texto)) {
      texto = "'" + texto;
    }

    return `"${texto.replace(/"/g, '""')}"`;
  }

  $("csvBtn").addEventListener("click", () => {
    const registros = db.transactions.filter(
      item => String(item.date).slice(0, 7) === monthInput.value
    );

    if (!registros.length) {
      aviso("Não há movimentações neste mês.");
      return;
    }

    const linhas = [
      [
        "Data", "Tipo", "Descrição", "Categoria",
        "Conta", "Pagamento", "Valor"
      ],

      ...registros.map(item => [
        dataBR(item.date),
        item.type,
        item.description,
        item.category,
        nomeCarteira(item.walletId),
        item.payment || "",
        Number(item.amount)
          .toFixed(2)
          .replace(".", ",")
      ])
    ];

    const csv = "\uFEFF" + linhas
      .map(linha => linha.map(campoCSV).join(";"))
      .join("\r\n");

    const arquivo = new Blob(
      [csv],
      { type: "text/csv;charset=utf-8" }
    );

    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");

    link.href = url;
    link.download = `minhas-financas-${
      monthInput.value
    }.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);

    aviso("CSV exportado.");
  });

  /* =====================================================
     AUTENTICAÇÃO E INICIALIZAÇÃO
  ===================================================== */

  // Este campo aparece mesmo se a API estiver indisponível.
  monthInput.value = mesAtual();

  criarMenuInferior();
  icones();

  try {
    if (
      !window.WJ ||
      typeof WJ.verificarSessao !== "function" ||
      typeof WJ.api !== "function"
    ) {
      throw new Error(
        "js/global.js não carregado corretamente."
      );
    }

    // Não usa WJ.init(), que cria um segundo layout.
    const usuario = await WJ.verificarSessao();

    if (!usuario) {
      window.top.location.replace("index.html");
      return;
    }

    // Não substitui o cache local antes de decidir
    // sobre uma eventual importação.
    await carregarDados(false);

    const servidorVazio = !possuiRegistros(db);
    const localExistente = possuiRegistros(copiaLocalInicial);

    if (servidorVazio && localExistente) {
      const importar = window.confirm(
        "Foram encontrados dados antigos neste navegador.\n\n" +
        "O PostgreSQL está vazio.\n" +
        "Deseja importar esses dados para sua conta?"
      );

      if (importar) {
        const sucesso = await atualizar(() => {
          db = normalizar(copiaLocalInicial);
        });

        if (sucesso) {
          aviso("Dados antigos importados.");
        }
      }

      // Se o usuário não importar, não sobrescrevemos
      // a cópia antiga no armazenamento local.
    } else {
      cacheLocal();
    }

    renderizar();
    limparErro();

    await gerarFixos();

  } catch (erro) {
    console.error(
      "Falha ao inicializar Finanças Pessoais:",
      erro
    );

    carregado = false;

    mostrarErro(
      "Não foi possível carregar suas finanças: " +
      (erro.message || "erro desconhecido") +
      ". Nenhum dado foi alterado."
    );

    document.querySelectorAll("[data-add]")
      .forEach(item => {
        item.disabled = true;
      });
  }

  /* =====================================================
     ATUALIZAR AO VOLTAR PARA O APLICATIVO
  ===================================================== */

  document.addEventListener(
    "visibilitychange",
    async () => {
      if (
        document.hidden ||
        salvando ||
        !carregado
      ) {
        return;
      }

      try {
        await carregarDados();
        renderizar();
        await gerarFixos();

      } catch (erro) {
        console.error(erro);

        mostrarErro(
          "Não foi possível atualizar os dados: " +
          erro.message
        );
      }
    }
  );

});
