// lib/mongodb/connection.ts
import mongoose from "mongoose";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/ssl-service";

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable");
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongoose || {
  conn: null,
  promise: null,
};

if (!global.mongoose) {
  global.mongoose = cached;
}

export async function connectDB() {
  if (cached.conn) {
    console.log("Using existing database connection");
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      console.log("Database connected successfully");
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

// import mongoose from "mongoose";

// let isConnected = false; // Track the connection state

// export const connectDB = async () => {
//   try {
//     const uri = process.env.MONGODB_URI;

//     if (!uri) {
//       throw new Error("MONGODB_URI environment variable not found");
//     }

//     if (isConnected) {
//       console.log("Using existing database connection");
//       return;
//     }

//     // Checking the ready state before attempting to connect
//     if (mongoose.connection.readyState === 1) {
//       isConnected = true;
//       console.log("Already connected to the database");
//       return;
//     }

//     // Configure Mongoose connection options if needed
//     const options: mongoose.ConnectOptions = {
//       // Add options as needed
//     };

//     await mongoose.connect(uri, options);
//     isConnected = true;

//     console.log("Database connected successfully");
//   } catch (error) {
//     isConnected = false;
//     console.error("Error connecting to database:", error);
//     throw error; // Ensure the error is thrown to be handled by the caller
//   }
// };

// // lib/mongodb/connection.ts
// import mongoose from "mongoose";

// const MONGODB_URI =
//   process.env.MONGODB_URI || "mongodb://localhost:27017/ssl-service";

// if (!MONGODB_URI) {
//   throw new Error("Please define the MONGODB_URI environment variable");
// }

// interface MongooseCache {
//   conn: typeof mongoose | null;
//   promise: Promise<typeof mongoose> | null;
// }

// declare global {
//   var mongoose: MongooseCache | undefined;
// }

// const cached: MongooseCache = global.mongoose || {
//   conn: null,
//   promise: null,
// };

// if (!global.mongoose) {
//   global.mongoose = cached;
// }

// export async function connectToDatabase() {
//   if (cached.conn) {
//     return cached.conn;
//   }

//   if (!cached.promise) {
//     const opts = {
//       bufferCommands: false,
//       maxPoolSize: 10,
//       serverSelectionTimeoutMS: 5000,
//       socketTimeoutMS: 45000,
//     };

//     cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
//       console.log("✅ MongoDB connected successfully");
//       return mongoose;
//     });
//   }

//   try {
//     cached.conn = await cached.promise;
//   } catch (e) {
//     cached.promise = null;
//     throw e;
//   }

//   return cached.conn;
// }

// import mongoose from "mongoose";

// const MONGODB_URI =
//   process.env.MONGODB_URI || "mongodb://localhost:27017/ssl-service";

// if (!MONGODB_URI) {
//   throw new Error("Please define the MONGODB_URI environment variable");
// }

// interface MongooseCache {
//   conn: typeof mongoose | null;
//   promise: Promise<typeof mongoose> | null;
// }

// declare global {
//   var mongoose: MongooseCache | undefined;
// }

// const cached: MongooseCache = global.mongoose || {
//   conn: null,
//   promise: null,
// };

// if (!global.mongoose) {
//   global.mongoose = cached;
// }

// export async function connectToDatabase() {
//   if (cached.conn) {
//     return cached.conn;
//   }

//   if (!cached.promise) {
//     const opts = {
//       bufferCommands: false,
//       maxPoolSize: 10,
//       serverSelectionTimeoutMS: 5000,
//       socketTimeoutMS: 45000,
//     };

//     cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
//       console.log("✅ MongoDB connected successfully");
//       return mongoose;
//     });
//   }

//   try {
//     cached.conn = await cached.promise;
//   } catch (e) {
//     cached.promise = null;
//     throw e;
//   }

//   return cached.conn;
// }
