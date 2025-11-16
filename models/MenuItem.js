const mongoose = require("mongoose");

const MenuItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  img: {
    type: String,
    default: "/images/placeholder.jpg"
  },
  category: {
    type: String,
    required: true,
    enum: ["snacks", "main", "breads", "dessert", "drinks"]
  }
});

module.exports = mongoose.model("MenuItem", MenuItemSchema);

