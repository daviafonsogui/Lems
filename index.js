import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================= FUNÇÕES SEGURAS =================

const lerArquivo = (arquivo) => {
  try {
    const caminho = path.join(__dirname, arquivo);

    if (!fs.existsSync(caminho)) {
      fs.writeFileSync(caminho, "[]");
      return [];
    }

    const dados = fs.readFileSync(caminho, "utf-8").trim();

    if (!dados) return [];

    return JSON.parse(dados);
  } catch (err) {
    console.error(`Erro lendo ${arquivo}:`, err.message);
    return [];
  }
};

const salvarArquivo = (arquivo, conteudo) => {
  if (!conteudo || typeof conteudo !== "object") {
    throw new Error("JSON inválido recebido no POST");
  }

  const caminho = path.join(__dirname, arquivo);
  fs.writeFileSync(caminho, JSON.stringify(conteudo, null, 2));
};

// ================= USERS =================
app.get("/admin/users", (req, res) => {
  res.json(lerArquivo("data.json"));
});
app.post("/admin/escala", (req, res) => {
  console.log("Corpo recebido:", JSON.stringify(req.body, null, 2));

  try {
    const atualizacoes = req.body;
    let usuarios = lerArquivo("data.json");

    const valoresValidos = ["T1", "T2", "F", null];

    const mapaUsuarios = {};

    // transforma usuários existentes em mapa
    usuarios.forEach(u => {
      mapaUsuarios[String(u.id)] = u;
    });

    // processa tudo que veio do front
    atualizacoes.forEach(update => {
      if (!update.dias) throw new Error(`Funcionário ${update.nome} sem dias`);

      update.dias.forEach(({ dia, status }) => {
        if (!valoresValidos.includes(status)) {
          throw new Error(`Status inválido ${status} para ${update.nome} dia ${dia}`);
        }
      });

      mapaUsuarios[String(update.id)] = {
        id: String(update.id),
        nome: update.nome,
        cargo: update.cargo,
        horarios: mapaUsuarios[String(update.id)]?.horarios || {},
        escalaInicial: update.dias.sort((a, b) => a.dia - b.dia),
      };
    });

    const resultadoFinal = Object.values(mapaUsuarios);

    salvarArquivo("data.json", resultadoFinal);

    res.json({ mensagem: "Escalas atualizadas com sucesso" });

  } catch (err) {
    console.error(err);
    res.status(400).json({ erro: err.message });
  }
});


app.post("/admin/horarios", (req, res) => {
  try {
    const atualizacoes = req.body;
    // esperado:
    // [{ nome, cargo, horarios: { Segunda: { "08:00":"Atendimento" } } }]

    let usuarios = lerArquivo("data.json");

    // 🔧 normaliza nomes para evitar erro de maiúscula/minúscula
    const normalizar = (n) => String(n).trim().toLowerCase();

    // =========================
    // 1️⃣ ATUALIZA EXISTENTES PELO NOME
    // =========================
    const usuariosAtualizados = usuarios.map((usuario) => {
      const update = atualizacoes.find(
        (u) => normalizar(u.nome) === normalizar(usuario.nome)
      );

      if (!update) return usuario;

      if (!usuario.horarios) usuario.horarios = {};

      Object.entries(update.horarios || {}).forEach(([diaSemana, horas]) => {
        if (!usuario.horarios[diaSemana]) {
          usuario.horarios[diaSemana] = {};
        }

        Object.entries(horas).forEach(([hora, atividade]) => {
          usuario.horarios[diaSemana][hora] = atividade;
        });
      });

      return usuario;
    });

    // =========================
    // 2️⃣ CRIA NOVOS SE NÃO EXISTIREM
    // =========================
    const nomesExistentes = usuarios.map((u) => normalizar(u.nome));

    const novosFuncionarios = atualizacoes
      .filter((u) => !nomesExistentes.includes(normalizar(u.nome)))
      .map((novo) => {
        console.log("🆕 Novo funcionário criado (horários):", novo.nome);

        return {
          id: Date.now().toString(), // gera id automático
          nome: novo.nome,
          cargo: novo.cargo || "",
          escalaInicial: [], // não mexe na escala
          horarios: novo.horarios || {},
        };
      });

    // =========================
    // 3️⃣ SALVA
    // =========================
    const resultadoFinal = [...usuariosAtualizados, ...novosFuncionarios];

    salvarArquivo("data.json", resultadoFinal);

    res.json({ mensagem: "Horários atualizados com sucesso" });
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});



// ================= METAS =================

app.get("/admin/metas", (req, res) => {
  res.json(lerArquivo("metas.json"));
});

app.post("/admin/metas", (req, res) => {
  try {
    salvarArquivo("metas.json", req.body);
    res.json({ mensagem: "Metas atualizadas" });
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

// ================= DDS =================

app.get("/admin/dds", (req, res) => {
  res.json(lerArquivo("dds.json"));
});

app.post("/admin/dds", (req, res) => {
  try {
    const { titulo, horario, duracao } = req.body;

    if (!titulo || !horario || !duracao) {
      return res.status(400).json({ erro: "Dados incompletos" });
    }

    // 🔒 LÊ O ARQUIVO ATUAL
    const arquivoAtual = lerArquivo("dds.json");

    // 🔒 PRESERVA atividades DO JEITO QUE ESTÁ
    const atividadesOriginais = Array.isArray(arquivoAtual.atividades)
      ? arquivoAtual.atividades
      : [];

    const reunioesOriginais = Array.isArray(arquivoAtual.reunioes)
      ? arquivoAtual.reunioes
      : [];

    // 🆕 CRIA NOVA REUNIÃO
    const novaReuniao = {
      id: "r" + Date.now(),
      titulo,
      horario,
      duracao,
    };

    // 🧩 MONTA NOVO OBJETO SEM MEXER NAS ATIVIDADES
    const novoArquivo = {
      atividades: atividadesOriginais,   // ← INTOCÁVEL
      reunioes: [...reunioesOriginais, novaReuniao],
    };

    salvarArquivo("dds.json", novoArquivo);

    res.json({ mensagem: "Reunião adicionada", reuniao: novaReuniao });

  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});


// ================= PERFIL FUNCIONÁRIO =================

app.get("/funcionario/:id", (req, res) => {
  const id = parseInt(req.params.id);
  console.log("ID recebido:", id);

  const usuarios = JSON.parse(lerArquivo("data.json"));
  const metas = lerArquivo("metas.json");
  const dds = lerArquivo("dds.json");

  const funcionario = dds

  if (!funcionario) {
    return res.status(404).json({ erro: "Funcionário não encontrado" });
  }

  const setor = funcionario.setor;

  res.json({
    funcionario,
    metas: metas.filter((m) => m.setor === setor),
    dds: dds.filter((d) => d.setor === setor),
  });
});

// ================= START =================

const PORT = 443;
app.listen(PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${PORT}`);
});
