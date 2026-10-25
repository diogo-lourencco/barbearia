
"use strict";

const express = require("express");

const controller = require("../controllers/financeiroController");

const {
  exigirLogin
} = require("../middlewares/authMiddleware");

const router = express.Router();

// Todas as rotas exigem autenticação.
router.use(exigirLogin);

// Listar movimentações.
router.get("/", controller.listar);

// Resumo de um mês.
router.get("/resumo", controller.resumo);

// Listar vendas de produtos.
router.get("/vendas", controller.listarVendas);

// Registrar venda de produto.
router.post("/vendas", controller.venderProduto);

// Cadastrar receita ou despesa.
router.post("/", controller.cadastrar);

// Editar movimentação manual.
router.put("/:id", controller.editar);

// Excluir movimentação manual.
router.delete("/:id", controller.excluir);

module.exports = router;
