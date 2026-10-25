
"use strict";

document.addEventListener("DOMContentLoaded", async () => {

  // =====================================
  // AUTENTICAÇÃO
  // =====================================

  const autorizado = await WJ.init("dashboard");

  if (!autorizado) return;

  const $ = id => document.getElementById(id);

  let atualizando = false;
  let excluindo = false;

  // =====================================
  // FUNÇÕES AUXILIARES
  // =====================================

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
      item => dateOnly(item.data).startsWith(month)
    );
  }

  function getMonthlyTotals(transactions, month) {
    const rows = getMonthlyTransactions(transactions, month);

    const receitas = rows
      .filter(isRevenue)
      .reduce(
        (total, item) => total + Number(item.valor || 0),
        0
      );

    const despesas = rows
      .filter(item => !isRevenue(item))
      .reduce(
        (total, item) => total + Number(item.valor || 0),
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

    WJ.toast(
      erro?.message ||
      "Não foi possível atualizar o Dashboard."
    );
  }

  // =====================================
  // CARREGAR DADOS
  // =====================================

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

    return { financeiro, estoque };
  }

  // =====================================
  // INDICADORES FINANCEIROS
  // =====================================

  function renderFinancialIndicators(financeiro, mesAtual) {
    const totais = getMonthlyTotals(financeiro, mesAtual);

    $("revenue").textContent = WJ.money(totais.receitas);
    $("expenses").textContent = WJ.money(totais.despesas);
    $("balance").textContent = WJ.money(totais.saldo);

    $("balance").classList.toggle(
      "bad",
      totais.saldo < 0
    );

    $("balance").classList.toggle(
      "accent",
      totais.saldo >= 0
    );

    const movementsElement =
      $("movements") ||
      $("transactionsCount") ||
      $("totalTransactions");

    if (movementsElement) {
      movementsElement.textContent = totais.movimentacoes;
    }
  }

  // =====================================
  // ESTOQUE BAIXO
  // =====================================

  function renderLowStock(estoque) {
    const estoqueBaixo = estoque.filter(item => {
      const quantidade = Number(item.quantidade);
      const minimo = Number(item.estoque_minimo);

      return (
        Number.isFinite(quantidade) &&
        Number.isFinite(minimo) &&
        quantidade <= minimo
      );
    });

    $("alerts").textContent = estoqueBaixo.length;

    $("lowStock").innerHTML = estoqueBaixo.map(item => `
      <div class="list-row">
        <div>
          <strong>
            ${WJ.escape(item.nome || "Produto")}
          </strong>

          <div class="muted">
            Mínimo:
            ${formatQuantity(item.estoque_minimo)}
            ${WJ.escape(item.unidade || "un")}
          </div>
        </div>

        <span class="pill warn">
          ${formatQuantity(item.quantidade)}
          ${WJ.escape(item.unidade || "un")}
        </span>
      </div>
    `).join("") || `
      <p class="empty">
        Nenhum produto com estoque baixo.
      </p>
    `;
  }

  // =====================================
  // MOVIMENTAÇÕES RECENTES
  // =====================================

  function renderRecentTransactions(financeiro) {
    const recentes = [...financeiro]
      .sort((a, b) => {
        const comparacao = dateOnly(b.data)
          .localeCompare(dateOnly(a.data));

        return comparacao ||
          Number(b.id) - Number(a.id);
      })
      .slice(0, 6);

    $("recent").innerHTML = recentes.map(item => {
      const receita = isRevenue(item);
      const automatica = isAutomaticSale(item);

      return `
        <div
          class="list-row"
          style="
            display:flex;
            align-items:center;
            gap:12px;
          "
        >
          <div style="flex:1;min-width:0;">
            <strong>
              ${WJ.escape(
                item.descricao || "Movimentação"
              )}
            </strong>

            <div class="muted">
              ${WJ.escape(WJ.date(item.data))}
            </div>

            ${automatica ? `
              <div
                class="muted"
                style="font-size:11px;"
              >
                Venda de produto
              </div>
            ` : ""}
          </div>

          <strong
            class="${receita ? "good" : "bad"}"
            style="white-space:nowrap;"
          >
            ${receita ? "+" : "-"}
            ${WJ.money(item.valor)}
          </strong>

          <button
            type="button"
            class="btn-delete-movement"
            data-id="${WJ.escape(String(item.id))}"
            data-automatic="${automatica}"
            title="${
              automatica
                ? "Cancelar venda"
                : "Excluir movimentação"
            }"
            aria-label="${
              automatica
                ? "Cancelar venda"
                : "Excluir movimentação"
            }"
            style="
              width:36px;
              height:36px;
              display:flex;
              align-items:center;
              justify-content:center;
              background:transparent;
              color:#ef4444;
              border:1px solid rgba(239,68,68,.35);
              border-radius:10px;
              cursor:pointer;
              flex-shrink:0;
            "
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

  // =====================================
  // EXCLUIR MOVIMENTAÇÃO
  // =====================================

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

    botoes.forEach(botao => {
      botao.disabled = true;
      botao.style.opacity = "0.5";
      botao.style.cursor = "not-allowed";
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
      ).forEach(botao => {
        botao.disabled = false;
        botao.style.opacity = "";
        botao.style.cursor = "";
      });
    }
  }

  // =====================================
  // EVENTO DOS BOTÕES
  // =====================================

  $("recent").addEventListener("click", async event => {
    const botao = event.target.closest(
      ".btn-delete-movement"
    );

    if (!botao || !$("recent").contains(botao)) {
      return;
    }

    const id = botao.dataset.id;
    const automatica =
      botao.dataset.automatic === "true";

    if (!id) {
      WJ.toast("ID da movimentação não encontrado.");
      return;
    }

    await excluirMovimentacao(id, automatica);
  });

  // =====================================
  // GRÁFICO DOS ÚLTIMOS SEIS MESES
  // =====================================

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
          nome: data.toLocaleDateString("pt-BR", {
            month: "short"
          }),
          ano: data.getFullYear(),
          receitas: totais.receitas
        };
      }
    );

    const maiorReceita = Math.max(
      1,
      ...meses.map(mes => mes.receitas)
    );

    $("chart").innerHTML = meses.map(mes => {
      const altura = mes.receitas > 0
        ? Math.max(
            2,
            (mes.receitas / maiorReceita) * 100
          )
        : 0;

      return `
        <div
          class="chart-item"
          title="${WJ.escape(
            `${mes.nome}/${mes.ano} — ${WJ.money(mes.receitas)}`
          )}"
        >
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

  // =====================================
  // RENDERIZAR DASHBOARD
  // =====================================

  async function renderDashboard() {
    if (atualizando) return;

    atualizando = true;

    try {
      const { financeiro, estoque } = await carregarDados();

      const hoje = new Date();
      const mesAtual = monthKey(hoje);

      $("currentMonth").textContent =
        hoje.toLocaleDateString("pt-BR", {
          month: "long",
          year: "numeric"
        });

      renderFinancialIndicators(financeiro, mesAtual);
      renderLowStock(estoque);
      renderRecentTransactions(financeiro);
      renderChart(financeiro, hoje);

    } catch (erro) {
      mostrarErro(erro);

    } finally {
      atualizando = false;
    }
  }

  // =====================================
  // ATUALIZAÇÃO AUTOMÁTICA
  // =====================================

  await renderDashboard();

  setInterval(() => {
    if (!document.hidden && !excluindo) {
      renderDashboard();
    }
  }, 60000);

  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden && !excluindo) {
        renderDashboard();
      }
    }
  );

  window.addEventListener("pageshow", event => {
    if (event.persisted && !excluindo) {
      renderDashboard();
    }
  });
});
