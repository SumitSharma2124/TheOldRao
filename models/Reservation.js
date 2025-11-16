const mongoose = require("mongoose");

const ReservationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  guests: { type: Number, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  message: { type: String },
  status: { 
    type: String, 
    default: "Pending", 
    enum: ["Pending", "Confirmed", "Completed", "Cancelled"] 
  }
});

module.exports = mongoose.model("Reservation", ReservationSchema);

