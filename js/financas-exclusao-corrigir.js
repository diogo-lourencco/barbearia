"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const mesmo = (a, b) => String(a) === String(b);
  let executando = false;

  const colecoes = [
    "wallets", "transactions", "bills", "goals", "cards",
    "purchases", "recurring", "transfers", "goalMoves", "invoicePayments"
  ];

  function dinheiro(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency", currency: "BRL"
    });
  }

  function mensagem(texto, erro = false) {
    const id = "wj-exclusao-resultado";
    let el = $(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.setAttribute("role", "alert");
      el.style.cssText =
        "position:fixed;left:12px;right:12px;bottom:16px;z-index:2147483600;" +
        "padding:16px;border-radius:12px;color:white;font:600 14px/1.5 system-ui;" +
        "box-shadow:0 8px 35px #0008;max-width:700px;margin:auto";
      document.body.append(el);
    }
    el.style.background = erro ? "#8f2637" : "#176c53";
    el.textContent = texto;
    el.hidden = false;
    if (!erro) setTimeout(() => { if (el.textContent === texto) el.hidden = true; }, 5000);
  }

  function prepararDados(dados) {
    const resultado = {};
    for (const chave of colecoes) {
      if (!Array.isArray(dados?.[chave])) {
        throw new Error(`Dados financeiros inválidos (${chave}). Nenhum registro foi excluído.`);
      }
      resultado[chave] = structuredClone(dados[chave]);
    }
    return resultado;
  }

  function analisar(db, tipo, id) {
    const nomeColecao = tipo === "wallet" ? "wallets" : "goals";
    const cadastro = db[nomeColecao].find(item => mesmo(item.id, id));
    if (!cadastro) throw new Error("Este cadastro não foi encontrado no servidor. Atualize a tela.");

    const detalhes = [];
    if (tipo === "goal") {
      const movimentos = db.goalMoves.filter(item => mesmo(item.goalId, id));
      const saldo = movimentos.reduce((soma, item) =>
        soma + (item.kind === "withdraw" ? -1 : 1) * Number(item.amount), 0);
      detalhes.push(`Saldo reservado na meta: ${dinheiro(saldo)}.`);
      detalhes.push(`${movimentos.length} aporte(s) e retirada(s) serão desfeitos.`);
      detalhes.push("O valor reservado voltará ao saldo calculado das carteiras de origem.");

      return {
        nome: cadastro.name, titulo: "Excluir meta financeira", detalhes,
        vinculos: movimentos.length,
        aplicar(dados) {
          dados.goalMoves = dados.goalMoves.filter(item => !mesmo(item.goalId, id));
          dados.goals = dados.goals.filter(item => !mesmo(item.id, id));
        }
      };
    }

    const transacoes = db.transactions.filter(item => mesmo(item.walletId, id));
    const ids = new Set(transacoes.map(item => String(item.id)));
    const transferencias = db.transfers.filter(item => mesmo(item.from, id) || mesmo(item.to, id));
    const movMeta = db.goalMoves.filter(item => mesmo(item.walletId, id));
    const contas = db.bills.filter(item => ids.has(String(item.transactionId)));
    const faturas = db.invoicePayments.filter(item => ids.has(String(item.transactionId)));
    const saldo = Number(cadastro.initial || 0) +
      transacoes.reduce((s, t) => s + (t.type === "Receita" ? 1 : -1) * Number(t.amount), 0) +
      transferencias.reduce((s, t) => s + (mesmo(t.to, id) ? 1 : -1) * Number(t.amount), 0) +
      movMeta.reduce((s, t) => s + (t.kind === "withdraw" ? 1 : -1) * Number(t.amount), 0);

    detalhes.push(`Saldo calculado da conta: ${dinheiro(saldo)}.`);
    detalhes.push(`${transacoes.length} movimentação(ões) serão apagadas.`);
    detalhes.push(`${transferencias.length} transferência(s) serão desfeitas nas duas contas.`);
    detalhes.push(`${movMeta.length} movimento(s) de metas serão desfeitos.`);
    detalhes.push(`${contas.length} conta(s) a pagar/receber voltarão a ficar pendentes.`);
    detalhes.push(`${faturas.length} fatura(s) de cartão voltarão a ficar abertas.`);

    // Antes de apagar uma carteira, não podemos deixar metas negativas.
    const idsMetas = new Set(movMeta.map(m => String(m.goalId)));
    for (const meta of db.goals.filter(m => idsMetas.has(String(m.id)))) {
      const saldoRestante = db.goalMoves
        .filter(m => mesmo(m.goalId, meta.id) && !mesmo(m.walletId, id))
        .reduce((s, m) => s + (m.kind === "withdraw" ? -1 : 1) * Number(m.amount), 0);
      if (saldoRestante < -0.005) {
        throw new Error(`A exclusão deixaria a meta “${meta.name}” com saldo negativo. Exclua ou ajuste essa meta primeiro.`);
      }
    }

    return {
      nome: cadastro.name, titulo: "Excluir conta corrente / carteira", detalhes,
      vinculos: transacoes.length + transferencias.length + movMeta.length,
      aplicar(dados) {
        const idsLocais = new Set(dados.transactions
          .filter(t => mesmo(t.walletId, id)).map(t => String(t.id)));
        dados.bills.forEach(conta => {
          if (conta.transactionId != null && idsLocais.has(String(conta.transactionId))) {
            conta.status = "pending";
            delete conta.transactionId;
          }
        });
        dados.invoicePayments = dados.invoicePayments.filter(
          item => !idsLocais.has(String(item.transactionId))
        );
        dados.transactions = dados.transactions.filter(t => !mesmo(t.walletId, id));
        dados.transfers = dados.transfers.filter(t => !mesmo(t.from, id) && !mesmo(t.to, id));
        dados.goalMoves = dados.goalMoves.filter(t => !mesmo(t.walletId, id));
        dados.wallets = dados.wallets.filter(w => !mesmo(w.id, id));
      }
    };
  }

  function salvarBackup(dados, revisao) {
    const arquivo = new Blob([JSON.stringify({
      formato: "WJ_FINANCAS_BACKUP_V1",
      criadoEm: new Date().toISOString(), revisao, dados
    }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");
    link.href = url;
    link.download = `backup-financas-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function pedirConfirmacao(analise, dados, revisao) {
    return new Promise(resolve => {
      const fundo = document.createElement("div");
      fundo.id = "wj-exclusao-dialogo";
      fundo.style.cssText = "position:fixed;inset:0;z-index:2147483590;" +
        "background:#000c;display:grid;place-items:center;padding:15px";

      const painel = document.createElement("section");
      painel.setAttribute("role", "dialog");
      painel.setAttribute("aria-modal", "true");
      painel.setAttribute("aria-label", analise.titulo);
      painel.style.cssText = "width:min(100%,520px);max-height:85vh;overflow:auto;" +
        "background:#24272d;color:#f9fafb;border:1px solid #535961;border-radius:15px;" +
        "padding:22px;font:14px/1.5 system-ui;box-shadow:0 20px 55px #0009";

      const titulo = document.createElement("h2");
      titulo.style.cssText = "font-size:20px;margin:0 0 10px";
      titulo.textContent = analise.titulo;
      const descricao = document.createElement("p");
      descricao.textContent = `Cadastro: ${analise.nome}. Confira o que será removido:`;
      const lista = document.createElement("ul");
      lista.style.cssText = "margin:12px 0;padding-left:20px";
      for (const texto of analise.detalhes) {
        const li = document.createElement("li");
        li.textContent = texto;
        lista.append(li);
      }
      const aviso = document.createElement("p");
      aviso.style.cssText = "color:#ffafba;font-weight:700";
      aviso.textContent = "A exclusão é permanente e alterará o histórico financeiro.";
      const instrucoes = document.createElement("label");
      instrucoes.textContent = analise.vinculos
        ? "Para confirmar, digite EXCLUIR:"
        : "Confirme a exclusão:";
      instrucoes.style.cssText = "display:block;margin:12px 0 7px";
      const campo = document.createElement("input");
      campo.type = "text";
      campo.autocomplete = "off";
      campo.placeholder = "EXCLUIR";
      campo.style.cssText = "display:block;width:100%;height:43px;padding:9px;color:white;" +
        "border:1px solid #737985;border-radius:8px;background:#343943;font:inherit";
      if (analise.vinculos) instrucoes.append(campo);

      const botoes = document.createElement("div");
      botoes.style.cssText = "display:flex;flex-wrap:wrap;gap:9px;margin-top:18px";
      const botao = (texto, cor) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = texto;
        b.style.cssText = "min-height:43px;padding:9px 13px;border:0;border-radius:9px;" +
          `background:${cor};color:#fff;font:700 13px system-ui;cursor:pointer`;
        return b;
      };
      const backup = botao("Baixar backup JSON", "#475366");
      const cancelar = botao("Cancelar", "#525862");
      const confirmar = botao("Excluir definitivamente", "#b33745");
      confirmar.disabled = Boolean(analise.vinculos);
      confirmar.style.opacity = confirmar.disabled ? ".5" : "1";
      campo.addEventListener("input", () => {
        confirmar.disabled = campo.value.trim().toUpperCase() !== "EXCLUIR";
        confirmar.style.opacity = confirmar.disabled ? ".5" : "1";
      });
      const encerrar = resultado => { fundo.remove(); resolve(resultado); };
      backup.addEventListener("click", () => salvarBackup(dados, revisao));
      cancelar.addEventListener("click", () => encerrar(false));
      confirmar.addEventListener("click", () => { if (!confirmar.disabled) encerrar(true); });
      botoes.append(backup, cancelar, confirmar);
      painel.append(titulo, descricao, lista, aviso, instrucoes, botoes);
      fundo.append(painel);
      document.body.append(fundo);
      (analise.vinculos ? campo : confirmar).focus();
      fundo.addEventListener("click", e => { if (e.target === fundo) encerrar(false); });
    });
  }

  async function excluirNoServidor(tipo, id) {
    if (executando) return;
    executando = true;
    try {
      if (!window.WJ?.api) throw new Error("A comunicação com o servidor não está disponível.");
      const resposta = await window.WJ.api("/financas-pessoais");
      const revisao = Number(resposta?.revisao);
      if (!Number.isSafeInteger(revisao)) throw new Error("Revisão inválida. Atualize a página.");
      const dados = prepararDados(resposta.dados);
      const analise = analisar(dados, tipo, id);
      if (!await pedirConfirmacao(analise, dados, revisao)) return;
      // A revisão protege contra alterações feitas em outra aba.
      analise.aplicar(dados);
      const resultado = await window.WJ.api("/financas-pessoais", {
        method: "PUT",
        body: JSON.stringify({ dados, revisao })
      });
      if (!Number.isSafeInteger(Number(resultado?.revisao))) {
        throw new Error("O servidor não confirmou o salvamento.");
      }
      mensagem("Excluído com sucesso. Atualizando a tela...");
      // Recarregar somente este iframe para sincronizar todo o painel.
      setTimeout(() => window.location.reload(), 500);
    } catch (erro) {
      console.error("Falha ao excluir conta/meta:", erro);
      mensagem(`Não foi possível excluir: ${erro.message || "erro desconhecido"}`, true);
    } finally {
      executando = false;
    }
  }

  // Captura ANTES do antigo handler, inclusive quando o botão é criado dinamicamente.
  document.addEventListener("click", evento => {
    const alvo = evento.target.closest?.("[data-action='delete-wallet'],[data-action='delete-goal']");
    if (!alvo) return;
    evento.preventDefault();
    evento.stopImmediatePropagation();
    excluirNoServidor(alvo.dataset.action === "delete-wallet" ? "wallet" : "goal", alvo.dataset.id);
  }, true);
})();
