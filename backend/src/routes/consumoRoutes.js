
"use strict";

const express = require("express");

const controller = require(
  "../controllers/consumoController"
);

const auth = require(
  "../middlewares/authMiddleware"
);

const router = express.Router();

// =====================================
// VALIDAR FUNÇÕES IMPORTADAS
// =====================================

if (typeof auth.exigirLogin !== "function") {
  throw new Error(
    "A função exigirLogin não foi encontrada no authMiddleware.js"
  );
}

if (typeof auth.exigirAdmin !== "function") {
  throw new Error(
    "A função exigirAdmin não foi encontrada no authMiddleware.js"
  );
}

if (typeof controller.listar !== "function") {
  throw new Error(
    "A função listar não foi encontrada no consumoController.js"
  );
}

if (typeof controller.cadastrar !== "function") {
  throw new Error(
    "A função cadastrar não foi encontrada no consumoController.js"
  );
}

if (typeof controller.excluir !== "function") {
  throw new Error(
    "A função excluir não foi encontrada no consumoController.js"
  );
}

// =====================================
// AUTENTICAÇÃO
// =====================================

router.use(auth.exigirLogin);

// =====================================
// LISTAR CONSUMOS
// =====================================

router.get("/", controller.listar);

// =====================================
// CADASTRAR CONSUMO
// =====================================

router.post("/", controller.cadastrar);

// =====================================
// EXCLUIR CONSUMO
// =====================================

router.delete(
  "/:id",
  auth.exigirAdmin,
  controller.excluir
);

module.exports = router;
