import mongoose from "mongoose";

const favouriteItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["blog", "property"],
      required: true,
    },
    id: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    email: { type: String, trim: true, required: true, unique: true },
    mobile: { type: String, trim: true, required: true },
    user: { type: String, trim: true },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    favourites: {
      type: [favouriteItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ "favourites.type": 1, "favourites.id": 1 });

const User = mongoose.models.User || mongoose.model("User", userSchema, "users");

export default User;
