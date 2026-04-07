import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import axios from "axios";

const validListingTypes = new Set(["Auction", "Distress"]);
const validPropertyTypes = new Set([
  "Flat",
  "Apartment",
  "Bungalow",
  "Villa",
  "Penthouse",
  "Studio",
  "Duplex",
  "Plot",
  "Commercial",
]);
const validPossessionTypes = new Set(["Physical", "Symbolic", "Free Hold"]);
const validStatusTypes = new Set(["Available", "Sold Out"]);

const generatePropertyId = () => {
  const stamp = Date.now().toString().slice(-6);
  const rand = Math.floor(100 + Math.random() * 900);
  return `PR-${stamp}-${rand}`;
};

const parsePrice = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return parsed;
};

const alphaSpacePattern = /^[A-Za-z]+(?:\s+[A-Za-z]+)*$/;

const normalizeSpaces = (value) => String(value || "").replace(/\s+/g, " ").trim();

const toTitleCase = (value) => {
  const normalized = normalizeSpaces(value);
  if (!normalized) return "";

  return normalized
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const isAlphaSpaceOnly = (value) => alphaSpacePattern.test(normalizeSpaces(value));

const parseStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || "").trim()).filter(Boolean);
      }
    } catch (error) {
      return [trimmed];
    }
  }

  return [];
};

const normalizeRawPublicId = (value) =>
  String(value || "")
    .trim()
    .replace(/\.pdf$/i, "");

const deriveRawPublicIdFromUrl = (value) => {
  const url = String(value || "").trim();
  if (!url) return "";

  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/raw\/upload\/(?:v\d+\/)?(.+)$/i);
    if (!match?.[1]) return "";

    return normalizeRawPublicId(match[1]);
  } catch (error) {
    return "";
  }
};

const shapePdfDocumentForResponse = (pdfDocument) => {
  if (!pdfDocument) return null;

  if (typeof pdfDocument === "string") {
    const derivedPublicId = deriveRawPublicIdFromUrl(pdfDocument);

    if (derivedPublicId) {
      try {
        const signedDownloadUrl = cloudinary.utils.private_download_url(
          `${derivedPublicId}.pdf`,
          "pdf",
          {
            resource_type: "raw",
            type: "upload",
            attachment: false,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }
        );

        return {
          url: signedDownloadUrl,
          public_id: derivedPublicId,
          resource_type: "raw",
        };
      } catch (error) {
        console.error("Failed to sign legacy property pdf url", error);
      }
    }

    return {
      url: pdfDocument,
    };
  }

  const doc = { ...pdfDocument };
  const publicId = normalizeRawPublicId(
    doc.public_id || deriveRawPublicIdFromUrl(doc.url) || ""
  );
  const resourceType = doc.resource_type || "raw";

  if (!publicId) {
    return doc;
  }

  try {
    if (resourceType === "raw") {
      const signedDownloadUrl = cloudinary.utils.private_download_url(
        `${publicId}.pdf`,
        "pdf",
        {
          resource_type: "raw",
          type: "upload",
          attachment: false,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }
      );

      return {
        ...doc,
        public_id: publicId,
        url: signedDownloadUrl,
      };
    }

    const signedUrl = cloudinary.url(publicId, {
      resource_type: resourceType,
      type: "upload",
      secure: true,
      sign_url: true,
    });

    return {
      ...doc,
      url: signedUrl,
    };
  } catch (error) {
    console.error("Failed to sign property pdf url", error);
    return doc;
  }
};

