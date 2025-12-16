const express = require("express");
const router = express.Router();
const User = require("../models/User");
const auth = require("../middleware/auth");

router.get("/:email", auth, async (req, res) => {
  try {
    const emailParam = String(req.params.email).trim().toLowerCase();
    if (!req.user) return res.status(401).json({ message: "Não autenticado" });
    const isSelf = req.user.email && String(req.user.email).toLowerCase() === emailParam;
    const isAdmin = req.user.role === "admin";
    if (!isSelf && !isAdmin) return res.status(403).json({ message: "Acesso negado" });

    const user = await User.findOne({ email: emailParam }).select("-password");
    if (!user) return res.status(404).json({ message: "Usuário não encontrado" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
