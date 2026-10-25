
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const autorizado = await WJ.init("consumo");

  if (!autorizado) return;

  const $ = id => document.getElementById(id);

  const form = $("consumeForm");
  const productInput = $("consumeProduct");
  const quantityInput = $("consumeQty");
  const reasonInput = $("consumeReason");
  const dateInput = $("consumeDate");
  const monthInput = $("consumeMonth");
  const table = $("consumeRows");

  const showAllButton = $("showAllConsumption");
  const exportButton = $("exportConsumptionCSV");
  const saveButton = $("saveConsume");

  let products = [];
  let consumption = [];
  let showAllMonths = false;
  let saving = false;
  let loading = false;
  let deleting = false;

  // ==========================================
  // FUNÇÕES AUXILIARES
  // ==========================================

  function refreshIcons() {
    if (typeof WJ.initIcons === "function") {
      WJ.initIcons();
    } else if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function showError(error, fallback) {
    console.error(error);
    WJ.toast(error?.message || fallback);
  }

  function formatQuantity(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
      maximumFractionDigits: 3
    });
  }

  function getCurrentMonth() {
    const today = new Date();

    return (
      today.getFullYear() +
      "-" +
      String(today.getMonth() + 1).padStart(2, "0")
    );
  }

  function getConsumptionDate(item) {
    return String(item.data || "").slice(0, 10);
  }

  function getQuantity(product) {
    return Number(product.quantidade || 0);
  }

  function getMinimum(product) {
    return Number(product.estoque_minimo || 0);
  }

  function getConsumedQuantity(item) {
    return Number(item.quantidade || 0);
  }

  function getConsumedName(item) {
    return String(
      item.produto_nome ||
      item.produtoNome ||
      item.nome ||
      "Produto"
    );
  }

  function getConsumedReason(item) {
    return String(
      item.motivo ||
      item.observacoes ||
      "-"
    );
  }

  // ==========================================
  // CARREGAR DADOS DO POSTGRESQL
  // ==========================================

  async function loadData() {
    if (loading) return;

    loading = true;

    try {
      const [stockData, consumptionData] =
        await Promise.all([
          WJ.api("/estoque"),
          WJ.api("/consumo")
        ]);

      if (
        !Array.isArray(stockData) ||
        !Array.isArray(consumptionData)
      ) {
        throw new Error(
          "O servidor retornou dados em formato inválido."
        );
      }

      products = stockData;
      consumption = consumptionData;

      updateProductOptions();
      render();

    } catch (error) {
      showError(
        error,
        "Não foi possível carregar os dados."
      );

    } finally {
      loading = false;
    }
  }

  // ==========================================
  // BOTÃO VER TODOS OS MESES
  // ==========================================

  function updateShowAllButton() {
    const iconName = showAllMonths
      ? "calendar-days"
      : "calendar-range";

    const label = showAllMonths
      ? "Mostrar mês selecionado"
      : "Ver todos os meses";

    showAllButton.innerHTML = `
      <i data-lucide="${iconName}" aria-hidden="true"></i>
      <span>${label}</span>
    `;

    showAllButton.setAttribute(
      "aria-pressed",
      String(showAllMonths)
    );

    refreshIcons();
  }

  // ==========================================
  // LISTA DE PRODUTOS
  // ==========================================

  function updateProductOptions() {
    const previous = productInput.value;

    productInput.replaceChildren();

    const placeholder = document.createElement("option");

    placeholder.value = "";

    placeholder.textContent = products.length
      ? "Selecione um produto"
      : "Nenhum produto cadastrado";

    productInput.appendChild(placeholder);

    products.forEach(product => {
      const option = document.createElement("option");

      option.value = String(product.id);

      option.textContent =
        `${product.nome} — ` +
        `${formatQuantity(product.quantidade)} ` +
        `${product.unidade || "un"} disponíveis`;

      option.disabled =
        Number(product.quantidade) <= 0;

      productInput.appendChild(option);
    });

    const previousExists = products.some(
      product =>
        String(product.id) === previous &&
        Number(product.quantidade) > 0
    );

    productInput.value = previousExists
      ? previous
      : "";

    updateStockPreview();
  }

  // ==========================================
  // VISUALIZAÇÃO DO ESTOQUE
  // ==========================================

  function updateStockPreview() {
    const preview = $("stockPreview");

    const product = products.find(
      item => String(item.id) === productInput.value
    );

    if (!product) {
      preview.textContent =
        "Selecione um produto para consultar o estoque.";
      return;
    }

    const quantity = getQuantity(product);
    const minimum = getMinimum(product);
    const low = quantity <= minimum;

    preview.innerHTML = `
      <strong>
        ${WJ.escape(product.nome)}
      </strong>

      <div>
        Disponível:
        ${formatQuantity(quantity)}
        ${WJ.escape(product.unidade || "un")}
      </div>

      <div>
        Estoque mínimo:
        ${formatQuantity(minimum)}
      </div>

      <div class="${low ? "bad" : "good"}">
        ${low ? "Produto em alerta" : "Estoque adequado"}
      </div>
    `;
  }

  // ==========================================
  // INDICADORES
  // ==========================================

  function renderIndicators() {
    const currentMonth = getCurrentMonth();

    const monthly = consumption.filter(
      item =>
        getConsumptionDate(item).startsWith(currentMonth)
    );

    const totalQuantity = monthly.reduce(
      (total, item) =>
        total + getConsumedQuantity(item),
      0
    );

    const lowStock = products.filter(product => {
      const quantity = getQuantity(product);
      const minimum = getMinimum(product);

      return (
        Number.isFinite(quantity) &&
        Number.isFinite(minimum) &&
        quantity <= minimum
      );
    });

    $("consumeCount").textContent = monthly.length;

    $("consumeQuantity").textContent =
      formatQuantity(totalQuantity);

    $("consumeLow").textContent = lowStock.length;

    $("currentMonth").textContent =
      new Date().toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric"
      });
  }

  // ==========================================
  // FILTRAR HISTÓRICO
  // ==========================================

  function getFilteredConsumption() {
    const selectedMonth = monthInput.value;

    return [...consumption]
      .filter(item => {
        if (showAllMonths) return true;

        return getConsumptionDate(item)
          .startsWith(selectedMonth);
      })
      .sort((a, b) => {
        const dateComparison = getConsumptionDate(b)
          .localeCompare(getConsumptionDate(a));

        return dateComparison ||
          Number(b.id) - Number(a.id);
      });
  }

  // ==========================================
  // HISTÓRICO DE CONSUMO
  // ==========================================

  function renderHistory() {
    const rows = getFilteredConsumption();

    $("consumeResults").textContent =
      `${rows.length} registro` +
      `${rows.length === 1 ? "" : "s"}`;

    if (!rows.length) {
      table.innerHTML = `
        <tr>
          <td colspan="5" class="empty-consumption">
            Nenhum consumo encontrado neste período.
          </td>
        </tr>
      `;

      return;
    }

    table.innerHTML = rows.map(item => `
      <tr>
        <td>
          ${WJ.escape(WJ.date(getConsumptionDate(item)))}
        </td>

        <td>
          ${WJ.escape(getConsumedName(item))}
        </td>

        <td>
          ${formatQuantity(getConsumedQuantity(item))}
        </td>

        <td>
          ${WJ.escape(getConsumedReason(item))}
        </td>

        <td style="text-align:center;">
          <button
            type="button"
            class="btn-delete-consumption"
            data-consumption-id="${WJ.escape(String(item.id))}"
            title="Excluir consumo"
            aria-label="Excluir consumo"
            style="
              display:inline-flex;
              align-items:center;
              justify-content:center;
              width:36px;
              height:36px;
              padding:0;
              border:1px solid rgba(239,68,68,.35);
              border-radius:10px;
              background:transparent;
              color:#ef4444;
              cursor:pointer;
              transition:background .2s ease;
            "
          >
            <i
              data-lucide="trash-2"
              aria-hidden="true"
              style="width:17px;height:17px;"
            ></i>
          </button>
        </td>
      </tr>
    `).join("");

    refreshIcons();
  }

  // ==========================================
  // ATUALIZAÇÃO DA INTERFACE
  // ==========================================

  function render() {
    renderIndicators();
    renderHistory();
    updateStockPreview();
  }

  // ==========================================
  // SELECIONAR PRODUTO
  // ==========================================

  productInput.addEventListener(
    "change",
    updateStockPreview
  );

  // ==========================================
  // EXCLUIR CONSUMO
  // ==========================================

  async function deleteConsumption(id) {
    if (deleting || saving) return;

    const item = consumption.find(
      registro => String(registro.id) === String(id)
    );

    if (!item) {
      WJ.toast("Registro de consumo não encontrado.");
      return;
    }

    const nome = getConsumedName(item);
    const quantidade = formatQuantity(
      getConsumedQuantity(item)
    );

    const confirmed = window.confirm(
      `Deseja realmente excluir este consumo?\n\n` +
      `Produto: ${nome}\n` +
      `Quantidade: ${quantidade}\n\n` +
      `A quantidade será devolvida ao estoque.\n` +
      `Essa ação não poderá ser desfeita.`
    );

    if (!confirmed) return;

    deleting = true;

    const buttons = document.querySelectorAll(
      ".btn-delete-consumption"
    );

    buttons.forEach(button => {
      button.disabled = true;
      button.style.opacity = "0.5";
      button.style.cursor = "not-allowed";
    });

    try {
      const result = await WJ.api(
        `/consumo/${encodeURIComponent(id)}`,
        {
          method: "DELETE"
        }
      );

      await loadData();

      WJ.toast(
        result?.mensagem ||
        "Consumo excluído e estoque atualizado."
      );

    } catch (error) {
      showError(
        error,
        "Não foi possível excluir o consumo."
      );

    } finally {
      deleting = false;

      document.querySelectorAll(
        ".btn-delete-consumption"
      ).forEach(button => {
        button.disabled = false;
        button.style.opacity = "";
        button.style.cursor = "";
      });
    }
  }

  // ==========================================
  // EVENTO DA LIXEIRA NO HISTÓRICO
  // ==========================================

  table.addEventListener("click", async event => {
    const button = event.target.closest(
      ".btn-delete-consumption"
    );

    if (!button || !table.contains(button)) {
      return;
    }

    const id = button.dataset.consumptionId;

    if (!id) {
      WJ.toast("ID do consumo não encontrado.");
      return;
    }

    await deleteConsumption(id);
  });

  // ==========================================
  // REGISTRAR CONSUMO NO POSTGRESQL
  // ==========================================

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (saving || deleting) return;

    const productId = productInput.value;
    const quantity = Number(quantityInput.value);
    const reason = reasonInput.value.trim();
    const date = dateInput.value;

    const product = products.find(
      item => String(item.id) === productId
    );

    if (!product) {
      WJ.toast("Selecione um produto válido.");
      return;
    }

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      Math.abs(
        Math.round(quantity * 1000) / 1000 - quantity
      ) > 0.0000001
    ) {
      WJ.toast(
        "Informe uma quantidade válida com até 3 casas decimais."
      );
      return;
    }

    if (!reason) {
      WJ.toast("Informe o motivo do consumo.");
      return;
    }

    if (!date) {
      WJ.toast("Informe a data do consumo.");
      return;
    }

    const available = getQuantity(product);

    if (quantity > available) {
      WJ.toast(
        `Estoque insuficiente. Disponível: ` +
        formatQuantity(available)
      );
      return;
    }

    saving = true;
    saveButton.disabled = true;

    const originalText = saveButton.textContent;

    saveButton.textContent = "Salvando...";

    try {
      await WJ.api("/consumo", {
        method: "POST",
        body: JSON.stringify({
          produto_id: Number(productId),
          quantidade: quantity,
          motivo: reason,
          data: date
        })
      });

      form.reset();
      dateInput.value = WJ.today();

      await loadData();

      WJ.toast(
        "Consumo registrado e estoque atualizado!"
      );

    } catch (error) {
      showError(
        error,
        "Não foi possível registrar o consumo."
      );

    } finally {
      saving = false;
      saveButton.disabled = false;
      saveButton.textContent = originalText;
    }
  });

  // ==========================================
  // FILTRO POR MÊS
  // ==========================================

  monthInput.addEventListener("change", () => {
    showAllMonths = false;

    updateShowAllButton();
    renderHistory();
  });

  // ==========================================
  // VER TODOS OS MESES
  // ==========================================

  showAllButton.addEventListener("click", () => {
    showAllMonths = !showAllMonths;

    updateShowAllButton();
    renderHistory();
  });

  // ==========================================
  // EXPORTAR CSV
  // ==========================================

  exportButton.addEventListener("click", () => {
    const rows = getFilteredConsumption();

    if (!rows.length) {
      WJ.toast("Não há registros para exportar.");
      return;
    }

    function escapeCSV(value) {
      let text = String(value ?? "");

      // Evita interpretação como fórmula no Excel.
      if (/^\s*[=+\-@]/.test(text)) {
        text = "'" + text;
      }

      return `"${text.replace(/"/g, '""')}"`;
    }

    const header = [
      "Data",
      "Produto",
      "Quantidade",
      "Motivo"
    ];

    const lines = [
      header.map(escapeCSV).join(";"),

      ...rows.map(item => [
        WJ.date(getConsumptionDate(item)),
        getConsumedName(item),
        getConsumedQuantity(item)
          .toFixed(3)
          .replace(".", ","),
        getConsumedReason(item)
      ].map(escapeCSV).join(";"))
    ];

    WJ.download(
      "consumo-barbearia-wj.csv",
      "\uFEFF" + lines.join("\r\n"),
      "text/csv;charset=utf-8"
    );

    WJ.toast(
      "Arquivo CSV preparado para download."
    );
  });

  // ==========================================
  // ATUALIZAR AO VOLTAR PARA A PÁGINA
  // ==========================================

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !saving && !deleting) {
      loadData();
    }
  });

  // ==========================================
  // ATUALIZAÇÃO PERIÓDICA
  // ==========================================

  let lastMonth = getCurrentMonth();

  setInterval(() => {
    if (
      saving ||
      deleting ||
      document.hidden
    ) {
      return;
    }

    const currentMonth = getCurrentMonth();

    if (currentMonth !== lastMonth) {
      lastMonth = currentMonth;

      if (!showAllMonths) {
        monthInput.value = currentMonth;
      }
    }

    loadData();
  }, 60000);

  // ==========================================
  // INICIALIZAÇÃO
  // ==========================================

  dateInput.value = WJ.today();
  monthInput.value = getCurrentMonth();

  updateShowAllButton();

  await loadData();

  refreshIcons();
});
