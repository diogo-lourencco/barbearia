
"use strict";

const WJ = {
  keys: {
    finance: "bwj_financeiro",
    stock: "bwj_estoque",
    consumption: "bwj_consumo",
    user: "barbeariaWJ_user"
  },

  usuario: null,

  // =====================================
  // API E AUTENTICAÇÃO
  // =====================================

  async api(endpoint, options = {}) {
    const headers = {
      ...(options.body ? {
        "Content-Type": "application/json"
      } : {}),
      ...(options.headers || {})
    };

    const resposta = await fetch(`/api${endpoint}`, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
      headers
    });

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
        dados.erro || "Sessão expirada. Entre novamente."
      );
    }

    if (!resposta.ok) {
      throw new Error(
        dados.erro || `Erro na requisição (${resposta.status}).`
      );
    }

    return dados;
  },

  async verificarSessao() {
    try {
      const dados = await this.api("/auth/me");

      if (!dados.autenticado || !dados.usuario) {
        return null;
      }

      this.usuario = dados.usuario;
      return dados.usuario;
    } catch {
      this.usuario = null;
      return null;
    }
  },

  async sair() {
    try {
      await this.api("/auth/logout", {
        method: "POST"
      });
    } catch (erro) {
      console.warn("Erro ao encerrar sessão:", erro.message);
    } finally {
      this.usuario = null;
      localStorage.removeItem(this.keys.user);
      window.location.replace("/index.html");
    }
  },

  // =====================================
  // COMPATIBILIDADE COM AS PÁGINAS ANTIGAS
  // =====================================
  // Estes métodos ainda usam localStorage.
  // Serão substituídos pela API ao atualizar
  // Financeiro, Estoque e Consumo.
  // Não são o banco de dados definitivo.

  get(key) {
    try {
      const data = JSON.parse(localStorage.getItem(key));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  save(key, rows) {
    localStorage.setItem(key, JSON.stringify(rows));
  },

  finance() {
    return this.get(this.keys.finance);
  },

  stock() {
    return this.get(this.keys.stock);
  },

  consumption() {
    return this.get(this.keys.consumption);
  },

  // =====================================
  // FUNÇÕES AUXILIARES
  // =====================================

  money(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  },

  today() {
    const date = new Date();

    return new Date(
      date.getTime() - date.getTimezoneOffset() * 60000
    ).toISOString().slice(0, 10);
  },

  date(value) {
    if (!value) return "-";

    const parts = String(value).slice(0, 10).split("-");

    return parts.length === 3
      ? `${parts[2]}/${parts[1]}/${parts[0]}`
      : String(value);
  },

  id() {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now() + Math.random());
  },

  escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  },

  sum(rows, type) {
    return rows
      .filter(row => !type || row.tipo === type)
      .reduce(
        (total, row) => total + Number(row.valor || 0),
        0
      );
  },

  toast(message) {
    document.querySelector(".toast")?.remove();

    const element = document.createElement("div");
    element.className = "toast";
    element.textContent = message;

    document.body.append(element);

    setTimeout(() => element.remove(), 3200);
  },

  download(name, data, type) {
    const url = URL.createObjectURL(
      new Blob([data], { type })
    );

    const link = document.createElement("a");

    link.href = url;
    link.download = name;
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1500);
  },

  // =====================================
  // ÍCONES LUCIDE
  // =====================================

  initIcons() {
    if (
      window.lucide &&
      typeof window.lucide.createIcons === "function"
    ) {
      window.lucide.createIcons();
    }
  },

  // =====================================
  // INICIALIZAÇÃO DO SISTEMA
  // =====================================

  async init(page, options = {}) {
    if (page === "login") {
      const usuario = await this.verificarSessao();

      if (usuario) {
        window.location.replace("/dashboard.html");
        return false;
      }

      return true;
    }

    const usuario = await this.verificarSessao();

    if (!usuario) {
      window.location.replace("/index.html");
      return false;
    }

    // Nas páginas que já possuem layout próprio, validar apenas a sessão.
    // Evita inserir um segundo menu e cabeçalho dentro do painel pessoal.
    if (options.layout === false) {
      this.initIcons();
      return true;
    }

    const main = document.querySelector(".main");

    if (!main) {
      console.error("Elemento .main não encontrado.");
      return false;
    }

    // =====================================
    // MENU LATERAL
    // =====================================

    const menu = [
      ["dashboard", "layout-dashboard", "Dashboard"],
      ["financeiro", "wallet", "Financeiro"],
      ["estoque", "boxes", "Estoque"],
      ["consumo", "clipboard-list", "Consumo"],
      [
        "financas-pessoais",
        "wallet-cards",
        "Minhas Finanças"
      ]
    ];

    const sidebar = `
      <aside class="sidebar" id="sidebar">

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

        <nav class="nav" aria-label="Menu principal">
          ${menu.map(([id, icon, label]) => `
            <a
              href="${id}.html"
              class="${id === page ? "active" : ""}"
              ${id === page ? 'aria-current="page"' : ""}
            >
              <i
                data-lucide="${icon}"
                aria-hidden="true"
              ></i>

              <span>${label}</span>
            </a>
          `).join("")}
        </nav>

        <div class="sidebar-footer">
          <span class="muted">Barbearia WJ</span>

          <button
            class="btn danger"
            id="logout"
            type="button"
          >
            <i
              data-lucide="log-out"
              aria-hidden="true"
            ></i>

            <span>Sair</span>
          </button>
        </div>

      </aside>
    `;

    document.body.insertAdjacentHTML(
      "afterbegin",
      sidebar
    );

    // =====================================
    // BARRA SUPERIOR
    // =====================================

    main.insertAdjacentHTML("afterbegin", `
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
            ${page === "financas-pessoais"
              ? "Minhas Finanças"
              : "Painel de Gestão"}
          </strong>

        </div>

        <span class="user">
          Olá, ${this.escape(usuario.nome)}
        </span>

      </header>
    `);

    // =====================================
    // MENU RESPONSIVO
    // =====================================

    const menuBtn = document.getElementById("menuBtn");
    const sidebarElement = document.getElementById("sidebar");

    menuBtn?.addEventListener("click", () => {
      const isOpen = sidebarElement.classList.toggle("open");

      menuBtn.setAttribute(
        "aria-expanded",
        String(isOpen)
      );

      menuBtn.setAttribute(
        "aria-label",
        isOpen ? "Fechar menu" : "Abrir menu"
      );
    });

    // =====================================
    // LOGOUT REAL
    // =====================================

    document.getElementById("logout")
      ?.addEventListener("click", () => this.sair());

    // =====================================
    // RENDERIZAR ÍCONES
    // =====================================

    this.initIcons();

    return true;
  }
};
