"use strict";

document.addEventListener("DOMContentLoaded", () => {

  const dashboard = document.querySelector(".dashboard-page");

  if (!dashboard || typeof WJ === "undefined") return;

  const cabecalho =
    dashboard.querySelector(".dashboard-welcome") ||
    dashboard.querySelector(".dashboard-heading");

  if (!cabecalho) return;

  let salvando = false;
  let focoAnterior = null;

  /* =====================================
     BOTÃO PRINCIPAL
  ===================================== */

  const destaque = document.createElement("section");

  destaque.className = "wj-corte-destaque";

  destaque.innerHTML = `
    <div class="wj-corte-destaque-info">

      <span class="wj-corte-destaque-icone">
        <i data-lucide="scissors"></i>
      </span>

      <div>
        <strong>Atendeu um cliente?</strong>

        <p>
          Registre a entrada no
          Financeiro em poucos segundos.
        </p>
      </div>

    </div>

    <button
      type="button"
      class="wj-corte-abrir"
      id="wjAbrirCorte"
    >
      <i data-lucide="plus"></i>
      Novo atendimento
    </button>
  `;

  cabecalho.insertAdjacentElement(
    "afterend",
    destaque
  );

  /* =====================================
     FORMULÁRIO
  ===================================== */

  const modal = document.createElement("div");

  modal.className = "wj-corte-modal";
  modal.id = "wjCorteModal";
  modal.hidden = true;

  modal.innerHTML = `
    <div
      class="wj-corte-backdrop"
      data-close-corte
    ></div>

    <section
      class="wj-corte-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wjCorteTitulo"
      tabindex="-1"
    >

      <header class="wj-corte-cabecalho">

        <div class="wj-corte-titulo-area">

          <span class="wj-corte-modal-icone">
            <i data-lucide="scissors"></i>
          </span>

          <div>
            <h2 id="wjCorteTitulo">
              Novo atendimento
            </h2>

            <p>
              Registrar atendimento realizado
            </p>
          </div>

        </div>

        <button
          type="button"
          class="wj-corte-fechar"
          id="wjFecharCorte"
          aria-label="Fechar formulário"
        >
          <i data-lucide="x"></i>
        </button>

      </header>

      <form id="wjCorteForm">

        <div class="wj-corte-campos">

          <fieldset
            class="wj-corte-pagamentos wj-corte-servicos-grupo"
            aria-describedby="wjCorteServicosAjuda"
          >
            <legend>Quais serviços foram realizados?</legend>

            <small id="wjCorteServicosAjuda">
              Selecione um ou mais serviços.
            </small>

            <div class="wj-corte-servicos-grid">
              <label class="wj-corte-servico">
                <input
                  type="checkbox"
                  name="servicos"
                  value="Corte masculino"
                >
                <span>Corte masculino</span>
              </label>

              <label class="wj-corte-servico">
                <input
                  type="checkbox"
                  name="servicos"
                  value="Barba"
                >
                <span>Barba</span>
              </label>

              <label class="wj-corte-servico">
                <input
                  type="checkbox"
                  name="servicos"
                  value="Corte + barba"
                >
                <span>Corte + barba</span>
              </label>

              <label class="wj-corte-servico">
                <input
                  type="checkbox"
                  name="servicos"
                  value="Sobrancelha"
                >
                <span>Sobrancelha</span>
              </label>

              <label class="wj-corte-servico">
                <input
                  type="checkbox"
                  name="servicos"
                  value="Progressiva"
                >
                <span>Progressiva</span>
              </label>

              <label class="wj-corte-servico">
                <input
                  type="checkbox"
                  name="servicos"
                  value="Alisante"
                >
                <span>Alisante</span>
              </label>

              <label class="wj-corte-servico">
                <input
                  type="checkbox"
                  name="servicos"
                  value="Luzes"
                >
                <span>Luzes</span>
              </label>

              <label class="wj-corte-servico">
                <input
                  type="checkbox"
                  name="servicos"
                  value="Platinado"
                >
                <span>Platinado</span>
              </label>

              <label class="wj-corte-servico">
                <input
                  type="checkbox"
                  name="servicos"
                  value="Hidratação"
                >
                <span>Hidratação</span>
              </label>

              <label class="wj-corte-servico">
                <input
                  type="checkbox"
                  name="servicos"
                  value="Outros serviços"
                >
                <span>Outros serviços</span>
              </label>
              
            <small
              id="wjCorteServicosContador"
              role="status"
              aria-live="polite"
            >
              Nenhum serviço selecionado.
            </small>
          </fieldset>

          <div class="wj-corte-campo">

            <label for="wjCorteValor">
              Valor recebido
            </label>

            <div class="wj-corte-valor-area">

              <span>R$</span>

              <input
                id="wjCorteValor"
                name="valor"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                placeholder="35,00"
                maxlength="18"
                required
              >

            </div>

            <small>
              Exemplo: 35,00
            </small>

          </div>

          <fieldset class="wj-corte-pagamentos">

            <legend>
              Como o cliente pagou?
            </legend>

            <div class="wj-corte-pagamento-grid">

              <label class="wj-corte-pagamento">

                <input
                  type="radio"
                  name="pagamento"
                  value="Pix"
                  checked
                  required
                >

                <span>
                  <i data-lucide="qr-code"></i>
                  Pix
                </span>

              </label>

              <label class="wj-corte-pagamento">

                <input
                  type="radio"
                  name="pagamento"
                  value="Cartão"
                >

                <span>
                  <i data-lucide="credit-card"></i>
                  Cartão
                </span>

              </label>

              <label class="wj-corte-pagamento">

                <input
                  type="radio"
                  name="pagamento"
                  value="Dinheiro"
                >

                <span>
                  <i data-lucide="banknote"></i>
                  Dinheiro
                </span>

              </label>

            </div>

          </fieldset>

          <div class="wj-corte-campo">

            <label for="wjCorteCliente">
              Nome do cliente
              <small>(opcional)</small>
            </label>

            <input
              id="wjCorteCliente"
              name="cliente"
              type="text"
              placeholder="Ex.: João"
              maxlength="160"
              autocomplete="off"
            >

          </div>

          <div class="wj-corte-campo">

            <label for="wjCorteWhatsapp">
              WhatsApp do cliente
              <small>(opcional)</small>
            </label>

            <input
              id="wjCorteWhatsapp"
              name="whatsapp"
              type="tel"
              inputmode="tel"
              autocomplete="tel"
              placeholder="(11) 99999-9999"
              maxlength="20"
            >

          </div>

        </div>

        <div
          id="wjCorteErro"
          class="wj-corte-erro"
          role="alert"
          hidden
        ></div>

        <div class="wj-corte-resumo">

          <span>
            Entrada no Financeiro
          </span>

          <strong id="wjCorteResumoValor">
            R$ 0,00
          </strong>

        </div>

        <div class="wj-corte-acoes">

          <button
            type="button"
            class="wj-corte-cancelar"
            id="wjCancelarCorte"
          >
            Cancelar
          </button>

          <button
            type="submit"
            class="wj-corte-salvar"
            id="wjSalvarCorte"
          >
            <i data-lucide="check-circle-2"></i>

            <span id="wjSalvarCorteTexto">
              Salvar atendimento
            </span>
          </button>

        </div>

        <p class="wj-corte-rodape">
          Ao salvar, o valor será lançado como
          receita no Financeiro da barbearia.
        </p>

      </form>

    </section>
  `;

  document.body.appendChild(modal);

  /* =====================================
     ELEMENTOS
  ===================================== */

  const $ = (id) => document.getElementById(id);

  const form = $("wjCorteForm");
  const valorInput = $("wjCorteValor");
  const servicosInputs = Array.from(
    form.querySelectorAll('input[name="servicos"]')
  );
  const servicosContador = $("wjCorteServicosContador");
  const clienteInput = $("wjCorteCliente");
  const whatsappInput = $("wjCorteWhatsapp");

  const salvarBotao = $("wjSalvarCorte");
  const salvarTexto = $("wjSalvarCorteTexto");

  const erroElemento = $("wjCorteErro");
  const resumoElemento = $("wjCorteResumoValor");

  const dialog = modal.querySelector(
    ".wj-corte-dialog"
  );

  /* =====================================
     SELEÇÃO DE VÁRIOS SERVIÇOS
  ===================================== */

  function obterServicosSelecionados() {
    return servicosInputs
      .filter((input) => input.checked)
      .map((input) => input.value);
  }

  function atualizarContadorServicos() {
    const quantidade = obterServicosSelecionados().length;

    servicosContador.textContent = quantidade === 0
      ? "Nenhum serviço selecionado."
      : quantidade === 1
        ? "1 serviço selecionado."
        : `${quantidade} serviços selecionados.`;
  }

  servicosInputs.forEach((input) => {
    input.addEventListener("change", () => {
      atualizarContadorServicos();
      limparErro();
    });
  });

  /* =====================================
     VALOR EM REAIS
  ===================================== */

  function converterValor(texto) {

    const valor = String(texto || "")
      .trim()
      .replace(/\s/g, "");

    if (!valor) return NaN;

    let normalizado;

    // Exemplo: 1.234,56
    if (
      /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(valor)
    ) {

      normalizado = valor
        .replace(/\./g, "")
        .replace(",", ".");

    // Exemplos: 35 / 35,00 / 35.00
    } else if (
      /^\d+(?:[.,]\d{1,2})?$/.test(valor)
    ) {

      normalizado = valor.replace(",", ".");

    } else {

      return NaN;

    }

    const numero = Number(normalizado);

    if (
      !Number.isFinite(numero) ||
      numero <= 0 ||
      numero > 9999999999.99
    ) {
      return NaN;
    }

    return Math.round(
      (numero + Number.EPSILON) * 100
    ) / 100;
  }

  function atualizarResumo() {

    const valor = converterValor(
      valorInput.value
    );

    resumoElemento.textContent =
      Number.isFinite(valor)
        ? WJ.money(valor)
        : "R$ 0,00";
  }

  /* =====================================
     WHATSAPP DO CLIENTE
  ===================================== */

  function normalizarWhatsapp(numero) {
    const digitos = String(numero || "").replace(/\D/g, "");

    if (!digitos) return "";

    // Número brasileiro com DDD (celular ou fixo).
    if (digitos.length === 10 || digitos.length === 11) {
      return "55" + digitos;
    }

    // Número informado com código do Brasil (+55).
    if (
      digitos.startsWith("55") &&
      (digitos.length === 12 || digitos.length === 13)
    ) {
      return digitos;
    }

    return null;
  }

  /* =====================================
     MENSAGENS
  ===================================== */

  function mostrarErro(mensagem) {

    erroElemento.textContent = mensagem;
    erroElemento.hidden = false;
  }

  function limparErro() {

    erroElemento.textContent = "";
    erroElemento.hidden = true;
  }

  /* =====================================
     ABRIR O FORMULÁRIO
  ===================================== */

  function abrirModal() {

    if (salvando) return;

    focoAnterior = document.activeElement;

    form.reset();
    atualizarContadorServicos();

    salvarBotao.disabled = false;
    salvarTexto.textContent = "Salvar atendimento";

    limparErro();
    atualizarResumo();

    modal.hidden = false;

    document.body.classList.add(
      "wj-corte-modal-aberto"
    );

    // Evita que o iPhone role a página ou
    // abra o teclado ao exibir o formulário.
    requestAnimationFrame(() => {

      dialog.scrollTop = 0;

      try {
        dialog.focus({
          preventScroll: true
        });
      } catch {
        dialog.focus();
      }

    });

  }

  /* =====================================
     FECHAR O FORMULÁRIO
  ===================================== */

  function fecharModal() {

    if (salvando) return;

    modal.hidden = true;

    document.body.classList.remove(
      "wj-corte-modal-aberto"
    );

    if (
      focoAnterior &&
      typeof focoAnterior.focus === "function"
    ) {

      try {
        focoAnterior.focus({
          preventScroll: true
        });
      } catch {
        focoAnterior.focus();
      }

    }
  }

  /* =====================================
     BOTÕES DE ABRIR E FECHAR
  ===================================== */

  $("wjAbrirCorte").addEventListener(
    "click",
    abrirModal
  );

  $("wjFecharCorte").addEventListener(
    "click",
    fecharModal
  );

  $("wjCancelarCorte").addEventListener(
    "click",
    fecharModal
  );

  modal.querySelector(
    "[data-close-corte]"
  ).addEventListener(
    "click",
    fecharModal
  );

  /* =====================================
     ACESSIBILIDADE DO FORMULÁRIO
  ===================================== */

  document.addEventListener("keydown", (event) => {

    if (modal.hidden) return;

    if (event.key === "Escape") {

      event.preventDefault();
      fecharModal();

      return;
    }

    if (event.key !== "Tab") return;

    const focaveis = Array.from(
      modal.querySelectorAll(
        "button:not(:disabled), " +
        "input:not(:disabled), " +
        "select:not(:disabled)"
      )
    ).filter((elemento) => {
      return elemento.getClientRects().length > 0;
    });

    if (!focaveis.length) return;

    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];

    if (
      event.shiftKey &&
      document.activeElement === primeiro
    ) {

      event.preventDefault();
      ultimo.focus();

    } else if (
      !event.shiftKey &&
      document.activeElement === ultimo
    ) {

      event.preventDefault();
      primeiro.focus();
    }

  });

  /* =====================================
     SALVAR ATENDIMENTO NO POSTGRESQL
  ===================================== */

  form.addEventListener("submit", async (event) => {

    event.preventDefault();

    if (salvando) return;

    limparErro();

    const servicos = obterServicosSelecionados();

    if (servicos.length === 0) {
      mostrarErro("Selecione pelo menos um serviço realizado.");
      servicosInputs[0].focus();
      return;
    }

    // O Financeiro aceita somente uma categoria por receita.
    // Quando há vários serviços, a descrição registra todos eles.
    const categoria = servicos.length === 1
      ? servicos[0]
      : "Outros serviços";

    const valor = converterValor(
      valorInput.value
    );

    if (!Number.isFinite(valor)) {

      mostrarErro(
        "Informe um valor válido, como 35,00."
      );

      valorInput.focus();

      return;
    }

    const pagamentoSelecionado =
      form.querySelector(
        'input[name="pagamento"]:checked'
      );

    const pagamento =
      pagamentoSelecionado?.value || "";

    if (
      !["Pix", "Cartão", "Dinheiro"].includes(
        pagamento
      )
    ) {

      mostrarErro(
        "Selecione Pix, Cartão ou Dinheiro."
      );

      return;
    }

    const cliente = clienteInput.value.trim();
    const whatsapp = normalizarWhatsapp(whatsappInput.value);

    if (whatsapp === null) {
      mostrarErro("Informe um WhatsApp válido com DDD.");
      whatsappInput.focus();
      return;
    }

    // Campos compatíveis com o
    // financeiroController.js do backend.
    const dados = {

      tipo: "receita",

      data: WJ.today(),

      cliente_nome: cliente,

      cliente_whatsapp: whatsapp,

      descricao: `Atendimento: ${servicos.join(", ")}`,

      categoria,

      pagamento,

      valor,

      observacoes:
        `Registrado pelo Novo atendimento. Serviços: ${servicos.join(", ")}`

    };

    salvando = true;

    salvarBotao.disabled = true;
    salvarTexto.textContent = "Salvando...";

    try {

      // Grava a receita no PostgreSQL.
      await WJ.api("/financeiro", {

        method: "POST",

        body: JSON.stringify(dados)

      });

      salvarTexto.textContent = "Atendimento salvo!";

      limparErro();

      WJ.toast(
        `Atendimento registrado: +${WJ.money(valor)}`
      );

      // Recarrega os dados financeiros do
      // dashboard após o cadastro confirmado.
      window.setTimeout(() => {

        window.location.reload();

      }, 900);

    } catch (erro) {

      console.error(
        "Erro ao registrar corte:",
        erro
      );

      mostrarErro(
        erro?.message ||
        "Não foi possível confirmar o cadastro. " +
        "Confira o Financeiro antes de tentar novamente."
      );

      salvando = false;

      salvarBotao.disabled = false;

      salvarTexto.textContent = "Tentar salvar";

    }

  });

  /* =====================================
     ATUALIZAR O RESUMO DO VALOR
  ===================================== */

  valorInput.addEventListener("input", () => {

    atualizarResumo();
    limparErro();

  });

  /* =====================================
     ÍCONES
  ===================================== */

  if (
    window.lucide &&
    typeof window.lucide.createIcons === "function"
  ) {

    window.lucide.createIcons({
      nodes: [destaque, modal]
    });

  }

});
