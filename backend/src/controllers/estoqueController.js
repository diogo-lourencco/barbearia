
const pool = require("../config/database");

function numeroValido(valor, minimo = 0) {
  return valor !== null &&
    valor !== undefined &&
    valor !== "" &&
    Number.isFinite(Number(valor)) &&
    Number(valor) >= minimo;
}

async function listar(req, res, next) {
  try {
    const resultado = await pool.query(
      `SELECT *,
         (quantidade <= estoque_minimo) AS alerta,
         (quantidade * custo_unitario) AS valor_estoque
       FROM produtos
       ORDER BY nome ASC`
    );

    res.json(resultado.rows);
  } catch (erro) {
    next(erro);
  }
}

async function cadastrar(req, res, next) {
  try {
    const {
      nome,
      unidade = "un",
      quantidade = 0,
      estoque_minimo = 0,
      custo_unitario = 0,
      preco_venda = 0
    } = req.body || {};

    if (typeof nome !== "string" || !nome.trim() || nome.length > 160) {
      return res.status(400).json({ erro: "Nome inválido." });
    }

    if (
      typeof unidade !== "string" ||
      !unidade.trim() ||
      unidade.length > 30 ||
      !numeroValido(quantidade) ||
      !numeroValido(estoque_minimo) ||
      !numeroValido(custo_unitario) ||
      !numeroValido(preco_venda)
    ) {
      return res.status(400).json({
        erro: "Confira os dados do produto."
      });
    }

    const resultado = await pool.query(
      `INSERT INTO produtos
        (nome, unidade, quantidade, estoque_minimo,
         custo_unitario, preco_venda)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        nome.trim(),
        unidade.trim(),
        quantidade,
        estoque_minimo,
        custo_unitario,
        preco_venda
      ]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (erro) {
    next(erro);
  }
}

async function atualizar(req, res, next) {
  try {
    const { id } = req.params;

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ erro: "ID inválido." });
    }

    const {
      nome,
      unidade,
      quantidade,
      estoque_minimo,
      custo_unitario,
      preco_venda
    } = req.body || {};

    if (
      typeof nome !== "string" ||
      !nome.trim() ||
      nome.length > 160 ||
      typeof unidade !== "string" ||
      !unidade.trim() ||
      unidade.length > 30 ||
      !numeroValido(quantidade) ||
      !numeroValido(estoque_minimo) ||
      !numeroValido(custo_unitario) ||
      !numeroValido(preco_venda)
    ) {
      return res.status(400).json({
        erro: "Confira os dados do produto."
      });
    }

    const resultado = await pool.query(
      `UPDATE produtos
       SET nome = $1,
           unidade = $2,
           quantidade = $3,
           estoque_minimo = $4,
           custo_unitario = $5,
           preco_venda = $6,
           atualizado_em = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        nome.trim(),
        unidade.trim(),
        quantidade,
        estoque_minimo,
        custo_unitario,
        preco_venda,
        id
      ]
    );

    if (!resultado.rowCount) {
      return res.status(404).json({
        erro: "Produto não encontrado."
      });
    }

    res.json(resultado.rows[0]);
  } catch (erro) {
    next(erro);
  }
}

async function excluir(req, res, next) {
  try {
    const { id } = req.params;

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ erro: "ID inválido." });
    }

    const resultado = await pool.query(
      "DELETE FROM produtos WHERE id = $1 RETURNING id",
      [id]
    );

    if (!resultado.rowCount) {
      return res.status(404).json({
        erro: "Produto não encontrado."
      });
    }

    res.json({ mensagem: "Produto excluído." });
  } catch (erro) {
    if (erro.code === "23503") {
      return res.status(409).json({
        erro: "Este produto possui histórico e não pode ser excluído."
      });
    }

    next(erro);
  }
}

module.exports = {
  listar,
  cadastrar,
  atualizar,
  excluir
};
