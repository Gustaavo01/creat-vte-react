const express = require("express");
const { MercadoPagoConfig, Preference } = require("mercadopago");
const crypto = require("crypto");
const router = express.Router();
require("dotenv").config();

if (!process.env.MP_ACCESS_TOKEN) {
  console.error("MP_ACCESS_TOKEN não configurado");
}
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const FRONTEND_URL = process.env.FRONTEND_URL;
const IS_PROD = process.env.NODE_ENV === "production";
const WEBHOOK_URL = process.env.MP_WEBHOOK_URL || process.env.WEBHOOK_URL || "";

router.post("/create_preference", async (req, res) => {
  try {
    const { cart, totalPrice, payerEmail } = req.body;

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Carrinho inválido ou vazio" });
    }

    const items = cart.map((item) => ({
      title: String(item.name || "Item"),
      unit_price: Number(item.price || 0),
      quantity: Number(item.quantity || 1),
      currency_id: "BRL",
    })).filter((i) => Number.isFinite(i.unit_price) && Number.isFinite(i.quantity) && i.quantity > 0);

    if (items.length === 0) {
      return res.status(400).json({ error: "Itens do carrinho inválidos" });
    }

    const computedTotal = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
    if (totalPrice && Math.abs(Number(totalPrice) - computedTotal) > 0.01) {
      console.warn("Total divergente", { totalPrice, computedTotal });
    }

    const externalReference = crypto.randomBytes(16).toString("hex");

    const body = {
      items,
      back_urls: {
        success: `${FRONTEND_URL}/sucesso`,
        failure: `${FRONTEND_URL}/erro`,
        pending: `${FRONTEND_URL}/erro`,
      },
      binary_mode: true,
      auto_return: IS_PROD ? "approved" : undefined,
      statement_descriptor: "Cia de Pijamas",
      external_reference: externalReference,
      payer: payerEmail ? { email: String(payerEmail).trim().toLowerCase() } : undefined,
      metadata: {
        cart,
        totalPrice: computedTotal,
      },
    };

    if (WEBHOOK_URL) {
      body.notification_url = WEBHOOK_URL;
    }

    const preference = await new Preference(client).create({ body });

    console.log(" Preferência criada com sucesso:", preference.id);
    return res.json({
      id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
      external_reference: externalReference,
    });
  } catch (error) {
    console.error(" Erro ao criar preferência Mercado Pago:", error);
    return res.status(500).json({
      error: "Erro ao gerar preferência de pagamento",
      details: error.message || error,
    });
  }
});

module.exports = router;
