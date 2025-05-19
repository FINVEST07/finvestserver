import mongoose from "mongoose";
import { Resend } from "resend";

// re_ccuAZtfq_qWsMFDrWjLSwX1vt6qm5GFCp

const resend = new Resend("re_ccuAZtfq_qWsMFDrWjLSwX1vt6qm5GFCp");

const sendotp = async (email) => {
  try {
    if (!email) {
      return res.status(400).json({ message: "No email provided" });
    }

    const db = mongoose.connection.db;

    // Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const { data, error } = await resend.emails.send({
      from: "FINVESTCORP <no-reply@t-rexinfotech.in>",
      to: [email],
      subject: "Your OTP Code",
      html: `<p>Your OTP is: <strong>${otp}</strong>. It is valid for 2 minutes.</p>`,
    });

    if (error) {
      throw new Error({ message: "Failed to send OTP", error });
    }

    return otp;
  } catch (error) {
    console.error("Send OTP Error:", error);
    throw new Error({ message: "Internal Server Error" });
  }
};

export const adduser = async (req, res) => {
  try {
    // Connect to the database
    const db = mongoose.connection.db;
    const { name, email, mobile, password } = req.body.payload; // Extract data from request

    if (!name || !email || !mobile || !password) {
      return res.status(400).json({ message: "Some Fields are missing" });
    }

    // Function to generate user ID (random 6-digit number + timestamp)
    const generateUserId = () => {
      const randomNum = Math.floor(100000 + Math.random() * 900000); // 6-digit random number
      return `${randomNum}-${Date.now()}`;
    };

    const userid = generateUserId();

    const existingUser = await db.collection("users").findOne({
      $or: [{ email: email }, { mobile: mobile }],
    });

    if (existingUser) {
      return res.status(400).json({ message: "User Already exists" });
    }

    const otp = await sendotp(email);

    await db.collection("users").insertOne({
      name,
      email,
      mobile,
      user: userid,
      password,
      createdAt: new Date(),
      otp: otp,
      otpGeneratedAt: new Date(),
    });

    return res.status(200).json({ message: "opd generated successfully" });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const verifyotp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const db = mongoose.connection.db;

    const user = await db.collection("users").findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.otp || !user.otpGeneratedAt) {
      return res
        .status(400)
        .json({ message: "No OTP found. Please request a new one." });
    }

    // Check if OTP has expired (10 minutes expiry)
    const otpAge =
      (Date.now() - new Date(user.otpGeneratedAt).getTime()) / 1000; // in seconds
    if (otpAge > 120) {
      return res
        .status(410)
        .json({ message: "OTP expired. Please request a new one." });
    }

    // Match OTP
    if (user.otp !== otp) {
      return res.status(401).json({ message: "Invalid OTP" });
    }

    // ✅ Success: Clear OTP and mark as verified
    await db.collection("users").updateOne(
      { email },
      {
        $unset: { otp: "", otpGeneratedAt: "" },
        $set: { isVerified: true }, // optional
      }
    );

    return res
      .status(200)
      .json({ message: "OTP verified successfully", name: user.name });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


export const SendLoginOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const db = mongoose.connection.db;

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        message: "Invalid or missing email",
      });
    }

    const checkuser = await db.collection("users").findOne({
      email: email,
    });

    if (!checkuser) {
      return res.status(404).json({
        message: "No user Found with this email",
      });
    }

    const otp = await sendotp(email);

    if (!otp) {
      return res.status(500).json({
        message: "Unable to generate OTP, please try again later",
      });
    }

    // Optional: remove previous OTPs for the same email
    await db.collection("login").deleteMany({ email });

    // Insert new OTP record
    await db.collection("login").insertOne({
      email,
      otp,
      otpGeneratedAt: new Date(),
    });

    return res.status(200).json({
      message: "OTP generated successfully",
    });
  } catch (error) {
    console.error("Error in SendLoginOtp:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

export const getsingleuser = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const db = mongoose.connection.db;

    const user = await db.collection("users").findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User retrieved", payload: user });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const LoginwithOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({
      message: "Required fields are missing",
    });
  }

  const db = mongoose.connection.db;

  try {
    const user = await db.collection("login").findOne({ email });

    if (!user) {
      return res
        .status(404)
        .json({ message: "OTP not found. Please request a new one." });
    }

    const isOtpMatch = user.otp === otp;
    const now = new Date();
    const timeDiff = (now - user.otpGeneratedAt) / 1000; // in seconds

    if (!isOtpMatch) {
      return res.status(401).json({ message: "Invalid OTP" });
    }

    if (timeDiff > 120) {
      return res
        .status(410)
        .json({ message: "OTP has expired. Please request a new one." });
    }

    // OTP is valid and within 2 minutes
    // Optional: delete OTP record after use
    await db.collection("login").deleteOne({ email });

    // user extracted from user collection
    const newuser = await db.collection("users").findOne({email});
    

    return res.status(200).json({
      message: "login successfully",
      mobile : newuser.mobile,
    });
  } catch (error) {
    console.error("Error in LoginwithOtp:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const LoginPassword = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Required fields are missing",
    });
  }

  try {
    const db = mongoose.connection.db;

    const user = await db.collection("users").findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const isPassMatch = user.password == password;

    if (!isPassMatch) {
      return res.status(401).json({ message: "Invalid Password" });
    }

    return res.status(200).json({
      message: "login successfully",
      mobile : user.mobile,
    });
  } catch (error) {
    console.error("Error in LoginwithOtp:", error);
    return res.status(500).json({ message: "Internal Serve Error" });
  }
};


export const getUsers = async (req, res) => {
  try {
    const db = mongoose.connection.db;

    // Await the result and sort by createdAt descending (-1)
    const users = await db.collection("users")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    if (!users || users.length === 0) {
      return res.status(404).json({
        message: "No user Found",
      });
    }

    return res.status(200).json({
      payload: users,
    });
  } catch (error) {
    console.error("Error in getUsers:", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};
