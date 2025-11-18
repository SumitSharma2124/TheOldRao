const mongoose = require('mongoose');

const ContactMessageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  message: { type: String, required: true, trim: true },
  responded: { type: Boolean, default: false },
  respondedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('ContactMessage', ContactMessageSchema);
