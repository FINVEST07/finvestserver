import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import { fileTypeFromBuffer } from "file-type";

// Allowed mime types and extensions
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"];

/**
 * Validates file buffer against magic numbers and allowed types
 * @param {Buffer} buffer 
 * @param {string} originalName 
 * @returns {Promise<{isValid: boolean, error?: string}>}
 */
const validateFileContent = async (buffer, originalName) => {
  try {
    const type = await fileTypeFromBuffer(buffer);
    
    if (!type) {
      // file-type might not recognize some valid PDFs or very small files
      // Additional check for PDF header if file-type fails
      const isPdfHeader = buffer.slice(0, 4).toString() === '%PDF';
      if (isPdfHeader && originalName.toLowerCase().endsWith('.pdf')) {
        return { isValid: true };
      }
      return { isValid: false, error: "Unknown or invalid file type content" };
    }

    if (!ALLOWED_MIME_TYPES.includes(type.mime)) {
      return { isValid: false, error: `File type ${type.mime} is not allowed` };
    }

    const ext = `.${type.ext}`;
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return { isValid: false, error: `Extension ${ext} is not allowed` };
    }

    return { isValid: true };
  } catch (error) {
    console.error("Validation error:", error);
    return { isValid: false, error: "Error validating file content" };
  }
};

// Configure Cloudinary
cloudinary.config({
  cloud_name: "dopuniuhm",
  api_key: "416177782863496",
  api_secret: "rSii_w8-_YXFIF5Fvmo1NtJKjz0",
});

// Multer memory storage with increased limits
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fieldSize: 50 * 1024 * 1024, // 50MB per field (for base64 data)
    fileSize: 50 * 1024 * 1024,  // 50MB per file
    fields: 50,                   // Maximum number of fields
    files: 20                     // Maximum number of files
  },
  fileFilter: (req, file, cb) => {
    const ext = "." + file.originalname.split(".").pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error("Only images and PDFs are allowed"), false);
    }
    cb(null, true);
  }
}).any(); // Accept any files

// Helper function to determine resource type for Cloudinary
const getResourceType = (mimeType) => {
  if (mimeType === 'application/pdf') {
    return 'raw';
  } else if (mimeType && mimeType.startsWith('video/')) {
    return 'video';
  } else if (mimeType && mimeType.startsWith('image/')) {
    return 'image';
  }
  return 'auto';
};

// Helper function to upload base64 data to Cloudinary
const uploadBase64ToCloudinary = async (
  base64Data,
  fieldName,
  fileInfo = {},
  options = {}
) => {
  try {
    // Extract base64 content if it has data URL prefix
    let cleanBase64 = base64Data;
    let mimeType = fileInfo.type;
    
    if (base64Data.startsWith('data:')) {
      const [header, content] = base64Data.split(',');
      cleanBase64 = content;
      if (!mimeType) {
        mimeType = header.match(/data:([^;]+)/)?.[1];
      }
    }

    const resourceType = getResourceType(mimeType);
    const timestamp = Date.now();
    const isPdf = (resourceType === 'raw' && (mimeType === 'application/pdf'));
    const publicId = `${fieldName}_${timestamp}`; // keep id clean; use format for extension
    
    // Decode base64 into a Buffer
    const fileBuffer = Buffer.from(cleanBase64, 'base64');

    // Security Validation: Magic number check
    const validation = await validateFileContent(fileBuffer, fileInfo.name || fieldName);
    if (!validation.isValid) {
      throw new Error(`Security validation failed: ${validation.error}`);
    }

    // Upload via stream for reliability (prevents zero-byte PDFs)
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder || "documents",
          resource_type: resourceType,
          public_id: publicId,
          ...(isPdf ? { format: 'pdf' } : {}),
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      streamifier.createReadStream(fileBuffer).pipe(stream);
    });

    return {
      field: fieldName,
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      resource_type: uploadResult.resource_type,
      format: uploadResult.format,
      bytes: uploadResult.bytes,
      original_filename: fileInfo.name || fieldName
    };
  } catch (error) {
    console.error(`Error uploading base64 data for ${fieldName}:`, error);
    throw error;
  }
};

// Helper function to upload file buffer to Cloudinary
const uploadBufferToCloudinary = async (file) => {
  // Security Validation: Magic number check
  const validation = await validateFileContent(file.buffer, file.originalname);
  if (!validation.isValid) {
    throw new Error(`Security validation failed for ${file.originalname}: ${validation.error}`);
  }

  return new Promise((resolve, reject) => {
    const resourceType = getResourceType(file.mimetype);
    const timestamp = Date.now();
    const isPdf = (resourceType === 'raw' && (file.mimetype === 'application/pdf'));
    const publicId = `${file.fieldname}_${timestamp}`; // keep id clean; use format for extension
    
    const stream = cloudinary.uploader.upload_stream(
      { 
        folder: "documents",
        resource_type: resourceType,
        public_id: publicId,
        ...(isPdf ? { format: 'pdf' } : {}),
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ 
          field: file.fieldname, 
          url: result.secure_url,
          public_id: result.public_id,
          resource_type: result.resource_type,
          format: result.format,
          bytes: result.bytes,
          original_filename: file.originalname
        });
      }
    );
    streamifier.createReadStream(file.buffer).pipe(stream);
  });
};

