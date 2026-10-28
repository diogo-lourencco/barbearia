
"use strict";

const WJ = {
  keys: {
    finance: "bwj_financeiro",
    stock: "bwj_estoque",
    consumption: "bwj_consumo",
    user: "barbeariaWJ_user"
  },

  usuario: null,

  /* =====================================================
     API
  ===================================================== */

  async api(endpoint, options = {}) {
    const headers = {
      ...(options.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...(options.headers || {})
    };

    const resposta = await fetch(
      `/api${endpoint}`,
      {
        ...options,
        credentials: "same-origin",
        cache: "no-store",
        headers
      }
    );

    let dados;

    try {
      dados = await resposta.json();
    } catch {
      dados = {};
    }

    if (resposta.status === 401) {
      if (!endpoint.startsWith("/auth/")) {
        window.location.replace("/index.html");
      }

      throw new Error(
        dados.erro ||
        "Sessão expirada. Entre novamente."
      );
    }

    if (!resposta.ok) {
      throw new Error(
        dados.erro ||
        `Erro na requisição (${resposta.status}).`
      );
    }

    return dados;
  },

  /* =====================================================
     VERIFICAR SESSÃO
  ===================================================== */

  async verificarSessao() {
    try {
      const dados = await this.api("/auth/me");

      if (
        !dados.autenticado ||
        !dados.usuario
      ) {
        this.usuario = null;
        return null;
      }

      this.usuario = dados.usuario;

      return dados.usuario;

    } catch (erro) {
      console.warn(
        "Não foi possível verificar a sessão:",
        erro.message
      );

      this.usuario = null;
      return null;
    }
  },

  /* =====================================================
     SAIR
  ===================================================== */

  async sair() {
    try {
      await this.api("/auth/logout", {
        method: "POST"
      });

    } catch (erro) {
      console.warn(
        "Erro ao encerrar sessão:",
        erro.message
      );

    } finally {
      this.usuario = null;

      localStorage.removeItem(
        this.keys.user
      );

      window.location.replace("/index.html");
    }
  },

  /* =====================================================
     COMPATIBILIDADE COM DADOS ANTIGOS
  ===================================================== */

  get(key) {
    try {
      const dados = JSON.parse(
        localStorage.getItem(key)
      );

      return Array.isArray(dados)
        ? dados
        : [];

    } catch {
      return [];
    }
  },

  save(key, rows) {
    localStorage.setItem(
      key,
      JSON.stringify(rows)
    );
  },

  finance() {
    return this.get(
      this.keys.finance
    );
  },

  stock() {
    return this.get(
      this.keys.stock
    );
  },

  consumption() {
    return this.get(
      this.keys.consumption
    );
  },

  /* =====================================================
     FUNÇÕES AUXILIARES
  ===================================================== */

  money(value) {
    return Number(value || 0)
      .toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
      });
  },

  today() {
    const date = new Date();

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  },

  date(value) {
    if (!value) return "-";

    const parts = String(value)
      .slice(0, 10)
      .split("-");

    return parts.length === 3
      ? `${parts[2]}/${parts[1]}/${parts[0]}`
      : String(value);
  },

  id() {
    return (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    )
      ? crypto.randomUUID()
      : String(Date.now() + Math.random());
  },

  escape(value) {
    return String(value ?? "")
      .replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]));
  },

  sum(rows, type) {
    return rows
      .filter(
        row => !type || row.tipo === type
      )
      .reduce(
        (total, row) =>
          total + Number(row.valor || 0),
        0
      );
  },

  /* =====================================================
     NOTIFICAÇÕES
  ===================================================== */

  toast(message) {
    const antiga = document.querySelector(
      ".wj-global-toast"
    );

    antiga?.remove();

    const elemento = document.createElement("div");

    elemento.className = "toast wj-global-toast";
    elemento.textContent = String(message);

    document.body.appendChild(elemento);

    window.setTimeout(() => {
      elemento.remove();
    }, 3200);
  },

  /* =====================================================
     DOWNLOAD
  ===================================================== */

  download(name, data, type) {
    const arquivo = new Blob(
      [data],
      { type }
    );

    const url = URL.createObjectURL(
      arquivo
    );

    const link = document.createElement("a");

    link.href = url;
    link.download = name;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1500);
  },

  /* =====================================================
     ÍCONES
  ===================================================== */

  initIcons() {
    if (
      window.lucide &&
      typeof window.lucide.createIcons === "function"
    ) {
      window.lucide.createIcons();
    }
  },

  /* =====================================================
     INICIALIZAÇÃO
  ===================================================== */

  async init(page, options = {}) {

    /* PÁGINA DE LOGIN */

    if (page === "login") {
      const usuario = await this.verificarSessao();

      if (usuario) {
        window.location.replace(
          "/dashboard.html"
        );

        return false;
      }

      return true;
    }

    /* VERIFICAR AUTENTICAÇÃO */

    const usuario = await this.verificarSessao();

    if (!usuario) {
      window.location.replace(
        "/index.html"
      );

      return false;
    }

    /*
      PÁGINAS COM LAYOUT PRÓPRIO:

      Minhas Finanças usa pessoal-app.html,
      que possui sua própria sidebar.

      Não inserir o layout do sistema
      novamente nessas páginas.
    */

    if (options.layout === false) {
      this.initIcons();
      return true;
    }

    const main = document.querySelector(
      ".main"
    );

    if (!main) {
      console.error(
        "Elemento .main não encontrado."
      );

      return false;
    }

    /* =====================================================
       EVITAR LAYOUT DUPLICADO
    ===================================================== */

    if (document.getElementById("sidebar")) {
      this.initIcons();
      return true;
    }

    /* =====================================================
       MENU LATERAL
    ===================================================== */

    const menu = [
      [
        "dashboard",
        "layout-dashboard",
        "Dashboard"
      ],
      [
        "financeiro",
        "wallet",
        "Financeiro"
      ],
      [
        "estoque",
        "boxes",
        "Estoque"
      ],
      [
        "consumo",
        "clipboard-list",
        "Consumo"
      ],
      [
        "financas-pessoais",
        "wallet-cards",
        "Minhas Finanças"
      ]
    ];

    const sidebar = `
      <aside
        class="sidebar"
        id="sidebar"
      >

        <a
          class="brand-logo-link"
          href="dashboard.html"
          aria-label="Barbearia WJ - início"
        >
          <img
            class="brand-logo"
            src="assets/logo.png"
            alt="Logo Barbearia WJ"
          >
        </a>

        <nav
          class="nav"
          aria-label="Menu principal"
        >

          ${menu.map(([id, icon, label]) => `
            <a
              href="${id}.html"
              class="${id === page ? "active" : ""}"
              ${id === page
                ? 'aria-current="page"'
                : ""
              }
            >
              <i
                data-lucide="${icon}"
                aria-hidden="true"
              ></i>

              <span>
                ${label}
              </span>
            </a>
          `).join("")}

        </nav>

        <div class="sidebar-footer">

          <span class="muted">
            Barbearia WJ
          </span>

          <button
            class="btn danger"
            id="logout"
            type="button"
          >
            <i
              data-lucide="log-out"
              aria-hidden="true"
            ></i>

            <span>
              Sair
            </span>
          </button>

        </div>
      </aside>
    `;

    document.body.insertAdjacentHTML(
      "afterbegin",
      sidebar
    );

    /* =====================================================
       CABEÇALHO SUPERIOR
    ===================================================== */

    main.insertAdjacentHTML(
      "afterbegin",
      `
        <header class="topbar">

          <div class="actions">

            <button
              class="btn alt menu-btn"
              id="menuBtn"
              type="button"
              aria-label="Abrir menu"
              aria-controls="sidebar"
              aria-expanded="false"
            >
              <i
                data-lucide="menu"
                aria-hidden="true"
              ></i>
            </button>

            <strong>
              ${
                page === "financas-pessoais"
                  ? "Minhas Finanças"
                  : "Painel de Gestão"
              }
            </strong>

          </div>

          <span class="user">
            Olá, ${this.escape(usuario.nome)}
          </span>

        </header>
      `
    );

    /* =====================================================
       MENU RESPONSIVO
    ===================================================== */

    const menuBtn = document.getElementById(
      "menuBtn"
    );

    const sidebarElement =
      document.getElementById("sidebar");

    menuBtn?.addEventListener(
      "click",
      () => {
        const aberto =
          sidebarElement.classList.toggle("open");

        menuBtn.setAttribute(
          "aria-expanded",
          String(aberto)
        );

        menuBtn.setAttribute(
          "aria-label",
          aberto ? "Fechar menu" : "Abrir menu"
        );
      }
    );

    /* =====================================================
       LOGOUT
    ===================================================== */

    document.getElementById("logout")
      ?.addEventListener(
        "click",
        () => this.sair()
      );

    this.initIcons();

    return true;
  }
};


window.WJ = WJ;
