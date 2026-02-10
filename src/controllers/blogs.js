import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";

const slugify = (str) =>
  str
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

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

export const getBlogBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    if (!slug) return res.status(400).json({ status: false, message: "Slug required" });

    const db = mongoose.connection.db;
    const blog = await db.collection("blogs").findOne({ slug });
    if (!blog) return res.status(404).json({ status: false, message: "Blog not found" });

    return res.status(200).json({ status: true, payload: blog });
  } catch (error) {
    console.error("getBlogBySlug error", error);
    return res.status(500).json({ status: false, message: "Failed to fetch blog" });
  }
};


export const getBlogById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ status: false, message: "Id required" });

    const db = mongoose.connection.db;
    const blog = await db.collection("blogs").findOne({ _id: new mongoose.Types.ObjectId(id) });
    if (!blog) return res.status(404).json({ status: false, message: "Blog not found" });

    return res.status(200).json({ status: true, payload: blog });
  } catch (error) {
    console.error("getBlogById error", error);
    return res.status(500).json({ status: false, message: "Failed to fetch blog" });
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
  let thumbnailPublicId = null;

    if (Array.isArray(req.uploadedFiles) && req.uploadedFiles.length > 0) {
      const thumb = req.uploadedFiles.find((f) => f.field === "thumbnail");
      if (thumb?.url) thumbnailUrl = thumb.url;
      if (thumb?.public_id) thumbnailPublicId = thumb.public_id;
    }

    const db = mongoose.connection.db;

    let baseSlug = slugify(title);
    let slug = baseSlug;
    const existingWithSlug = await db.collection("blogs").findOne({ slug });
    if (existingWithSlug) {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const payload = {
      title,
      content,
      thumbnailUrl,
      thumbnailPublicId,
      slug,
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

export const deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ status: false, message: "Id required" });

    const db = mongoose.connection.db;
    const existing = await db.collection("blogs").findOne({ _id: new mongoose.Types.ObjectId(id) });
    if (!existing) return res.status(404).json({ status: false, message: "Blog not found" });

    if (existing.thumbnailPublicId) {
      try {
        await cloudinary.uploader.destroy(existing.thumbnailPublicId, { resource_type: "image" });
      } catch (e) {
        console.error("Cloudinary destroy error (blog)", e);
      }
    }

    await db.collection("blogs").deleteOne({ _id: new mongoose.Types.ObjectId(id) });
    return res.status(200).json({ status: true, message: "Blog deleted" });
  } catch (error) {
    console.error("deleteBlog error", error);
    return res.status(500).json({ status: false, message: "Failed to delete blog" });
  }
};

export const updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ status: false, message: "Id required" });

    const { title, content } = req.body;

    const db = mongoose.connection.db;
    const existing = await db
      .collection("blogs")
      .findOne({ _id: new mongoose.Types.ObjectId(id) });

    if (!existing) return res.status(404).json({ status: false, message: "Blog not found" });

    const update = {};
    if (typeof title === "string" && title.trim()) update.title = title.trim();
    if (typeof content === "string" && content.trim()) update.content = content.trim();

    if (update.title) {
      let baseSlug = slugify(update.title);
      let slug = baseSlug;
      const clash = await db.collection("blogs").findOne({
        slug,
        _id: { $ne: new mongoose.Types.ObjectId(id) },
      });
      if (clash) {
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      }
      update.slug = slug;
    }

    let newThumbnailUrl = null;
    let newThumbnailPublicId = null;
    if (Array.isArray(req.uploadedFiles) && req.uploadedFiles.length > 0) {
      const thumb = req.uploadedFiles.find((f) => f.field === "thumbnail");
      if (thumb?.url) newThumbnailUrl = thumb.url;
      if (thumb?.public_id) newThumbnailPublicId = thumb.public_id;
    }

    if (newThumbnailUrl) {
      update.thumbnailUrl = newThumbnailUrl;
      update.thumbnailPublicId = newThumbnailPublicId;

      if (existing.thumbnailPublicId) {
        try {
          await cloudinary.uploader.destroy(existing.thumbnailPublicId, { resource_type: "image" });
        } catch (e) {
          console.error("Cloudinary destroy error (blog update)", e);
        }
      }
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ status: false, message: "No fields to update" });
    }

    await db
      .collection("blogs")
      .updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: update });

    const updated = await db
      .collection("blogs")
      .findOne({ _id: new mongoose.Types.ObjectId(id) });

    return res.status(200).json({ status: true, message: "Blog updated", payload: updated });
  } catch (error) {
    console.error("updateBlog error", error);
    return res.status(500).json({ status: false, message: "Failed to update blog" });
  }
};