const uploadMiddleware = (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err);
      return res.status(400).json({ message: "Multer error: " + err.message });
    }

    try {
      const uploadedFiles = [];

      // Handle traditional file uploads (if any)
      if (req.files && req.files.length > 0) {
        const fileUploadPromises = req.files.map(uploadBufferToCloudinary);
        const uploadedFileResults = await Promise.all(fileUploadPromises);
        uploadedFiles.push(...uploadedFileResults);
      }

      // Handle base64 data in request body
      const fileFields = [
        "photo", "pancard", "aadharcard", "passport", "visa", "cdc",
        "rentagreement", "salaryslip", "bankstatement", "form16", "itr",
        "saleagreement", "sharecertificate", "electricitybill", "maintenancebill",
        "housetaxbill", "noc", "marraigecertificate", "birthcertificate",
        "qualificationcertificate"
      ];

      // Process base64 data from request body
      for (const [key, value] of Object.entries(req.body)) {
        try {
          // Handle new file object format from React component
          if (value && typeof value === 'object' && value.content && value.type) {
            const uploadResult = await uploadBase64ToCloudinary(value.content, key, value);
            uploadedFiles.push(uploadResult);
            
            // Replace base64 data with Cloudinary URL in request body
            req.body[key] = {
              url: uploadResult.url,
              public_id: uploadResult.public_id,
              type: value.type,
              name: value.name || key,
              size: uploadResult.bytes
            };
          }
          // Handle legacy base64 string format (backward compatibility)
          else if (typeof value === 'string' && value.startsWith('data:')) {
            const uploadResult = await uploadBase64ToCloudinary(value, key);
            uploadedFiles.push(uploadResult);
            
            // Replace base64 data with Cloudinary URL
            req.body[key] = uploadResult.url;
          }
          // Handle JSON string that might contain file data
          else if (typeof value === 'string' && value.startsWith('{')) {
            try {
              const parsedValue = JSON.parse(value);
              if (parsedValue.content && parsedValue.type) {
                const uploadResult = await uploadBase64ToCloudinary(parsedValue.content, key, parsedValue);
                uploadedFiles.push(uploadResult);
                
                req.body[key] = {
                  url: uploadResult.url,
                  public_id: uploadResult.public_id,
                  type: parsedValue.type,
                  name: parsedValue.name || key,
                  size: uploadResult.bytes
                };
              }
            } catch (parseError) {
              // Not JSON, skip
            }
          }
        } catch (uploadError) {
          console.error(`Error processing ${key}:`, uploadError);
          // Continue processing other fields, don't fail the entire request
        }
      }

      // Attach uploaded files info to request for backward compatibility
      req.uploadedImages = uploadedFiles; // Keep original property name
      req.uploadedFiles = uploadedFiles;  // Also provide more descriptive name
      
      next();
    } catch (error) {
      console.error("Upload middleware error:", error);
      res.status(500).json({ message: "File upload failed", error: error.message });
    }
  });
};

export default uploadMiddleware;

// Enhanced single upload middleware
export const singleupload = (req, res, next) => {
  const uploadSingle = multer({
    storage,
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
    fileFilter: (req, file, cb) => {
      const ext = "." + file.originalname.split(".").pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return cb(new Error("Only images and PDFs are allowed"), false);
      }
      cb(null, true);
    }
  }).fields([
    { name: "file", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ]);

  uploadSingle(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: "Multer error: " + err.message });
    }

    const incomingFile =
      (req.files && req.files.file && req.files.file[0]) ||
      (req.files && req.files.image && req.files.image[0]) ||
      null;

    // Handle traditional file upload
    if (incomingFile) {
      try {
        const resourceType = getResourceType(incomingFile.mimetype);
        
        const uploadResult = await new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream(
              { 
                folder: "media",
                resource_type: resourceType 
              }, 
              (error, result) => {
                if (error) return reject(error);
                resolve(result);
              }
            )
            .end(incomingFile.buffer);
        });
        
        req.mediaUrl = uploadResult.secure_url;
        req.uploadInfo = {
          url: uploadResult.secure_url,
          public_id: uploadResult.public_id,
          resource_type: uploadResult.resource_type,
          format: uploadResult.format,
          bytes: uploadResult.bytes
        };
        
        return next();
      } catch (error) {
        console.error("Cloudinary upload error:", error);
        return res.status(500).json({ message: "Cloudinary upload failed" });
      }
    }

    // Handle base64 data in request body
    if (req.body.file || req.body.image) {
      try {
        let imageData = req.body.file || req.body.image;
        let fileInfo = {};
        
        // Handle object format
        if (typeof imageData === 'object' && imageData.content) {
          fileInfo = imageData;
          imageData = imageData.content;
        }
        
        const uploadResult = await uploadBase64ToCloudinary(
          imageData,
          'file',
          fileInfo,
          { folder: 'media' }
        );
        req.mediaUrl = uploadResult.url;
        req.uploadInfo = uploadResult;
        
        next();
      } catch (error) {
        console.error("Base64 upload error:", error);
        res.status(500).json({ message: "Media upload failed" });
      }
    } else {
      res.status(400).json({ message: "No file uploaded" });
    }
  });
};