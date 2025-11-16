const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
  items: [
    {
      id: String,
      name: String,
      price: Number,
      qty: Number,
      phone: String,
      address: String,
      payment: String,

    }
  ],
  total: Number,
  userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
     },
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

