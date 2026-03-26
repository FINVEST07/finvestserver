import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";

const validListingTypes = new Set(["Auction", "Distress"]);
const validPropertyTypes = new Set([
  "Flat",
  "Bungalow",
  "Villa",
  "Penthouse",
  "Studio",
  "Duplex",
  "Plot",
  "Commercial",
]);

const generatePropertyId = () => {
  const stamp = Date.now().toString().slice(-6);
  const rand = Math.floor(100 + Math.random() * 900);
  return `PR-${stamp}-${rand}`;
};

const parsePrice = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return parsed;
};

export const getProperties = async (req, res) => {
  try {
    const { type } = req.query;
    const query = {};

    if (type) {
      if (!validListingTypes.has(type)) {
        return res.status(400).json({
          status: false,
          message: "Invalid listing type",
        });
      }
      query.type = type;
    }

    const db = mongoose.connection.db;
    const properties = await db
      .collection("properties")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({ status: true, payload: properties });
  } catch (error) {
    console.error("getProperties error", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to fetch properties" });
  }
};

export const getPropertyById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: false, message: "Invalid property id" });
    }

    const db = mongoose.connection.db;
    const property = await db
      .collection("properties")
      .findOne({ _id: new mongoose.Types.ObjectId(id) });

    if (!property) {
      return res.status(404).json({ status: false, message: "Property not found" });
    }

    return res.status(200).json({ status: true, payload: property });
  } catch (error) {
    console.error("getPropertyById error", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to fetch property" });
  }
};

export const createProperty = async (req, res) => {
  try {
    const {
      propertyName,
      area,
      type,
      floor,
      propertyType,
      address,
      phoneNumber,
      price,
      description,
    } = req.body;

    if (
      !propertyName ||
      !area ||
      !type ||
      !propertyType ||
      !address ||
      !phoneNumber ||
      !description
    ) {
      return res.status(400).json({
        status: false,
        message: "All required fields must be provided",
      });
    }

    if (!validListingTypes.has(type)) {
      return res.status(400).json({ status: false, message: "Invalid listing type" });
    }

    if (!validPropertyTypes.has(propertyType)) {
      return res.status(400).json({ status: false, message: "Invalid property type" });
    }

    if (!/^\d{10,15}$/.test(String(phoneNumber))) {
      return res.status(400).json({
        status: false,
        message: "Phone Number must be numeric and between 10 to 15 digits",
      });
    }

    const parsedPrice = parsePrice(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return res
        .status(400)
        .json({ status: false, message: "Price must be greater than 0" });
    }

    const uploadedPhotos = Array.isArray(req.uploadedFiles)
      ? req.uploadedFiles.filter((f) => f.field === "photos")
      : [];

    if (uploadedPhotos.length === 0) {
      return res
        .status(400)
        .json({ status: false, message: "At least one photo is required" });
    }

    if (uploadedPhotos.length > 5) {
      return res
        .status(400)
        .json({ status: false, message: "Maximum 5 photos are allowed" });
    }

    const photos = uploadedPhotos.map((photo) => ({
      url: photo.url,
      public_id: photo.public_id,
      resource_type: photo.resource_type || "image",
    }));

    const db = mongoose.connection.db;

    const payload = {
      propertyId: generatePropertyId(),
      propertyName: String(propertyName).trim(),
      area: String(area).trim(),
      type,
      floor: String(floor || "").trim(),
      propertyType,
      address: String(address).trim(),
      phoneNumber: String(phoneNumber).trim(),
      price: parsedPrice,
      description: String(description).trim(),
      photos,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("properties").insertOne(payload);

    return res.status(201).json({
      status: true,
      message: "Property created successfully",
      payload: {
        _id: result.insertedId,
        ...payload,
      },
    });
  } catch (error) {
    console.error("createProperty error", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to create property" });
  }
};

export const deleteProperty = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ status: false, message: "Id required" });
    }

    const db = mongoose.connection.db;
    const existing = await db
      .collection("properties")
      .findOne({ _id: new mongoose.Types.ObjectId(id) });

    if (!existing) {
      return res.status(404).json({ status: false, message: "Property not found" });
    }

    if (Array.isArray(existing.photos)) {
      for (const photo of existing.photos) {
        if (!photo?.public_id) continue;
        try {
          await cloudinary.uploader.destroy(photo.public_id, {
            resource_type: photo.resource_type || "image",
          });
        } catch (err) {
          console.error("Cloudinary destroy error (property photo)", err);
        }
      }
    }

    await db.collection("properties").deleteOne({ _id: new mongoose.Types.ObjectId(id) });

    return res.status(200).json({ status: true, message: "Property deleted" });
  } catch (error) {
    console.error("deleteProperty error", error);
    return res.status(500).json({ status: false, message: "Failed to delete property" });
  }
};

