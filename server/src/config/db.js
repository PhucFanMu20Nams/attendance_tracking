import mongoose from 'mongoose';

// Connect to MongoDB using connection string from environment variable
// Throws error if connection fails - caller (server.js) handles the error
const connectDB = async () => {
  const conn = await mongoose.connect(process.env.MONGO_URI);
  console.log(`MongoDB Connected: ${conn.connection.host}`);
};

export default connectDB;
