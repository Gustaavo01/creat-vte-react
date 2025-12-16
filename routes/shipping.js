const express = require("express");
const router = express.Router();
const axios = require("axios");
const Produto = require("../models/Product"); // ✅ Modelo de produtos
require("dotenv").config();

router.post("/calcular-frete", async (req, res) => {
  try {
    const {
      cepDestino,
      produtoId,
      valorDeclarado = 100,
      quantidade = 1,
    } = req.body;

    if (!cepDestino || !produtoId) {
      return res
        .status(400)
        .json({ error: "CEP de destino e ID do produto são obrigatórios." });
    }

    const cep = String(cepDestino).replace(/\D/g, "");
    if (cep.length !== 8) {
      return res.status(400).json({ error: "CEP inválido." });
    }
    if (!process.env.SUPERFRETE_TOKEN) {
      return res.status(500).json({ error: "Token da SuperFrete não configurado." });
    }

   
    const produto = await Produto.findById(produtoId);
    if (!produto) {
      return res.status(404).json({ error: "Produto não encontrado." });
    }

    
    const peso = produto.weight || 1;
    const altura = produto.height || 10;
    const largura = produto.width || 15;
    const comprimento = produto.length || 20;

  
    const body = {
      from: { postal_code: process.env.CEP_ORIGEM || "08589320" },
      to: { postal_code: cep },
      products: [
        {
          id: produto._id.toString(),
          width: largura,
          height: altura,
          length: comprimento,
          weight: peso,
          quantity: quantidade,
          insurance_value: valorDeclarado,
        },
      ],
      services: "1,2", 
    };

    console.log("📦 Dados enviados à SuperFrete:", JSON.stringify(body, null, 2));

    
    const response = await axios.post(
      "https://sandbox.superfrete.com/api/v0/calculator",
      body,
      {
        headers: {
          Authorization: `Bearer ${process.env.SUPERFRETE_TOKEN}`,
          "User-Agent": "MeuEcommerce (meuemail@exemplo.com)",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

   
    const resultado = Array.isArray(response.data)
      ? response.data
      : response.data?.data || [];

    console.log("📨 Resposta bruta da SuperFrete:", resultado);

    
    const servicos = resultado.filter(
      (s) => s && s.has_error === false && s.company
    );

    if (servicos.length === 0) {
      console.warn(" Nenhum serviço retornado:", resultado);
      return res.status(400).json({
        error: "Nenhum frete disponível para o CEP informado.",
        raw: resultado,
      });
    }

   
    console.log(
      " Fretes retornados:",
      servicos.map((s) => ({
        servico: s.name,
        valor: s.price,
        empresa: s.company?.name,
        prazo: s.delivery_time || s.delivery_range?.max || "N/D",
      }))
    );

    return res.status(200).json({
      message: " Frete calculado com sucesso!",
      data: servicos.map((item) => {
        const prazo =
          item.delivery_time ||
          item.delivery_range?.max ||
          item.delivery_range?.min ||
          "N/D";

        return {
          method: item.name,
          price: `R$ ${item.price}`,
          delivery: `Entrega em até ${prazo} dias úteis`,
          company: item.company?.name || "Desconhecida",
        };
      }),
    });
  } catch (error) {
    console.error(" Erro ao calcular frete:", error.response?.data || error);
    res.status(500).json({
      error: "Erro ao calcular frete.",
      details: error.response?.data || error.message,
    });
  }
});

module.exports = router;
