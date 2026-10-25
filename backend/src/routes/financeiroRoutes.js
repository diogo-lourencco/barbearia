
"use strict";

const express = require("express");
const controller = require("../controllers/financeiroController");

const { exigirLogin } = require("../middlewares/authMiddleware");

const router = express.Router();

router.use(exigirLogin);

// Movimentações financeiras
router.get("/", controller.listar);
router.get("/resumo", controller.resumo);

// Vendas de produtos
router.get("/vendas", controller.listarVendas);
router.post("/vendas", controller.venderProduto);

// Cancelamento de venda pelo ID da movimentação
router.delete(
  "/:id/cancelar-venda",
  controller.cancelarVenda
);

// Movimentações manuais
router.post("/", controller.cadastrar);
router.put("/:id", controller.editar);
router.delete("/:id", controller.excluir);

module.exports = router;
