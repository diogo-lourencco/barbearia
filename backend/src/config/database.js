
"use strict";

const { Pool } = require("pg");

// =====================================
// CONFIGURAÇÕES DO POSTGRESQL
// =====================================

const producao =
  process.env.NODE_ENV === "production";

const usarSSL =
  process.env.DB_SSL === "true";

const configuracao = {
  host: process.env.DB_HOST || "localhost",

  port: Number(
    process.env.DB_PORT || 5432
  ),

  database: process.env.DB_NAME,

  user: process.env.DB_USER,

  password: process.env.DB_PASSWORD,

  max: producao ? 10 : 5,

  idleTimeoutMillis: 30000,

  connectionTimeoutMillis: 10000,

  ssl: usarSSL
    ? {
        rejectUnauthorized: true,
        ...(process.env.DB_CA_CERT
          ? {
              ca: process.env.DB_CA_CERT.replace(
                /\\n/g,
                "\n"
              )
            }
          : {})
      }
    : false
};

// =====================================
// VALIDAR VARIÁVEIS DE AMBIENTE
// =====================================

const obrigatorias = [
  "DB_HOST",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD"
];

const ausentes = obrigatorias.filter(
  nome => !process.env[nome]
);

if (ausentes.length) {
  throw new Error(
    `Configuração PostgreSQL incompleta: ${
      ausentes.join(", ")
    }`
  );
}

if (
  producao &&
  !usarSSL
) {
  console.warn(
    "A conexão PostgreSQL está sem TLS. " +
    "Confirme se isso é apropriado para a rede do provedor."
  );
}

// =====================================
// CRIAR POOL DE CONEXÕES
// =====================================

const pool = new Pool(configuracao);

// =====================================
// ERROS EM CONEXÕES OCIOSAS
// =====================================

pool.on("error", erro => {
  console.error(
    "Erro em conexão ociosa PostgreSQL:",
    erro.message
  );
});

module.exports = pool;
