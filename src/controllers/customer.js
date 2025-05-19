import mongoose from "mongoose";

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
    const customer_id = `${Lastcustomer ? Lastcustomer.customer_id + 1 : 100001}`;

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

export const getSingleCustomer = async (req, res) => {
  try {
    const  { email }  = req.query;

    if (!email) {
      console.error("Email Not Provided");

      return res.status(400).json({
        message: "Unable to load data at the moment",
      });
    }

    const db = mongoose.connection.db;
  
    const customer = await db.collection("customers").findOne({ email });

  
    if (!customer) {
      console.error("Customer not found in database");

      return res.status(404).json({
        message: "Unable to load data at the moment",
      });
    }

    return res.status(200).json({
      message: "Succesfully Fetched",
      payload: customer,
    });
  } catch (error) {
    console.error(error);
    return res.status(200).json({
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
    const users = await db.collection("customers")
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





