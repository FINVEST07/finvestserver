import { Router } from "express";
import {
  adduser,
  getsingleuser,
  getUsers,
  LoginPassword,
  LoginwithOtp,
  ResetPassword,
  sendforgotpasswordotp,
  SendLoginOtp,
  verifyotp,
} from "./controllers/users.js";
import uploadMiddleware from "../middlewares/upload.js";
import {
  CreateCustomer,
  getCustomers,
  getSingleCustomer,
  savecustomer,
} from "./controllers/customer.js";
import {
  addAdmin,
  adminlogin,
  deleteEmloyeePartner,
  getAdmins,
  getPartnerandEmployeeApplications,
  ResetAdminPassword,
} from "./controllers/admin.js";
import { addVisitor, getDashboardNumbers } from "./controllers/visitors.js";
import {
  createapplication,
  getApplicationCustomers,
  getApplication,
  getApplications,
  handleComplete,
  ForwardApplication,
} from "./controllers/application.js";
import { GetCities } from "./controllers/cities.js";
import { SendEnquiry } from "./controllers/enquiry.js";

const approuter = Router();

approuter.post("/api/adduser", adduser);
approuter.post("/api/verifyotp", verifyotp);
approuter;

approuter.get("/api/getuser", getsingleuser);
approuter.post("/api/sendloginotp", SendLoginOtp);
approuter.post("/api/loginwithotp", LoginwithOtp);
approuter.post("/api/loginwithpassword", LoginPassword);

approuter.post("/api/createcustomer", CreateCustomer);
approuter.get("/api/getsinglecustomer", getSingleCustomer);
approuter.post("/api/savecustomer", uploadMiddleware, savecustomer);
approuter.get("/api/getcustomers", getCustomers);
approuter.get("/api/getapplicationcustomers", getApplicationCustomers);
approuter.post("/api/createapplication", uploadMiddleware, createapplication);

// admin routes
approuter.post("/api/adminlogin", adminlogin);
approuter.post("/api/addadmin", addAdmin);
approuter.get("/api/getadmins", getAdmins);

// visitor routes
approuter.post("/api/addvisitor", addVisitor);
approuter.get("/api/getusers", getUsers);

//application routes
approuter.get("/api/getapplication", getApplication);
approuter.get("/api/getapplications", getApplications);
approuter.get(
  "/api/getpartnerandemployeeapplcations",
  getPartnerandEmployeeApplications
);
approuter.post("/api/completeapplication", handleComplete);
approuter.post("/api/deleteemloyeepartner", deleteEmloyeePartner);
approuter.post("/api/forwardapplication", ForwardApplication);

//Dashboard Routes
approuter.get("/api/getdashboardnumbers", getDashboardNumbers);

approuter.get("/api/getcities", GetCities);

//Enquiry Routes
approuter.post("/api/sendenquiry", SendEnquiry);

//Forgot PassWord
approuter.post("/api/sendforgotpasswordotp",sendforgotpasswordotp);

approuter.post("/api/resetpassword",ResetPassword);

approuter.post("/api/resetadminpassword",ResetAdminPassword);


export default approuter;