const shapePropertyForResponse = (property) => {
  if (!property) return property;

  const fallbackCreatedAt =
    property.createdAt ||
    (property._id && typeof property._id.getTimestamp === "function"
      ? property._id.getTimestamp()
      : null);

  const normalizedPhotos = Array.isArray(property.photos)
    ? property.photos
        .map((photo) => {
          if (typeof photo === "string") {
            const url = String(photo || "").trim();
            return url ? { url } : null;
          }

          if (photo && typeof photo === "object") {
            const url = String(photo.url || photo.secure_url || "").trim();
            if (!url) return null;
            return {
              ...photo,
              url,
            };
          }

          return null;
        })
        .filter(Boolean)
    : [];

  return {
    ...property,
    headline: property.headline || property.propertyName || "",
    propertyOrSocietyName: property.propertyOrSocietyName || property.propertyName || "",
    bhk: property.bhk || "",
    offerPrice: Number.isFinite(Number(property.offerPrice))
      ? Number(property.offerPrice)
      : Number(property.price) || 0,
    estimatedMarketValue: Number.isFinite(Number(property.estimatedMarketValue))
      ? Number(property.estimatedMarketValue)
      : Number(property.price) || 0,
    location: property.location || property.area || "",
    district: property.district || "",
    possession: property.possession || "",
    status: property.status || "Available",
    emdDate: property.emdDate || null,
    eoiDate: property.eoiDate || null,
    flatNo: property.flatNo || "",
    fullAddress: property.fullAddress || property.address || "",
    bankName: property.bankName || "",
    contactPerson: property.contactPerson || "",
    contactNumber: property.contactNumber || property.phoneNumber || "",
    photos: normalizedPhotos,
    pdfDocument: shapePdfDocumentForResponse(property.pdfDocument),
    createdAt: fallbackCreatedAt,
  };
};

export const getPropertyDocument = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: false, message: "Invalid property id" });
    }

    const db = mongoose.connection.db;
    const property = await db
      .collection("properties")
      .findOne({ _id: new mongoose.Types.ObjectId(id) });

    if (!property) {
      return res.status(404).json({ status: false, message: "Property not found" });
    }

    const rawDoc = property.pdfDocument;
    if (!rawDoc) {
      return res.status(404).json({ status: false, message: "Property document not found" });
    }

    const publicId = normalizeRawPublicId(
      (typeof rawDoc === "object" ? rawDoc.public_id : "") ||
        deriveRawPublicIdFromUrl(typeof rawDoc === "string" ? rawDoc : rawDoc?.url) ||
        ""
    );

    if (!publicId) {
      return res.status(404).json({ status: false, message: "Property document is unavailable" });
    }

    const signedDownloadUrl = cloudinary.utils.private_download_url(
      `${publicId}.pdf`,
      "pdf",
      {
        resource_type: "raw",
        type: "upload",
        attachment: false,
        expires_at: Math.floor(Date.now() / 1000) + 600,
      }
    );

    const cloudinaryResponse = await axios.get(signedDownloadUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
      validateStatus: () => true,
    });

    if (cloudinaryResponse.status !== 200) {
      return res.status(502).json({
        status: false,
        message: "Failed to fetch property document",
      });
    }

    const filename =
      (typeof rawDoc === "object" && rawDoc?.original_filename
        ? String(rawDoc.original_filename)
        : "property-document")
        .replace(/[^a-zA-Z0-9-_ ]/g, "")
        .trim() || "property-document";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(Buffer.from(cloudinaryResponse.data));
  } catch (error) {
    console.error("getPropertyDocument error", error);
    return res.status(500).json({ status: false, message: "Failed to load property document" });
  }
};

export const getProperties = async (req, res) => {
  try {
    const { type } = req.query;
    const query = {};

    if (type) {
      if (!validListingTypes.has(type)) {
        return res.status(400).json({
          status: false,
          message: "Invalid listing type",
        });
      }
      query.type = type;
    }

    const db = mongoose.connection.db;
    const properties = await db
      .collection("properties")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      status: true,
      payload: properties.map(shapePropertyForResponse),
    });
  } catch (error) {
    console.error("getProperties error", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to fetch properties" });
  }
};

export const getPropertyById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: false, message: "Invalid property id" });
    }

    const db = mongoose.connection.db;
    const property = await db
      .collection("properties")
      .findOne({ _id: new mongoose.Types.ObjectId(id) });

    if (!property) {
      return res.status(404).json({ status: false, message: "Property not found" });
    }

    return res.status(200).json({ status: true, payload: shapePropertyForResponse(property) });
  } catch (error) {
    console.error("getPropertyById error", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to fetch property" });
  }
};

