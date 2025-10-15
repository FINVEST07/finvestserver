import mongoose from "mongoose";

export const getBlogs = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const blogs = await db
      .collection("blogs")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({ status: true, payload: blogs });
  } catch (error) {
    console.error("getBlogs error", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to fetch blogs" });
  }
};

export const createBlog = async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title || !content) {
      return res
        .status(400)
        .json({ status: false, message: "Title and content are required" });
    }

    let thumbnailUrl = null;

    if (Array.isArray(req.uploadedFiles) && req.uploadedFiles.length > 0) {
      const thumb = req.uploadedFiles.find((f) => f.field === "thumbnail");
      if (thumb?.url) thumbnailUrl = thumb.url;
    }

    const db = mongoose.connection.db;

    const payload = {
      title,
      content,
      thumbnailUrl,
      createdAt: new Date(),
    };

    const result = await db.collection("blogs").insertOne(payload);

    return res.status(201).json({
      status: true,
      message: "Blog created successfully",
      payload: { _id: result.insertedId, ...payload },
    });
  } catch (error) {
    console.error("createBlog error", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to create blog" });
  }
};
