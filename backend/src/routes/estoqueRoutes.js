
"use strict";

const express = require("express");
const controller = require("../controllers/estoqueController");

const {
  exigirLogin,
  exigirAdmin
} = require("../middlewares/authMiddleware");

const router = express.Router();

router.use(exigirLogin);

// Listar produtos ativos.
// Para arquivados: GET /api/estoque?arquivados=true
router.get("/", controller.listar);

// Cadastrar produto.
router.post("/", exigirAdmin, controller.cadastrar);

// Atualizar produto ativo.
router.put("/:id", exigirAdmin, controller.atualizar);

// Excluir ou arquivar automaticamente.
router.delete("/:id", exigirAdmin, controller.excluir);

// Restaurar produto arquivado.
router.patch(
  "/:id/restaurar",
  exigirAdmin,
  controller.restaurar
);

module.exports = router;
