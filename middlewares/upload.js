import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";

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
  }
}).any(); // Accept any files

// Helper function to determine resource type for Cloudinary
const getResourceType = (mimeType) => {
  if (mimeType === 'application/pdf') {
    return 'raw';
  } else if (mimeType && mimeType.startsWith('image/')) {
    return 'image';
  }
  return 'auto';
};

// Helper function to upload base64 data to Cloudinary
const uploadBase64ToCloudinary = async (base64Data, fieldName, fileInfo = {}) => {
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

    // Upload via stream for reliability (prevents zero-byte PDFs)
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "documents",
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
const uploadBufferToCloudinary = (file) => {
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
    }
  }).single("image");

  uploadSingle(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: "Multer error: " + err.message });
    }

    // Handle traditional file upload
    if (req.file) {
      try {
        const resourceType = getResourceType(req.file.mimetype);
        
        const uploadResult = await new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream(
              { 
                folder: "images",
                resource_type: resourceType 
              }, 
              (error, result) => {
                if (error) return reject(error);
                resolve(result);
              }
            )
            .end(req.file.buffer);
        });
        
        req.imageUrl = uploadResult.secure_url;
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
    if (req.body.image) {
      try {
        let imageData = req.body.image;
        let fileInfo = {};
        
        // Handle object format
        if (typeof imageData === 'object' && imageData.content) {
          fileInfo = imageData;
          imageData = imageData.content;
        }
        
        const uploadResult = await uploadBase64ToCloudinary(imageData, 'image', fileInfo);
        req.imageUrl = uploadResult.url;
        req.uploadInfo = uploadResult;
        
        next();
      } catch (error) {
        console.error("Base64 upload error:", error);
        res.status(500).json({ message: "Image upload failed" });
      }
    } else {
      res.status(400).json({ message: "No file uploaded" });
    }
  });
};