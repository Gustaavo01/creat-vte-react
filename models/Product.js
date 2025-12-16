const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: String,
  price: String,
  category: String,
  image: String,
  category: String,
  weight: { type: Number },
  height: { type: Number}, 
  width: { type: Number }, 
  length: { type: Number}, 
});

module.exports = mongoose.model("Product", productSchema);
