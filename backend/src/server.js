
"use strict";

require("dotenv").config();

const app = require("./app");
const pool = require("./config/database");

const PORT = Number(process.env.PORT || 3000);
const PRODUCAO = process.env.NODE_ENV === "production";

async function iniciarServidor() {
  try {
    // =====================================
    // VALIDAR CONFIGURAÇÕES
    // =====================================

    if (
      !process.env.SESSION_SECRET ||
      process.env.SESSION_SECRET.length < 32
    ) {
      throw new Error(
        "Configure SESSION_SECRET com pelo menos 32 caracteres."
      );
    }

    if (
      PRODUCAO &&
      process.env.DB_SSL === "false"
    ) {
      console.warn(
        "Atenção: verifique se a conexão PostgreSQL utiliza TLS."
      );
    }

    // =====================================
    // TESTAR CONEXÃO COM POSTGRESQL
    // =====================================

    await pool.query("SELECT NOW()");

    console.log(
      "PostgreSQL conectado com sucesso."
    );

    // =====================================
    // INICIAR SERVIDOR
    // =====================================

    const server = app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log("----------------------------------");
        console.log("BARBEARIA WJ - BACKEND ONLINE");
        console.log(`Ambiente: ${
          PRODUCAO ? "Produção" : "Desenvolvimento"
        }`);
        console.log(`Porta: ${PORT}`);

        if (!PRODUCAO) {
          console.log(
            `Acesso local: http://localhost:${PORT}`
          );
        }

        console.log("----------------------------------");
      }
    );

    // =====================================
    // ENCERRAMENTO CONTROLADO
    // =====================================

    async function encerrar(sinal) {
      console.log(
        `${sinal} recebido. Encerrando servidor...`
      );

      server.close(async () => {
        try {
          await pool.end();
          console.log(
            "Conexão PostgreSQL encerrada."
          );
          process.exit(0);
        } catch (erro) {
          console.error(
            "Erro ao encerrar PostgreSQL:",
            erro.message
          );
          process.exit(1);
        }
      });
    }

    process.once("SIGTERM", () => {
      void encerrar("SIGTERM");
    });

    process.once("SIGINT", () => {
      void encerrar("SIGINT");
    });

  } catch (erro) {
    console.error(
      "Falha ao iniciar o backend:",
      erro.message
    );

    process.exit(1);
  }
}

iniciarServidor();
