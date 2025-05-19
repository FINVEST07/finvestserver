import express from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import cors from 'cors';
import ConnectDB from '../src/db.js';
import approuter from '../src/router.js';
// import { encrypt } from '../src/utils/security.js';
import path from 'path';
import cookieParser from "cookie-parser";


dotenv.config();

const app = express();
const PORT = process.env.PORT || 4002;

// Middleware for parsing the request body
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));

app.use(cookieParser());

app.use(express.json()); // ✅ For JSON requests (except file uploads)
app.use(express.urlencoded({ extended: true })); // ✅ URL-encoded data


app.use("/uploads", express.static(path.join(process.cwd(), "public/uploads")));


app.use(cors({
    origin: true,  // Allow all origins
    credentials: true 
}));

app.use(approuter);
// app.use(encrypt)






// Connect to the database and start the servers
ConnectDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch((e) => {
        console.error('MongoDB connection failed', e.message);
    });