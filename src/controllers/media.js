import mongoose from "mongoose";

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
