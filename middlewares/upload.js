import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

import streamifier from "streamifier";



// Configure Cloudinary
cloudinary.config({
  cloud_name: "dopuniuhm",
  api_key: "416177782863496",
  api_secret: "rSii_w8-_YXFIF5Fvmo1NtJKjz0",
});

// Multer memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage }).any(); // Accept any files

const uploadMiddleware = (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: "Multer error: " + err.message });
    }

    if (!req.files || req.files.length === 0) {
      return next(); // No files, skip image uploading
    }

    try {
      const uploadPromises = req.files.map((file) => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "documents" },
            (error, result) => {
              if (error) return reject(error);
              resolve({ field: file.fieldname, url: result.secure_url });
            }
          );
          streamifier.createReadStream(file.buffer).pipe(stream);
        });
      });

      const uploadedImages = await Promise.all(uploadPromises);
      req.uploadedImages = uploadedImages;
      next();
    } catch (error) {
      console.error("Cloudinary upload error:", error);
      res.status(500).json({ message: "Cloudinary upload failed" });
    }
  });
};

export default uploadMiddleware;


// Middleware to upload a single image to Cloudinary
export const singleupload = (req, res, next) => {
  const uploadSingle = multer({
    storage,
  }).single("image");

  uploadSingle(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: "Multer error: " + err.message });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    try {
      cloudinary.uploader
        .upload_stream({ folder: "images" }, (error, result) => {
          if (error) {
            console.error("Cloudinary upload error:", error);
            return res
              .status(500)
              .json({ message: "Cloudinary upload failed" });
          }
          req.imageUrl = result.secure_url;
          next();
        })
        .end(req.file.buffer);
    } catch (error) {
      console.error("Cloudinary upload error:", error);
      res.status(500).json({ message: "Cloudinary upload failed" });
    }
  });
};


