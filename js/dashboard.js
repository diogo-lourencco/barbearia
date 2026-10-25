
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  // =====================================
  // AUTENTICAÇÃO
  // =====================================

  const autorizado = await WJ.init("dashboard");

  if (!autorizado) return;

  const $ = id => document.getElementById(id);

  let atualizando = false;

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
      erro?.message || "Não foi possível atualizar o Dashboard."
    );
  }

  // =====================================
  // CARREGAR DADOS DO POSTGRESQL
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

    return {
      financeiro,
      estoque
    };
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

    // Caso exista um indicador de movimentações
    // no HTML, ele será atualizado.
    const movementsElement =
      $("movements") ||
      $("transactionsCount") ||
      $("totalTransactions");

    if (movementsElement) {
      movementsElement.textContent =
        totais.movimentacoes;
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
  // ÚLTIMAS MOVIMENTAÇÕES
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

      return `
        <div class="list-row">
          <div>
            <strong>
              ${WJ.escape(
                item.descricao || "Movimentação"
              )}
            </strong>

            <div class="muted">
              ${WJ.escape(WJ.date(item.data))}
            </div>
          </div>

          <strong class="${receita ? "good" : "bad"}">
            ${receita ? "+" : "-"}
            ${WJ.money(item.valor)}
          </strong>
        </div>
      `;
    }).join("") || `
      <p class="empty">
        Nenhuma movimentação cadastrada.
      </p>
    `;
  }

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
            style="height: ${altura}%"
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
    if (!document.hidden) {
      renderDashboard();
    }
  }, 60000);

  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) {
        renderDashboard();
      }
    }
  );

  window.addEventListener("pageshow", event => {
    if (event.persisted) {
      renderDashboard();
    }
  });
});
