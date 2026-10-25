
"use strict";

const express = require("express");
const { rateLimit } = require("express-rate-limit");

const {
  login,
  verificarSessao,
  logout
} = require("../controllers/authController");

const router = express.Router();

// =====================================
// LIMITADOR DE TENTATIVAS DE LOGIN
// =====================================

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    erro: "Muitas tentativas. Aguarde 15 minutos."
  }
});

// =====================================
// ROTAS DE AUTENTICAÇÃO
// =====================================

// Login com usuário e senha
router.post("/login", limiteLogin, login);

// Verificar sessão autenticada
router.get("/me", verificarSessao);

// Encerrar sessão
router.post("/logout", logout);

module.exports = router;
