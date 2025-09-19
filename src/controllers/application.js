import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid"; // install via npm if not added: npm install uuid

export const createapplication = async (req, res) => {
  try {
    const { uploadedImages } = req;

    // Parse the payload
    const data =
      typeof req.body.payload === "string"
        ? JSON.parse(req.body.payload)
        : req.body.payload;

    // Validate email
    if (!data?.email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Extract only valid fields (non-empty)
    const validData = {};
    Object.entries(data).forEach(([key, value]) => {
      if (key != "_id" && value != null && value != undefined && value != "") {
        validData[key] = value;
      }
    });

    validData.status = "Processing";

    // Map uploaded image fields
    const imageFields = {};
    if (Array.isArray(uploadedImages)) {
      uploadedImages.forEach(({ field, url }) => {
        if (field && url) {
          imageFields[field] = url;
        }
      });
    }

    const db = mongoose.connection.db;
    const updatePayload = {
      ...validData,
      ...imageFields,
    };

    // If applyMode requests a new application, ignore any passed applicationId
    if (data.applyMode === 'new') {
      delete data.applicationId;
      delete updatePayload.applicationId;
    }

    // Check if applicationId exists in data
    if (data.applicationId) {
      // Update existing document
      await db
        .collection("applications")
        .findOneAndUpdate(
          { applicationId: data.applicationId },
          { $set: updatePayload },
          { returnDocument: "after" }
        );

      return res.status(200).json({
        message: "Application updated successfully",
        applicationId: data.applicationId,
      });
    } else {
      // Initialize representativeid
      let representativeid;

      // Fixed condition logic - use AND (&&) instead of OR (||)
      if (validData.servicetype != "4" && validData.servicetype != 4) {
        // Fixed await for async operation
        const admin = await db
          .collection("admin")
          .findOne({ location: validData.location });

        if (admin) {
          representativeid = admin.email;
        }
      }

      // Create new document with generated applicationId
      const newApplicationId = `${uuidv4()}`;
      const shortid = newApplicationId.slice(3, 12).replace(/-/g, ""); // remove hyphens
      const newPayload = {
        ...updatePayload,
        representativeid,
        stars: 5,
        // This will be undefined if not set above
        applicationId: shortid,
        createdAt: new Date(),
      };

      await db.collection("applications").insertOne(newPayload);

      return res.status(200).json({
        message: "Application created successfully",
        applicationId: shortid, // Fixed: return shortid instead of newApplicationId
      });
    }
  } catch (error) {
    console.error("Error Creating Application:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getApplication = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        message: "Required fields is missing",
      });
    }

    const db = mongoose.connection.db;

    // Await the result and sort by createdAt descending (-1)
    const applications = await db
      .collection("applications")
      .find({ email: email })
      .sort({ createdAt: -1 })
      .toArray();

    if (!applications || applications.length === 0) {
      return res.status(404).json({
        message: "No application Found",
      });
    }

    return res.status(200).json({
      payload: applications,
    });
  } catch (error) {
    console.error("Error in getApplication:", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const getApplications = async (req, res) => {
  try {
    const db = mongoose.connection.db;

    // Await the result and sort by createdAt descending (-1)
    const applications = await db
      .collection("applications")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    if (!applications || applications.length === 0) {
      return res.status(404).json({
        message: "No application Found",
      });
    }

    return res.status(200).json({
      payload: applications,
    });
  } catch (error) {
    console.error("Error in getApplication:", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const getApplicationCustomers = async (req, res) => {
  try {
    const rank = req.query.rank;
    const email = req.query.email;

    const db = mongoose.connection.db;

    // Await the result and sort by createdAt descending (-1)
    let applications = [];

    if (rank == 1) {
      applications = await db
        .collection("applications")
        .find({
          servicetype: { $nin: [4, "4"] },
        })
        .sort({ createdAt: -1 })
        .toArray();
    } else {
      applications = await db
        .collection("applications")
        .find({
          status: "Processing",
          servicetype: { $nin: [4, "4"] },
          representativeid: email,
        })
        .sort({ createdAt: -1 })
        .toArray();
    }

    if (!applications || applications.length === 0) {
      return res.status(404).json({
        message: "No application Found",
      });
    }

    return res.status(200).json({
      payload: applications,
    });
  } catch (error) {
    console.error("Error in getApplication:", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const handleComplete = async (req, res) => {
  try {
    const { applicationId } = req.body;

    if (!applicationId) {
      return res.status(400).json({
        message: "Application ID is missing",
        status: false,
      });
    }

    const db = mongoose.connection.db;

    const result = await db.collection("applications").updateOne(
      { applicationId: applicationId },
      {
        $set: {
          status: "Completed",
          closingTime: new Date(),
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        message: "No application found or already completed",
      });
    }

    return res.status(200).json({
      message: "Application marked as Completed",
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
      status: false,
    });
  }
};

export const ForwardApplication = async (req, res) => {
  try {
    const { email, applicationId } = req.body;

    if (!email || !applicationId) {
      return res.status(400).json({
        message: "Required fields are missing",
        status: false,
      });
    }

    const db = mongoose.connection.db;

    const result = await db
      .collection("applications")
      .updateOne(
        { applicationId: applicationId },
        { $set: { representativeid: email } }
      );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: "Application not found",
        status: false,
      });
    }

    return res.status(200).json({
      message: "Forwarding successful",
      status: true,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal server error",
      status: false,
    });
  }
};

export const AddAppraisal = async (req, res) => {
  try {
    const { applicationId, appraisal } = req.body;

    if (!applicationId || !appraisal) {
      return res.status(400).json({
        message: "Required Fields are Missing",
        status: false,
      });
    }

    const db = mongoose.connection.db;

    const result = await db
      .collection("applications")
      .updateOne(
        { applicationId: applicationId },
        { $set: { appraisal: appraisal } }
      );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        message: "Application not found or no changes made",
        status: false,
      });
    }

    return res.status(200).json({
      message: "Submitted Successfully",
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
      status: false,
    });
  }
};

export const UpdateApplicationStatus = async (req, res) => {
  try {
    const { applicationId, status } = req.body;

    if (!applicationId || !status) {
      return res.status(400).json({
        message: "Required Fields are missing",
        status: false,
      });
    }

    const db = mongoose.connection.db;

    await db
      .collection("applications")
      .updateOne(
        { applicationId: applicationId },
        { $set: { status: status } }
      );

    return res.status(200).json({
      message: "Application Updated Successful",
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};