export const updateProperty = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ status: false, message: "Id required" });
    }

    const db = mongoose.connection.db;
    const existing = await db
      .collection("properties")
      .findOne({ _id: new mongoose.Types.ObjectId(id) });

    if (!existing) {
      return res.status(404).json({ status: false, message: "Property not found" });
    }

    const {
      propertyName,
      area,
      type,
      floor,
      propertyType,
      address,
      phoneNumber,
      price,
      description,
    } = req.body;

    if (
      !propertyName ||
      !area ||
      !type ||
      !propertyType ||
      !address ||
      !phoneNumber ||
      !description
    ) {
      return res.status(400).json({
        status: false,
        message: "All required fields must be provided",
      });
    }

    if (!validListingTypes.has(type)) {
      return res.status(400).json({ status: false, message: "Invalid listing type" });
    }

    if (!validPropertyTypes.has(propertyType)) {
      return res.status(400).json({ status: false, message: "Invalid property type" });
    }

    if (!/^\d{10,15}$/.test(String(phoneNumber))) {
      return res.status(400).json({
        status: false,
        message: "Phone Number must be numeric and between 10 to 15 digits",
      });
    }

    const parsedPrice = parsePrice(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return res
        .status(400)
        .json({ status: false, message: "Price must be greater than 0" });
    }

    const uploadedPhotos = Array.isArray(req.uploadedFiles)
      ? req.uploadedFiles.filter((f) => f.field === "photos")
      : [];

    if (uploadedPhotos.length > 5) {
      return res
        .status(400)
        .json({ status: false, message: "Maximum 5 photos are allowed" });
    }

    let photos = existing.photos || [];
    if (uploadedPhotos.length > 0) {
      if (Array.isArray(existing.photos)) {
        for (const photo of existing.photos) {
          if (!photo?.public_id) continue;
          try {
            await cloudinary.uploader.destroy(photo.public_id, {
              resource_type: photo.resource_type || "image",
            });
          } catch (err) {
            console.error("Cloudinary destroy error (property update photo)", err);
          }
        }
      }

      photos = uploadedPhotos.map((photo) => ({
        url: photo.url,
        public_id: photo.public_id,
        resource_type: photo.resource_type || "image",
      }));
    }

    const update = {
      propertyName: String(propertyName).trim(),
      area: String(area).trim(),
      type,
      floor: String(floor || "").trim(),
      propertyType,
      address: String(address).trim(),
      phoneNumber: String(phoneNumber).trim(),
      price: parsedPrice,
      description: String(description).trim(),
      photos,
      updatedAt: new Date(),
    };

    await db
      .collection("properties")
      .updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: update });

    const updated = await db
      .collection("properties")
      .findOne({ _id: new mongoose.Types.ObjectId(id) });

    return res.status(200).json({
      status: true,
      message: "Property updated successfully",
      payload: updated,
    });
  } catch (error) {
    console.error("updateProperty error", error);
    return res.status(500).json({ status: false, message: "Failed to update property" });
  }
};
