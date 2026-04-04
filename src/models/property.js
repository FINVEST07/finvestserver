import mongoose from "mongoose";

const alphaSpacePattern = /^[A-Za-z]+(?:\s+[A-Za-z]+)*$/;

const normalizeSpaces = (value) => String(value || "").replace(/\s+/g, " ").trim();

const toTitleCase = (value) => {
  const normalized = normalizeSpaces(value);
  if (!normalized) return "";

  return normalized
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const propertyPhotoSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    public_id: { type: String, default: "" },
    resource_type: { type: String, default: "image" },
  },
  { _id: false }
);

const propertyDocumentSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    public_id: { type: String, default: "" },
    resource_type: { type: String, default: "raw" },
    original_filename: { type: String, default: "" },
  },
  { _id: false }
);

const propertySchema = new mongoose.Schema(
  {
    propertyId: { type: String, trim: true },
    type: { type: String, enum: ["Auction", "Distress"], required: true },

    // Public fields
    headline: { type: String, trim: true, required: true },
    propertyType: { type: String, trim: true, required: true },
    area: { type: String, trim: true, required: true },
    bhk: { type: String, trim: true, required: true },
    offerPrice: { type: Number, required: true },
    estimatedMarketValue: { type: Number, required: true },
    location: {
      type: String,
      trim: true,
      required: true,
      set: toTitleCase,
      validate: {
        validator: (value) => alphaSpacePattern.test(normalizeSpaces(value)),
        message: "Only letters are allowed in this field.",
      },
    },
    district: {
      type: String,
      trim: true,
      required: true,
      set: toTitleCase,
      validate: {
        validator: (value) => alphaSpacePattern.test(normalizeSpaces(value)),
        message: "Only letters are allowed in this field.",
      },
    },
    possession: { type: String, enum: ["Physical", "Symbolic"], required: true },
    status: { type: String, enum: ["Available", "Sold Out"], required: true },
    emdDate: { type: Date },
    eoiDate: { type: Date },
    photos: { type: [propertyPhotoSchema], default: [] },

    // Locked fields
    flatNo: { type: String, trim: true, default: "" },
    propertyOrSocietyName: { type: String, trim: true, default: "" },
    floor: { type: String, trim: true, default: "" },
    fullAddress: { type: String, trim: true, default: "" },
    bankName: { type: String, trim: true, default: "" },
    contactPerson: { type: String, trim: true, default: "" },
    contactNumber: { type: String, trim: true, default: "" },
    pdfDocument: { type: propertyDocumentSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    strict: false,
  }
);

const Property = mongoose.models.Property || mongoose.model("Property", propertySchema, "properties");

export default Property;