export const createProperty = async (req, res) => {
  try {
    const {
      headline,
      area,
      type,
      propertyType,
      bhk,
      offerPrice,
      estimatedMarketValue,
      location,
      district,
      possession,
      status,
      emdDate,
      eoiDate,
      flatNo,
      propertyOrSocietyName,
      floor,
      fullAddress,
      bankName,
      contactPerson,
      contactNumber,

      // Backward compatibility with previous payload names
      propertyName,
      address,
      phoneNumber,
      price,
      description,
    } = req.body;

    const normalizedHeadline = String(headline || propertyName || "").trim();
    const normalizedBhk = String(bhk || "").trim();
    const normalizedLocation = normalizeSpaces(location || area || "");
    const normalizedDistrict = normalizeSpaces(district || "");
    const normalizedPossession = String(possession || "").trim();
    const normalizedStatus = String(status || "").trim();

    const normalizedOfferPrice = parsePrice(offerPrice ?? price);
    const normalizedEstimatedValue = parsePrice(estimatedMarketValue);

    const normalizedPropertyOrSocietyName = String(propertyOrSocietyName || propertyName || "").trim();
    const normalizedFullAddress = String(fullAddress || address || "").trim();
    const normalizedContactNumber = String(contactNumber || phoneNumber || "").trim();

    if (
      !normalizedHeadline ||
      !type ||
      !propertyType ||
      !normalizedBhk ||
      !normalizedLocation ||
      !normalizedDistrict ||
      !normalizedPossession ||
      !normalizedStatus
    ) {
      return res.status(400).json({
        status: false,
        message: "All required fields must be provided",
      });
    }

    if (!validListingTypes.has(type)) {
      return res.status(400).json({ status: false, message: "Invalid listing type" });
    }

    if (!validPropertyTypes.has(propertyType)) {
      return res.status(400).json({ status: false, message: "Invalid property type" });
    }

    if (!validPossessionTypes.has(normalizedPossession)) {
      return res.status(400).json({ status: false, message: "Invalid possession type" });
    }

    if (!validStatusTypes.has(normalizedStatus)) {
      return res.status(400).json({ status: false, message: "Invalid status" });
    }

    if (!isAlphaSpaceOnly(normalizedLocation)) {
      return res.status(400).json({
        status: false,
        message: "Only letters are allowed in this field.",
      });
    }

    if (!isAlphaSpaceOnly(normalizedDistrict)) {
      return res.status(400).json({
        status: false,
        message: "Only letters are allowed in this field.",
      });
    }

    if (type === "Auction" && !emdDate) {
      return res.status(400).json({ status: false, message: "EMD Date is required for Auction property" });
    }

    if (type === "Distress" && !eoiDate) {
      return res.status(400).json({ status: false, message: "EOI Date is required for Alternate property" });
    }

    if (normalizedContactNumber && !/^\d{10,15}$/.test(normalizedContactNumber)) {
      return res.status(400).json({
        status: false,
        message: "Contact Number must be numeric and between 10 to 15 digits",
      });
    }

    if (!Number.isFinite(normalizedOfferPrice) || normalizedOfferPrice <= 0) {
      return res
        .status(400)
        .json({ status: false, message: "Offer price must be greater than 0" });
    }

    if (!Number.isFinite(normalizedEstimatedValue) || normalizedEstimatedValue <= 0) {
      return res
        .status(400)
        .json({ status: false, message: "Estimated market value must be greater than 0" });
    }

    const uploadedPhotos = Array.isArray(req.uploadedFiles)
      ? req.uploadedFiles.filter((f) => f.field === "photos")
      : [];

    if (uploadedPhotos.length === 0) {
      return res
        .status(400)
        .json({ status: false, message: "At least one photo is required" });
    }

    if (uploadedPhotos.length > 5) {
      return res
        .status(400)
        .json({ status: false, message: "Maximum 5 photos are allowed" });
    }

    const photos = uploadedPhotos.map((photo) => ({
      url: photo.url,
      public_id: photo.public_id,
      resource_type: photo.resource_type || "image",
    }));

    const uploadedPdf = Array.isArray(req.uploadedFiles)
      ? req.uploadedFiles.find((f) => f.field === "pdfDocument")
      : null;

    const db = mongoose.connection.db;

    const payload = {
      propertyId: generatePropertyId(),
      headline: normalizedHeadline,
      area: String(area || "").trim(),
      type,
      propertyType,
      bhk: normalizedBhk,
      offerPrice: normalizedOfferPrice,
      estimatedMarketValue: normalizedEstimatedValue,
      location: toTitleCase(normalizedLocation),
      district: toTitleCase(normalizedDistrict),
      possession: normalizedPossession,
      status: normalizedStatus,
      emdDate: emdDate ? new Date(emdDate) : null,
      eoiDate: eoiDate ? new Date(eoiDate) : null,
      flatNo: String(flatNo || "").trim(),
      propertyOrSocietyName: normalizedPropertyOrSocietyName,
      floor: String(floor || "").trim(),
      fullAddress: normalizedFullAddress,
      bankName: String(bankName || "").trim(),
      contactPerson: String(contactPerson || "").trim(),
      contactNumber: normalizedContactNumber,
      pdfDocument: uploadedPdf
        ? {
            url: uploadedPdf.url,
            public_id: uploadedPdf.public_id,
            resource_type: uploadedPdf.resource_type || "raw",
            original_filename: uploadedPdf.original_filename || "",
          }
        : null,

      // Compatibility mirrors for existing frontend/admin consumers
      propertyName: normalizedPropertyOrSocietyName || normalizedHeadline,
      address: normalizedFullAddress,
      phoneNumber: normalizedContactNumber,
      price: normalizedOfferPrice,
      description: String(description || "").trim(),
      photos,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("properties").insertOne(payload);

    return res.status(201).json({
      status: true,
      message: "Property created successfully",
      payload: {
        _id: result.insertedId,
        ...payload,
      },
    });
  } catch (error) {
    console.error("createProperty error", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to create property" });
  }
};

export const deleteProperty = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ status: false, message: "Id required" });
    }

    const db = mongoose.connection.db;
    const existing = await db
      .collection("properties")
      .findOne({ _id: new mongoose.Types.ObjectId(id) });

    if (!existing) {
      return res.status(404).json({ status: false, message: "Property not found" });
    }

    if (Array.isArray(existing.photos)) {
      for (const photo of existing.photos) {
        if (!photo?.public_id) continue;
        try {
          await cloudinary.uploader.destroy(photo.public_id, {
            resource_type: photo.resource_type || "image",
          });
        } catch (err) {
          console.error("Cloudinary destroy error (property photo)", err);
        }
      }
    }

    if (existing?.pdfDocument?.public_id) {
      try {
        await cloudinary.uploader.destroy(existing.pdfDocument.public_id, {
          resource_type: existing.pdfDocument.resource_type || "raw",
        });
      } catch (err) {
        console.error("Cloudinary destroy error (property pdf)", err);
      }
    }

    await db.collection("properties").deleteOne({ _id: new mongoose.Types.ObjectId(id) });
    await db
      .collection("users")
      .updateMany({}, { $pull: { favourites: { type: "property", id: String(id) } } });

    return res.status(200).json({ status: true, message: "Property deleted" });
  } catch (error) {
    console.error("deleteProperty error", error);
    return res.status(500).json({ status: false, message: "Failed to delete property" });
  }
};

