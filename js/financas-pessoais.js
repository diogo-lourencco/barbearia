
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const KEY = "minhas_financas_pessoais_completo_v2";

  const autorizado = await WJ.init("financas-pessoais", {
    layout: false
  });

  if (!autorizado) return;

  let revisao = 0;
  let salvando = false;

  const $ = id => document.getElementById(id);

  const money = value =>
    Number(value || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));

  const today = () => {
    const d = new Date();

    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0")
    ].join("-");
  };

  const dateBR = value =>
    value ? value.split("-").reverse().join("/") : "-";

  const id = () =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

  const initialData = () => ({
    wallets: [],
    transactions: [],
    bills: [],
    goals: [],
    cards: [],
    purchases: [],
    recurring: [],
    transfers: [],
    goalMoves: [],
    invoicePayments: []
  });

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));

      if (!saved || typeof saved !== "object") {
        return initialData();
      }

      const result = initialData();

      Object.keys(result).forEach(key => {
        result[key] = Array.isArray(saved[key])
          ? saved[key]
          : [];
      });

      return result;
    } catch {
      return initialData();
    }
  }

  let db = load();
  let currentPage = "dashboard";
  let modalType = "";
  let editingId = "";
  let goalAction = "deposit";
  let invoiceContext = null;

  const monthInput = $("month");
  monthInput.value = today().slice(0, 7);

  const selectedMonth = () => monthInput.value;

  const inMonth = value =>
    String(value || "").slice(0, 7) === selectedMonth();

  const get = (collection, itemId) =>
    db[collection].find(item => item.id === itemId);

  // =====================================
  // SALVAR DADOS NO POSTGRESQL
  // =====================================

  async function save() {
    const resultado = await WJ.api("/financas-pessoais", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dados: db,
        revisao
      })
    });

    revisao = Number(resultado.revisao);
  }

  function toast(message) {
    const element = $("toast");

    element.textContent = message;
    element.classList.add("show");

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => {
      element.classList.remove("show");
    }, 3000);
  }

  // =====================================
  // CONTROLE DE CONFLITO DE REVISÃO
  // =====================================

  function isRevisionConflict(error) {
    return /alterados em outra aba|revis[aã]o|\(409\)/i.test(
      String(error?.message || "")
    );
  }

  async function reloadLatest() {
    const resultado = await WJ.api("/financas-pessoais");

    const dados = resultado.dados || {};

    const atualizado = initialData();

    Object.keys(atualizado).forEach(key => {
      atualizado[key] = Array.isArray(dados[key])
        ? dados[key]
        : [];
    });

    db = atualizado;
    revisao = Number(resultado.revisao || 0);

    localStorage.setItem(KEY, JSON.stringify(db));
  }

  // =====================================
  // ATUALIZAR REGISTROS
  // =====================================

  async function update(callback) {
    if (salvando) {
      toast(
        "Aguarde a conclusão do salvamento anterior."
      );
      return false;
    }

    const previous = JSON.stringify(db);
    salvando = true;

    try {
      callback();

      await save();

      localStorage.setItem(KEY, JSON.stringify(db));

      render();
      return true;

    } catch (error) {
      if (isRevisionConflict(error)) {
        try {
          await reloadLatest();

          callback();

          await save();

          localStorage.setItem(KEY, JSON.stringify(db));

          render();

          toast("Dados sincronizados e salvos.");
          return true;

        } catch (retryError) {
          await reloadLatest().catch(() => {});

          render();

          toast(
            retryError.message ||
            "Não foi possível sincronizar os dados."
          );

          return false;
        }
      }

      db = JSON.parse(previous);

      render();

      toast(
        error.message ||
        "Não foi possível salvar no servidor."
      );

      return false;

    } finally {
      salvando = false;
    }
  }

  // =====================================
  // VALIDAÇÃO DE VALORES
  // =====================================

  function amount(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
      throw new Error(
        "Informe um valor maior que zero."
      );
    }

    return Math.round(number * 100) / 100;
  }

  function walletName(walletId) {
    return get("wallets", walletId)?.name ||
      "Conta removida";
  }

  function cardName(cardId) {
    return get("cards", cardId)?.name ||
      "Cartão removido";
  }

  // =====================================
  // SALDO DAS CONTAS
  // =====================================

  function walletBalance(walletId) {
    const wallet = get("wallets", walletId);

    if (!wallet) return 0;

    let balance = Number(wallet.initial || 0);

    db.transactions.forEach(item => {
      if (item.walletId !== walletId) return;

      balance += item.type === "Receita"
        ? Number(item.amount)
        : -Number(item.amount);
    });

    db.transfers.forEach(item => {
      if (item.from === walletId) {
        balance -= Number(item.amount);
      }

      if (item.to === walletId) {
        balance += Number(item.amount);
      }
    });

    db.goalMoves.forEach(item => {
      if (item.walletId !== walletId) return;

      balance += item.kind === "withdraw"
        ? Number(item.amount)
        : -Number(item.amount);
    });

    return balance;
  }

  // =====================================
  // SALDO DAS METAS
  // =====================================

  function goalBalance(goalId) {
    return db.goalMoves
      .filter(item => item.goalId === goalId)
      .reduce((total, item) => {
        return total + (
          item.kind === "withdraw"
            ? -Number(item.amount)
            : Number(item.amount)
        );
      }, 0);
  }

  // =====================================
  // TOTAIS MENSAIS
  // =====================================

  function monthTotals(month = selectedMonth()) {
    const rows = db.transactions.filter(
      item => item.date?.slice(0, 7) === month
    );

    const income = rows
      .filter(item => item.type === "Receita")
      .reduce(
        (total, item) =>
          total + Number(item.amount),
        0
      );

    const expense = rows
      .filter(item => item.type === "Despesa")
      .reduce(
        (total, item) =>
          total + Number(item.amount),
        0
      );

    return {
      income,
      expense
    };
  }

  // =====================================
  // AVANÇAR OU RETROCEDER MESES
  // =====================================

  function shiftMonth(month, offset) {
    const [year, number] = month
      .split("-")
      .map(Number);

    const date = new Date(
      year,
      number - 1 + offset,
      1
    );

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0")
    ].join("-");
  }

  // =====================================
  // ATUALIZAR ÍCONES
  // =====================================

  function refreshIcons() {
    if (
      window.lucide &&
      typeof window.lucide.createIcons === "function"
    ) {
      window.lucide.createIcons();
    }
  }

  // =====================================
  // ÍCONES DOS BOTÕES DE AÇÃO
  // =====================================

  const actionIcons = {
    "edit-transaction": "pencil",
    "delete-transaction": "trash-2",
    "settle-bill": "check-circle-2",
    "edit-bill": "pencil",
    "delete-bill": "trash-2",
    "contribute": "piggy-bank",
    "withdraw-goal": "arrow-up-right",
    "edit-goal": "pencil",
    "delete-goal": "trash-2",
    "new-purchase": "shopping-bag",
    "edit-card": "pencil",
    "delete-card": "trash-2",
    "pay-invoice": "receipt",
    "generate-recurring": "file-plus-2",
    "toggle-recurring": "pause-circle",
    "edit-recurring": "pencil",
    "delete-recurring": "trash-2",
    "edit-wallet": "pencil",
    "delete-wallet": "trash-2"
  };

  // =====================================
  // BOTÕES DINÂMICOS
  // =====================================

  function button(action, itemId, label) {
    const icon =
      action === "toggle-recurring" &&
      label === "Ativar"
        ? "play-circle"
        : actionIcons[action] || "circle-dot";

    return `
      <button
        type="button"
        class="small-btn"
        data-action="${escapeHTML(action)}"
        data-id="${escapeHTML(itemId)}"
      >
        <i
          data-lucide="${icon}"
          aria-hidden="true"
        ></i>

        <span>
          ${escapeHTML(label)}
        </span>
      </button>
    `;
  }

  // =====================================
  // MENSAGEM PARA LISTAS VAZIAS
  // =====================================

  function empty(message) {
    return `
      <div class="empty">
        ${escapeHTML(message)}
      </div>
    `;
  }

  // =====================================
  // COMPONENTE DE LINHA
  // =====================================

  function listRow(title, subtitle, right) {
    return `
      <div class="list-row">
        <div>
          <strong>
            ${escapeHTML(title)}
          </strong>

          <small>
            ${escapeHTML(subtitle)}
          </small>
        </div>

        <div class="right">
          ${right}
        </div>
      </div>
    `;
  }

  // =====================================
  // DASHBOARD DE FINANÇAS PESSOAIS
  // =====================================

  function renderDashboard() {
    const totals = monthTotals();

    // SALDO DISPONÍVEL NAS CONTAS

    const available = db.wallets.reduce(
      (total, wallet) =>
        total + walletBalance(wallet.id),
      0
    );

    // INDICADORES FINANCEIROS

    const cards = [
      [
        "Receitas do mês",
        totals.income,
        "green"
      ],
      [
        "Despesas do mês",
        totals.expense,
        "red"
      ],
      [
        "Resultado do mês",
        totals.income - totals.expense,
        "orange"
      ],
      [
        "Disponível nas contas",
        available,
        ""
      ]
    ];

    $("stats").innerHTML = cards.map(item => `
      <article class="stat">
        <span>
          ${escapeHTML(item[0])}
        </span>

        <strong class="${item[2]}">
          ${money(item[1])}
        </strong>

        <small>
          Atualizado automaticamente
        </small>
      </article>
    `).join("");

    // GRÁFICO DOS ÚLTIMOS SEIS MESES

    const months = Array.from(
      { length: 6 },
      (_, index) =>
        shiftMonth(
          selectedMonth(),
          index - 5
        )
    );

    const max = Math.max(
      1,
      ...months.flatMap(month => {
        const totals = monthTotals(month);

        return [
          totals.income,
          totals.expense
        ];
      })
    );

    $("chart").innerHTML = months.map(month => {
      const totals = monthTotals(month);

      const incomeHeight = Math.max(
        2,
        totals.income / max * 160
      );

      const expenseHeight = Math.max(
        2,
        totals.expense / max * 160
      );

      return `
        <div class="chart-col">
          <div class="chart-bars">

            <div
              class="chart-bar"
              title="Receitas: ${money(totals.income)}"
              style="height:${incomeHeight}px"
            ></div>

            <div
              class="chart-bar expense"
              title="Despesas: ${money(totals.expense)}"
              style="height:${expenseHeight}px"
            ></div>

          </div>

          <span class="chart-label">
            ${month.slice(5)}/${month.slice(2, 4)}
          </span>
        </div>
      `;
    }).join("");

    // PRÓXIMAS CONTAS PENDENTES

    const pending = db.bills
      .filter(item => item.status !== "done")
      .sort(
        (a, b) =>
          a.due.localeCompare(b.due)
      )
      .slice(0, 5);

    $("upcoming").innerHTML = pending.length
      ? pending.map(item =>
          listRow(
            item.description,
            `${dateBR(item.due)} • ${item.type}`,
            `<strong>${money(item.amount)}</strong>`
          )
        ).join("")
      : empty("Nenhuma conta pendente.");

    // RESUMO DAS METAS FINANCEIRAS

    $("goalOverview").innerHTML = db.goals.length
      ? db.goals.slice(0, 4).map(goal => {
          const balance = goalBalance(goal.id);

          const percent = Math.min(
            100,
            Math.max(
              0,
              balance / goal.target * 100
            )
          );

          return `
            <div style="margin-bottom:15px">

              <div class="list-row">
                <strong>
                  ${escapeHTML(goal.name)}
                </strong>

                <span>
                  ${money(balance)}
                  /
                  ${money(goal.target)}
                </span>
              </div>

              <div class="progress">
                <span
                  style="width:${percent}%"
                ></span>
              </div>

            </div>
          `;
        }).join("")
      : empty("Nenhuma meta cadastrada.");

    // ÚLTIMAS MOVIMENTAÇÕES

    $("recent").innerHTML = db.transactions.length
      ? db.transactions
          .slice()
          .sort(
            (a, b) =>
              b.date.localeCompare(a.date)
          )
          .slice(0, 5)
          .map(item =>
            listRow(
              item.description,
              `${dateBR(item.date)} • ${
                walletName(item.walletId)
              }`,
              `
                <strong class="${
                  item.type === "Receita"
                    ? "green"
                    : "red"
                }">
                  ${money(item.amount)}
                </strong>
              `
            )
          ).join("")
      : empty(
          "Nenhuma movimentação registrada."
        );
  }

  // =====================================
  // MOVIMENTAÇÕES FINANCEIRAS
  // =====================================

  function renderTransactions() {
    const search = $("txSearch").value.toLowerCase();
    const type = $("txType").value;
    const wallet = $("txWallet").value;

    // ATUALIZAR FILTRO DE CONTAS

    $("txWallet").innerHTML = `
      <option value="">
        Todas as contas
      </option>

      ${db.wallets.map(item => `
        <option value="${escapeHTML(item.id)}">
          ${escapeHTML(item.name)}
        </option>
      `).join("")}
    `;

    $("txWallet").value = wallet;

    // FILTRAR MOVIMENTAÇÕES

    const rows = db.transactions
      .filter(item =>
        inMonth(item.date) &&
        (!type || item.type === type) &&
        (!wallet || item.walletId === wallet) &&
        `${item.description} ${item.category}`
          .toLowerCase()
          .includes(search)
      )
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date)
      );

    // PREENCHER TABELA

    $("txRows").innerHTML = rows.length
      ? rows.map(item => `
        <tr>
          <td>
            ${dateBR(item.date)}
          </td>

          <td>
            ${escapeHTML(item.description)}
          </td>

          <td>
            ${escapeHTML(item.category)}
          </td>

          <td>
            ${escapeHTML(
              walletName(item.walletId)
            )}
          </td>

          <td>
            ${escapeHTML(item.payment || "-")}
          </td>

          <td class="${
            item.type === "Receita"
              ? "green"
              : "red"
          }">
            ${money(item.amount)}
          </td>

          <td>
            <div class="row-actions">
              ${
                item.linked
                  ? `
                    <span class="pill good">
                      <i
                        data-lucide="check-circle-2"
                        aria-hidden="true"
                      ></i>
                      Automático
                    </span>

                    ${button(
                      "delete-transaction",
                      item.id,
                      "Excluir"
                    )}
                  `
                  : button(
                      "edit-transaction",
                      item.id,
                      "Editar"
                    ) +
                    button(
                      "delete-transaction",
                      item.id,
                      "Excluir"
                    )
              }
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

    refreshIcons();
  }

  // =====================================
  // CONTAS A PAGAR E RECEBER
  // =====================================

  function renderBills() {
    const pending = db.bills.filter(
      item => item.status !== "done"
    );

    // CALCULAR VALORES PENDENTES

    const total = type =>
      pending
        .filter(item => item.type === type)
        .reduce(
          (sum, item) =>
            sum + Number(item.amount),
          0
        );

    // CALCULAR CONTAS VENCIDAS

    const overdue = pending
      .filter(item => item.due < today())
      .reduce(
        (sum, item) =>
          sum + Number(item.amount),
        0
      );

    // INDICADORES DAS CONTAS

    $("billStats").innerHTML = [
      [
        "A pagar",
        money(total("Pagar"))
      ],
      [
        "A receber",
        money(total("Receber"))
      ],
      [
        "Vencidas",
        money(overdue)
      ]
    ].map(item => `
      <div class="mini-stat">
        <span>
          ${item[0]}
        </span>

        <strong>
          ${item[1]}
        </strong>
      </div>
    `).join("");

    // HISTÓRICO DE CONTAS

    $("billRows").innerHTML = db.bills.length
      ? db.bills
          .slice()
          .sort(
            (a, b) =>
              a.due.localeCompare(b.due)
          )
          .map(item => `
            <tr>
              <td>
                ${dateBR(item.due)}
              </td>

              <td>
                ${escapeHTML(item.description)}
              </td>

              <td>
                ${escapeHTML(item.type)}
              </td>

              <td>
                ${money(item.amount)}
              </td>

              <td>
                ${
                  item.status === "done"
                    ? `
                      <span class="pill good">
                        <i
                          data-lucide="check-circle-2"
                          aria-hidden="true"
                        ></i>
                        Concluída
                      </span>
                    `
                    : `
                      <span class="pill warning">
                        <i
                          data-lucide="clock-3"
                          aria-hidden="true"
                        ></i>
                        Pendente
                      </span>
                    `
                }
              </td>

              <td>
                <div class="row-actions">
                  ${
                    item.status !== "done"
                      ? button(
                          "settle-bill",
                          item.id,
                          "Confirmar"
                        ) +
                        button(
                          "edit-bill",
                          item.id,
                          "Editar"
                        )
                      : ""
                  }

                  ${button(
                    "delete-bill",
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
            Nenhuma conta cadastrada.
          </td>
        </tr>
      `;

    refreshIcons();
  }

  // =====================================
  // METAS FINANCEIRAS
  // =====================================

  function renderGoals() {
    $("goalCards").innerHTML = db.goals.length
      ? db.goals.map(goal => {
          const balance = goalBalance(goal.id);

          const percent = Math.min(
            100,
            Math.max(
              0,
              balance / goal.target * 100
            )
          );

          return `
            <article class="tile">
              <span class="eyebrow">
                META FINANCEIRA
              </span>

              <h3>
                ${escapeHTML(goal.name)}
              </h3>

              <p>
                Objetivo: ${money(goal.target)}
              </p>

              <strong>
                ${money(balance)}
              </strong>

              <div class="progress">
                <span
                  style="width:${percent}%"
                ></span>
              </div>

              <p>
                ${percent.toFixed(0)}% alcançado
              </p>

              <div class="row-actions">
                ${button(
                  "contribute",
                  goal.id,
                  "Guardar"
                )}

                ${
                  balance > 0
                    ? button(
                        "withdraw-goal",
                        goal.id,
                        "Retirar"
                      )
                    : ""
                }

                ${button(
                  "edit-goal",
                  goal.id,
                  "Editar"
                )}

                ${button(
                  "delete-goal",
                  goal.id,
                  "Excluir"
                )}
              </div>
            </article>
          `;
        }).join("")
      : empty("Nenhuma meta cadastrada.");

    refreshIcons();
  }

  // =====================================
  // CARTÕES DE CRÉDITO
  // =====================================

  // =====================================
  // IDENTIFICAR PARCELAS DE UMA FATURA
  // =====================================

  function invoiceItems(cardId, month) {
    return db.purchases.flatMap(purchase => {
      if (purchase.cardId !== cardId) {
        return [];
      }

      const start = purchase.date.slice(0, 7);

      const difference =
        (
          Number(month.slice(0, 4)) -
          Number(start.slice(0, 4))
        ) * 12 +
        Number(month.slice(5)) -
        Number(start.slice(5));

      if (
        difference < 0 ||
        difference >= Number(
          purchase.installments
        )
      ) {
        return [];
      }

      return [{
        ...purchase,
        installment: difference + 1,
        value:
          Number(purchase.amount) /
          Number(purchase.installments)
      }];
    });
  }

  // =====================================
  // VALOR TOTAL DA FATURA
  // =====================================

  function invoiceTotal(cardId, month) {
    return invoiceItems(cardId, month)
      .reduce(
        (total, item) =>
          total + item.value,
        0
      );
  }

  // =====================================
  // VERIFICAR SE FATURA FOI PAGA
  // =====================================

  function paidInvoice(cardId, month) {
    return db.invoicePayments.find(
      item =>
        item.cardId === cardId &&
        item.month === month
    );
  }

  // =====================================
  // VALOR COMPROMETIDO DO CARTÃO
  // =====================================

  function committed(cardId) {
    return db.purchases
      .filter(
        item => item.cardId === cardId
      )
      .reduce((total, purchase) => {
        for (
          let index = 0;
          index < purchase.installments;
          index++
        ) {
          const month = shiftMonth(
            purchase.date.slice(0, 7),
            index
          );

          if (!paidInvoice(cardId, month)) {
            total +=
              purchase.amount /
              purchase.installments;
          }
        }

        return total;
      }, 0);
  }

  // =====================================
  // EXIBIR CARTÕES DE CRÉDITO
  // =====================================

  function renderCards() {
    // CARTÕES CADASTRADOS

    $("creditCards").innerHTML = db.cards.some(card => !card.archived)
      ? db.cards.filter(card => !card.archived).map(card => `
        <article class="tile">
          <span class="eyebrow">
            CARTÃO DE CRÉDITO
          </span>

          <h3>
            ${escapeHTML(card.name)}
          </h3>

          <p>
            Vencimento: dia ${card.dueDay}
          </p>

          <strong>
            ${money(
              card.limit - committed(card.id)
            )}
          </strong>

          <p>
            Limite total: ${money(card.limit)}
          </p>

          <p>
            Compras em aberto:
            ${money(committed(card.id))}
          </p>

          <div class="row-actions">
            ${button(
              "new-purchase",
              card.id,
              "Nova compra"
            )}

            ${button(
              "edit-card",
              card.id,
              "Editar"
            )}

            ${button(
              "delete-card",
              card.id,
              "Excluir"
            )}
          </div>
        </article>
      `).join("")
      : empty("Nenhum cartão cadastrado.");

    // FATURAS DO MÊS SELECIONADO

    $("invoices").innerHTML = db.cards.some(card => !card.archived)
      ? db.cards.filter(card => !card.archived).map(card => {
          const total = invoiceTotal(
            card.id,
            selectedMonth()
          );

          const paid = paidInvoice(
            card.id,
            selectedMonth()
          );

          return listRow(
            card.name,
            `${
              invoiceItems(
                card.id,
                selectedMonth()
              ).length
            } compras no mês`,
            `
              <strong>
                ${money(total)}
              </strong>

              <div class="row-actions">
                ${
                  paid
                    ? `
                      <span class="pill good">
                        <i
                          data-lucide="check-circle-2"
                          aria-hidden="true"
                        ></i>
                        Fatura paga
                      </span>
                    `
                    : total > 0
                      ? button(
                          "pay-invoice",
                          card.id,
                          "Pagar fatura"
                        )
                      : `
                        <span class="muted">
                          Sem cobrança
                        </span>
                      `
                }
              </div>
            `
          );
        }).join("")
      : empty(
          "Cadastre um cartão para visualizar faturas."
        );

    refreshIcons();
  }

  // =====================================
  // GASTOS FIXOS
  // =====================================

  // VERIFICAR SE A CONTA DO MÊS JÁ FOI GERADA

  function recurringBill(item, month) {
    return db.bills.find(
      bill =>
        bill.recurringId === item.id &&
        bill.period === month
    );
  }

  // =====================================
  // EXIBIR GASTOS FIXOS
  // =====================================

  function renderRecurring() {
    const active = db.recurring.filter(
      item => item.active
    );

    // INDICADORES DOS GASTOS FIXOS

    $("recurringStats").innerHTML = [
      [
        "Custo mensal",
        money(
          active.reduce(
            (total, item) =>
              total + Number(item.amount),
            0
          )
        )
      ],
      [
        "Gastos ativos",
        active.length
      ],
      [
        "Contas geradas",
        active.filter(
          item =>
            recurringBill(
              item,
              selectedMonth()
            )
        ).length
      ]
    ].map(item => `
      <div class="mini-stat">
        <span>
          ${item[0]}
        </span>

        <strong>
          ${item[1]}
        </strong>
      </div>
    `).join("");

    // =====================================
    // TABELA DE GASTOS FIXOS
    // =====================================

    $("recurringRows").innerHTML =
      db.recurring.length
        ? db.recurring.map(item => `
          <tr>
            <td>
              ${escapeHTML(item.name)}
            </td>

            <td>
              ${escapeHTML(item.category)}
            </td>

            <td>
              Dia ${item.day}
            </td>

            <td>
              ${money(item.amount)}
            </td>

            <td>
              ${
                item.active
                  ? `
                    <span class="pill good">
                      <i
                        data-lucide="check-circle-2"
                        aria-hidden="true"
                      ></i>
                      Ativo
                    </span>
                  `
                  : `
                    <span class="pill">
                      <i
                        data-lucide="pause-circle"
                        aria-hidden="true"
                      ></i>
                      Pausado
                    </span>
                  `
              }
            </td>

            <td>
              <div class="row-actions">
                ${
                  item.active &&
                  !recurringBill(
                    item,
                    selectedMonth()
                  )
                    ? button(
                        "generate-recurring",
                        item.id,
                        "Gerar conta"
                      )
                    : ""
                }

                ${button(
                  "toggle-recurring",
                  item.id,
                  item.active
                    ? "Pausar"
                    : "Ativar"
                )}

                ${button(
                  "edit-recurring",
                  item.id,
                  "Editar"
                )}

                ${button(
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

    refreshIcons();
  }

  // =====================================
  // CONTAS E CARTEIRAS
  // =====================================

  function renderWallets() {
    // =====================================
    // EXIBIR CONTAS CADASTRADAS
    // =====================================

    $("walletCards").innerHTML =
      db.wallets.length
        ? db.wallets.map(wallet => `
          <article class="tile">
            <span class="eyebrow">
              ${escapeHTML(wallet.kind)}
            </span>

            <h3>
              ${escapeHTML(wallet.name)}
            </h3>

            <strong>
              ${money(
                walletBalance(wallet.id)
              )}
            </strong>

            <p>
              Saldo inicial:
              ${money(wallet.initial)}
            </p>

            <div class="row-actions">
              ${button(
                "edit-wallet",
                wallet.id,
                "Editar"
              )}

              ${button(
                "delete-wallet",
                wallet.id,
                "Excluir"
              )}
            </div>
          </article>
        `).join("")
        : empty(
            "Cadastre sua primeira conta ou carteira."
          );

    // =====================================
    // HISTÓRICO DE TRANSFERÊNCIAS
    // =====================================

    $("transferList").innerHTML =
      db.transfers.length
        ? db.transfers
            .slice()
            .sort(
              (a, b) =>
                b.date.localeCompare(a.date)
            )
            .slice(0, 10)
            .map(item =>
              listRow(
                `${
                  walletName(item.from)
                } → ${
                  walletName(item.to)
                }`,
                dateBR(item.date),
                `
                  <strong>
                    ${money(item.amount)}
                  </strong>
                `
              )
            ).join("")
        : empty(
            "Nenhuma transferência registrada."
          );

    refreshIcons();
  }

  // =====================================
  // RENDERIZAÇÃO GERAL
  // =====================================

  function render() {
    renderDashboard();
    renderTransactions();
    renderBills();
    renderGoals();
    renderCards();
    renderRecurring();
    renderWallets();

    refreshIcons();
  }

  // =====================================
  // TÍTULOS DAS PÁGINAS
  // =====================================

  const sections = {
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

  // =====================================
  // NAVEGAÇÃO ENTRE AS PÁGINAS
  // =====================================

  function navigate(page) {
    if (!sections[page]) {
      return;
    }

    currentPage = page;

    document.querySelectorAll(".page")
      .forEach(element => {
        element.classList.toggle(
          "active",
          element.id === `page-${page}`
        );
      });

    document.querySelectorAll("#nav button")
      .forEach(element => {
        element.classList.toggle(
          "active",
          element.dataset.page === page
        );
      });

    $("pageTitle").textContent =
      sections[page][0];

    $("pageSubtitle").textContent =
      sections[page][1];

    // FECHAR MENU MOBILE AO NAVEGAR

    const sidebar = $("personalSidebar");
    const backdrop = $("mobileMenuBackdrop");
    const menuToggle = $("mobileMenuToggle");

    if (sidebar) {
      sidebar.classList.remove("mobile-open");
    }

    if (backdrop) {
      backdrop.hidden = true;
    }

    if (menuToggle) {
      menuToggle.setAttribute(
        "aria-expanded",
        "false"
      );
    }

    render();
  }

  // =====================================
  // CLIQUES NO MENU LATERAL
  // =====================================

  $("nav").addEventListener(
    "click",
    event => {
      const button = event.target.closest(
        "[data-page]"
      );

      if (button) {
        navigate(button.dataset.page);
      }
    }
  );

  // =====================================
  // BOTÕES DE ATALHO
  // =====================================

  document.body.addEventListener(
    "click",
    event => {
      const button = event.target.closest(
        "[data-go]"
      );

      if (button) {
        navigate(button.dataset.go);
      }
    }
  );

  // =====================================
  // FORMULÁRIOS
  // =====================================

  function options(items, selected = "") {
    return `
      <option value="">
        Selecione
      </option>

      ${items.map(item => `
        <option
          value="${escapeHTML(item.id)}"
          ${
            item.id === selected
              ? "selected"
              : ""
          }
        >
          ${escapeHTML(item.name)}
        </option>
      `).join("")}
    `;
  }

  function input(
    name,
    label,
    type = "text",
    value = "",
    attributes = ""
  ) {
    return `
      <label>
        ${escapeHTML(label)}

        <input
          name="${name}"
          type="${type}"
          value="${escapeHTML(value)}"
          ${attributes}
          required
        >
      </label>
    `;
  }

  function select(
    name,
    label,
    items,
    selected = ""
  ) {
    return `
      <label>
        ${escapeHTML(label)}

        <select
          name="${name}"
          required
        >
          ${options(items, selected)}
        </select>
      </label>
    `;
  }

  function enumSelect(
    name,
    label,
    values,
    selected
  ) {
    return select(
      name,
      label,
      values.map(value => ({
        id: value,
        name: value
      })),
      selected
    );
  }

  // =====================================
  // ABRIR FORMULÁRIOS
  // =====================================

  function openModal(
    type,
    itemId = "",
    defaults = {}
  ) {
    if (
      [
        "transaction",
        "bill",
        "transfer",
        "contribution",
        "invoice"
      ].includes(type) &&
      !db.wallets.length
    ) {
      toast(
        "Cadastre uma conta ou carteira primeiro."
      );

      navigate("wallets");
      return;
    }

    if (
      type === "purchase" &&
      !db.cards.some(card => !card.archived)
    ) {
      toast(
        "Cadastre um cartão primeiro."
      );

      navigate("cards");
      return;
    }

    modalType = type;
    editingId = itemId;

    const collections = {
      transaction: "transactions",
      bill: "bills",
      goal: "goals",
      card: "cards",
      recurring: "recurring",
      wallet: "wallets"
    };

    const item = itemId
      ? get(collections[type], itemId)
      : null;

    const data = {
      ...defaults,
      ...(item || {})
    };

    const titles = {
      transaction: "movimentação",
      bill: "conta",
      goal: "meta financeira",
      card: "cartão de crédito",
      purchase: "compra parcelada",
      recurring: "gasto fixo",
      wallet: "conta ou carteira",
      transfer: "transferência",
      contribution: "movimentação da meta",
      invoice: "pagamento de fatura"
    };

    $("modalTitle").textContent =
      `${item ? "Editar" : "Nova"} ${titles[type]}`;

    // =====================================
    // CAMPOS REUTILIZÁVEIS
    // =====================================

    const valueInput = (
      value = data.amount
    ) =>
      input(
        "amount",
        "Valor (R$)",
        "number",
        value || "",
        'min="0.01" step="0.01"'
      );

    const dateInput = (
      value = data.date
    ) =>
      input(
        "date",
        "Data",
        "date",
        value || today()
      );

    const walletInput = (
      value = data.walletId
    ) =>
      select(
        "walletId",
        "Conta / carteira",
        db.wallets,
        value
      );

    let html = "";

    // =====================================
    // TIPOS DE FORMULÁRIO
    // =====================================

    switch (type) {

      // MOVIMENTAÇÃO FINANCEIRA

      case "transaction":
        html =
          enumSelect(
            "type",
            "Tipo",
            [
              "Receita",
              "Despesa"
            ],
            data.type || "Despesa"
          ) +

          dateInput() +

          input(
            "description",
            "Descrição",
            "text",
            data.description || ""
          ) +

          input(
            "category",
            "Categoria",
            "text",
            data.category || "Outros"
          ) +

          valueInput() +

          walletInput() +

          enumSelect(
            "payment",
            "Pagamento",
            [
              "Pix",
              "Cartão de débito",
              "Dinheiro",
              "Transferência",
              "Boleto"
            ],
            data.payment || "Pix"
          );
        break;

      // CONTAS A PAGAR E RECEBER

      case "bill":
        html =
          enumSelect(
            "type",
            "Tipo",
            [
              "Pagar",
              "Receber"
            ],
            data.type || "Pagar"
          ) +

          input(
            "due",
            "Vencimento",
            "date",
            data.due || today()
          ) +

          input(
            "description",
            "Descrição",
            "text",
            data.description || ""
          ) +

          input(
            "category",
            "Categoria",
            "text",
            data.category || "Contas"
          ) +

          valueInput();
        break;

      // METAS FINANCEIRAS

      case "goal":
        html =
          input(
            "name",
            "Nome da meta",
            "text",
            data.name || ""
          ) +

          input(
            "target",
            "Valor desejado",
            "number",
            data.target || "",
            'min="0.01" step="0.01"'
          ) +

          `
            <label>
              Prazo (opcional)

              <input
                name="deadline"
                type="date"
                value="${
                  escapeHTML(
                    data.deadline || ""
                  )
                }"
              >
            </label>
          `;
        break;

      // CARTÕES DE CRÉDITO

      case "card":
        html =
          input(
            "name",
            "Nome do cartão",
            "text",
            data.name || ""
          ) +

          input(
            "limit",
            "Limite total",
            "number",
            data.limit || "",
            'min="0.01" step="0.01"'
          ) +

          input(
            "dueDay",
            "Dia do vencimento",
            "number",
            data.dueDay || 10,
            'min="1" max="28"'
          );
        break;

      // COMPRAS PARCELADAS

      case "purchase":
        html =
          select(
            "cardId",
            "Cartão",
            db.cards.filter(card => !card.archived),
            data.cardId
          ) +

          dateInput() +

          input(
            "description",
            "Descrição da compra"
          ) +

          valueInput() +

          input(
            "installments",
            "Número de parcelas",
            "number",
            1,
            'min="1" max="48"'
          );
        break;

      // GASTOS FIXOS

      case "recurring":
        html =
          input(
            "name",
            "Nome da despesa",
            "text",
            data.name || ""
          ) +

          input(
            "category",
            "Categoria",
            "text",
            data.category || "Assinaturas"
          ) +

          input(
            "day",
            "Dia do vencimento",
            "number",
            data.day || 10,
            'min="1" max="28"'
          ) +

          valueInput();
        break;

      // CONTAS E CARTEIRAS

      case "wallet":
        html =
          input(
            "name",
            "Nome da conta",
            "text",
            data.name || ""
          ) +

          enumSelect(
            "kind",
            "Tipo",
            [
              "Conta corrente",
              "Poupança",
              "Carteira",
              "Conta digital",
              "Outro"
            ],
            data.kind || "Conta corrente"
          ) +

          input(
            "initial",
            "Saldo inicial",
            "number",
            data.initial ?? 0,
            'step="0.01"'
          );
        break;

      // TRANSFERÊNCIAS

      case "transfer":
        html =
          select(
            "from",
            "Conta de origem",
            db.wallets
          ) +

          select(
            "to",
            "Conta de destino",
            db.wallets
          ) +

          dateInput() +

          valueInput();
        break;

      // MOVIMENTAÇÕES DAS METAS

      case "contribution":
        html =
          select(
            "goalId",
            "Meta",
            db.goals,
            data.goalId
          ) +

          walletInput() +

          dateInput() +

          valueInput();
        break;

      // PAGAMENTO DE FATURA

      case "invoice":
        html =
          `
            <div class="wide muted">
              Fatura:
              ${
                money(
                  invoiceTotal(
                    data.cardId,
                    data.month
                  )
                )
              }
            </div>
          ` +

          walletInput() +

          dateInput() +

          enumSelect(
            "payment",
            "Pagamento",
            [
              "Pix",
              "Transferência",
              "Dinheiro",
              "Boleto"
            ],
            "Pix"
          );
        break;
    }

    // =====================================
    // EXIBIR FORMULÁRIO
    // =====================================

    $("modalFields").innerHTML = html;

    $("modal").hidden = false;

    refreshIcons();

    // FOCAR NO PRIMEIRO CAMPO

    const firstInput = $("modalFields").querySelector(
      "input, select"
    );

    if (firstInput) {
      firstInput.focus();
    }
  }

  function closeModal() {
    $("modal").hidden = true;

    $("modalForm").reset();

    modalType = "";
    editingId = "";
  }

  // =====================================
  // EVENTOS DO MODAL
  // =====================================

  $("closeModal").onclick = closeModal;

  $("cancelModal").onclick = closeModal;

  $("modal").addEventListener(
    "click",
    event => {
      if (event.target === $("modal")) {
        closeModal();
      }
    }
  );

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Escape" &&
        !$("modal").hidden
      ) {
        closeModal();
      }
    }
  );

  // =====================================
  // BOTÕES DE NOVO CADASTRO
  // =====================================

  document.querySelectorAll(
    "[data-add]"
  ).forEach(button => {
    button.onclick = () =>
      openModal(
        button.dataset.add
      );
  });

  // =====================================
  // CRIAR OU EDITAR REGISTROS
  // =====================================

  function record(
    collection,
    data,
    itemId
  ) {
    if (itemId) {
      const index =
        db[collection].findIndex(
          item => item.id === itemId
        );

      if (index === -1) {
        throw new Error(
          "Registro não encontrado."
        );
      }

      db[collection][index] = {
        ...db[collection][index],
        ...data
      };
    } else {
      db[collection].push({
        id: id(),
        ...data
      });
    }
  }

  // =====================================
  // SALVAR FORMULÁRIOS
  // =====================================

  $("modalForm").addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      const form = new FormData(
        event.currentTarget
      );

      const value = name =>
        String(
          form.get(name) || ""
        ).trim();

      const type = modalType;
      const itemId = editingId;

      const success = await update(() => {
        switch (type) {

          // =====================================
          // MOVIMENTAÇÕES
          // =====================================

          case "transaction":
            record(
              "transactions",
              {
                type: value("type"),
                date: value("date"),
                description:
                  value("description"),
                category:
                  value("category"),
                amount:
                  amount(value("amount")),
                walletId:
                  value("walletId"),
                payment:
                  value("payment")
              },
              itemId
            );
            break;

          // =====================================
          // CONTAS A PAGAR E RECEBER
          // =====================================

          case "bill":
            record(
              "bills",
              {
                type: value("type"),
                due: value("due"),
                description:
                  value("description"),
                category:
                  value("category"),
                amount:
                  amount(value("amount")),
                status: itemId
                  ? get(
                      "bills",
                      itemId
                    ).status
                  : "pending"
              },
              itemId
            );
            break;

          // =====================================
          // METAS FINANCEIRAS
          // =====================================

          case "goal":
            record(
              "goals",
              {
                name: value("name"),
                target:
                  amount(
                    value("target")
                  ),
                deadline:
                  value("deadline")
              },
              itemId
            );
            break;

          // =====================================
          // CARTÕES DE CRÉDITO
          // =====================================

          case "card": {
            const limit = amount(
              value("limit")
            );

            if (
              itemId &&
              limit < committed(itemId)
            ) {
              throw new Error(
                "Limite menor que as compras em aberto."
              );
            }

            record(
              "cards",
              {
                name: value("name"),
                limit,
                dueDay:
                  Number(
                    value("dueDay")
                  )
              },
              itemId
            );
            break;
          }

          // =====================================
          // COMPRAS PARCELADAS
          // =====================================

          case "purchase": {
            const card = get(
              "cards",
              value("cardId")
            );

            const total = amount(
              value("amount")
            );

            const installments = Number(
              value("installments")
            );

            if (!card) {
              throw new Error(
                "Cartão inválido."
              );
            }

            if (
              !Number.isInteger(
                installments
              ) ||
              installments < 1 ||
              installments > 48
            ) {
              throw new Error(
                "Informe entre 1 e 48 parcelas."
              );
            }

            if (
              committed(card.id) + total >
              card.limit
            ) {
              throw new Error(
                "Limite insuficiente no cartão."
              );
            }

            db.purchases.push({
              id: id(),
              cardId: card.id,
              date: value("date"),
              description:
                value("description"),
              amount: total,
              installments
            });
            break;
          }

          // =====================================
          // GASTOS FIXOS
          // =====================================

          case "recurring":
            record(
              "recurring",
              {
                name: value("name"),
                category:
                  value("category"),
                day:
                  Number(
                    value("day")
                  ),
                amount:
                  amount(
                    value("amount")
                  ),
                active: itemId
                  ? get(
                      "recurring",
                      itemId
                    ).active
                  : true
              },
              itemId
            );
            break;

          // =====================================
          // CONTAS E CARTEIRAS
          // =====================================

          case "wallet":
            record(
              "wallets",
              {
                name: value("name"),
                kind: value("kind"),
                initial:
                  Number(
                    value("initial")
                  )
              },
              itemId
            );
            break;

          // =====================================
          // TRANSFERÊNCIAS
          // =====================================

          case "transfer": {
            const from = value("from");
            const to = value("to");

            const total = amount(
              value("amount")
            );

            if (from === to) {
              throw new Error(
                "Escolha contas diferentes."
              );
            }

            if (
              !get("wallets", from) ||
              !get("wallets", to)
            ) {
              throw new Error(
                "Selecione contas válidas."
              );
            }

            if (
              walletBalance(from) < total
            ) {
              throw new Error(
                "Saldo insuficiente."
              );
            }

            db.transfers.push({
              id: id(),
              from,
              to,
              date: value("date"),
              amount: total
            });
            break;
          }

          // =====================================
          // MOVIMENTAÇÕES DAS METAS
          // =====================================

          case "contribution": {
            const total = amount(
              value("amount")
            );

            const walletId =
              value("walletId");

            const goalId =
              value("goalId");

            if (
              !get("wallets", walletId) ||
              !get("goals", goalId)
            ) {
              throw new Error(
                "Selecione uma conta e uma meta válidas."
              );
            }

            if (
              goalAction === "deposit" &&
              walletBalance(walletId) <
                total
            ) {
              throw new Error(
                "Saldo insuficiente na conta."
              );
            }

            if (
              goalAction === "withdraw" &&
              goalBalance(goalId) <
                total
            ) {
              throw new Error(
                "Saldo insuficiente na meta."
              );
            }

            db.goalMoves.push({
              id: id(),
              goalId,
              walletId,
              date: value("date"),
              amount: total,
              kind: goalAction
            });
            break;
          }

          // =====================================
          // PAGAMENTO DE FATURAS
          // =====================================

          case "invoice": {
            if (!invoiceContext) {
              throw new Error(
                "Nenhuma fatura selecionada."
              );
            }

            const {
              cardId,
              month
            } = invoiceContext;

            const total = invoiceTotal(
              cardId,
              month
            );

            const walletId =
              value("walletId");

            if (
              !get("wallets", walletId)
            ) {
              throw new Error(
                "Selecione uma conta válida."
              );
            }

            if (
              !total ||
              paidInvoice(
                cardId,
                month
              )
            ) {
              throw new Error(
                "Fatura indisponível."
              );
            }

            if (
              walletBalance(walletId) <
              total
            ) {
              throw new Error(
                "Saldo insuficiente."
              );
            }

            const transactionId = id();

            db.transactions.push({
              id: transactionId,
              type: "Despesa",
              date: value("date"),
              description:
                `Fatura ${
                  cardName(cardId)
                } ${month}`,
              category:
                "Cartão de crédito",
              amount: total,
              walletId,
              payment:
                value("payment"),
              linked: true
            });

            db.invoicePayments.push({
              id: id(),
              cardId,
              month,
              date: value("date"),
              transactionId
            });
            break;
          }

          default:
            throw new Error(
              "Tipo de formulário inválido."
            );
        }
      });

      // =====================================
      // CONFIRMAÇÃO DE SALVAMENTO
      // =====================================

      if (success) {
        closeModal();

        toast(
          "Registro salvo com sucesso!"
        );
      }
    }
  );

  async function settleBill(item) {
    if (!db.wallets.length) {
      toast("Cadastre uma conta primeiro.");
      return;
    }

    const names = db.wallets
      .map(wallet => wallet.name)
      .join(", ");

    const chosen = prompt(
      `Em qual conta deseja confirmar?\nContas: ${names}`,
      db.wallets[0].name
    );

    if (chosen === null) return;

    const wallet = db.wallets.find(
      wallet =>
        wallet.name.toLowerCase() ===
        chosen.trim().toLowerCase()
    );

    if (!wallet) {
      toast("Conta não encontrada.");
      return;
    }

    if (
      item.type === "Pagar" &&
      walletBalance(wallet.id) < item.amount
    ) {
      toast("Saldo insuficiente.");
      return;
    }

    if (!confirm(`Confirmar ${money(item.amount)}?`)) {
      return;
    }

    await update(() => {
      const transactionId = id();

      db.transactions.push({
        id: transactionId,
        type: item.type === "Pagar" ? "Despesa" : "Receita",
        date: today(),
        description: item.description,
        category: item.category,
        amount: Number(item.amount),
        walletId: wallet.id,
        payment: "Transferência",
        linked: true
      });

      item.status = "done";
      item.transactionId = transactionId;
    });

    // A confirmação é exibida somente após o salvamento no servidor.
  }

  // =====================================
  // EXCLUSÃO DE MOVIMENTAÇÕES AUTOMÁTICAS
  // =====================================

  async function removeTransaction(itemId) {
    const transaction = get("transactions", itemId);
    if (!transaction) {
      toast("Movimentação não encontrada.");
      return;
    }

    const bill = db.bills.find(
      item => item.transactionId === itemId
    );
    const invoice = db.invoicePayments.find(
      item => item.transactionId === itemId
    );

    // Lançamentos antigos podem não ter o identificador da origem.
    // Nesse caso, apenas a movimentação será excluída.
    // Nenhuma conta ou fatura será alterada automaticamente.
    const legacyOrphan = Boolean(transaction.linked && !bill && !invoice);

    const message = bill
      ? "Excluir a movimentação e reabrir a conta como pendente?"
      : invoice
        ? "Excluir a movimentação e marcar a fatura como não paga?"
        : legacyOrphan
          ? "ATENÇÃO: este lançamento automático antigo não possui vínculo identificado. Excluir apenas esta movimentação? O saldo será recalculado, mas contas e faturas permanecerão inalteradas. Confira os registros após excluir."
          : "Deseja realmente excluir esta movimentação?";

    if (!confirm(message)) return;

    const success = await update(() => {
      const current = get("transactions", itemId);
      if (!current) {
        throw new Error("Movimentação não encontrada.");
      }

      const currentBill = db.bills.find(
        item => item.transactionId === itemId
      );
      const currentInvoice = db.invoicePayments.find(
        item => item.transactionId === itemId
      );

      // Preserva a proteção caso o vínculo tenha mudado durante
      // uma sincronização; somente registros já órfãos podem
      // ser excluídos sem atualizar uma conta ou fatura.
      if (current.linked && !currentBill && !currentInvoice && !legacyOrphan) {
        throw new Error(
          "O vínculo da movimentação mudou. Recarregue a página e tente novamente."
        );
      }

      if (currentBill) {
        currentBill.status = "pending";
        delete currentBill.transactionId;
      }

      if (currentInvoice) {
        db.invoicePayments = db.invoicePayments.filter(
          item => item.transactionId !== itemId
        );
      }

      db.transactions = db.transactions.filter(
        item => item.id !== itemId
      );
    });

    if (success) toast("Movimentação excluída com sucesso.");
  }

  // =====================================
  // EXCLUSÃO
  // =====================================

  async function remove(collection, itemId) {
    if (collection === "cards") {
      const card = get("cards", itemId);
      if (!card || card.archived) {
        toast("Cartão não encontrado ou já excluído.");
        return;
      }

      const purchases = db.purchases.filter(item => item.cardId === itemId);
      const payments = db.invoicePayments.filter(item => item.cardId === itemId);
      const message =
        `Excluir definitivamente o cartão ${card.name}?\n\n` +
        `${purchases.length} compra(s) e ${payments.length} pagamento(s) de fatura serão removidos.\n` +
        `As parcelas desaparecerão e os saldos das contas serão recalculados.\n\n` +
        `Esta ação não pode ser desfeita.`;
      if (!window.confirm(message)) return;

      const success = await update(() => {
        const current = get("cards", itemId);
        if (!current || current.archived) {
          throw new Error("Cartão não encontrado ou já excluído.");
        }

        const currentPayments = db.invoicePayments.filter(item => item.cardId === itemId);
        const transactionIds = new Set(currentPayments.map(item => item.transactionId).filter(Boolean));

        // Nunca excluir uma movimentação compartilhada com outro registro.
        if (db.bills.some(item => transactionIds.has(item.transactionId)) ||
            db.invoicePayments.some(item => item.cardId !== itemId && transactionIds.has(item.transactionId))) {
          throw new Error("Há movimentações compartilhadas com outros registros. Exclusão cancelada.");
        }

        db.purchases = db.purchases.filter(item => item.cardId !== itemId);
        db.invoicePayments = db.invoicePayments.filter(item => item.cardId !== itemId);
        db.transactions = db.transactions.filter(item => !transactionIds.has(item.id));
        db.cards = db.cards.filter(item => item.id !== itemId);
        if (invoiceContext?.cardId === itemId) invoiceContext = null;
      });

      if (success) toast("Cartão e registros vinculados excluídos definitivamente.");
      return;
    }

    const linked = {
      wallets: () =>
        db.transactions.some(item => item.walletId === itemId) ||
        db.transfers.some(item => item.from === itemId || item.to === itemId) ||
        db.goalMoves.some(item => item.walletId === itemId),
      goals: () => db.goalMoves.some(item => item.goalId === itemId)
    };

    if (linked[collection]?.()) {
      toast("Existem movimentações vinculadas a este registro.");
      return;
    }

    if (!window.confirm("Deseja realmente excluir este registro?")) return;

    await update(() => {
      db[collection] = db[collection].filter(item => item.id !== itemId);
    });
  }

  // =====================================
  // AÇÕES DOS BOTÕES
  // =====================================

  document.body.addEventListener("click", async event => {
    const element = event.target.closest("[data-action]");

    if (!element) return;

    const action = element.dataset.action;
    const itemId = element.dataset.id;

    const collections = {
      transaction: "transactions",
      bill: "bills",
      goal: "goals",
      card: "cards",
      recurring: "recurring",
      wallet: "wallets"
    };

    if (action.startsWith("edit-")) {
      openModal(action.replace("edit-", ""), itemId);
      return;
    }

    if (action === "delete-transaction") {
      await removeTransaction(itemId);
      return;
    }

    if (action.startsWith("delete-")) {
      const type = action.replace("delete-", "");
      const collection = collections[type];

      if (collection) {
        await remove(collection, itemId);
      }

      return;
    }


    // =====================================
    // CONFIRMAR CONTAS
    // =====================================

    switch (action) {
      case "settle-bill": {
        const item = get("bills", itemId);

        if (item && item.status !== "done") {
          await settleBill(item);
        }

        break;
      }

      // =====================================
      // GUARDAR OU RETIRAR DINHEIRO DAS METAS
      // =====================================

      case "contribute":
      case "withdraw-goal":
        goalAction =
          action === "contribute"
            ? "deposit"
            : "withdraw";

        openModal("contribution", "", {
          goalId: itemId
        });
        break;

      // =====================================
      // NOVA COMPRA NO CARTÃO
      // =====================================

      case "new-purchase":
        openModal("purchase", "", {
          cardId: itemId
        });
        break;

      // =====================================

      // PAGAR FATURA
      // =====================================

      case "pay-invoice":
        invoiceContext = {
          cardId: itemId,
          month: selectedMonth()
        };

        openModal("invoice", "", invoiceContext);
        break;

      // =====================================
      // ATIVAR OU PAUSAR GASTO FIXO
      // =====================================

      case "toggle-recurring":
        await update(() => {
          const item = get("recurring", itemId);

          if (!item) {
            throw new Error(
              "Gasto fixo não encontrado."
            );
          }

          item.active = !item.active;
        });
        break;

      // =====================================
      // GERAR CONTA DE GASTO FIXO
      // =====================================

      case "generate-recurring": {
        const item = get("recurring", itemId);
        const month = selectedMonth();

        if (
          !item ||
          !item.active ||
          recurringBill(item, month)
        ) {
          return;
        }

        await update(() => {
          db.bills.push({
            id: id(),
            type: "Pagar",
            due: `${month}-${String(item.day).padStart(2, "0")}`,
            description: item.name,
            category: item.category,
            amount: item.amount,
            status: "pending",
            recurringId: item.id,
            period: month
          });
        });

        break;
      }
    }
  });

  // =====================================
  // FILTROS DAS MOVIMENTAÇÕES
  // =====================================

  [
    "txSearch",
    "txType",
    "txWallet"
  ].forEach(elementId => {
    $(elementId).addEventListener(
      elementId === "txSearch"
        ? "input"
        : "change",
      renderTransactions
    );
  });

  // =====================================
  // FILTRO POR MÊS
  // =====================================

  monthInput.addEventListener(
    "change",
    render
  );

  // =====================================
  // EXPORTAÇÃO DE ARQUIVOS
  // =====================================

  function download(
    filename,
    content,
    type
  ) {
    const blob = new Blob(
      [content],
      { type }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);

    link.click();
    link.remove();

    setTimeout(
      () => URL.revokeObjectURL(url),
      1000
    );
  }

  // =====================================
  // EXPORTAR MOVIMENTAÇÕES EM CSV
  // =====================================

  $("csvBtn").onclick = () => {
    const rows = db.transactions.filter(
      item => inMonth(item.date)
    );

    if (!rows.length) {
      toast(
        "Nenhuma movimentação neste mês."
      );
      return;
    }

    const quote = value =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const data = [
      [
        "Data",
        "Tipo",
        "Descrição",
        "Categoria",
        "Conta",
        "Pagamento",
        "Valor"
      ],

      ...rows.map(item => [
        dateBR(item.date),
        item.type,
        item.description,
        item.category,
        walletName(item.walletId),
        item.payment,
        item.amount
      ])
    ];

    const csv = data
      .map(row =>
        row.map(quote).join(";")
      )
      .join("\r\n");

    download(
      `minhas-financas-${selectedMonth()}.csv`,
      "\uFEFF" + csv,
      "text/csv;charset=utf-8"
    );
  };

  // =====================================
  // INICIALIZAÇÃO DO SISTEMA
  // =====================================

  // CARREGAR DADOS DO POSTGRESQL

  try {
    const resposta = await WJ.api(
      "/financas-pessoais"
    );

    revisao = Number(
      resposta.revisao || 0
    );

    const servidor =
      resposta.dados || initialData();

    const dadosLocais = load();

    // =====================================
    // VERIFICAR DADOS ANTIGOS
    // =====================================

    const possuiDadosLocais =
      Object.values(dadosLocais)
        .some(lista => lista.length > 0);

    const servidorVazio =
      Object.values(servidor)
        .every(
          lista =>
            Array.isArray(lista) &&
            lista.length === 0
        );

    // =====================================
    // IMPORTAR DADOS DO NAVEGADOR
    // =====================================

    if (
      servidorVazio &&
      possuiDadosLocais
    ) {
      const importar = confirm(
        "Foram encontrados dados de Finanças Pessoais neste navegador. " +
        "Deseja importá-los para sua conta no PostgreSQL? " +
        "Uma cópia continuará no navegador."
      );

      if (importar) {
        db = dadosLocais;

        await save();

        toast(
          "Dados pessoais importados com sucesso!"
        );
      } else {
        db = servidor;
      }

    } else {
      db = servidor;

      if (
        possuiDadosLocais &&
        !servidorVazio
      ) {
        console.info(
          "Cópia local mantida; banco PostgreSQL tem prioridade."
        );
      }
    }

    // =====================================
    // EXIBIR TODAS AS INFORMAÇÕES
    // =====================================

    render();

  } catch (error) {
    console.error(
      "Erro ao carregar finanças pessoais:",
      error
    );

    toast(
      "Falha ao carregar dados pessoais. Nenhuma alteração foi realizada."
    );

    document.querySelectorAll(
      "[data-add], [data-action], #modalForm"
    ).forEach(element => {
      element.disabled = true;
    });
  }
});
