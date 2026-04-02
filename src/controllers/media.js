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
    const { text, label } = req.body;

    if (!req.mediaUrl) {
      return res
        .status(400)
        .json({ status: false, message: "File is required" });
    }

    const db = mongoose.connection.db;

    const payload = {
      url: req.mediaUrl,
      text: text || "",
      label: label || text || "",
      public_id: req.uploadInfo?.public_id || null,
      resource_type: req.uploadInfo?.resource_type || null,
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
        const resourceType = existing.resource_type || "image";
        await cloudinary.uploader.destroy(existing.public_id, { resource_type: resourceType });
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

export const updateMedia = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ status: false, message: "Id required" });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: false, message: "Invalid media id" });
    }

    const inputLabel = String(req.body?.label ?? req.body?.text ?? "").trim();
    if (!inputLabel) {
      return res.status(400).json({ status: false, message: "Label is required" });
    }

    const db = mongoose.connection.db;
    const objectId = new mongoose.Types.ObjectId(id);
    const existing = await db.collection("media").findOne({ _id: objectId });

    if (!existing) {
      return res.status(404).json({ status: false, message: "Media not found" });
    }

    const nextState = {
      label: inputLabel,
      text: inputLabel,
      updatedAt: new Date(),
    };

    if (req.mediaUrl) {
      nextState.url = req.mediaUrl;
      nextState.public_id = req.uploadInfo?.public_id || null;
      nextState.resource_type = req.uploadInfo?.resource_type || null;
    }

    await db.collection("media").updateOne(
      { _id: objectId },
      {
        $set: nextState,
      }
    );

    if (req.mediaUrl && existing.public_id) {
      try {
        const resourceType = existing.resource_type || "image";
        await cloudinary.uploader.destroy(existing.public_id, {
          resource_type: resourceType,
        });
      } catch (e) {
        console.error("Cloudinary destroy error (old media on update)", e);
      }
    }

    const updated = await db.collection("media").findOne({ _id: objectId });
    return res.status(200).json({
      status: true,
      message: "Media updated successfully",
      payload: updated,
    });
  } catch (error) {
    console.error("updateMedia error", error);
    return res.status(500).json({ status: false, message: "Failed to update media" });
  }
};
