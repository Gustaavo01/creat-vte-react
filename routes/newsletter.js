const express = require("express");
const nodemailer = require("nodemailer");
const Newsletter = require("../models/Newsletter"); 
const router = express.Router();


const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});


router.post("/", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) return res.status(400).json({ message: "E-mail obrigatório." });
    const normalizedEmail = String(email).trim().toLowerCase();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    if (!validEmail) return res.status(400).json({ message: "E-mail inválido." });

    const exists = await Newsletter.findOne({ email: normalizedEmail });
    if (exists)
      return res.status(400).json({ message: "E-mail já cadastrado." });

    const newEmail = new Newsletter({ email: normalizedEmail });
    await newEmail.save();

    res.status(201).json({ message: "E-mail cadastrado com sucesso!" });
  } catch (err) {
    console.error(" Erro ao cadastrar newsletter:", err);
    res.status(500).json({ message: "Erro no servidor." });
  }
});


router.post("/notify", async (req, res) => {
  try {
    const { productName, productUrl } = req.body;
    if (!productName)
      return res.status(400).json({ message: "Nome do produto é obrigatório." });

    const subscribers = await Newsletter.find();
    if (subscribers.length === 0)
      return res.status(200).json({ message: "Nenhum assinante cadastrado." });

    const emailList = subscribers.map((s) => s.email).filter(Boolean);

   
    const html = `
      <h2>🎉 Novo produto disponível!</h2>
      <p>Confira agora o novo item da nossa loja:</p>
      <h3>${productName}</h3>
      ${productUrl
        ? `<p><a href="${productUrl}" target="_blank">Clique aqui para ver o produto</a></p>`
        : ""
      }
      <p>Equipe Loja Pijamas 💤</p>
    `;

    
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({ message: "Serviço de e-mail não configurado." });
    }

    const chunk = (arr, size) => {
      const out = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };
    const batches = chunk(emailList, 50);

    for (const batch of batches) {
      await transporter.sendMail({
        from: `"Loja Pijamas" <${process.env.EMAIL_USER}>`,
        bcc: batch,
        subject: `Novo produto: ${productName}!`,
        html,
        headers: {
          "List-Unsubscribe": `<mailto:${process.env.EMAIL_USER}>`,
        },
      });
    }

    console.log(`Notificação enviada para ${emailList.length} assinantes.`);

    res.json({
      message: `E-mails enviados para ${emailList.length} assinantes.`,
    });
  } catch (err) {
    console.error(" Erro ao enviar notificações:", err);
    res.status(500).json({ message: "Erro ao enviar notificações." });
  }
});

module.exports = router;
