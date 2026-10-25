
"use strict";

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const cors = require("cors");

const pool = require("./config/database");

const authRoutes = require("./routes/authRoutes");
const estoqueRoutes = require("./routes/estoqueRoutes");
const financeiroRoutes = require("./routes/financeiroRoutes");
const consumoRoutes = require("./routes/consumoRoutes");

const financasPessoaisRoutes = require(
  "./routes/financasPessoaisRoutes"
);

const {
  exigirLogin
} = require("./middlewares/authMiddleware");

const app = express();

const producao =
  process.env.NODE_ENV === "production";

const frontend = path.resolve(__dirname, "../..");

// =====================================
// CONFIGURAÇÃO DE ORIGEM
// =====================================

const origemPermitida = (
  process.env.FRONTEND_ORIGIN ||
  "http://localhost:3000"
).replace(/\/$/, "");

app.disable("x-powered-by");

if (producao) {
  app.set("trust proxy", 1);
}

// =====================================
// SEGURANÇA HTTP
// =====================================

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

// =====================================
// PROCESSAMENTO DE REQUISIÇÕES
// =====================================

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "2mb"
  })
);

// =====================================
// CORS
// =====================================

app.use(
  cors({
    origin: origemPermitida,
    credentials: true
  })
);

// =====================================
// VERIFICAÇÃO DE ORIGEM
// =====================================

app.use((req, res, next) => {
  if (
    ["GET", "HEAD", "OPTIONS"].includes(
      req.method
    )
  ) {
    return next();
  }

  const origem = req.get("origin");

  if (!origem) {
    return next();
  }

  let origemAtual;

  try {
    origemAtual = new URL(origem).origin;
  } catch {
    return res.status(403).json({
      erro: "Origem inválida."
    });
  }

  const origemDoServidor =
    `${req.protocol}://${req.get("host")}`;

  if (
    origemAtual !== origemPermitida &&
    origemAtual !== origemDoServidor
  ) {
    return res.status(403).json({
      erro: "Origem não autorizada."
    });
  }

  next();
});

// =====================================
// SESSÕES
// =====================================

app.use(
  session({
    name: "wj.sid",

    store: new pgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true
    }),

    secret: process.env.SESSION_SECRET,

    resave: false,
    saveUninitialized: false,
    rolling: true,

    cookie: {
      httpOnly: true,
      secure: producao,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000
    }
  })
);

// =====================================
// CACHE DA API
// =====================================

app.use("/api", (req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  next();
});

// =====================================
// HEALTH CHECK
// =====================================

app.get(
  "/api/health",
  async (req, res, next) => {
    try {
      await pool.query("SELECT 1");

      return res.json({
        status: "online",
        banco: "conectado"
      });

    } catch (erro) {
      next(erro);
    }
  }
);

// =====================================
// ROTAS DA API
// =====================================

app.use("/api/auth", authRoutes);

app.use("/api/estoque", estoqueRoutes);

app.use("/api/financeiro", financeiroRoutes);

app.use("/api/consumo", consumoRoutes);

app.use(
  "/api/financas-pessoais",
  financasPessoaisRoutes
);

// =====================================
// ARQUIVOS ESTÁTICOS
// =====================================

app.use(
  "/css",
  express.static(
    path.join(frontend, "css")
  )
);

app.use(
  "/js",
  express.static(
    path.join(frontend, "js")
  )
);

app.use(
  "/assets",
  express.static(
    path.join(frontend, "assets")
  )
);

// =====================================
// ARQUIVOS DA PWA
// =====================================

for (const arquivo of [
  "manifest.webmanifest",
  "service-worker.js"
]) {
  app.get(`/${arquivo}`, (req, res) => {
    res.sendFile(
      path.join(frontend, arquivo)
    );
  });
}

// =====================================
// PÁGINA DE LOGIN
// =====================================

app.get(
  ["/", "/index.html"],
  (req, res) => {
    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    res.sendFile(
      path.join(frontend, "index.html")
    );
  }
);

// =====================================
// PÁGINAS PROTEGIDAS
// =====================================

const paginas = [
  "dashboard.html",
  "financeiro.html",
  "estoque.html",
  "consumo.html",
  "financas-pessoais.html",
  "pessoal-app.html"
];

for (const pagina of paginas) {
  app.get(
    `/${pagina}`,
    exigirLogin,
    (req, res) => {
      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      res.sendFile(
        path.join(frontend, pagina)
      );
    }
  );
}

// =====================================
// ROTA NÃO ENCONTRADA
// =====================================

app.use((req, res) => {
  res.status(404).json({
    erro: "Rota não encontrada."
  });
});

// =====================================
// TRATAMENTO DE ERROS
// =====================================

app.use((erro, req, res, next) => {
  console.error(
    "Erro:",
    erro.message
  );

  if (erro.status) {
    return res.status(erro.status).json({
      erro: erro.message
    });
  }

  return res.status(500).json({
    erro: "Erro interno do servidor."
  });
});

module.exports = app;
