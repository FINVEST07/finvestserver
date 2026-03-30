import mongoose from "mongoose";

export const requireUserAuth = async (req, res, next) => {
  try {
    const headerEmail =
      typeof req.headers["x-user-email"] === "string"
        ? req.headers["x-user-email"].trim().toLowerCase()
        : "";

    const cookieValue = typeof req.cookies?.finvest === "string" ? req.cookies.finvest : "";
    const cookieEmail = cookieValue ? cookieValue.split("$")[0].trim().toLowerCase() : "";

    if (headerEmail && cookieEmail && headerEmail !== cookieEmail) {
      return res.status(401).json({ status: false, message: "User authentication mismatch" });
    }

    const email = headerEmail || cookieEmail;
    if (!email) {
      return res.status(401).json({ status: false, message: "Authentication required" });
    }

    const db = mongoose.connection.db;
    const user = await db.collection("users").findOne({ email });

    if (!user) {
      return res.status(401).json({ status: false, message: "Invalid user session" });
    }

    req.authUser = {
      _id: user._id,
      email: user.email,
      mobile: user.mobile,
      name: user.name,
    };

    return next();
  } catch (error) {
    console.error("requireUserAuth error", error);
    return res.status(500).json({ status: false, message: "Authentication failed" });
  }
};
