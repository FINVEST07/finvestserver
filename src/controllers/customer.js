import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";

export const CreateCustomer = async (req, res) => {
  try {
    const data = req.body.payload;

    if (!data) {
      return res.status(404).json({
        message: "Missing Required Fields",
      });
    }

    const db = mongoose.connection.db;

    const checkcustomer = await db
      .collection("customers")
      .findOne({ email: data.email });

    if (checkcustomer) {
      return res.status(400).json({
        message: "Customer already exists with this email",
      });
    }

    const Lastcustomer = await db
      .collection("customers")
      .findOne({}, { sort: { customer_id: -1 } });

    // Set broker ID (auto-increment starting from 100001)
    const customer_id = Lastcustomer ? Lastcustomer.customer_id + 1 : 100001;

    data.customer_id = customer_id;
    data.createdAt = new Date();

    await db.collection("customers").insertOne(data);

    return res.status(200).json({
      message: "Details Submitted",
      payload: data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

// Delete a single document field for a customer and remove it from Cloudinary as well
export const DeleteDocument = async (req, res) => {
  try {
    const { email, field, url, type } = req.body;

    if (!email || !field) {
      return res.status(400).json({ message: "email and field are required" });
    }

    const db = mongoose.connection.db;

    // Unset the field from the customer document
    const unsetResult = await db.collection("customers").updateOne(
      { email },
      { $unset: { [field]: "" } }
    );

    // Best-effort Cloudinary delete if a URL exists and looks like Cloudinary
    if (url && typeof url === "string" && url.startsWith("http")) {
      try {
        // Attempt to extract public_id from Cloudinary URL
        // Example: https://res.cloudinary.com/<cloud>/.../upload/v1699999999/documents/photo_1700000000.jpg
        const urlObj = new URL(url);
        const parts = urlObj.pathname.split("/").filter(Boolean);
        // Find 'upload' segment and public id after version
        const uploadIdx = parts.findIndex((p) => p === "upload");
        let publicIdWithExt = null;
        if (uploadIdx !== -1 && parts.length > uploadIdx + 2) {
          // parts[uploadIdx+1] is version like v12345, rest joined is public_id with extension
          publicIdWithExt = parts.slice(uploadIdx + 2).join("/");
        }

        if (publicIdWithExt) {
          // Remove file extension to get public_id
          const dotIdx = publicIdWithExt.lastIndexOf(".");
          const publicId = dotIdx > 0 ? publicIdWithExt.slice(0, dotIdx) : publicIdWithExt;
          // Determine resource type: PDFs were uploaded as 'raw' in middleware
          const resource_type = (type === 'application/pdf' || url.toLowerCase().endsWith('.pdf')) ? 'raw' : 'image';
          await cloudinary.uploader.destroy(publicId, { resource_type });
        }
      } catch (e) {
        console.error("Cloudinary delete failed", e);
        // Non-blocking error; continue
      }
    }

    return res.status(200).json({
      message: "Document deleted",
      modifiedCount: unsetResult.modifiedCount,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getSingleCustomer = async (req, res) => {
  try {
    const { email, customer_id } = req.query;

    // Check if at least one parameter is provided
    if (!email && !customer_id) {
      console.error("Email or Customer ID not provided");
      return res.status(400).json({
        message: "Unable to load data at the moment",
      });
    }

    const db = mongoose.connection.db;

    // Build query object based on available parameters
    let query = {};

    if (email) {
      query.email = email;
    } else if (customer_id) {
      query.customer_id = customer_id;
    }

    const customer = await db.collection("customers").findOne(query);

    if (!customer) {
      console.error("Customer not found in database");
      return res.status(404).json({
        message: "Unable to load data at the moment",
      });
    }

    return res.status(200).json({
      message: "Successfully Fetched",
      payload: customer,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const savecustomer = async (req, res) => {
  try {
    const { uploadedImages } = req;

    // Parse the JSON string if payload is sent as string in FormData
    const data =
      typeof req.body.payload === "string"
        ? JSON.parse(req.body.payload)
        : req.body.payload;

    if (!data?.email) {
      return res
        .status(400)
        .json({ message: "Email is required to update user" });
    }

    // Filter non-null/empty/undefined fields from payload, exclude _id
    const validData = {};
    Object.entries(data).forEach(([key, value]) => {
      if (
        key !== "_id" &&
        key !== "createdAt" &&
        value !== null &&
        value !== undefined &&
        value !== ""
      ) {
        validData[key] = value;
      }
    });

    // Create an object from the uploadedImages array with valid entries
    const imageFields = {};
    if (Array.isArray(uploadedImages)) {
      uploadedImages.forEach(({ field, url }) => {
        if (field && url) {
          imageFields[field] = url;
        }
      });
    }
    //

    const updatePayload = {
      ...validData,
      ...imageFields,
    };

    const db = mongoose.connection.db;

    const updateResult = await db.collection("customers").findOneAndUpdate(
      { email: data.email },
      {
        $set: updatePayload,
      },
      { returnDocument: "after" } // Return updated document
    );

    res.status(200).json({
      message: "Data Saved",
      user: updateResult.value,
    });
  } catch (error) {
    console.error("Error saving customer:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getCustomers = async (req, res) => {
  try {
    const db = mongoose.connection.db;

    // Await the result and sort by createdAt descending (-1)
    const users = await db
      .collection("customers")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    if (!users || users.length === 0) {
      return res.status(404).json({
        message: "No customers Found",
      });
    }

    return res.status(200).json({
      payload: users,
    });
  } catch (error) {
    console.error("Error in getCustomers:", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};
