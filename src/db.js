

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const DB_URL = process.env.DB;



const ConnectDB = async () => {
    try {
        const connectionInstance = await mongoose.connect(DB_URL);
        console.log(`Connected to MongoDB: ${connectionInstance.connection.host}`);
    } catch (error) {
        console.error("MongoDB connection FAILED", error);
        process.exit(1);
    }
}

export default ConnectDB;