const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Product = require("../models/Product");
const auth = require("../middleware/auth");

const router = express.Router();


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "..", "uploads"));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Arquivo inválido"));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});


router.get("/", async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    console.error("Erro ao listar produtos:", err);
    res.status(500).json({ error: "Erro ao listar produtos" });
  }
});


router.get("/categoria/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const products = await Product.find({ category });
    res.json(products);
  } catch (err) {
    console.error("Erro ao listar por categoria:", err);
    res.status(500).json({ error: "Erro ao listar por categoria" });
  }
});


router.post("/", auth, upload.single("image"), async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "Acesso negado" });
    }
    const { name, price, category } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null;

    const weight = req.body.weight ? Number(req.body.weight) : undefined;
    const height = req.body.height ? Number(req.body.height) : undefined;
    const width = req.body.width ? Number(req.body.width) : undefined;
    const length = req.body.length ? Number(req.body.length) : undefined;

    const product = new Product({
      name: String(name).trim(),
      price: String(price).trim(),
      category: String(category).trim().toLowerCase(),
      image,
      ...(weight && weight > 0 ? { weight } : {}),
      ...(height && height > 0 ? { height } : {}),
      ...(width && width > 0 ? { width } : {}),
      ...(length && length > 0 ? { length } : {}),
    });
    await product.save();

    res.status(201).json(product);
  } catch (err) {
    console.error("Erro ao criar produto:", err);
    res.status(500).json({ error: "Erro ao criar produto" });
  }
});


router.delete("/:id", auth, async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "Acesso negado" });
    }
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ error: "Produto não encontrado" });
    }

   
    if (product.image) {
      const imagePath = path.join(
        __dirname,
        "..",
        "uploads",
        path.basename(product.image)
      );
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await Product.findByIdAndDelete(id);
    res.json({ message: "Produto excluído com sucesso!" });
  } catch (err) {
    console.error("Erro ao excluir produto:", err);
    res.status(500).json({ error: "Erro ao excluir produto" });
  }
});

module.exports = router;
