// lib/mongodb/models/Certificates.ts - Simplified version
import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICertificate extends Document {
  domain: string;
  email: string;
  type: "single" | "wildcard";
  status: "pending" | "dns-pending" | "validated" | "issued" | "failed";
  domains: string[];
  ipAddress: string;
  challenges: any[]; // Simplified to any[] to avoid schema conflicts
  certificateIssued: boolean;
  issuedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const certificateSchema = new Schema<ICertificate>(
  {
    domain: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["single", "wildcard"],
      default: "single",
    },
    status: {
      type: String,
      enum: ["pending", "dns-pending", "validated", "issued", "failed"],
      default: "pending",
      index: true,
    },
    domains: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    ipAddress: {
      type: String,
      required: true,
    },
    challenges: {
      type: Schema.Types.Mixed, // This allows any structure
      default: [],
    },
    certificateIssued: {
      type: Boolean,
      default: false,
    },
    issuedAt: Date,
    expiresAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
certificateSchema.index({ domain: 1, createdAt: -1 });
certificateSchema.index({ ipAddress: 1, createdAt: -1 });
certificateSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // Auto-delete after 90 days

const Certificate: Model<ICertificate> =
  mongoose.models.Certificate ||
  mongoose.model<ICertificate>("Certificate", certificateSchema);

export default Certificate;

// // lib/mongodb/models/Certificates.ts
// import mongoose, { Schema, Document, Model } from "mongoose";

// export interface ICertificate extends Document {
//   domain: string;
//   email: string;
//   type: "single" | "wildcard";
//   status: "pending" | "dns-pending" | "validated" | "issued" | "failed";
//   domains: string[];
//   ipAddress: string;
//   challenges: Array<{
//     domain: string;
//     type: string;
//     status: "pending" | "valid" | "invalid";
//     token: string;
//     keyAuthorization?: string;
//     dnsRecord?: {
//       name: string;
//       type: string;
//       value: string;
//       ttl: number;
//     };
//     validatedAt?: Date;
//     error?: string;
//   }>;
//   certificateIssued: boolean;
//   issuedAt?: Date;
//   expiresAt?: Date;
//   createdAt: Date;
//   updatedAt: Date;
// }

// const certificateSchema = new Schema<ICertificate>(
//   {
//     domain: {
//       type: String,
//       required: true,
//       lowercase: true,
//       trim: true,
//       index: true,
//     },
//     email: {
//       type: String,
//       required: true,
//       lowercase: true,
//       trim: true,
//     },
//     type: {
//       type: String,
//       enum: ["single", "wildcard"],
//       default: "single",
//     },
//     status: {
//       type: String,
//       enum: ["pending", "dns-pending", "validated", "issued", "failed"],
//       default: "pending",
//       index: true,
//     },
//     domains: [
//       {
//         type: String,
//         lowercase: true,
//         trim: true,
//       },
//     ],
//     ipAddress: {
//       type: String,
//       required: true,
//     },
//     challenges: [
//       {
//         domain: {
//           type: String,
//           required: true,
//         },
//         type: {
//           type: String,
//           required: true,
//         },
//         status: {
//           type: String,
//           enum: ["pending", "valid", "invalid"],
//           default: "pending",
//         },
//         token: {
//           type: String,
//           required: true,
//         },
//         keyAuthorization: String,
//         dnsRecord: {
//           name: {
//             type: String,
//             required: true,
//           },
//           type: {
//             type: String,
//             required: true,
//           },
//           value: {
//             type: String,
//             required: true,
//           },
//           ttl: {
//             type: Number,
//             required: true,
//           },
//         },
//         validatedAt: Date,
//         error: String,
//       },
//     ],
//     certificateIssued: {
//       type: Boolean,
//       default: false,
//     },
//     issuedAt: Date,
//     expiresAt: {
//       type: Date,
//       index: true,
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// // Indexes for performance
// certificateSchema.index({ domain: 1, createdAt: -1 });
// certificateSchema.index({ ipAddress: 1, createdAt: -1 });
// certificateSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // Auto-delete after 90 days

// const Certificate: Model<ICertificate> =
//   mongoose.models.Certificate ||
//   mongoose.model<ICertificate>("Certificate", certificateSchema);

// export default Certificate;

// // lib/mongodb/models/Certificate.ts
// import mongoose, { Schema, Document, Model } from "mongoose";

// export interface ICertificate extends Document {
//   domain: string;
//   email: string;
//   type: "single" | "wildcard";
//   status: "pending" | "dns-pending" | "validated" | "issued" | "failed";
//   domains: string[];
//   ipAddress: string;
//   challenges: Array<{
//     domain: string;
//     type: string;
//     status: "pending" | "valid" | "invalid";
//     token: string;
//     keyAuthorization?: string;
//     dnsRecord?: {
//       name: string;
//       type: string;
//       value: string;
//       ttl: number;
//     };
//     validatedAt?: Date;
//     error?: string;
//   }>;
//   certificateIssued: boolean;
//   issuedAt?: Date;
//   expiresAt?: Date;
//   createdAt: Date;
//   updatedAt: Date;
// }

// const certificateSchema = new Schema<ICertificate>(
//   {
//     domain: {
//       type: String,
//       required: true,
//       lowercase: true,
//       trim: true,
//       index: true,
//     },
//     email: {
//       type: String,
//       required: true,
//       lowercase: true,
//       trim: true,
//     },
//     type: {
//       type: String,
//       enum: ["single", "wildcard"],
//       default: "single",
//     },
//     status: {
//       type: String,
//       enum: ["pending", "dns-pending", "validated", "issued", "failed"],
//       default: "pending",
//       index: true,
//     },
//     domains: [
//       {
//         type: String,
//         lowercase: true,
//         trim: true,
//       },
//     ],
//     ipAddress: {
//       type: String,
//       required: true,
//     },
//     challenges: [
//       {
//         domain: String,
//         type: String,
//         status: {
//           type: String,
//           enum: ["pending", "valid", "invalid"],
//           default: "pending",
//         },
//         token: String,
//         keyAuthorization: String,
//         dnsRecord: {
//           name: String,
//           type: String,
//           value: String,
//           ttl: Number,
//         },
//         validatedAt: Date,
//         error: String,
//       },
//     ],
//     certificateIssued: {
//       type: Boolean,
//       default: false,
//     },
//     issuedAt: Date,
//     expiresAt: {
//       type: Date,
//       index: true,
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// // Indexes for performance
// certificateSchema.index({ domain: 1, createdAt: -1 });
// certificateSchema.index({ ipAddress: 1, createdAt: -1 });
// certificateSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

// // Create the model with proper typing
// const Certificate: Model<ICertificate> =
//   mongoose.models.Certificate ||
//   mongoose.model<ICertificate>("Certificate", certificateSchema);

// export default Certificate;

// // lib/mongodb/models/Certificate.ts
// import mongoose, { Schema, Document, models } from "mongoose";

// interface ICertificate extends Document {
//   domain: string;
//   email: string;
//   type: "single" | "wildcard";
//   status: "pending" | "dns-pending" | "validated" | "issued" | "failed";
//   domains: string[];
//   ipAddress: string;
//   challenges: Array<{
//     domain: string;
//     type: string;
//     status: "pending" | "valid" | "invalid";
//     token: string;
//     keyAuthorization?: string;
//     dnsRecord?: {
//       name: string;
//       type: string;
//       value: string;
//       ttl: number;
//     };
//     validatedAt?: Date;
//     error?: string;
//   }>;
//   certificateIssued: boolean;
//   issuedAt?: Date;
//   expiresAt?: Date;
//   createdAt: Date;
//   updatedAt: Date;
// }

// const certificateSchema = new Schema<ICertificate>(
//   {
//     domain: {
//       type: String,
//       required: true,
//       lowercase: true,
//       trim: true,
//       index: true,
//     },
//     email: {
//       type: String,
//       required: true,
//       lowercase: true,
//       trim: true,
//     },
//     type: {
//       type: String,
//       enum: ["single", "wildcard"],
//       default: "single",
//     },
//     status: {
//       type: String,
//       enum: ["pending", "dns-pending", "validated", "issued", "failed"],
//       default: "pending",
//       index: true,
//     },
//     domains: [
//       {
//         type: String,
//         lowercase: true,
//         trim: true,
//       },
//     ],
//     ipAddress: {
//       type: String,
//       required: true,
//     },
//     challenges: [
//       {
//         domain: String,
//         type: String,
//         status: {
//           type: String,
//           enum: ["pending", "valid", "invalid"],
//           default: "pending",
//         },
//         token: String,
//         keyAuthorization: String,
//         dnsRecord: {
//           name: String,
//           type: String,
//           value: String,
//           ttl: Number,
//         },
//         validatedAt: Date,
//         error: String,
//       },
//     ],
//     certificateIssued: {
//       type: Boolean,
//       default: false,
//     },
//     issuedAt: Date,
//     expiresAt: {
//       type: Date,
//       index: true,
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// // Indexes for performance
// certificateSchema.index({ domain: 1, createdAt: -1 });
// certificateSchema.index({ ipAddress: 1, createdAt: -1 });
// certificateSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // Auto-delete after 90 days

// // Type-safe model
// const Certificates =
//   models.Certificate ||
//   mongoose.model<ICertificate>("Certificate", certificateSchema);
// export default Certificates;
// export type { ICertificate };
