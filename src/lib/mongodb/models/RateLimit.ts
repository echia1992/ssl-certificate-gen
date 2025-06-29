// lib/mongodb/models/RateLimit.ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IRateLimit extends Document {
  identifier: string; // IP address or domain
  type: "ip" | "domain";
  endpoint: string;
  requests: number;
  windowStart: Date;
  blocked: boolean;
  blockedUntil?: Date;
}

const rateLimitSchema = new Schema<IRateLimit>(
  {
    identifier: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["ip", "domain"],
      required: true,
    },
    endpoint: {
      type: String,
      required: true,
    },
    requests: {
      type: Number,
      default: 1,
    },
    windowStart: {
      type: Date,
      default: Date.now,
    },
    blocked: {
      type: Boolean,
      default: false,
    },
    blockedUntil: Date,
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient lookups
rateLimitSchema.index({ identifier: 1, type: 1, endpoint: 1 });
rateLimitSchema.index({ windowStart: 1 }, { expireAfterSeconds: 86400 }); // Auto-delete after 24 hours

const RateLimit: Model<IRateLimit> =
  mongoose.models.RateLimit ||
  mongoose.model<IRateLimit>("RateLimit", rateLimitSchema);

export default RateLimit;

// // lib/mongodb/models/RateLimit.ts
// import mongoose, { Schema, Document, Model } from "mongoose";

// export interface IRateLimit extends Document {
//   identifier: string;
//   type: "ip" | "domain";
//   endpoint: string;
//   requests: number;
//   windowStart: Date;
//   blocked: boolean;
//   blockedUntil?: Date;
// }

// const rateLimitSchema = new Schema<IRateLimit>(
//   {
//     identifier: {
//       type: String,
//       required: true,
//       index: true,
//     },
//     type: {
//       type: String,
//       enum: ["ip", "domain"],
//       required: true,
//     },
//     endpoint: {
//       type: String,
//       required: true,
//     },
//     requests: {
//       type: Number,
//       default: 1,
//     },
//     windowStart: {
//       type: Date,
//       default: Date.now,
//     },
//     blocked: {
//       type: Boolean,
//       default: false,
//     },
//     blockedUntil: Date,
//   },
//   {
//     timestamps: true,
//   }
// );

// rateLimitSchema.index({ identifier: 1, type: 1, endpoint: 1 });
// rateLimitSchema.index({ windowStart: 1 }, { expireAfterSeconds: 86400 });

// const RateLimit: Model<IRateLimit> =
//   mongoose.models.RateLimit ||
//   mongoose.model<IRateLimit>("RateLimit", rateLimitSchema);

// export default RateLimit;

// // // lib/mongodb/models/RateLimit.ts
// // import mongoose, { Schema, Document, models } from "mongoose";

// // interface IRateLimit extends Document {
// //   identifier: string; // IP address or domain
// //   type: "ip" | "domain";
// //   endpoint: string;
// //   requests: number;
// //   windowStart: Date;
// //   blocked: boolean;
// //   blockedUntil?: Date;
// // }

// // const rateLimitSchema = new Schema<IRateLimit>(
// //   {
// //     identifier: {
// //       type: String,
// //       required: true,
// //       index: true,
// //     },
// //     type: {
// //       type: String,
// //       enum: ["ip", "domain"],
// //       required: true,
// //     },
// //     endpoint: {
// //       type: String,
// //       required: true,
// //     },
// //     requests: {
// //       type: Number,
// //       default: 1,
// //     },
// //     windowStart: {
// //       type: Date,
// //       default: Date.now,
// //     },
// //     blocked: {
// //       type: Boolean,
// //       default: false,
// //     },
// //     blockedUntil: Date,
// //   },
// //   {
// //     timestamps: true,
// //   }
// // );

// // // Compound index for efficient lookups
// // rateLimitSchema.index({ identifier: 1, type: 1, endpoint: 1 });
// // rateLimitSchema.index({ windowStart: 1 }, { expireAfterSeconds: 86400 }); // Auto-delete after 24 hours

// // const RateLimit =
// //   models?.RateLimit || mongoose.model<IRateLimit>("RateLimit", rateLimitSchema);
// // export default RateLimit;
// // export type { IRateLimit };
