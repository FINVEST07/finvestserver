import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import Job from "../models/job.js";

const normalizeString = (value) => String(value || "").trim();

export const getJobs = async (req, res) => {
  try {
    const jobs = await Job.find({}).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ status: true, payload: jobs });
  } catch (error) {
    console.error("getJobs error", error);
    return res.status(500).json({ status: false, message: "Failed to fetch jobs" });
  }
};

export const getJobById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: false, message: "Invalid job id" });
    }

    const job = await Job.findById(id).lean();

    if (!job) {
      return res.status(404).json({ status: false, message: "Job not found" });
    }

    return res.status(200).json({ status: true, payload: job });
  } catch (error) {
    console.error("getJobById error", error);
    return res.status(500).json({ status: false, message: "Failed to fetch job" });
  }
};

export const createJob = async (req, res) => {
  try {
    const title = normalizeString(req.body?.title);
    const description = normalizeString(req.body?.description);
    const location = normalizeString(req.body?.location);
    const salary = normalizeString(req.body?.salary);
    const type = normalizeString(req.body?.type);

    if (!title || !description) {
      return res.status(400).json({ status: false, message: "Title and description are required" });
    }

    let thumbnailUrl = "";
    let thumbnailPublicId = "";
    if (Array.isArray(req.uploadedFiles) && req.uploadedFiles.length > 0) {
      const thumb = req.uploadedFiles.find((f) => f.field === "thumbnail");
      if (thumb?.url) thumbnailUrl = thumb.url;
      if (thumb?.public_id) thumbnailPublicId = thumb.public_id;
    }

    const created = await Job.create({
      title,
      description,
      location,
      salary,
      type,
      thumbnailUrl,
      thumbnailPublicId,
    });

    return res.status(201).json({
      status: true,
      message: "Job created successfully",
      payload: created,
    });
  } catch (error) {
    console.error("createJob error", error);
    return res.status(500).json({ status: false, message: "Failed to create job" });
  }
};

export const updateJob = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: false, message: "Invalid job id" });
    }

    const title = normalizeString(req.body?.title);
    const description = normalizeString(req.body?.description);
    const location = normalizeString(req.body?.location);
    const salary = normalizeString(req.body?.salary);
    const type = normalizeString(req.body?.type);

    if (!title || !description) {
      return res.status(400).json({ status: false, message: "Title and description are required" });
    }

    const existing = await Job.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ status: false, message: "Job not found" });
    }

    let thumbnailUrl = existing.thumbnailUrl || "";
    let thumbnailPublicId = existing.thumbnailPublicId || "";

    if (Array.isArray(req.uploadedFiles) && req.uploadedFiles.length > 0) {
      const thumb = req.uploadedFiles.find((f) => f.field === "thumbnail");
      if (thumb?.url) {
        thumbnailUrl = thumb.url;
        thumbnailPublicId = thumb.public_id || "";

        if (existing.thumbnailPublicId) {
          try {
            await cloudinary.uploader.destroy(existing.thumbnailPublicId, {
              resource_type: "image",
            });
          } catch (e) {
            console.error("Cloudinary destroy error (job update)", e);
          }
        }
      }
    }

    const updated = await Job.findByIdAndUpdate(
      id,
      {
        $set: {
          title,
          description,
          location,
          salary,
          type,
          thumbnailUrl,
          thumbnailPublicId,
        },
      },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ status: false, message: "Job not found" });
    }

    return res.status(200).json({
      status: true,
      message: "Job updated successfully",
      payload: updated,
    });
  } catch (error) {
    console.error("updateJob error", error);
    return res.status(500).json({ status: false, message: "Failed to update job" });
  }
};

export const deleteJob = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: false, message: "Invalid job id" });
    }

    const deleted = await Job.findByIdAndDelete(id).lean();

    if (!deleted) {
      return res.status(404).json({ status: false, message: "Job not found" });
    }

    if (deleted.thumbnailPublicId) {
      try {
        await cloudinary.uploader.destroy(deleted.thumbnailPublicId, {
          resource_type: "image",
        });
      } catch (e) {
        console.error("Cloudinary destroy error (job delete)", e);
      }
    }

    try {
      await mongoose.connection.db.collection("users").updateMany(
        { "favourites.type": "job", "favourites.id": String(id) },
        { $pull: { favourites: { type: "job", id: String(id) } } }
      );
    } catch (e) {
      console.error("Failed to cleanup job favourites on delete", e);
    }

    return res.status(200).json({ status: true, message: "Job deleted" });
  } catch (error) {
    console.error("deleteJob error", error);
    return res.status(500).json({ status: false, message: "Failed to delete job" });
  }
};
