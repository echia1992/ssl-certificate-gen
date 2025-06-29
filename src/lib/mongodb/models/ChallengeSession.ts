// lib/mongodb/models/ChallengeSession.ts
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IChallengeSession extends Document {
  sessionToken: string;
  certificateId: Types.ObjectId;
  domain: string;
  email: string;
  includeWildcard: boolean;
  acmeOrder: any;
  authorizations: any[];
  challenges: Array<{
    domain: string;
    token: string;
    keyAuthorization: string;
    url: string;
    dnsRecord: {
      name: string;
      type: string;
      value: string;
      ttl: number;
    };
  }>;
  privateKey: string;
  csr: string;
  dnsVerified: boolean;
  dnsVerificationAttempts: number;
  lastDnsCheck?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const challengeSessionSchema = new Schema<IChallengeSession>(
  {
    sessionToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    certificateId: {
      type: Schema.Types.ObjectId,
      ref: "Certificate",
      required: true,
    },
    domain: {
      type: String,
      required: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
    },
    includeWildcard: {
      type: Boolean,
      default: false,
    },
    acmeOrder: {
      type: Schema.Types.Mixed,
      required: true,
    },
    authorizations: [
      {
        type: Schema.Types.Mixed,
      },
    ],
    challenges: [
      {
        domain: {
          type: String,
          required: true,
        },
        token: {
          type: String,
          required: true,
        },
        keyAuthorization: {
          type: String,
          required: true,
        },
        url: {
          type: String,
          required: true,
        },
        dnsRecord: {
          name: {
            type: String,
            required: true,
          },
          type: {
            type: String,
            required: true,
          },
          value: {
            type: String,
            required: true,
          },
          ttl: {
            type: Number,
            required: true,
          },
        },
      },
    ],
    privateKey: {
      type: String,
      required: true,
    },
    csr: {
      type: String,
      required: true,
    },
    dnsVerified: {
      type: Boolean,
      default: false,
    },
    dnsVerificationAttempts: {
      type: Number,
      default: 0,
    },
    lastDnsCheck: Date,
    expiresAt: {
      type: Date,
      default: Date.now,
      expires: 3600, // Auto-delete after 1 hour
    },
  },
  {
    timestamps: true,
  }
);

const ChallengeSession: Model<IChallengeSession> =
  mongoose.models.ChallengeSession ||
  mongoose.model<IChallengeSession>("ChallengeSession", challengeSessionSchema);

export default ChallengeSession;

// // lib/mongodb/models/ChallengeSession.ts
// import mongoose, { Schema, Document, Types, Model } from "mongoose";

// export interface IChallengeSession extends Document {
//   sessionToken: string;
//   certificateId: Types.ObjectId;
//   domain: string;
//   email: string;
//   includeWildcard: boolean;
//   acmeOrder: any;
//   authorizations: any[];
//   challenges: Array<{
//     domain: string;
//     token: string;
//     keyAuthorization: string;
//     url: string;
//     dnsRecord: {
//       name: string;
//       type: string;
//       value: string;
//       ttl: number;
//     };
//   }>;
//   privateKey: string;
//   csr: string;
//   dnsVerified: boolean;
//   dnsVerificationAttempts: number;
//   lastDnsCheck?: Date;
//   expiresAt: Date;
//   createdAt: Date;
//   updatedAt: Date;
// }

// const challengeSessionSchema = new Schema<IChallengeSession>(
//   {
//     sessionToken: {
//       type: String,
//       required: true,
//       unique: true,
//       index: true,
//     },
//     certificateId: {
//       type: Schema.Types.ObjectId,
//       ref: "Certificate",
//       required: true,
//     },
//     domain: {
//       type: String,
//       required: true,
//       lowercase: true,
//     },
//     email: {
//       type: String,
//       required: true,
//       lowercase: true,
//     },
//     includeWildcard: {
//       type: Boolean,
//       default: false,
//     },
//     acmeOrder: {
//       type: Schema.Types.Mixed,
//       required: true,
//     },
//     authorizations: [
//       {
//         type: Schema.Types.Mixed,
//       },
//     ],
//     challenges: [
//       {
//         domain: String,
//         token: String,
//         keyAuthorization: String,
//         url: String,
//         dnsRecord: {
//           name: String,
//           type: String,
//           value: String,
//           ttl: Number,
//         },
//       },
//     ],
//     privateKey: {
//       type: String,
//       required: true,
//     },
//     csr: {
//       type: String,
//       required: true,
//     },
//     dnsVerified: {
//       type: Boolean,
//       default: false,
//     },
//     dnsVerificationAttempts: {
//       type: Number,
//       default: 0,
//     },
//     lastDnsCheck: Date,
//     expiresAt: {
//       type: Date,
//       default: Date.now,
//       expires: 3600,
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// const ChallengeSession: Model<IChallengeSession> =
//   mongoose.models.ChallengeSession ||
//   mongoose.model<IChallengeSession>("ChallengeSession", challengeSessionSchema);

// export default ChallengeSession;

// // // lib/mongodb/models/ChallengeSession.ts
// // import mongoose, { Schema, Document, Types, models } from "mongoose";

// // interface IChallengeSession extends Document {
// //   sessionToken: string;
// //   certificateId: Types.ObjectId;
// //   domain: string;
// //   email: string;
// //   includeWildcard: boolean;
// //   acmeOrder: any;
// //   authorizations: any[];
// //   challenges: Array<{
// //     domain: string;
// //     token: string;
// //     keyAuthorization: string;
// //     url: string;
// //     dnsRecord: {
// //       name: string;
// //       type: string;
// //       value: string;
// //       ttl: number;
// //     };
// //   }>;
// //   privateKey: string;
// //   csr: string;
// //   dnsVerified: boolean;
// //   dnsVerificationAttempts: number;
// //   lastDnsCheck?: Date;
// //   expiresAt: Date;
// //   createdAt: Date;
// //   updatedAt: Date;
// // }

// // const challengeSessionSchema = new Schema<IChallengeSession>(
// //   {
// //     sessionToken: {
// //       type: String,
// //       required: true,
// //       unique: true,
// //       index: true,
// //     },
// //     certificateId: {
// //       type: Schema.Types.ObjectId,
// //       ref: "Certificate",
// //       required: true,
// //     },
// //     domain: {
// //       type: String,
// //       required: true,
// //       lowercase: true,
// //     },
// //     email: {
// //       type: String,
// //       required: true,
// //       lowercase: true,
// //     },
// //     includeWildcard: {
// //       type: Boolean,
// //       default: false,
// //     },
// //     acmeOrder: {
// //       type: Schema.Types.Mixed,
// //       required: true,
// //     },
// //     authorizations: [
// //       {
// //         type: Schema.Types.Mixed,
// //       },
// //     ],
// //     challenges: [
// //       {
// //         domain: String,
// //         token: String,
// //         keyAuthorization: String,
// //         url: String,
// //         dnsRecord: {
// //           name: String,
// //           type: String,
// //           value: String,
// //           ttl: Number,
// //         },
// //       },
// //     ],
// //     privateKey: {
// //       type: String,
// //       required: true,
// //     },
// //     csr: {
// //       type: String,
// //       required: true,
// //     },
// //     dnsVerified: {
// //       type: Boolean,
// //       default: false,
// //     },
// //     dnsVerificationAttempts: {
// //       type: Number,
// //       default: 0,
// //     },
// //     lastDnsCheck: Date,
// //     expiresAt: {
// //       type: Date,
// //       default: Date.now,
// //       expires: 3600, // Auto-delete after 1 hour
// //     },
// //   },
// //   {
// //     timestamps: true,
// //   }
// // );

// // const ChallengeSession =
// //   models?.ChallengeSession ||
// //   mongoose.model<IChallengeSession>("ChallengeSession", challengeSessionSchema);
// // export default ChallengeSession;
// // export type { IChallengeSession };
