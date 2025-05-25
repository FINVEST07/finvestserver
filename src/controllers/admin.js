import mongoose from "mongoose";

import { decryptData, encryptData } from "../utils/Security.js";

const checkExisting = async (email) => {
  try {
    const db = mongoose.connection.db;
    return await db.collection("admin").findOne({ email });
  } catch (error) {
    console.error("Error in checkExisting:", error);
    throw new Error("Database error");
  }
};

const verification = async (email, password) => {
  try {
    const db = mongoose.connection.db;
    const admin = await db.collection("admin").findOne({ email });

    if (!admin) {
      throw new Error("Admin not found");
    }

    if (admin.password != password) {
      throw new Error("Incorrect Password");
    }

    return {
      verify: true,
      rank: admin.rank,
    };
  } catch (error) {
    console.error("Error in verification:", error);
    throw new Error(error.message);
  }
};

export const adminlogin = async (req, res) => {
  try {
    const data = req.body.payload;

    const decrypteddata = decryptData(data, process.env.KEY);

    if (!decrypteddata.email || !decrypteddata.password) {
      return res
        .status(400)
        .json({ message: "Email and Password are required" });
    }

    const admin = await checkExisting(decrypteddata.email);

    if (!admin) {
      return res.status(404).json({ message: "Wrong Email" });
    }

    const isVerified = await verification(
      decrypteddata.email,
      decrypteddata.password
    );

    if (!isVerified.verify) {
      return res.status(400).json({ message: "Incorrect Password" });
    }

    const payload = {
      message: "Login Successful",
      rank: isVerified.rank,
      email: decrypteddata.email,
    };

    const encryptedpayload = encryptData(payload, process.env.KEY);

    return res.status(200).json({
      payload: encryptedpayload,
    });
  } catch (error) {
    console.error("Error in adminlogin:", error);
    return res
      .status(500)
      .json({ message: error.message || "Internal Server Error" });
  }
};

export const getAdmins = async (req, res) => {
  try {
    const { email } = req.query;

    const db = mongoose.connection.db;

    let admins = [];

    if (email) {
      admins = await db
        .collection("admin")
        .find({
          email: { $ne: email },
        })
        .toArray();
    } else {
      admins = await db.collection("admin").find({}).toArray();
    }

    if (admins?.length < 0) {
      console.error("No admins Found");

      return res.status(404).json({
        message: "No admins Found",
        status: false,
      });
    }

    const filteradmins = admins.filter((item) => item.rank != 1);

    return res.status(200).json({
      message: "Admins Fetched Successfully",
      payload: filteradmins,
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Intenal Server Error",
      status: false,
    });
  }
};

export const addAdmin = async (req, res) => {
  try {
    const { fullName, adminname, email, mobile, rank, adminId } =
      req.body.payload;
    const update = req.body.update;
    const data = req.body.payload;

    // Validation: either fullName or adminname must be present, along with other required fields
    if ((!fullName && !adminname) || !email || !mobile || !rank) {
      return res.status(400).json({
        status: false,
        message: "Required Fields are Missing",
      });
    }

    // For updates, adminId is required
    if (update && !email) {
      return res.status(400).json({
        status: false,
        message: "Email ID is required for updates",
      });
    }

    const db = mongoose.connection.db;
    const finalAdminName = fullName || adminname;

    if (update) {
      // UPDATE EXISTING ADMIN

      // Check if admin exists
      const existingAdmin = await db
        .collection("admin")
        .findOne({ email: email });

      if (!existingAdmin) {
        return res.status(404).json({
          status: false,
          message: "Admin not found",
        });
      }

      // Check if email is being changed and if new email already exists (but not for current admin)
      if (email !== existingAdmin.email) {
        const emailExists = await checkExisting(email);
        if (emailExists) {
          return res.status(400).json({
            status: false,
            message: "Email ID is already registered with another admin",
          });
        }
      }

      // Prepare update data
      const updateData = {
        adminname: finalAdminName,
        email,
        mobile,
        rank,
        password: existingAdmin.password,
      };

      // Update the admin
      await db
        .collection("admin")
        .updateOne({ email: email }, { $set: updateData });

      return res.status(200).json({
        message: "Admin updated successfully",
        status: true,
      });
    } else {
      // ADD NEW ADMIN (Original logic)

      // Clean up data object
      delete data.fullName;
      data.adminname = finalAdminName;

      // Check if email already exists
      const existingadmin = await checkExisting(email);
      if (existingadmin) {
        return res.status(400).json({
          status: false,
          message: "Email ID is already registered with another admin",
        });
      }

      // Generate password
      const name = finalAdminName.slice(0, 4).toUpperCase();
      const number = mobile.slice(6, 10);
      const password = name + number;

      // Insert new admin
      await db.collection("admin").insertOne({
        adminname: finalAdminName,
        email,
        mobile,
        rank,
        password,
      });

      // Delete the application request
      await db.collection("applications").deleteOne({
        servicetype: "4" || 4,
        email: email,
      });

      return res.status(200).json({
        message: "Admin added successfully",
        status: true,
      });
    }
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal Server Error",
      status: false,
    });
  }
};

export const getPartnerandEmployeeApplications = async (req, res) => {
  try {
    const db = mongoose.connection.db;

    const data = await db
      .collection("applications")
      .find({
        servicetype: "4" || 4,
      })
      .toArray();

    if (!data) {
      return res.status(404).json({
        message: "No Request Found",
      });
    }

    return res.status(200).json({
      message: "No Request Found",
      payload: data,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const deleteEmloyeePartner = async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        message: "Required Fields are Missing",
      });
    }

    const db = mongoose.connection.db;

    await db.collection("applications").deleteOne({
      applicationId: id,
    });

    return res.status(200).json({
      message: "Deletion Successfull",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};
