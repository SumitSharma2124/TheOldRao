const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
  items: [
    {
      id: String,
      name: String,
      price: Number,
      qty: Number,
      img: String
    }
  ],
  total: Number,
  // Customer association (nullable to allow guest orders if desired)
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
    default: null
  },
  // Customer details captured at checkout
  name: String,
  phone: String,
  address: String,
  payment: String,
  status: {
    type: String,
    enum: ["Pending", "Preparing", "Out for Delivery", "Completed", "Cancelled"],
    default: "Pending"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Order", OrderSchema);

