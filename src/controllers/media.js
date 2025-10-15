import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";

export const getMedia = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const items = await db
      .collection("media")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({ status: true, payload: items });
  } catch (error) {
    console.error("getMedia error", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to fetch media" });
  }
};

export const createMedia = async (req, res) => {
  try {
    const { text } = req.body;

    if (!req.imageUrl) {
      return res
        .status(400)
        .json({ status: false, message: "Image is required" });
    }

    const db = mongoose.connection.db;

    const payload = {
      url: req.imageUrl,
      text: text || "",
      public_id: req.uploadInfo?.public_id || null,
      createdAt: new Date(),
    };

    const result = await db.collection("media").insertOne(payload);

    return res.status(201).json({
      status: true,
      message: "Media uploaded successfully",
      payload: { _id: result.insertedId, ...payload },
    });
  } catch (error) {
    console.error("createMedia error", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to upload media" });
  }
};

export const deleteMedia = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ status: false, message: "Id required" });

    const db = mongoose.connection.db;
    const existing = await db.collection("media").findOne({ _id: new mongoose.Types.ObjectId(id) });
    if (!existing) return res.status(404).json({ status: false, message: "Media not found" });

    if (existing.public_id) {
      try {
        await cloudinary.uploader.destroy(existing.public_id, { resource_type: "image" });
      } catch (e) {
        console.error("Cloudinary destroy error (media)", e);
      }
    }

    await db.collection("media").deleteOne({ _id: new mongoose.Types.ObjectId(id) });
    return res.status(200).json({ status: true, message: "Media deleted" });
  } catch (error) {
    console.error("deleteMedia error", error);
    return res.status(500).json({ status: false, message: "Failed to delete media" });
  }
};
