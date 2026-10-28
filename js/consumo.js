"use strict";

document.addEventListener("DOMContentLoaded", async () => {

  /* =====================================================
     INICIALIZAÇÃO E AUTENTICAÇÃO
  ===================================================== */

  if (typeof WJ === "undefined") {
    console.error(
      "O arquivo js/global.js não foi carregado."
    );
    return;
  }

  try {
    const autorizado = await WJ.init("consumo");

    // WJ.init pode não retornar true.
    // Interrompemos apenas quando retorna false.
    if (autorizado === false) return;

  } catch (erro) {
    console.error("Erro de autenticação:", erro);
    return;
  }

  /* =====================================================
     ELEMENTOS
  ===================================================== */

  const $ = (id) => document.getElementById(id);

  const form = $("consumeForm");
  const formPanel = $("consumeFormPanel");

  const productInput = $("consumeProduct");
  const quantityInput = $("consumeQty");
  const reasonInput = $("consumeReason");
  const dateInput = $("consumeDate");

  const monthInput = $("consumeMonth");
  const searchInput = $("searchConsumption");

  const table = $("consumeRows");

  const showAllButton = $("showAllConsumption");
  const exportButton = $("exportConsumptionCSV");
  const saveButton = $("saveConsume");

  const requiredElements = [
    form,
    formPanel,
    productInput,
    quantityInput,
    reasonInput,
    dateInput,
    monthInput,
    searchInput,
    table,
    showAllButton,
    exportButton,
    saveButton,
    $("stockPreview"),
    $("consumeCount"),
    $("consumeQuantity"),
    $("consumeLow"),
    $("consumeCost")
  ];

  if (requiredElements.some((elemento) => !elemento)) {
    console.error(
      "O HTML do Consumo está incompleto. " +
      "Confira se foi substituído pela nova versão."
    );
    return;
  }

  /* =====================================================
     ESTADO DA PÁGINA
  ===================================================== */

  let produtos = [];
  let consumos = [];

  let todosOsMeses = false;

  let salvando = false;
  let excluindo = false;

  let requisicaoAtual = null;

  /* =====================================================
     FUNÇÕES AUXILIARES
  ===================================================== */

  function escapar(valor) {
    return WJ.escape(String(valor ?? ""));
  }

  function moeda(valor) {
    return WJ.money(Number(valor || 0));
  }

  function quantidadeFormatada(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", {
      maximumFractionDigits: 3
    });
  }

  function arredondarQuantidade(valor) {
    return Math.round(Number(valor) * 1000) / 1000;
  }

  function atualizarIcones() {
    if (
      window.lucide &&
      typeof window.lucide.createIcons === "function"
    ) {
      window.lucide.createIcons();
    }
  }

  function avisar(mensagem) {
    if (typeof WJ.toast === "function") {
      WJ.toast(mensagem);
    } else {
      window.alert(mensagem);
    }
  }

  function mostrarErro(erro, mensagem) {
    console.error("Consumo WJ:", erro);

    avisar(
      erro?.message ||
      mensagem ||
      "Não foi possível concluir a operação."
    );
  }

  function dataSimples(valor) {
    return String(valor || "").slice(0, 10);
  }

  function mesAtual() {
    // Usa a data local do sistema, compatível com WJ.
    return WJ.today().slice(0, 7);
  }

  function formatarMes(valor) {
    if (!/^\d{4}-\d{2}$/.test(valor)) {
      return "Período atual";
    }

    const [ano, mes] = valor.split("-").map(Number);

    return new Date(
      ano,
      mes - 1,
      1
    ).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric"
    });
  }

  function produtoPorId(id) {
    return produtos.find(
      (produto) =>
        String(produto.id) === String(id)
    );
  }

  function quantidadeDisponivel(produto) {
    return Number(produto?.quantidade || 0);
  }

  function estoqueMinimo(produto) {
    return Number(produto?.estoque_minimo || 0);
  }

  function quantidadeConsumida(item) {
    return Number(item.quantidade || 0);
  }

  function nomeConsumido(item) {
    return String(
      item.produto_nome ||
      item.produtoNome ||
      item.nome ||
      produtoPorId(item.produto_id)?.nome ||
      "Produto"
    );
  }

  function motivoConsumido(item) {
    return String(
      item.motivo ||
      item.observacoes ||
      "-"
    );
  }

  function unidadeConsumida(item) {
    return String(
      item.unidade ||
      item.produto_unidade ||
      produtoPorId(item.produto_id)?.unidade ||
      ""
    );
  }

  function consumoValido(valor) {
    if (
      valor === "" ||
      valor === null ||
      valor === undefined
    ) {
      return false;
    }

    const numero = Number(valor);

    return (
      Number.isFinite(numero) &&
      numero > 0 &&
      Math.abs(
        arredondarQuantidade(numero) - numero
      ) < 0.0000001
    );
  }

  function ocupado() {
    return salvando || excluindo;
  }

  /* =====================================================
     MOSTRAR E FECHAR FORMULÁRIO
  ===================================================== */

  function mostrarFormulario() {
    document.body.classList.add(
      "consumption-form-open"
    );

    formPanel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function esconderFormulario() {
    if (salvando) return;

    document.body.classList.remove(
      "consumption-form-open"
    );
  }

  function limparFormulario() {
    form.reset();

    dateInput.value = WJ.today();
    productInput.value = "";

    atualizarPrevisao();
  }

  $("openConsumeForm").addEventListener(
    "click",
    () => {
      if (ocupado()) return;

      mostrarFormulario();
    }
  );

  $("closeConsumeForm").addEventListener(
    "click",
    esconderFormulario
  );

  $("cancelConsume").addEventListener(
    "click",
    () => {
      if (ocupado()) return;

      limparFormulario();
      esconderFormulario();
    }
  );

  /* =====================================================
     CARREGAR DADOS DO POSTGRESQL
  ===================================================== */

  async function carregarDados() {
    // Permite que chamadas diferentes aguardem
    // a mesma atualização em andamento.
    if (requisicaoAtual) {
      return requisicaoAtual;
    }

    requisicaoAtual = (async () => {
      const [estoqueResposta, consumoResposta] =
        await Promise.all([
          WJ.api("/estoque"),
          WJ.api("/consumo")
        ]);

      if (
        !Array.isArray(estoqueResposta) ||
        !Array.isArray(consumoResposta)
      ) {
        throw new Error(
          "O servidor retornou dados em formato inválido."
        );
      }

      produtos = estoqueResposta;
      consumos = consumoResposta;

      atualizarOpcoesProdutos();
      renderizar();
    })();

    try {
      await requisicaoAtual;

    } catch (erro) {
      mostrarErro(
        erro,
        "Não foi possível carregar os dados."
      );

      $("consumeResults").textContent =
        "Erro ao carregar consumos.";

    } finally {
      requisicaoAtual = null;
    }
  }

  /* =====================================================
     LISTA DE PRODUTOS
  ===================================================== */

  function atualizarOpcoesProdutos() {
    const selecionado = productInput.value;

    const lista = [...produtos].sort(
      (a, b) =>
        String(a.nome || "").localeCompare(
          String(b.nome || ""),
          "pt-BR"
        )
    );

    productInput.replaceChildren(
      new Option(
        lista.length
          ? "Selecione um material"
          : "Nenhum produto cadastrado",
        ""
      )
    );

    lista.forEach((produto) => {
      const quantidade = quantidadeDisponivel(
        produto
      );

      const unidade = produto.unidade || "unid.";

      const rotulo =
        `${produto.nome} — ` +
        `${quantidadeFormatada(quantidade)} ` +
        `${unidade} disponíveis`;

      const opcao = new Option(
        rotulo,
        String(produto.id)
      );

      opcao.disabled = quantidade <= 0;

      productInput.add(opcao);
    });

    const aindaDisponivel = produtos.some(
      (produto) =>
        String(produto.id) === selecionado &&
        quantidadeDisponivel(produto) > 0
    );

    productInput.value = aindaDisponivel
      ? selecionado
      : "";

    atualizarPrevisao();
  }

  /* =====================================================
     PREVISÃO DO ESTOQUE
  ===================================================== */

  function atualizarPrevisao() {
    const preview = $("stockPreview");

    const produto = produtoPorId(
      productInput.value
    );

    if (!produto) {
      preview.textContent =
        "Selecione um material para consultar " +
        "a quantidade disponível.";

      return;
    }

    const disponivel = quantidadeDisponivel(
      produto
    );

    const minimo = estoqueMinimo(
      produto
    );

    const unidade = String(
      produto.unidade || "unid."
    );

    const informado = quantityInput.value.trim();

    const quantidade =
      informado !== "" &&
      Number.isFinite(Number(informado))
        ? Number(informado)
        : 0;

    const restante = arredondarQuantidade(
      disponivel - quantidade
    );

    let mensagem;
    let classe;

    if (quantidade > disponivel) {
      mensagem = "Quantidade maior que o estoque disponível";
      classe = "bad";

    } else if (restante <= 0) {
      mensagem = "O produto ficará sem estoque";
      classe = "bad";

    } else if (restante <= minimo) {
      mensagem = "O produto precisará de reposição";
      classe = "warn";

    } else {
      mensagem = "Estoque suficiente";
      classe = "";
    }

    preview.innerHTML = `
      <strong class="consume-preview-product">
        ${escapar(produto.nome)}
      </strong>

      <div class="consume-preview-grid">

        <div class="consume-preview-item">
          <span>Disponível agora</span>

          <strong>
            ${quantidadeFormatada(disponivel)}
            ${escapar(unidade)}
          </strong>
        </div>

        <div class="consume-preview-item">
          <span>Restará após o consumo</span>

          <strong>
            ${quantidadeFormatada(restante)}
            ${escapar(unidade)}
          </strong>
        </div>

        <div class="consume-preview-item">
          <span>Estoque mínimo</span>

          <strong>
            ${quantidadeFormatada(minimo)}
            ${escapar(unidade)}
          </strong>
        </div>

        <div class="consume-preview-item">
          <span>Quantidade informada</span>

          <strong>
            ${quantidadeFormatada(quantidade)}
            ${escapar(unidade)}
          </strong>
        </div>

      </div>

      <span class="consume-preview-status ${classe}">
        ${mensagem}
      </span>
    `;
  }

  productInput.addEventListener(
    "change",
    atualizarPrevisao
  );

  quantityInput.addEventListener(
    "input",
    atualizarPrevisao
  );

  /* =====================================================
     RESUMO DO MÊS ATUAL
  ===================================================== */

  function renderizarIndicadores() {
    const mes = mesAtual();

    const registrosMes = consumos.filter(
      (item) =>
        dataSimples(item.data).startsWith(mes)
    );

    // Não somamos 30 ml + 2 unidades.
    // Contamos materiais distintos utilizados.
    const materiaisDiferentes = new Set(
      registrosMes.map((item) => {
        const id =
          item.produto_id ??
          item.produtoId ??
          "";

        if (id !== "") {
          return `id:${id}`;
        }

        return (
          "nome:" +
          nomeConsumido(item)
            .trim()
            .toLocaleLowerCase("pt-BR")
        );
      })
    );

    const produtosAlerta = produtos.filter(
      (produto) =>
        quantidadeDisponivel(produto) <=
        estoqueMinimo(produto)
    );

    /*
      ESTIMATIVA DE CUSTO:

      O histórico de consumo não contém
      necessariamente o custo unitário na
      data em que o material foi utilizado.

      Por isso usamos o custo ATUAL do
      produto, quando ele ainda existe.
    */

    let custoEstimado = 0;

    let itensSemCusto = 0;

    registrosMes.forEach((item) => {
      let produto = produtoPorId(
        item.produto_id ?? item.produtoId
      );

      if (!produto) {
        const nome = nomeConsumido(item)
          .trim()
          .toLocaleLowerCase("pt-BR");

        produto = produtos.find(
          (registro) =>
            String(registro.nome || "")
              .trim()
              .toLocaleLowerCase("pt-BR") === nome
        );
      }

      if (!produto) {
        itensSemCusto++;
        return;
      }

      const custo = Number(
        produto.custo_unitario
      );

      if (!Number.isFinite(custo) || custo < 0) {
        itensSemCusto++;
        return;
      }

      custoEstimado +=
        quantidadeConsumida(item) * custo;
    });

    $("consumeCount").textContent =
      String(registrosMes.length);

    $("consumeQuantity").textContent =
      String(materiaisDiferentes.size);

    $("consumeLow").textContent =
      String(produtosAlerta.length);

    $("consumeCost").textContent =
      moeda(custoEstimado);

    $("currentMonth").textContent =
      formatarMes(mes);

    // Informação contextual para não confundir
    // estimativa com custo histórico exato.
    const custo = $("consumeCost");

    custo.title = itensSemCusto > 0
      ? (
          "Estimativa com custos atuais. " +
          `${itensSemCusto} registro(s) sem custo ` +
          "correspondente no estoque atual."
        )
      : (
          "Estimativa baseada nos custos atuais " +
          "dos produtos."
        );
  }

  /* =====================================================
     VER TODOS OS MESES
  ===================================================== */

  function atualizarBotaoMeses() {
    const nomeIcone = todosOsMeses
      ? "calendar-days"
      : "calendar-range";

    const texto = todosOsMeses
      ? "Mostrar mês selecionado"
      : "Ver todos os meses";

    showAllButton.innerHTML = `
      <i
        data-lucide="${nomeIcone}"
        aria-hidden="true"
      ></i>

      <span>
        ${texto}
      </span>
    `;

    showAllButton.setAttribute(
      "aria-pressed",
      String(todosOsMeses)
    );

    monthInput.disabled = todosOsMeses;

    atualizarIcones();
  }

  /* =====================================================
     FILTRAR HISTÓRICO
  ===================================================== */

  function consumosFiltrados() {
    const mesSelecionado = monthInput.value;

    const busca = searchInput.value
      .trim()
      .toLocaleLowerCase("pt-BR");

    return [...consumos]
      .filter((item) => {
        const correspondeMes =
          todosOsMeses ||
          !mesSelecionado ||
          dataSimples(item.data)
            .startsWith(mesSelecionado);

        const texto = [
          nomeConsumido(item),
          motivoConsumido(item),
          unidadeConsumida(item)
        ]
          .join(" ")
          .toLocaleLowerCase("pt-BR");

        const correspondeBusca =
          texto.includes(busca);

        return correspondeMes && correspondeBusca;
      })
      .sort((a, b) => {
        const porData = dataSimples(b.data)
          .localeCompare(dataSimples(a.data));

        return (
          porData ||
          Number(b.id) - Number(a.id)
        );
      });
  }

  /* =====================================================
     RENDERIZAR HISTÓRICO
  ===================================================== */

  function renderizarHistorico() {
    const lista = consumosFiltrados();

    $("consumeResults").textContent =
      `${lista.length} registro${
        lista.length === 1 ? "" : "s"
      }`;

    if (!lista.length) {
      table.innerHTML = `
        <tr class="consume-empty-row">

          <td
            colspan="5"
            class="empty-consumption"
          >
            Nenhum consumo encontrado
            para os filtros selecionados.
          </td>

        </tr>
      `;

      return;
    }

    table.innerHTML = lista.map((item) => {
      const nome = nomeConsumido(item);

      const unidade = unidadeConsumida(item);

      const quantidade =
        quantidadeFormatada(
          quantidadeConsumida(item)
        );

      const data = dataSimples(item.data);

      const dataFormatada = data
        ? WJ.date(data)
        : "-";

      return `
        <tr>

          <td data-label="Data">
            ${escapar(dataFormatada)}
          </td>

          <td data-label="Material">

            <span class="consume-product-name">
              ${escapar(nome)}
            </span>

          </td>

          <td data-label="Quantidade utilizada">

            <span class="consume-quantity">

              − ${quantidade}
              ${escapar(unidade)}

            </span>

          </td>

          <td data-label="Motivo / serviço">

            <span class="consume-reason">
              ${escapar(motivoConsumido(item))}
            </span>

          </td>

          <td data-label="Ações">

            <button
              type="button"
              class="consume-delete btn-delete-consumption"
              data-consumption-id="${escapar(item.id)}"
              aria-label="Excluir consumo de ${escapar(nome)}"
              title="Excluir consumo e solicitar devolução ao estoque"
            >

              <i data-lucide="trash-2"></i>

              <span>
                Excluir consumo
              </span>

            </button>

          </td>

        </tr>
      `;
    }).join("");

    atualizarIcones();
  }

  /* =====================================================
     ATUALIZAR TELA
  ===================================================== */

  function renderizar() {
    renderizarIndicadores();
    renderizarHistorico();
    atualizarPrevisao();
  }

  /* =====================================================
     REGISTRAR CONSUMO
  ===================================================== */

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    if (ocupado()) return;

    const produtoId = productInput.value;

    const produto = produtoPorId(
      produtoId
    );

    if (!produto) {
      avisar("Selecione um material válido.");
      return;
    }

    const quantidadeTexto =
      quantityInput.value;

    if (!consumoValido(quantidadeTexto)) {
      avisar(
        "Informe uma quantidade maior que zero, " +
        "com até 3 casas decimais."
      );
      return;
    }

    const quantidade = Number(
      quantidadeTexto
    );

    const motivo = reasonInput.value.trim();
    const data = dateInput.value;

    if (!motivo || motivo.length > 150) {
      avisar("Informe o motivo ou serviço.");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      avisar("Informe uma data válida.");
      return;
    }

    if (
      quantidade >
      quantidadeDisponivel(produto)
    ) {
      avisar(
        "Estoque insuficiente. Disponível: " +
        quantidadeFormatada(
          quantidadeDisponivel(produto)
        ) +
        ` ${produto.unidade || "unid."}`
      );

      return;
    }

    salvando = true;
    saveButton.disabled = true;

    const conteudoOriginal =
      saveButton.innerHTML;

    saveButton.textContent =
      "Registrando consumo...";

    let salvo = false;

    try {
      await WJ.api("/consumo", {
        method: "POST",
        body: JSON.stringify({
          produto_id: Number(produtoId),
          quantidade,
          motivo,
          data
        })
      });

      salvo = true;

    } catch (erro) {
      mostrarErro(
        erro,
        "Não foi possível registrar o consumo. " +
        "Confira o histórico antes de tentar novamente."
      );

    } finally {
      salvando = false;
      saveButton.disabled = false;
      saveButton.innerHTML = conteudoOriginal;

      atualizarIcones();
    }

    if (salvo) {
      limparFormulario();
      esconderFormulario();

      await carregarDados();

      avisar(
        "Consumo registrado e estoque atualizado!"
      );
    }
  });

  /* =====================================================
     EXCLUIR CONSUMO
  ===================================================== */

  async function excluirConsumo(id) {
    if (ocupado()) return;

    const item = consumos.find(
      (registro) =>
        String(registro.id) === String(id)
    );

    if (!item) {
      avisar("Registro de consumo não encontrado.");
      return;
    }

    const nome = nomeConsumido(item);

    const quantidade =
      quantidadeFormatada(
        quantidadeConsumida(item)
      );

    const confirmado = window.confirm(
      "Deseja excluir este consumo?\n\n" +
      `Material: ${nome}\n` +
      `Quantidade: ${quantidade}\n\n` +
      "O sistema solicitará ao servidor a " +
      "devolução dessa quantidade ao estoque.\n\n" +
      "Essa exclusão não poderá ser desfeita."
    );

    if (!confirmado) return;

    excluindo = true;

    table.querySelectorAll(
      ".btn-delete-consumption"
    ).forEach((botao) => {
      botao.disabled = true;
    });

    let excluido = false;
    let mensagemSucesso = "";

    try {
      const resultado = await WJ.api(
        `/consumo/${encodeURIComponent(id)}`,
        {
          method: "DELETE"
        }
      );

      excluido = true;

      mensagemSucesso =
        resultado?.mensagem ||
        "Consumo excluído. Confira o estoque atualizado.";

    } catch (erro) {
      mostrarErro(
        erro,
        "Não foi possível excluir o consumo."
      );

    } finally {
      excluindo = false;

      table.querySelectorAll(
        ".btn-delete-consumption"
      ).forEach((botao) => {
        botao.disabled = false;
      });
    }

    if (excluido) {
      await carregarDados();
      avisar(mensagemSucesso);
    }
  }

  /* =====================================================
     EVENTO DA LIXEIRA
  ===================================================== */

  table.addEventListener("click", (evento) => {
    const botao = evento.target.closest(
      ".btn-delete-consumption"
    );

    if (
      !botao ||
      !table.contains(botao)
    ) {
      return;
    }

    const id =
      botao.dataset.consumptionId;

    if (!id) {
      avisar("ID do consumo não encontrado.");
      return;
    }

    excluirConsumo(id);
  });

  /* =====================================================
     FILTROS DE HISTÓRICO
  ===================================================== */

  monthInput.addEventListener("change", () => {
    todosOsMeses = false;

    atualizarBotaoMeses();
    renderizarHistorico();
  });

  searchInput.addEventListener(
    "input",
    renderizarHistorico
  );

  showAllButton.addEventListener("click", () => {
    todosOsMeses = !todosOsMeses;

    atualizarBotaoMeses();
    renderizarHistorico();
  });

  /* =====================================================
     EXPORTAÇÃO CSV
  ===================================================== */

  exportButton.addEventListener("click", () => {
    const lista = consumosFiltrados();

    if (!lista.length) {
      avisar("Não há registros para exportar.");
      return;
    }

    function campoCSV(valor) {
      let texto = String(valor ?? "");

      // Proteção contra fórmulas
      // abertas em programas de planilha.
      if (/^\s*[=+\-@]/.test(texto)) {
        texto = "'" + texto;
      }

      return (
        '"' +
        texto.replace(/"/g, '""') +
        '"'
      );
    }

    const linhas = [
      [
        "Data",
        "Material",
        "Quantidade",
        "Unidade",
        "Motivo / Serviço"
      ],

      ...lista.map((item) => [
        dataSimples(item.data),
        nomeConsumido(item),
        quantidadeConsumida(item)
          .toFixed(3)
          .replace(".", ","),
        unidadeConsumida(item),
        motivoConsumido(item)
      ])
    ];

    const conteudo =
      "\uFEFF" +
      linhas
        .map((linha) =>
          linha.map(campoCSV).join(";")
        )
        .join("\r\n");

    const arquivo = new Blob(
      [conteudo],
      {
        type: "text/csv;charset=utf-8"
      }
    );

    const url = URL.createObjectURL(
      arquivo
    );

    const link = document.createElement("a");

    link.href = url;
    link.download =
      "consumo-barbearia-wj.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);

    avisar("Relatório CSV exportado!");
  });

  /* =====================================================
     MENU INFERIOR NO CELULAR
  ===================================================== */

  const botaoMenu = $("consumptionMobileMenu");
  const overlayMenu = $("consumptionNavOverlay");

  function obterSidebar() {
    return document.querySelector(".sidebar");
  }

  function sincronizarMenu() {
    const aberto = !!obterSidebar()?.classList.contains(
      "open"
    );

    overlayMenu.hidden = !aberto;

    botaoMenu.setAttribute(
      "aria-expanded",
      String(aberto)
    );

    document.body.classList.toggle(
      "consumption-menu-open",
      aberto
    );
  }

  function fecharMenu() {
    obterSidebar()?.classList.remove("open");
    sincronizarMenu();
  }

  botaoMenu.addEventListener("click", () => {
    const sidebar = obterSidebar();

    if (!sidebar) {
      avisar("Menu lateral indisponível.");
      return;
    }

    sidebar.classList.toggle("open");

    sincronizarMenu();
  });

  overlayMenu.addEventListener(
    "click",
    fecharMenu
  );

  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") {
      fecharMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) {
      fecharMenu();
    }
  });

  /* =====================================================
     ATUALIZAÇÃO AO VOLTAR À PÁGINA
  ===================================================== */

  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        !document.hidden &&
        !ocupado()
      ) {
        carregarDados();
      }
    }
  );

  window.addEventListener(
    "pageshow",
    (evento) => {
      if (
        evento.persisted &&
        !ocupado()
      ) {
        carregarDados();
      }
    }
  );

  /* =====================================================
     ATUALIZAÇÃO PERIÓDICA
  ===================================================== */

  let ultimoMes = mesAtual();

  window.setInterval(() => {
    if (
      document.hidden ||
      ocupado()
    ) {
      return;
    }

    const agora = mesAtual();

    if (agora !== ultimoMes) {
      const acompanhavaMesAtual =
        monthInput.value === ultimoMes;

      ultimoMes = agora;

      if (acompanhavaMesAtual) {
        monthInput.value = agora;
      }
    }

    carregarDados();
  }, 60000);

  /* =====================================================
     INICIALIZAÇÃO
  ===================================================== */

  dateInput.value = WJ.today();
  monthInput.value = mesAtual();

  document.body.classList.add(
    "consumption-ready"
  );

  atualizarBotaoMeses();
  atualizarIcones();

  await carregarDados();

});
