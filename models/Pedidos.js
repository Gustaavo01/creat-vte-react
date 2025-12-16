const mongoose = require("mongoose");

const PedidoSchema = new mongoose.Schema({
  cliente: String,
  email: String,
  produto: String,
  quantidade: Number,
  total: String,
  status: { type: String, default: "Pendente" },
  endereco: String,
  paymentId: { type: String, index: true, unique: true, sparse: true },
  data: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Pedido", PedidoSchema);
