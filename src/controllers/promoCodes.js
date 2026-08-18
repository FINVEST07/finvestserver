import mongoose from "mongoose";
import PromoCode from "../models/promoCode.js";

const normalizeString = (value) => String(value || "").trim();

export const getPromoCodes = async (req, res) => {
  try {
    const codes = await PromoCode.find({}).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ status: true, payload: codes });
  } catch (error) {
    console.error("getPromoCodes error", error);
    return res.status(500).json({ status: false, message: "Failed to fetch promo codes" });
  }
};

export const getPromoCodeById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: false, message: "Invalid promo code id" });
    }

    const code = await PromoCode.findById(id).lean();

    if (!code) {
      return res.status(404).json({ status: false, message: "Promo code not found" });
    }

    return res.status(200).json({ status: true, payload: code });
  } catch (error) {
    console.error("getPromoCodeById error", error);
    return res.status(500).json({ status: false, message: "Failed to fetch promo code" });
  }
};

export const createPromoCode = async (req, res) => {
  try {
    const code = normalizeString(req.body?.code).toUpperCase();
    const description = normalizeString(req.body?.description);
    const discountType = normalizeString(req.body?.discountType);
    const discountValue = Number(req.body?.discountValue);
    const startDate = req.body?.startDate || null;
    const endDate = req.body?.endDate || null;
    const isActive = req.body?.isActive !== false;

    if (!code || !discountType || isNaN(discountValue)) {
      return res.status(400).json({ status: false, message: "Code, discount type and discount value are required" });
    }

    if (!["percentage", "flat"].includes(discountType)) {
      return res.status(400).json({ status: false, message: "Discount type must be 'percentage' or 'flat'" });
    }

    if (discountType === "percentage" && (discountValue < 0 || discountValue > 100)) {
      return res.status(400).json({ status: false, message: "Percentage discount must be between 0 and 100" });
    }

    const existing = await PromoCode.findOne({ code });
    if (existing) {
      return res.status(409).json({ status: false, message: "Promo code already exists" });
    }

    const created = await PromoCode.create({
      code,
      description,
      discountType,
      discountValue,
      startDate,
      endDate,
      isActive,
    });

    return res.status(201).json({ status: true, message: "Promo code created", payload: created });
  } catch (error) {
    console.error("createPromoCode error", error);
    return res.status(500).json({ status: false, message: "Failed to create promo code" });
  }
};

export const updatePromoCode = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: false, message: "Invalid promo code id" });
    }

    const updateFields = {};
    const allowedFields = [
      "description", "discountType", "discountValue",
      "startDate", "endDate", "isActive",
    ];

    for (const field of allowedFields) {
      if (req.body?.[field] !== undefined) {
        updateFields[field] = req.body[field];
      }
    }

    if (updateFields.discountType && !["percentage", "flat"].includes(updateFields.discountType)) {
      return res.status(400).json({ status: false, message: "Discount type must be 'percentage' or 'flat'" });
    }

    if (updateFields.discountValue !== undefined) {
      updateFields.discountValue = Number(updateFields.discountValue);
      if (updateFields.discountType === "percentage" && (updateFields.discountValue < 0 || updateFields.discountValue > 100)) {
        return res.status(400).json({ status: false, message: "Percentage discount must be between 0 and 100" });
      }
    }

    const updated = await PromoCode.findByIdAndUpdate(id, { $set: updateFields }, { new: true }).lean();

    if (!updated) {
      return res.status(404).json({ status: false, message: "Promo code not found" });
    }

    return res.status(200).json({ status: true, message: "Promo code updated", payload: updated });
  } catch (error) {
    console.error("updatePromoCode error", error);
    return res.status(500).json({ status: false, message: "Failed to update promo code" });
  }
};

export const deletePromoCode = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: false, message: "Invalid promo code id" });
    }

    const deleted = await PromoCode.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ status: false, message: "Promo code not found" });
    }

    return res.status(200).json({ status: true, message: "Promo code deleted" });
  } catch (error) {
    console.error("deletePromoCode error", error);
    return res.status(500).json({ status: false, message: "Failed to delete promo code" });
  }
};

export const validatePromoCode = async (req, res) => {
  try {
    const code = normalizeString(req.body?.code).toUpperCase();
    const orderAmount = Number(req.body?.orderAmount) || 0;

    if (!code) {
      return res.status(400).json({ status: false, message: "Promo code is required" });
    }

    const promo = await PromoCode.findOne({ code }).lean();

    if (!promo) {
      return res.status(404).json({ status: false, message: "Invalid promo code" });
    }

    if (!promo.isActive) {
      return res.status(400).json({ status: false, message: "This promo code is no longer active" });
    }

    const now = new Date();
    if (promo.startDate && now < new Date(promo.startDate)) {
      return res.status(400).json({ status: false, message: "This promo code is not yet valid" });
    }

    if (promo.endDate && now > new Date(promo.endDate)) {
      return res.status(400).json({ status: false, message: "This promo code has expired" });
    }

    let discountAmount = 0;
    if (promo.discountType === "percentage") {
      discountAmount = Math.round((orderAmount * promo.discountValue) / 100);
    } else {
      discountAmount = promo.discountValue;
    }

    discountAmount = Math.min(discountAmount, orderAmount);

    return res.status(200).json({
      status: true,
      message: "Promo code applied successfully",
      payload: {
        code: promo.code,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        discountAmount,
        finalAmount: orderAmount - discountAmount,
      },
    });
  } catch (error) {
    console.error("validatePromoCode error", error);
    return res.status(500).json({ status: false, message: "Failed to validate promo code" });
  }
};
