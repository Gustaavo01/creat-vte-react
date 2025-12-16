const express = require("express");
const router = express.Router();
const axios = require("axios");
const Pedido = require("../models/Pedidos");
require("dotenv").config();
const crypto = require("crypto");


router.post("/webhook", async (req, res) => {
  try {
    const data = req.body || {};
    const requestId = req.get("X-Request-Id") || req.get("x-request-id") || "";
    const topic = data.type || data.topic || "";

   
    const signatureHeader = req.get("X-Signature") || req.get("x-signature") || "";
    const webhookSecret = process.env.MP_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || "";
    if (webhookSecret && signatureHeader) {
      try {
        const [tsPart, sigPart] = signatureHeader.split(",").map((p) => p.trim());
        const ts = tsPart?.split("=")[1];
        const sig = sigPart?.split("=")[1];
        if (ts && sig) {
          const payload = ts + ":" + JSON.stringify(req.body);
          const expected = crypto.createHmac("sha256", webhookSecret).update(payload).digest("hex");
          if (expected !== sig) {
            console.warn("Assinatura inválida", { requestId });
            return res.status(401).send("invalid signature");
          }
        }
      } catch (e) {
        console.warn("Falha ao validar assinatura", { requestId, e });
        return res.status(401).send("invalid signature");
      }
    }

    
    if (topic === "payment") {
      const paymentId = data?.data?.id || data?.id;
      if (!paymentId) {
        console.warn("Webhook sem paymentId válido", { requestId, data });
        return res.status(200).send("OK");
      }

      
      const mpResponse = await axios.get(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          },
        }
      );

      const payment = mpResponse.data;

      const statusMap = {
        approved: "Aprovado",
        authorized: "Autorizado",
        in_process: "Em processamento",
        pending: "Pendente",
        rejected: "Rejeitado",
        cancelled: "Cancelado",
        refunded: "Reembolsado",
        charged_back: "Contestação",
      };

      const statusBr = statusMap[payment.status] || "Pendente";

      const update = {
        cliente: payment?.payer?.first_name || payment?.payer?.name || "Cliente",
        email: payment?.payer?.email || undefined,
        produto: payment?.description || "Produto não especificado",
        quantidade: payment?.additional_info?.items?.[0]?.quantity || 1,
        total: `R$ ${(payment?.transaction_amount || 0).toFixed(2)}`,
        status: statusBr,
        endereco:
          payment?.additional_info?.shipments?.receiver_address?.street ||
          payment?.additional_info?.items?.[0]?.title ||
          "—",
        paymentId,
      };

      const existing = await Pedido.findOne({ paymentId });
      if (existing) {
        await Pedido.updateOne({ _id: existing._id }, { $set: update });
        console.log("🔄 Pedido atualizado:", existing._id, statusBr, requestId);
      } else {
        const novoPedido = new Pedido(update);
        await novoPedido.save();
        console.log(" Pedido salvo:", novoPedido._id, statusBr, requestId);
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error(" Erro no webhook do Mercado Pago:", error.response?.data || error);
    res.status(500).send("Erro ao processar webhook");
  }
});

module.exports = router;
