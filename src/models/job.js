import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 180,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    salary: {
      type: String,
      trim: true,
      default: "",
    },
    type: {
      type: String,
      trim: true,
      default: "",
    },
    thumbnailUrl: {
      type: String,
      trim: true,
      default: "",
    },
    thumbnailPublicId: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    collection: "jobs",
    timestamps: true,
  }
);

const Job = mongoose.models.Job || mongoose.model("Job", jobSchema);

export default Job;