export const updateProperty = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ status: false, message: "Id required" });
    }

    const db = mongoose.connection.db;
    const existing = await db
      .collection("properties")
      .findOne({ _id: new mongoose.Types.ObjectId(id) });

    if (!existing) {
      return res.status(404).json({ status: false, message: "Property not found" });
    }

    const {
      headline,
      area,
      type,
      bhk,
      floor,
      propertyType,
      offerPrice,
      estimatedMarketValue,
      location,
      district,
      possession,
      status,
      emdDate,
      eoiDate,
      flatNo,
      propertyOrSocietyName,
      fullAddress,
      bankName,
      contactPerson,
      contactNumber,
      deletedImages,
      deletePdf,

      // Backward compatibility
      propertyName,
      address,
      phoneNumber,
      price,
      description,
    } = req.body;

    const normalizedHeadline = String(headline || propertyName || "").trim();
    const normalizedBhk = String(bhk || existing.bhk || "").trim();
    const normalizedLocation = normalizeSpaces(location || area || existing.location || existing.area || "");
    const normalizedDistrict = normalizeSpaces(district || existing.district || "");
    const normalizedPossession = String(possession || existing.possession || "").trim();
    const normalizedStatus = String(status || existing.status || "").trim();

    const normalizedOfferPrice = parsePrice(offerPrice ?? price ?? existing.offerPrice ?? existing.price);
    const normalizedEstimatedValue = parsePrice(estimatedMarketValue ?? existing.estimatedMarketValue);

    const normalizedPropertyOrSocietyName = String(propertyOrSocietyName || propertyName || existing.propertyOrSocietyName || existing.propertyName || "").trim();
    const normalizedFullAddress = String(fullAddress || address || existing.fullAddress || existing.address || "").trim();
    const normalizedContactNumber = String(contactNumber || phoneNumber || existing.contactNumber || existing.phoneNumber || "").trim();

    if (
      !normalizedHeadline ||
      !type ||
      !propertyType ||
      !normalizedBhk ||
      !normalizedLocation ||
      !normalizedDistrict ||
      !normalizedPossession ||
      !normalizedStatus
    ) {
      return res.status(400).json({
        status: false,
        message: "All required fields must be provided",
      });
    }

    if (!validListingTypes.has(type)) {
      return res.status(400).json({ status: false, message: "Invalid listing type" });
    }

    if (!validPropertyTypes.has(propertyType)) {
      return res.status(400).json({ status: false, message: "Invalid property type" });
    }

    if (!validPossessionTypes.has(normalizedPossession)) {
      return res.status(400).json({ status: false, message: "Invalid possession type" });
    }

    if (!validStatusTypes.has(normalizedStatus)) {
      return res.status(400).json({ status: false, message: "Invalid status" });
    }

    if (!isAlphaSpaceOnly(normalizedLocation)) {
      return res.status(400).json({
        status: false,
        message: "Only letters are allowed in this field.",
      });
    }

    if (!isAlphaSpaceOnly(normalizedDistrict)) {
      return res.status(400).json({
        status: false,
        message: "Only letters are allowed in this field.",
      });
    }

    if (type === "Auction" && !emdDate && !existing.emdDate) {
      return res.status(400).json({ status: false, message: "EMD Date is required for Auction property" });
    }

    if (type === "Distress" && !eoiDate && !existing.eoiDate) {
      return res.status(400).json({ status: false, message: "EOI Date is required for Alternate property" });
    }

    if (normalizedContactNumber && !/^\d{10,15}$/.test(normalizedContactNumber)) {
      return res.status(400).json({
        status: false,
        message: "Contact Number must be numeric and between 10 to 15 digits",
      });
    }

    if (!Number.isFinite(normalizedOfferPrice) || normalizedOfferPrice <= 0) {
      return res
        .status(400)
        .json({ status: false, message: "Offer price must be greater than 0" });
    }

    if (!Number.isFinite(normalizedEstimatedValue) || normalizedEstimatedValue <= 0) {
      return res
        .status(400)
        .json({ status: false, message: "Estimated market value must be greater than 0" });
    }

    const uploadedPhotos = Array.isArray(req.uploadedFiles)
      ? req.uploadedFiles.filter((f) => f.field === "photos")
      : [];

    const deletedMarkers = new Set(parseStringArray(deletedImages));

    if (uploadedPhotos.length > 5) {
      return res
        .status(400)
        .json({ status: false, message: "Maximum 5 photos are allowed" });
    }

    const existingPhotos = Array.isArray(existing.photos) ? existing.photos : [];
    const photosToDelete = existingPhotos.filter((photo) => {
      const photoPublicId = String(photo?.public_id || "").trim();
      const photoUrl = String(photo?.url || "").trim();
      return deletedMarkers.has(photoPublicId) || deletedMarkers.has(photoUrl);
    });

    for (const photo of photosToDelete) {
      if (!photo?.public_id) continue;
      try {
        await cloudinary.uploader.destroy(photo.public_id, {
          resource_type: photo.resource_type || "image",
        });
      } catch (err) {
        console.error("Cloudinary destroy error (property update photo)", err);
      }
    }

    const retainedExistingPhotos = existingPhotos.filter((photo) => {
      const photoPublicId = String(photo?.public_id || "").trim();
      const photoUrl = String(photo?.url || "").trim();
      return !deletedMarkers.has(photoPublicId) && !deletedMarkers.has(photoUrl);
    });

    const uploadedPhotoEntries = uploadedPhotos.map((photo) => ({
      url: photo.url,
      public_id: photo.public_id,
      resource_type: photo.resource_type || "image",
    }));

    const photos = [...retainedExistingPhotos, ...uploadedPhotoEntries];

    if (photos.length === 0) {
      return res
        .status(400)
        .json({ status: false, message: "At least one photo is required" });
    }

    if (photos.length > 5) {
      return res
        .status(400)
        .json({ status: false, message: "Maximum 5 photos are allowed" });
    }

    const uploadedPdf = Array.isArray(req.uploadedFiles)
      ? req.uploadedFiles.find((f) => f.field === "pdfDocument")
      : null;

    const shouldDeletePdf = String(deletePdf || "").toLowerCase() === "true";

    if (shouldDeletePdf && existing?.pdfDocument?.public_id) {
      try {
        await cloudinary.uploader.destroy(existing.pdfDocument.public_id, {
          resource_type: existing.pdfDocument.resource_type || "raw",
        });
      } catch (err) {
        console.error("Cloudinary destroy error (property delete pdf)", err);
      }
    }

    if (uploadedPdf?.public_id && existing?.pdfDocument?.public_id && !shouldDeletePdf) {
      try {
        await cloudinary.uploader.destroy(existing.pdfDocument.public_id, {
          resource_type: existing.pdfDocument.resource_type || "raw",
        });
      } catch (err) {
        console.error("Cloudinary destroy error (property update pdf)", err);
      }
    }

    const pdfDocument = uploadedPdf
      ? {
          url: uploadedPdf.url,
          public_id: uploadedPdf.public_id,
          resource_type: uploadedPdf.resource_type || "raw",
          original_filename: uploadedPdf.original_filename || "",
        }
      : shouldDeletePdf
      ? null
      : existing.pdfDocument || null;

    const update = {
      headline: normalizedHeadline,
      area: String(area || existing.area || "").trim(),
      type,
      floor: String(floor || "").trim(),
      propertyType,
      bhk: normalizedBhk,
      offerPrice: normalizedOfferPrice,
      estimatedMarketValue: normalizedEstimatedValue,
      location: toTitleCase(normalizedLocation),
      district: toTitleCase(normalizedDistrict),
      possession: normalizedPossession,
      status: normalizedStatus,
      emdDate: emdDate ? new Date(emdDate) : existing.emdDate || null,
      eoiDate: eoiDate ? new Date(eoiDate) : existing.eoiDate || null,
      flatNo: String(flatNo || existing.flatNo || "").trim(),
      propertyOrSocietyName: normalizedPropertyOrSocietyName,
      fullAddress: normalizedFullAddress,
      bankName: String(bankName || existing.bankName || "").trim(),
      contactPerson: String(contactPerson || existing.contactPerson || "").trim(),
      contactNumber: normalizedContactNumber,
      pdfDocument,

      // Compatibility mirrors
      propertyName: normalizedPropertyOrSocietyName || normalizedHeadline,
      address: normalizedFullAddress,
      phoneNumber: normalizedContactNumber,
      price: normalizedOfferPrice,
      description: String(description || existing.description || "").trim(),
      photos,
      updatedAt: new Date(),
    };

    await db
      .collection("properties")
      .updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: update });

    const updated = await db
      .collection("properties")
      .findOne({ _id: new mongoose.Types.ObjectId(id) });

    return res.status(200).json({
      status: true,
      message: "Property updated successfully",
      payload: shapePropertyForResponse(updated),
    });
  } catch (error) {
    console.error("updateProperty error", error);
    return res.status(500).json({ status: false, message: "Failed to update property" });
  }
};
