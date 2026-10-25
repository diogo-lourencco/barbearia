
"use strict";

const express = require("express");

const {
  exigirLogin
} = require("../middlewares/authMiddleware");

const controller = require(
  "../controllers/financasPessoaisController"
);

const router = express.Router();

// Todas as rotas exigem autenticação.
router.use(exigirLogin);

// Buscar os dados pessoais.
router.get("/", controller.obter);

// Salvar os dados pessoais.
router.put("/", controller.salvar);

module.exports = router;
