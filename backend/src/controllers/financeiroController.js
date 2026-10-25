
"use strict";

const pool = require("../config/database");
const { baixarEstoque } = require("../services/estoqueService");

const TIPOS = ["receita", "despesa"];
const PAGAMENTOS = ["Pix", "Cartão", "Dinheiro"];

function valorValido(valor, minimo = 0) {
  return valor !== null &&
    valor !== undefined &&
    valor !== "" &&
    Number.isFinite(Number(valor)) &&
    Number(valor) >= minimo;
}

function dataValida(data) {
  if (typeof data !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;

  const dataObj = new Date(`${data}T12:00:00Z`);

  return !Number.isNaN(dataObj.getTime()) &&
    dataObj.toISOString().slice(0, 10) === data;
}

function texto(valor, maximo) {
  return String(valor ?? "").trim().slice(0, maximo);
}

function idValido(id) {
  return /^\d+$/.test(String(id)) &&
    Number.isSafeInteger(Number(id)) &&
    Number(id) > 0;
}

function dinheiroValido(valor) {
  return valorValido(valor, 0.01) &&
    Number(valor) <= 9999999999.99 &&
    Math.abs(
      Math.round(Number(valor) * 100) / 100 -
      Number(valor)
    ) < 0.0000001;
}

function quantidadeValida(valor) {
  return valorValido(valor, 0.001) &&
    Math.abs(
      Math.round(Number(valor) * 1000) / 1000 -
      Number(valor)
    ) < 0.0000001;
}

function validarMovimentacao(dados) {
  const {
    tipo,
    data,
    descricao,
    pagamento,
    valor
  } = dados;

  if (!TIPOS.includes(tipo)) {
    return "Tipo de movimentação inválido.";
  }

  if (!dataValida(data)) {
    return "Informe uma data válida.";
  }

  if (
    typeof descricao !== "string" ||
    !descricao.trim() ||
    descricao.trim().length > 250
  ) {
    return "Informe uma descrição de até 250 caracteres.";
  }

  if (!dinheiroValido(valor)) {
    return "Informe um valor válido, maior que zero.";
  }

  if (!PAGAMENTOS.includes(pagamento)) {
    return "Forma de pagamento inválida.";
  }

  return null;
}

// =====================================
// LISTAR MOVIMENTAÇÕES
// =====================================

async function listar(req, res, next) {
  try {
    const resultado = await pool.query(
      `SELECT
         id,
         tipo,
         TO_CHAR(data, 'YYYY-MM-DD') AS data,
         cliente_nome,
         cliente_whatsapp,
         descricao,
         categoria,
         pagamento,
         valor,
         observacoes,
         origem,
         criado_por,
         criado_em
       FROM movimentacoes
       ORDER BY data DESC, id DESC`
    );

    res.json(resultado.rows);
  } catch (erro) {
    next(erro);
  }
}

// =====================================
// RESUMO MENSAL
// =====================================

async function resumo(req, res, next) {
  try {
    const mes = req.query.mes;

    if (
      typeof mes !== "string" ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)
    ) {
      return res.status(400).json({
        erro: "Informe o mês no formato AAAA-MM."
      });
    }

    const inicio = `${mes}-01`;

    const resultado = await pool.query(
      `SELECT
         COALESCE(SUM(valor) FILTER (
           WHERE tipo = 'receita'
         ), 0) AS receitas,

         COALESCE(SUM(valor) FILTER (
           WHERE tipo = 'despesa'
         ), 0) AS despesas,

         COUNT(*)::INTEGER AS movimentacoes

       FROM movimentacoes

       WHERE data >= $1::date
         AND data < ($1::date + INTERVAL '1 month')`,
      [inicio]
    );

    const dados = resultado.rows[0];

    res.json({
      mes,
      receitas: dados.receitas,
      despesas: dados.despesas,
      saldo: (
        Number(dados.receitas) - Number(dados.despesas)
      ).toFixed(2),
      movimentacoes: dados.movimentacoes
    });
  } catch (erro) {
    next(erro);
  }
}

// =====================================
// CADASTRAR MOVIMENTAÇÃO
// =====================================

