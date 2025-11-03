const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  userState: { type: Object, default: {} },
  name: { type: String, default: "" },
  phone: { type: String, default: "" },
  email: { type: String, default: "" },
  step: { type: String, default: "" },
  city: { type: String, default: "" },
  airtableId: { type: String, default: "" },
  studio: { type: String, default: "" },
  priceTag: { type: String, default: "" },
  paymentStatus: { type: String, default: "" },
  paymentId: { type: String, default: "", index: true }, // Индекс для быстрого поиска
  newPrice: { type: String, default: "" },
  laterDate: { type: String, default: "" },
});

const Session = mongoose.model("Session", sessionSchema);

module.exports = Session;
