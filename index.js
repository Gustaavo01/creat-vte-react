const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const cors = require("cors");

dotenv.config();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
const isVercel = !!process.env.VERCEL;

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

const corsOrigin = process.env.FRONTEND_URL || "http://localhost:5173";

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  })
);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const mercadoPagoWebhook = require("./routes/mercadoPagoWebhook");
const newsletterRoutes = require("./routes/newsletter");
const paymentRoutes = require("./routes/payment");
const userRoutes = require("./routes/users");
const shippingRoutes = require("./routes/shipping");
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const sendEmail = require("./utils/SendEmail");

app.use("/auth", authRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/produtos", productRoutes);
app.use("/api/users", userRoutes);
app.use("/api", shippingRoutes);
app.use("/api/pagamento", paymentRoutes);
app.use("/api/mercadopago", mercadoPagoWebhook);
app.use("/api/pedidos", require("./routes/pedidos"));

app.post("/api/contato", async (req, res) => {
  try {
    const { nome, email, assunto, mensagem } = req.body || {};

    const n = String(nome || "").trim();
    const e = String(email || "").trim().toLowerCase();
    const s = String(assunto || "").trim();
    const m = String(mensagem || "").trim();

    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    if (!n || !emailValido || !s || !m) {
      return res.status(400).json({ message: "Dados inválidos" });
    }

    const to = process.env.STORE_EMAIL || process.env.EMAIL_USER;
    if (!to || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({ message: "Serviço de e-mail não configurado" });
    }

    const html = `
      <h2>Nova mensagem de contato</h2>
      <p><strong>Nome:</strong> ${n}</p>
      <p><strong>Email:</strong> ${e}</p>
      <p><strong>Assunto:</strong> ${s}</p>
      <p><strong>Mensagem:</strong></p>
      <p>${m.replace(/\n/g, "<br>")}</p>
    `;

    await sendEmail(to, `Contato: ${s}`, html);
    res.json({ message: "Mensagem enviada com sucesso" });
  } catch (err) {
    console.error("Erro em /api/contato:", err);
    res.status(500).json({ message: "Erro ao enviar mensagem" });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/check-cookie", (req, res) => {
  const token = req.cookies.token;

  if (!token)
    return res.status(401).json({ message: "Nenhum cookie encontrado" });

  res.json({ message: "Cookie JWT encontrado!", token });
});


app.use((req, res) => {
  res.status(404).json({ message: "Rota não encontrada" });
});


app.use((err, req, res, next) => {
  console.error("Erro não tratado:", err);
  res.status(500).json({ message: "Erro interno do servidor" });
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log(" MongoDB conectado"))
  .catch((err) => console.error(" Erro MongoDB:", err));

if (isVercel) {
  module.exports = app;
} else {
  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`CORS origin: ${corsOrigin}`);
  });
  const shutdown = async () => {
    try {
      await mongoose.connection.close();
    } catch {}
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