async function cadastrar(req, res, next) {
  try {
    const dados = req.body || {};
    const erroValidacao = validarMovimentacao(dados);

    if (erroValidacao) {
      return res.status(400).json({
        erro: erroValidacao
      });
    }

    const {
      tipo,
      data,
      cliente_nome = "",
      cliente_whatsapp = "",
      descricao,
      categoria = "",
      pagamento,
      valor,
      observacoes = ""
    } = dados;

    const resultado = await pool.query(
      `INSERT INTO movimentacoes
        (
          tipo,
          data,
          cliente_nome,
          cliente_whatsapp,
          descricao,
          categoria,
          pagamento,
          valor,
          observacoes,
          origem,
          criado_por
        )
       VALUES
        (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          'manual', $10
        )
       RETURNING
         id,
         tipo,
         TO_CHAR(data, 'YYYY-MM-DD') AS data,
         cliente_nome,
         cliente_whatsapp,
         descricao,
         categoria,
         pagamento,
         valor,
         observacoes,
         origem`,
      [
        tipo,
        data,
        texto(cliente_nome, 160),
        texto(cliente_whatsapp, 30),
        descricao.trim(),
        texto(categoria, 100),
        pagamento,
        valor,
        String(observacoes),
        req.session.usuario.id
      ]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (erro) {
    next(erro);
  }
}

// =====================================
// EDITAR MOVIMENTAÇÃO MANUAL
// =====================================

async function editar(req, res, next) {
  try {
    const { id } = req.params;

    if (!idValido(id)) {
      return res.status(400).json({
        erro: "ID inválido."
      });
    }

    const dados = req.body || {};
    const erroValidacao = validarMovimentacao(dados);

    if (erroValidacao) {
      return res.status(400).json({
        erro: erroValidacao
      });
    }

    const {
      tipo,
      data,
      cliente_nome = "",
      cliente_whatsapp = "",
      descricao,
      categoria = "",
      pagamento,
      valor,
      observacoes = ""
    } = dados;

    const resultado = await pool.query(
      `UPDATE movimentacoes
       SET
         tipo = $1,
         data = $2,
         cliente_nome = $3,
         cliente_whatsapp = $4,
         descricao = $5,
         categoria = $6,
         pagamento = $7,
         valor = $8,
         observacoes = $9
       WHERE id = $10
         AND origem = 'manual'
       RETURNING
         id,
         tipo,
         TO_CHAR(data, 'YYYY-MM-DD') AS data,
         cliente_nome,
         cliente_whatsapp,
         descricao,
         categoria,
         pagamento,
         valor,
         observacoes,
         origem`,
      [
        tipo,
        data,
        texto(cliente_nome, 160),
        texto(cliente_whatsapp, 30),
        descricao.trim(),
        texto(categoria, 100),
        pagamento,
        valor,
        String(observacoes),
        id
      ]
    );

    if (!resultado.rowCount) {
      return res.status(404).json({
        erro: "Movimentação manual não encontrada."
      });
    }

    res.json({
      mensagem: "Movimentação atualizada com sucesso.",
      movimentacao: resultado.rows[0]
    });
  } catch (erro) {
    next(erro);
  }
}

// =====================================
// EXCLUIR MOVIMENTAÇÃO MANUAL
// =====================================

async function excluir(req, res, next) {
  try {
    const { id } = req.params;

    if (!idValido(id)) {
      return res.status(400).json({
        erro: "ID inválido."
      });
    }

    const resultado = await pool.query(
      `DELETE FROM movimentacoes
       WHERE id = $1
         AND origem = 'manual'
       RETURNING id`,
      [id]
    );

    if (!resultado.rowCount) {
      return res.status(404).json({
        erro: "Movimentação manual não encontrada."
      });
    }

    res.json({
      mensagem: "Movimentação excluída."
    });
  } catch (erro) {
    next(erro);
  }
}

// =====================================
// VENDER PRODUTO
// =====================================

async function venderProduto(req, res, next) {
  const {
    produto_id,
    quantidade,
    preco_unitario,
    data,
    cliente_nome = "",
    cliente_whatsapp = "",
    pagamento = "",
    observacoes = ""
  } = req.body || {};

  if (
    !idValido(produto_id) ||
    !quantidadeValida(quantidade) ||
    !dinheiroValido(preco_unitario) ||
    !dataValida(data) ||
    !PAGAMENTOS.includes(pagamento)
  ) {
    return res.status(400).json({
      erro: "Dados da venda inválidos."
    });
  }

  const total = Math.round(
    Number(quantidade) *
    Number(preco_unitario) *
    100
  ) / 100;

  if (
    !Number.isFinite(total) ||
    total <= 0 ||
    total > 9999999999.99
  ) {
    return res.status(400).json({
      erro: "Valor total inválido."
    });
  }

  const client = await pool.connect();
  let transacaoIniciada = false;

  try {
    await client.query("BEGIN");
    transacaoIniciada = true;

    // Baixa o estoque na mesma transação.
    const produto = await baixarEstoque(
      client,
      produto_id,
      quantidade
    );

    const movimentacao = await client.query(
      `INSERT INTO movimentacoes
        (
          tipo,
          data,
          cliente_nome,
          cliente_whatsapp,
          descricao,
          categoria,
          pagamento,
          valor,
          observacoes,
          origem,
          criado_por
        )
       VALUES
        (
          'receita',
          $1, $2, $3, $4,
          'Produtos vendidos',
          $5, $6, $7,
          'venda_produto', $8
        )
       RETURNING *`,
      [
        data,
        texto(cliente_nome, 160),
        texto(cliente_whatsapp, 30),
        `Venda de produto: ${produto.nome}`.slice(0, 250),
        pagamento,
        total,
        String(observacoes),
        req.session.usuario.id
      ]
    );

    const venda = await client.query(
      `INSERT INTO vendas_produtos
        (
          movimentacao_id,
          produto_id,
          quantidade,
          preco_unitario,
          total
        )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        movimentacao.rows[0].id,
        produto_id,
        quantidade,
        preco_unitario,
        total
      ]
    );

    await client.query("COMMIT");
    transacaoIniciada = false;

    res.status(201).json({
      mensagem: "Venda registrada com sucesso.",
      venda: venda.rows[0],
      movimentacao: movimentacao.rows[0],
      produto
    });
  } catch (erro) {
    if (transacaoIniciada) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErro) {
        console.error("Erro no rollback:", rollbackErro);
      }
    }

    next(erro);
  } finally {
    client.release();
  }
}

// =====================================
// LISTAR VENDAS
// =====================================

async function listarVendas(req, res, next) {
  try {
    const resultado = await pool.query(
      `SELECT
         v.*,
         p.nome AS produto_nome,
         TO_CHAR(m.data, 'YYYY-MM-DD') AS data,
         m.cliente_nome,
         m.cliente_whatsapp,
         m.pagamento
       FROM vendas_produtos v
       JOIN produtos p ON p.id = v.produto_id
       JOIN movimentacoes m
         ON m.id = v.movimentacao_id
       ORDER BY m.data DESC, v.id DESC`
    );

    res.json(resultado.rows);
  } catch (erro) {
    next(erro);
  }
}

module.exports = {
  listar,
  resumo,
  cadastrar,
  editar,
  excluir,
  venderProduto,
  listarVendas
};
