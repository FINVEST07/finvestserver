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

const allowedOrigins = new Set([
    "https://www.finvestcorp.com",
    "https://finvestcorp.com",
    "http://localhost:5173",
    "http://localhost:3000",
]);

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);
        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
};

// Middleware for parsing the request body
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));

app.use(cookieParser());

app.use(express.json()); // ✅ For JSON requests (except file uploads)
app.use(express.urlencoded({ extended: true })); // ✅ URL-encoded data

app.use("/uploads", express.static(path.join(process.cwd(), "public/uploads")));

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use(approuter);
// app.use(encrypt)

let dbReadyPromise;
const ensureDbReady = () => {
    if (!dbReadyPromise) {
        dbReadyPromise = ConnectDB().catch((e) => {
            console.error('MongoDB connection failed', e.message);
            throw e;
        });
    }
    return dbReadyPromise;
};

if (process.env.VERCEL !== "1") {
    ensureDbReady()
        .then(() => {
            app.listen(PORT, () => {
                console.log(`Server is running on port ${PORT}`);
            });
        })
        .catch(() => {
            // local dev: errors already logged
        });
}

export default async function handler(req, res) {
    try {
        await ensureDbReady();
        return app(req, res);
    } catch (e) {
        return res.status(500).json({ message: "Server failed to initialize" });
    }
}