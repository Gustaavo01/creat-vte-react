const express = require("express");
const router = express.Router();
const User = require("../models/User");
const auth = require("../middleware/auth");


router.get("/", auth, async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Acesso negado" });
    }
    const users = await User.find().select("_id name email role");
    res.json(users);
  } catch (err) {
    console.error("Erro ao buscar usuários:", err);
    res.status(500).json({ message: "Erro ao buscar usuários" });
  }
});


router.delete("/:id", auth, async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Acesso negado" });
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "Usuário excluído com sucesso" });
  } catch (err) {
    console.error("Erro ao excluir usuário:", err);
    res.status(500).json({ message: "Erro ao excluir usuário" });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Acesso negado" });
    }
    const { name, email, role } = req.body;
    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (email !== undefined) update.email = String(email).trim().toLowerCase();
    if (role !== undefined) {
      const allowed = ["user", "admin"];
      if (!allowed.includes(role)) {
        return res.status(400).json({ message: "Role inválida" });
      }
      update.role = role;
    }
    const user = await User.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
      select: "_id name email role",
    });
    res.json(user);
  } catch (err) {
    console.error("Erro ao atualizar usuário:", err);
    res.status(500).json({ message: "Erro ao atualizar usuário" });
  }
});

module.exports = router;
