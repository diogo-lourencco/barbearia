"use strict";

document.addEventListener("DOMContentLoaded", async () => {

  /* =====================================
     AUTENTICAÇÃO
  ===================================== */

  const autorizado = await WJ.init("dashboard");

  if (!autorizado) return;

  const $ = (id) => document.getElementById(id);

  let atualizando = false;
  let excluindo = false;

  /* =====================================
     INICIALIZAÇÃO DA INTERFACE
  ===================================== */

  function iniciarInterface() {
    const nome = String(
      WJ.usuario?.nome || ""
    ).trim();

    if (nome) {
      const primeiroNome = nome.split(/\s+/)[0];

      $("dashboardGreeting").textContent =
        `Olá, ${primeiroNome}! Veja como está seu negócio.`;
    }

    configurarMenuMobile();
    configurarAtualizacaoManual();

    WJ.initIcons();
  }

  /* =====================================
     MENU MOBILE
  ===================================== */

  function configurarMenuMobile() {
    const sidebar = $("sidebar");
    const overlay = $("dashboardMenuOverlay");
    const moreButton = $("dashboardMoreButton");
    const topMenuButton = $("menuBtn");

    if (!sidebar || !overlay || !moreButton) {
      return;
    }

    function sincronizarMenu() {
      const aberto = sidebar.classList.contains("open");

      overlay.hidden = !aberto;

      document.body.classList.toggle(
        "dashboard-menu-open",
        aberto
      );

      moreButton.setAttribute(
        "aria-expanded",
        String(aberto)
      );

      moreButton.setAttribute(
        "aria-label",
        aberto
          ? "Fechar menu completo"
          : "Abrir menu completo"
      );

      if (topMenuButton) {
        topMenuButton.setAttribute(
          "aria-expanded",
          String(aberto)
        );

        topMenuButton.setAttribute(
          "aria-label",
          aberto ? "Fechar menu" : "Abrir menu"
        );
      }
    }

    function fecharMenu() {
      sidebar.classList.remove("open");
      sincronizarMenu();
    }

    moreButton.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      sincronizarMenu();
    });

    overlay.addEventListener("click", fecharMenu);

    // O global.js já controla o botão superior.
    // Aqui apenas sincronizamos o fundo e o botão inferior.
    topMenuButton?.addEventListener(
      "click",
      sincronizarMenu
    );

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        fecharMenu();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 760) {
        fecharMenu();
      }
    });

    sincronizarMenu();
  }

  /* =====================================
     FUNÇÕES AUXILIARES
  ===================================== */

  function monthKey(date) {
    return (
      date.getFullYear() +
      "-" +
      String(date.getMonth() + 1).padStart(2, "0")
    );
  }

  function dateOnly(value) {
    return String(value || "").slice(0, 10);
  }

  function formatQuantity(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
      maximumFractionDigits: 3
    });
  }

  function isRevenue(item) {
    return String(item.tipo || "").toLowerCase() === "receita";
  }

  function isAutomaticSale(item) {
    return (
      String(item.origem || "").toLowerCase() ===
      "venda_produto"
    );
  }

  function getMonthlyTransactions(transactions, month) {
    return transactions.filter(
      (item) => dateOnly(item.data).startsWith(month)
    );
  }

  function getMonthlyTotals(transactions, month) {
    const rows = getMonthlyTransactions(
      transactions,
      month
    );

    const receitas = rows
      .filter(isRevenue)
      .reduce(
        (total, item) =>
          total + Number(item.valor || 0),
        0
      );

    const despesas = rows
      .filter((item) => !isRevenue(item))
      .reduce(
        (total, item) =>
          total + Number(item.valor || 0),
        0
      );

    return {
      receitas,
      despesas,
      saldo: receitas - despesas,
      movimentacoes: rows.length
    };
  }

  function mostrarErro(erro) {
    console.error("Erro no Dashboard:", erro);

    const mensagem =
      erro?.message ||
      "Não foi possível atualizar o Dashboard.";

    const errorBox = $("dashboardError");

    if (errorBox) {
      $("dashboardErrorMessage").textContent = mensagem;
      errorBox.hidden = false;
    }

    WJ.toast(mensagem);
  }

  function limparErro() {
    if ($("dashboardError")) {
      $("dashboardError").hidden = true;
    }
  }

  /* =====================================
     CARREGAR DADOS
  ===================================== */

  async function carregarDados() {
    const [financeiro, estoque] = await Promise.all([
      WJ.api("/financeiro"),
      WJ.api("/estoque")
    ]);

    if (!Array.isArray(financeiro)) {
      throw new Error(
        "O servidor retornou dados financeiros inválidos."
      );
    }

    if (!Array.isArray(estoque)) {
      throw new Error(
        "O servidor retornou dados de estoque inválidos."
      );
    }

    return {
      financeiro,
      estoque
    };
  }

  /* =====================================
     INDICADORES FINANCEIROS
  ===================================== */

  function renderFinancialIndicators(financeiro, mesAtual) {
    const totais = getMonthlyTotals(
      financeiro,
      mesAtual
    );

    $("revenue").textContent =
      WJ.money(totais.receitas);

    $("expenses").textContent =
      WJ.money(totais.despesas);

    $("balance").textContent =
      WJ.money(totais.saldo);

    const negativo = totais.saldo < 0;

    $("balance").classList.toggle(
      "bad",
      negativo
    );

    $("balance").classList.toggle(
      "accent",
      !negativo
    );

    $(".balance-card")?.classList.toggle(
      "negative-balance",
      negativo
    );

    const description = $("balanceDescription");

    if (description) {
      if (negativo) {
        description.textContent =
          "As despesas superaram as receitas";
      } else if (
        totais.receitas === 0 &&
        totais.despesas === 0
      ) {
        description.textContent =
          "Ainda não há movimentações neste mês";
      } else {
        description.textContent =
          "Resultado financeiro do mês";
      }
    }

    const movementsElement =
      $("movements") ||
      $("transactionsCount") ||
      $("totalTransactions");

    if (movementsElement) {
      movementsElement.textContent =
        totais.movimentacoes;
    }
  }

  /* =====================================
     ESTOQUE BAIXO
  ===================================== */

  function renderLowStock(estoque) {
    const estoqueBaixo = estoque.filter((item) => {
      const quantidade = Number(item.quantidade);
      const minimo = Number(item.estoque_minimo);

      return (
        Number.isFinite(quantidade) &&
        Number.isFinite(minimo) &&
        quantidade <= minimo
      );
    });

    const quantidadeAlertas = estoqueBaixo.length;

    $("alerts").textContent =
      quantidadeAlertas;

    const stockCard = document.querySelector(
      ".stock-card"
    );

    stockCard?.classList.toggle(
      "no-alerts",
      quantidadeAlertas === 0
    );

    const description = $("stockAlertDescription");

    if (description) {
      description.textContent =
        quantidadeAlertas === 0
          ? "Nenhum produto precisa de reposição"
          : quantidadeAlertas === 1
            ? "1 produto precisa de reposição"
            : `${quantidadeAlertas} produtos precisam de reposição`;
    }

    $("lowStock").innerHTML =
      estoqueBaixo.map((item) => `
        <div class="list-row">

          <div>
            <strong>
              ${WJ.escape(item.nome || "Produto")}
            </strong>

            <div class="muted">
              Estoque mínimo:
              ${formatQuantity(item.estoque_minimo)}
              ${WJ.escape(item.unidade || "un")}
            </div>
          </div>

          <span class="pill warn">
            Atual:
            ${formatQuantity(item.quantidade)}
            ${WJ.escape(item.unidade || "un")}
          </span>

        </div>
      `).join("") || `
        <p class="empty">
          Tudo certo! Nenhum produto está
          com estoque baixo.
        </p>
      `;
  }

  /* =====================================
     MOVIMENTAÇÕES RECENTES
  ===================================== */

  function renderRecentTransactions(financeiro) {
    const recentes = [...financeiro]
      .sort((a, b) => {
        const comparacao = dateOnly(b.data)
          .localeCompare(dateOnly(a.data));

        return (
          comparacao ||
          Number(b.id) - Number(a.id)
        );
      })
      .slice(0, 6);

    $("recent").innerHTML =
      recentes.map((item) => {
        const receita = isRevenue(item);
        const automatica = isAutomaticSale(item);

        const actionLabel = automatica
          ? "Cancelar venda"
          : "Excluir movimentação";

        return `
          <div class="list-row movement-row">

            <div class="movement-content">

              <strong>
                ${WJ.escape(
                  item.descricao || "Movimentação"
                )}
              </strong>

              <div class="muted">
                ${WJ.escape(WJ.date(item.data))}
              </div>

              ${automatica ? `
                <span class="movement-badge">
                  Venda de produto
                </span>
              ` : ""}

            </div>

            <strong
              class="movement-value ${receita ? "good" : "bad"}"
            >
              ${receita ? "+" : "-"}
              ${WJ.money(item.valor)}
            </strong>

            <button
              type="button"
              class="btn-delete-movement"
              data-id="${WJ.escape(String(item.id))}"
              data-automatic="${automatica}"
              title="${actionLabel}"
              aria-label="${actionLabel}: ${WJ.escape(
                item.descricao || "Movimentação"
              )}"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18"/>
                <path d="M8 6V4h8v2"/>
                <path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v5"/>
                <path d="M14 11v5"/>
              </svg>
            </button>

          </div>
        `;
      }).join("") || `
        <p class="empty">
          Nenhuma movimentação cadastrada.
        </p>
      `;
  }

  /* =====================================
     EXCLUIR MOVIMENTAÇÃO
  ===================================== */

  async function excluirMovimentacao(id, automatica) {
    if (excluindo) return;

    const mensagem = automatica
      ? (
        "Deseja cancelar esta venda?\n\n" +
        "A movimentação financeira será removida " +
        "e a quantidade vendida será devolvida " +
        "ao estoque."
      )
      : (
        "Deseja excluir esta movimentação?\n\n" +
        "Essa ação não poderá ser desfeita."
      );

    if (!window.confirm(mensagem)) return;

    excluindo = true;

    const botoes = document.querySelectorAll(
      ".btn-delete-movement"
    );

    botoes.forEach((botao) => {
      botao.disabled = true;
    });

    try {
      const caminho = automatica
        ? `/financeiro/${encodeURIComponent(id)}/cancelar-venda`
        : `/financeiro/${encodeURIComponent(id)}`;

      const resultado = await WJ.api(caminho, {
        method: "DELETE"
      });

      WJ.toast(
        resultado?.mensagem ||
        "Movimentação removida com sucesso."
      );

      await renderDashboard();

    } catch (erro) {
      mostrarErro(erro);

    } finally {
      excluindo = false;

      document.querySelectorAll(
        ".btn-delete-movement"
      ).forEach((botao) => {
        botao.disabled = false;
      });
    }
  }

  /* =====================================
     EVENTOS DAS MOVIMENTAÇÕES
  ===================================== */

  $("recent").addEventListener(
    "click",
    async (event) => {
      const botao = event.target.closest(
        ".btn-delete-movement"
      );

      if (
        !botao ||
        !$("recent").contains(botao)
      ) {
        return;
      }

      const id = botao.dataset.id;

      const automatica =
        botao.dataset.automatic === "true";

      if (!id) {
        WJ.toast(
          "ID da movimentação não encontrado."
        );
        return;
      }

      await excluirMovimentacao(
        id,
        automatica
      );
    }
  );

  /* =====================================
     GRÁFICO DOS ÚLTIMOS 6 MESES
  ===================================== */

  function renderChart(financeiro, hoje) {
    const meses = Array.from(
      { length: 6 },
      (_, index) => {
        const data = new Date(
          hoje.getFullYear(),
          hoje.getMonth() - 5 + index,
          1
        );

        const totais = getMonthlyTotals(
          financeiro,
          monthKey(data)
        );

        return {
          nome: data.toLocaleDateString(
            "pt-BR",
            { month: "short" }
          ),
          ano: data.getFullYear(),
          receitas: totais.receitas
        };
      }
    );

    const maiorReceita = Math.max(
      1,
      ...meses.map((mes) => mes.receitas)
    );

    const chart = $("chart");

    chart.setAttribute(
      "aria-label",
      "Receitas dos últimos seis meses: " +
      meses.map((mes) =>
        `${mes.nome} de ${mes.ano}: ${WJ.money(mes.receitas)}`
      ).join("; ")
    );

    chart.innerHTML = meses.map((mes) => {
      const altura = mes.receitas > 0
        ? Math.max(
            2,
            (mes.receitas / maiorReceita) * 100
          )
        : 0;

      const label =
        `${mes.nome}/${mes.ano} — ${WJ.money(mes.receitas)}`;

      return `
        <div
          class="chart-item"
          title="${WJ.escape(label)}"
        >

          <span class="chart-value">
            ${WJ.escape(
              formatCompactMoney(mes.receitas)
            )}
          </span>

          <div
            class="bar"
            style="height:${altura}%"
          ></div>

          <small>
            ${WJ.escape(mes.nome)}
          </small>

        </div>
      `;
    }).join("");
  }

  function formatCompactMoney(value) {
    const number = Number(value || 0);

    if (number >= 1000000) {
      return (
        "R$ " +
        (number / 1000000).toLocaleString(
          "pt-BR",
          { maximumFractionDigits: 1 }
        ) +
        " mi"
      );
    }

    if (number >= 1000) {
      return (
        "R$ " +
        (number / 1000).toLocaleString(
          "pt-BR",
          { maximumFractionDigits: 1 }
        ) +
        " mil"
      );
    }

    return (
      "R$ " +
      number.toLocaleString(
        "pt-BR",
        { maximumFractionDigits: 0 }
      )
    );
  }

  /* =====================================
     ATUALIZAÇÃO DO DASHBOARD
  ===================================== */

  async function renderDashboard() {
    if (atualizando) return;

    atualizando = true;

    const refreshButton = $("refreshDashboard");

    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.setAttribute(
        "aria-busy",
        "true"
      );
    }

    try {
      const { financeiro, estoque } =
        await carregarDados();

      const hoje = new Date();
      const mesAtual = monthKey(hoje);

      $("currentMonth").textContent =
        hoje.toLocaleDateString(
          "pt-BR",
          {
            month: "long",
            year: "numeric"
          }
        );

      renderFinancialIndicators(
        financeiro,
        mesAtual
      );

      renderLowStock(estoque);

      renderRecentTransactions(financeiro);

      renderChart(financeiro, hoje);

      $("dashboardUpdatedAt").textContent =
        "Atualizado às " +
        hoje.toLocaleTimeString(
          "pt-BR",
          {
            hour: "2-digit",
            minute: "2-digit"
          }
        );

      limparErro();

    } catch (erro) {
      mostrarErro(erro);

    } finally {
      atualizando = false;

      if (refreshButton) {
        refreshButton.disabled = false;
        refreshButton.removeAttribute(
          "aria-busy"
        );
      }
    }
  }

  /* =====================================
     ATUALIZAÇÃO MANUAL
  ===================================== */

  function configurarAtualizacaoManual() {
    $("refreshDashboard")?.addEventListener(
      "click",
      () => renderDashboard()
    );

    $("retryDashboard")?.addEventListener(
      "click",
      () => renderDashboard()
    );
  }

  /* =====================================
     INICIAR
  ===================================== */

  iniciarInterface();

  await renderDashboard();

  /* =====================================
     ATUALIZAÇÃO AUTOMÁTICA
  ===================================== */

  setInterval(() => {
    if (
      !document.hidden &&
      !excluindo
    ) {
      renderDashboard();
    }
  }, 60000);

  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        !document.hidden &&
        !excluindo
      ) {
        renderDashboard();
      }
    }
  );

  window.addEventListener(
    "pageshow",
    (event) => {
      if (
        event.persisted &&
        !excluindo
      ) {
        renderDashboard();
      }
    }
  );

});
