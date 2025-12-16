const express = require("express");
const router = express.Router();
const Pedido = require("../models/Pedidos");
const User = require("../models/User");
const auth = require("../middleware/auth");


router.get("/", auth, async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Acesso negado" });
    }
    const pedidos = await Pedido.find().sort({ data: -1 });
    res.json(pedidos);
  } catch (error) {
    console.error("Erro ao buscar pedidos:", error);
    res.status(500).json({ message: "Erro ao buscar pedidos" });
  }
});

router.get("/mine", auth, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "Não autenticado" });
    }
    const user = await User.findById(req.user.id).select("email");
    if (!user || !user.email) {
      return res.json([]);
    }
    const pedidos = await Pedido.find({ email: user.email }).sort({ data: -1 });
    res.json(pedidos);
  } catch (error) {
    console.error("Erro ao buscar pedidos do usuário:", error);
    res.status(500).json({ message: "Erro ao buscar pedidos" });
  }
});

router.put("/:id/status", auth, async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Acesso negado" });
    }
    const { status } = req.body || {};
    const s = String(status || "").trim();
    const allowed = [
      "Pendente",
      "Em andamento",
      "Enviado",
      "Entregue",
      "Cancelado",
      "Em processamento",
      "Aprovado",
      "Autorizado",
      "Rejeitado",
      "Reembolsado",
      "Contestação",
    ];
    if (!allowed.includes(s)) {
      return res.status(400).json({ message: "Status inválido" });
    }
    const updated = await Pedido.findByIdAndUpdate(
      req.params.id,
      { status: s },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ message: "Pedido não encontrado" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Erro ao atualizar status do pedido:", error);
    res.status(500).json({ message: "Erro ao atualizar status" });
  }
});

module.exports = router;
