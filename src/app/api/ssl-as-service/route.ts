// app/api/ssl-as-service/route.ts - Fixed Version
import { NextRequest, NextResponse } from "next/server";
import * as acme from "acme-client";
import { createHash } from "crypto";
import * as dns from "dns/promises";
import { connectDB } from "../../../lib/mongodb/connection";
import RateLimit from "../../../lib/mongodb/models/RateLimit";
import ChallengeSession from "../../../lib/mongodb/models/ChallengeSession";
import Certificate from "../../../lib/mongodb/models/Certificates";

// Initialize ACME client
let acmeClient: acme.Client;

async function getAcmeClient() {
  if (!acmeClient) {
    acmeClient = new acme.Client({
      directoryUrl:
        process.env.NODE_ENV === "production"
          ? acme.directory.letsencrypt.production
          : acme.directory.letsencrypt.staging,
      accountKey: await acme.crypto.createPrivateKey(),
    });
  }
  return acmeClient;
}

// Rate limiting helper
async function checkRateLimit(
  ipAddress: string,
  domain: string
): Promise<{ allowed: boolean; message?: string }> {
  await connectDB();

  // IP-based rate limiting (10 requests per hour)
  const ipWindowStart = new Date(Date.now() - 3600000);
  const ipLimit = 10;

  const ipRateLimit = await RateLimit.findOne({
    identifier: ipAddress,
    type: "ip",
    endpoint: "/api/ssl-as-service",
    windowStart: { $gte: ipWindowStart },
  });

  if (ipRateLimit) {
    if (
      ipRateLimit.blocked &&
      ipRateLimit.blockedUntil &&
      ipRateLimit.blockedUntil > new Date()
    ) {
      return {
        allowed: false,
        message: `Too many requests. Please try again after ${ipRateLimit.blockedUntil.toLocaleTimeString()}.`,
      };
    }

    if (ipRateLimit.requests >= ipLimit) {
      ipRateLimit.blocked = true;
      ipRateLimit.blockedUntil = new Date(Date.now() + 3600000);
      await ipRateLimit.save();
      return {
        allowed: false,
        message: "Rate limit exceeded. Please try again in 1 hour.",
      };
    }

    ipRateLimit.requests += 1;
    await ipRateLimit.save();
  } else {
    await new RateLimit({
      identifier: ipAddress,
      type: "ip",
      endpoint: "/api/ssl-as-service",
      requests: 1,
      windowStart: new Date(),
    }).save();
  }

  // Domain-based rate limiting (5 certificates per week)
  const domainWindowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const domainLimit = 5;

  const domainCertCount = await Certificate.countDocuments({
    domain: domain.toLowerCase(),
    createdAt: { $gte: domainWindowStart },
    status: { $in: ["issued", "validated"] },
  });

  if (domainCertCount >= domainLimit) {
    return {
      allowed: false,
      message: `Maximum certificates (${domainLimit}) reached for ${domain} this week. Please try again next week.`,
    };
  }

  return { allowed: true };
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const {
      domain,
      email,
      includeWildcard = true,
      step,
      challengeToken,
    } = body;

    // Get IP address
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // Validate inputs
    if (!domain || !email) {
      return NextResponse.json(
        {
          success: false,
          error: "Domain and email are required",
        },
        { status: 400 }
      );
    }

    // Domain validation
    const domainRegex =
      /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid domain format. Please enter a valid domain (e.g., example.com)",
        },
        { status: 400 }
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid email format",
        },
        { status: 400 }
      );
    }

    switch (step) {
      case "generate-challenge":
        const rateCheck = await checkRateLimit(ipAddress, domain);
        if (!rateCheck.allowed) {
          return NextResponse.json(
            {
              success: false,
              error: rateCheck.message,
            },
            { status: 429 }
          );
        }
        return await generateACMEChallenge(
          domain,
          email,
          includeWildcard,
          ipAddress
        );

      case "verify-dns":
        return await verifyDNSRecords(challengeToken);

      case "complete-certificate":
        return await completeCertificateGeneration(challengeToken);

      default:
        return NextResponse.json(
          {
            success: false,
            error:
              "Invalid step. Use: generate-challenge, verify-dns, or complete-certificate",
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("SSL Service error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function generateACMEChallenge(
  domain: string,
  email: string,
  includeWildcard: boolean,
  ipAddress: string
) {
  try {
    const client = await getAcmeClient();

    // Create ACME account
    await client.createAccount({
      termsOfServiceAgreed: true,
      contact: [`mailto:${email}`],
    });

    // Create certificate record
    const certificate = new Certificate({
      domain,
      email,
      type: includeWildcard ? "wildcard" : "single",
      status: "pending",
      domains: includeWildcard ? [domain, `*.${domain}`] : [domain],
      ipAddress,
    });
    await certificate.save();

    const domains = certificate.domains;

    // Create private key and CSR - Fixed the privateKey handling
    const privateKey = await acme.crypto.createPrivateKey();
    let privateKeyPem: string;

    // Handle different return types from createPrivateKey
    if (typeof privateKey === "string") {
      privateKeyPem = privateKey;
    } else if (Buffer.isBuffer(privateKey)) {
      privateKeyPem = privateKey.toString("utf8");
    } else {
      // For KeyObject or other types, convert to PEM
      privateKeyPem = (privateKey as any).export({
        type: "pkcs8",
        format: "pem",
      }) as string;
    }

    const [key, csr] = await acme.crypto.createCsr({
      commonName: domain,
      altNames: domains,
    });

    // Create order
    const order = await client.createOrder({
      identifiers: domains.map((d: any) => ({ type: "dns", value: d })),
    });

    // Get authorizations and create challenges
    const authorizations = await client.getAuthorizations(order);
    const challenges = [];
    const dnsRecords = [];

    for (const authorization of authorizations) {
      const challenge = authorization.challenges.find(
        (c) => c.type === "dns-01"
      );
      if (!challenge) {
        throw new Error(
          `No DNS challenge found for ${authorization.identifier.value}`
        );
      }

      const keyAuthorization = await client.getChallengeKeyAuthorization(
        challenge
      );
      const dnsRecordValue = createHash("sha256")
        .update(keyAuthorization)
        .digest("base64url");

      const domainName = authorization.identifier.value;
      const recordName = `_acme-challenge.${domainName.replace("*.", "")}`;

      const challengeData = {
        domain: domainName,
        token: challenge.token,
        keyAuthorization,
        url: challenge.url,
        dnsRecord: {
          name: recordName,
          type: "TXT",
          value: dnsRecordValue,
          ttl: 300,
        },
      };

      challenges.push(challengeData);
      dnsRecords.push(challengeData.dnsRecord);

      certificate.challenges.push({
        domain: domainName,
        type: "dns-01",
        status: "pending",
        token: challenge.token,
        keyAuthorization,
        dnsRecord: challengeData.dnsRecord,
      });
    }

    // Generate session token
    const sessionToken = `ssl-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Create challenge session
    const session = new ChallengeSession({
      sessionToken,
      certificateId: certificate._id,
      domain,
      email,
      includeWildcard,
      acmeOrder: order,
      authorizations,
      challenges,
      privateKey: privateKeyPem,
      csr: csr.toString(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    await session.save();

    certificate.status = "dns-pending";
    await certificate.save();

    console.log(`✅ Challenge created for ${domain}`);

    return NextResponse.json({
      success: true,
      domain,
      dnsRecords,
      challengeToken: sessionToken,
      expiresIn: "1 hour",
      instructions: [
        "Add the DNS TXT record(s) to your domain's DNS settings",
        "Wait 5-10 minutes for DNS propagation",
        "Click 'Verify DNS Records' to check if records are live",
        "Once verified, click 'Generate SSL Certificate' to get your free 90-day certificate",
      ],
    });
  } catch (error) {
    console.error("ACME challenge error:", error);
    return NextResponse.json(
      {
        success: false,
        error: `Failed to generate challenge: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      { status: 500 }
    );
  }
}
async function verifyDNSRecords(challengeToken: string) {
  if (!challengeToken) {
    return NextResponse.json(
      {
        success: false,
        error: "Challenge token is required",
      },
      { status: 400 }
    );
  }

  const session = await ChallengeSession.findOne({
    sessionToken: challengeToken,
  });

  if (!session) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid or expired challenge token. Please generate a new certificate request.",
      },
      { status: 404 }
    );
  }

  session.dnsVerificationAttempts += 1;
  session.lastDnsCheck = new Date();
  await session.save();

  const results: { [key: string]: boolean } = {};
  const foundRecordsMap: { [key: string]: string[] } = {};
  let allVerified = true;

  console.log(`🔍 Starting DNS verification for ${session.domain}`);
  console.log(`Attempt #${session.dnsVerificationAttempts}`);
  console.log(`Wildcard: ${session.includeWildcard ? "Yes" : "No"}`);

  // Group challenges by DNS record name (important for wildcard)
  const challengesByRecordName: { [key: string]: any[] } = {};
  for (const challenge of session.challenges) {
    const recordName = challenge.dnsRecord.name;
    if (!challengesByRecordName[recordName]) {
      challengesByRecordName[recordName] = [];
    }
    challengesByRecordName[recordName].push(challenge);
  }

  // Verify each DNS record name
  for (const [recordName, challenges] of Object.entries(
    challengesByRecordName
  )) {
    console.log(`\nChecking DNS record: ${recordName}`);
    console.log(`Expected ${challenges.length} value(s) for this record name`);

    const expectedValues = challenges.map((c) => c.dnsRecord.value);
    console.log(`Expected values:`, expectedValues);

    let foundRecords: string[] = [];

    // Try multiple DNS servers
    const dnsServers = ["8.8.8.8", "1.1.1.1", "9.9.9.9", "208.67.222.222"];

    for (const server of dnsServers) {
      try {
        const resolver = new dns.Resolver();
        resolver.setServers([server]);

        console.log(`Trying DNS server ${server}...`);
        const txtRecords = await resolver.resolveTxt(recordName);

        // Flatten the array of arrays that resolveTxt returns
        const flatRecords = txtRecords.map((chunks) => chunks.join(""));
        console.log(
          `Found ${flatRecords.length} TXT record(s) on ${server}:`,
          flatRecords
        );

        if (flatRecords.length > 0) {
          foundRecords = flatRecords;
          break; // Use the first server that returns records
        }
      } catch (error: any) {
        console.log(
          `DNS lookup failed on ${server}:`,
          error.code || error.message
        );
      }
    }

    // Store what we found
    foundRecordsMap[recordName] = foundRecords;

    // Check if all expected values are present
    let recordVerified = true;
    for (const expectedValue of expectedValues) {
      const found = foundRecords.some(
        (record) => record.toLowerCase() === expectedValue.toLowerCase()
      );

      if (!found) {
        recordVerified = false;
        console.log(`❌ Expected value not found: ${expectedValue}`);
      } else {
        console.log(`✅ Found expected value: ${expectedValue}`);
      }
    }

    // Also check for extra records (old challenges)
    const extraRecords = foundRecords.filter(
      (record) =>
        !expectedValues.some(
          (expected) => expected.toLowerCase() === record.toLowerCase()
        )
    );

    if (extraRecords.length > 0) {
      console.log(
        `⚠️ Found ${extraRecords.length} extra TXT record(s):`,
        extraRecords
      );
      console.log(
        `These are likely from old challenges and should be removed!`
      );
    }

    // Mark individual challenges as verified
    for (const challenge of challenges) {
      const isVerified = foundRecords.some(
        (record) =>
          record.toLowerCase() === challenge.dnsRecord.value.toLowerCase()
      );

      results[
        `${challenge.domain}:${challenge.dnsRecord.value.substring(0, 10)}...`
      ] = isVerified;

      if (isVerified) {
        // Update challenge status in certificate
        await Certificate.updateOne(
          {
            _id: session.certificateId,
            "challenges.domain": challenge.domain,
            "challenges.token": challenge.token,
          },
          {
            $set: {
              "challenges.$.status": "valid",
              "challenges.$.validatedAt": new Date(),
            },
          }
        );
      }
    }

    if (!recordVerified) {
      allVerified = false;
    }
  }

  if (allVerified) {
    session.dnsVerified = true;
    await session.save();

    await Certificate.updateOne(
      { _id: session.certificateId },
      { status: "validated" }
    );
  }

  console.log("\nVerification complete:");
  console.log("Results:", results);
  console.log("All verified:", allVerified);

  // Build detailed message
  let message = "";
  if (allVerified) {
    message =
      "✅ All DNS records verified successfully! You can now generate your certificate.";
  } else {
    message = `⏳ DNS verification incomplete (attempt ${session.dnsVerificationAttempts}).\n\n`;

    for (const [recordName, foundRecords] of Object.entries(foundRecordsMap)) {
      const challenges = challengesByRecordName[recordName];
      const expectedValues = challenges.map((c) => c.dnsRecord.value);

      message += `For ${recordName}:\n`;
      message += `- Expected: ${expectedValues.length} record(s)\n`;
      message += `- Found: ${foundRecords.length} record(s)\n`;

      if (foundRecords.length > expectedValues.length) {
        message += `- ⚠️ Extra records detected - please remove old TXT records!\n`;
      }
      message += "\n";
    }

    message += "Please ensure:\n";
    message += "1. You've added ALL the TXT records shown\n";
    message += "2. You've removed any OLD _acme-challenge records\n";
    message += "3. DNS has had time to propagate (5-15 minutes)\n";
  }

  return NextResponse.json({
    success: true,
    domain: session.domain,
    verified: allVerified,
    results,
    foundRecords: foundRecordsMap,
    attempts: session.dnsVerificationAttempts,
    message,
  });
}
// async function verifyDNSRecords(challengeToken: string) {
//   if (!challengeToken) {
//     return NextResponse.json(
//       {
//         success: false,
//         error: "Challenge token is required",
//       },
//       { status: 400 }
//     );
//   }

//   const session = await ChallengeSession.findOne({
//     sessionToken: challengeToken,
//   });

//   if (!session) {
//     return NextResponse.json(
//       {
//         success: false,
//         error:
//           "Invalid or expired challenge token. Please generate a new certificate request.",
//       },
//       { status: 404 }
//     );
//   }

//   session.dnsVerificationAttempts += 1;
//   session.lastDnsCheck = new Date();
//   await session.save();

//   const results: { [key: string]: boolean } = {};
//   let allVerified = true;

//   // DNS resolver setup
//   const resolver = new dns.Resolver();
//   resolver.setServers(["8.8.8.8", "1.1.1.1", "9.9.9.9"]);

//   for (const challenge of session.challenges) {
//     const recordName = challenge.dnsRecord.name;
//     const expectedValue = challenge.dnsRecord.value;
//     let found = false;

//     for (const server of ["8.8.8.8", "1.1.1.1", "9.9.9.9"]) {
//       try {
//         resolver.setServers([server]);
//         const txtRecords = await resolver.resolveTxt(recordName);
//         const flatRecords = txtRecords.map((chunks) => chunks.join(""));

//         if (flatRecords.includes(expectedValue)) {
//           found = true;
//           break;
//         }
//       } catch (error) {
//         // DNS record not found on this server, try next
//       }
//     }

//     results[recordName] = found;

//     if (!found) {
//       allVerified = false;
//     } else {
//       // Update challenge status
//       await Certificate.updateOne(
//         {
//           _id: session.certificateId,
//           "challenges.domain": challenge.domain,
//         },
//         {
//           $set: {
//             "challenges.$.status": "valid",
//             "challenges.$.validatedAt": new Date(),
//           },
//         }
//       );
//     }
//   }

//   if (allVerified) {
//     session.dnsVerified = true;
//     await session.save();

//     await Certificate.updateOne(
//       { _id: session.certificateId },
//       { status: "validated" }
//     );
//   }

//   return NextResponse.json({
//     success: true,
//     domain: session.domain,
//     verified: allVerified,
//     results,
//     attempts: session.dnsVerificationAttempts,
//     message: allVerified
//       ? "✅ All DNS records verified successfully! You can now generate your certificate."
//       : "⏳ DNS records not yet detected. Please wait a few more minutes for DNS propagation and try again.",
//   });
// }

// async function verifyDNSRecords(challengeToken: string) {
//   if (!challengeToken) {
//     return NextResponse.json(
//       {
//         success: false,
//         error: "Challenge token is required",
//       },
//       { status: 400 }
//     );
//   }

//   const session = await ChallengeSession.findOne({
//     sessionToken: challengeToken,
//   });

//   if (!session) {
//     return NextResponse.json(
//       {
//         success: false,
//         error:
//           "Invalid or expired challenge token. Please generate a new certificate request.",
//       },
//       { status: 404 }
//     );
//   }

//   session.dnsVerificationAttempts += 1;
//   session.lastDnsCheck = new Date();
//   await session.save();

//   const results: { [key: string]: boolean } = {};
//   let allVerified = true;

//   console.log(`🔍 Starting DNS verification for ${session.domain}`);
//   console.log(`Attempt #${session.dnsVerificationAttempts}`);

//   for (const challenge of session.challenges) {
//     const recordName = challenge.dnsRecord.name;
//     const expectedValue = challenge.dnsRecord.value;
//     let found = false;

//     console.log(`\nChecking DNS record: ${recordName}`);
//     console.log(`Expected value: ${expectedValue}`);

//     // Try multiple methods to resolve DNS
//     // Method 1: Use dns.resolveTxt with multiple DNS servers
//     const dnsServers = ["8.8.8.8", "1.1.1.1", "9.9.9.9", "208.67.222.222"]; // Added OpenDNS

//     for (const server of dnsServers) {
//       try {
//         const resolver = new dns.Resolver();
//         resolver.setServers([server]);

//         console.log(`Trying DNS server ${server}...`);
//         const txtRecords = await resolver.resolveTxt(recordName);

//         // Flatten the array of arrays that resolveTxt returns
//         const flatRecords = txtRecords.map((chunks) => chunks.join(""));
//         console.log(`Found TXT records on ${server}:`, flatRecords);

//         // Check if any record matches (case-insensitive)
//         if (
//           flatRecords.some(
//             (record) => record.toLowerCase() === expectedValue.toLowerCase()
//           )
//         ) {
//           found = true;
//           console.log(`✅ Match found on ${server}!`);
//           break;
//         }
//       } catch (error: any) {
//         console.log(
//           `❌ DNS lookup failed on ${server}:`,
//           error.code || error.message
//         );
//       }
//     }

//     // Method 2: If not found, try using DNS over HTTPS as fallback
//     if (!found) {
//       console.log("Trying DNS over HTTPS...");
//       try {
//         // Try Cloudflare DNS over HTTPS
//         const cloudflareResponse = await fetch(
//           `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(
//             recordName
//           )}&type=TXT`,
//           {
//             headers: { Accept: "application/dns-json" },
//           }
//         );

//         if (cloudflareResponse.ok) {
//           const data = await cloudflareResponse.json();
//           console.log("Cloudflare DNS response:", data);

//           if (data.Answer) {
//             for (const answer of data.Answer) {
//               if (answer.type === 16) {
//                 // TXT record type
//                 // Remove quotes from the data field
//                 const txtValue = answer.data.replace(/^"|"$/g, "");
//                 console.log(`Found TXT value: ${txtValue}`);

//                 if (txtValue.toLowerCase() === expectedValue.toLowerCase()) {
//                   found = true;
//                   console.log("✅ Match found via Cloudflare DNS!");
//                   break;
//                 }
//               }
//             }
//           }
//         }
//       } catch (error) {
//         console.log("Cloudflare DNS over HTTPS failed:", error);
//       }
//     }

//     // Method 3: Try Google DNS over HTTPS
//     if (!found) {
//       console.log("Trying Google DNS over HTTPS...");
//       try {
//         const googleResponse = await fetch(
//           `https://dns.google/resolve?name=${encodeURIComponent(
//             recordName
//           )}&type=TXT`,
//           {
//             headers: { Accept: "application/json" },
//           }
//         );

//         if (googleResponse.ok) {
//           const data = await googleResponse.json();
//           console.log("Google DNS response:", data);

//           if (data.Answer) {
//             for (const answer of data.Answer) {
//               if (answer.type === 16) {
//                 // TXT record type
//                 // Remove quotes from the data field
//                 const txtValue = answer.data.replace(/^"|"$/g, "");
//                 console.log(`Found TXT value: ${txtValue}`);

//                 if (txtValue.toLowerCase() === expectedValue.toLowerCase()) {
//                   found = true;
//                   console.log("✅ Match found via Google DNS!");
//                   break;
//                 }
//               }
//             }
//           }
//         }
//       } catch (error) {
//         console.log("Google DNS over HTTPS failed:", error);
//       }
//     }

//     results[recordName] = found;

//     if (!found) {
//       allVerified = false;
//       console.log(`❌ Record not found for ${recordName}`);
//     } else {
//       // Update challenge status in certificate
//       await Certificate.updateOne(
//         {
//           _id: session.certificateId,
//           "challenges.domain": challenge.domain,
//         },
//         {
//           $set: {
//             "challenges.$.status": "valid",
//             "challenges.$.validatedAt": new Date(),
//           },
//         }
//       );
//       console.log(`✅ Record verified for ${recordName}`);
//     }
//   }

//   if (allVerified) {
//     session.dnsVerified = true;
//     await session.save();

//     await Certificate.updateOne(
//       { _id: session.certificateId },
//       { status: "validated" }
//     );
//   }

//   console.log("\nVerification complete:");
//   console.log("Results:", results);
//   console.log("All verified:", allVerified);

//   return NextResponse.json({
//     success: true,
//     domain: session.domain,
//     verified: allVerified,
//     results,
//     attempts: session.dnsVerificationAttempts,
//     message: allVerified
//       ? "✅ All DNS records verified successfully! You can now generate your certificate."
//       : `⏳ DNS records not yet detected. This is attempt ${session.dnsVerificationAttempts}. DNS propagation can take up to 48 hours in some cases, but usually completes within 5-15 minutes. Please ensure the TXT records are added exactly as shown.`,
//   });
// }
// Updated completeCertificateGeneration with better DNS validation
// Updated completeCertificateGeneration with better DNS validation
async function completeCertificateGeneration(challengeToken: string) {
  if (!challengeToken) {
    return NextResponse.json(
      {
        success: false,
        error: "Challenge token is required",
      },
      { status: 400 }
    );
  }

  const session = await ChallengeSession.findOne({
    sessionToken: challengeToken,
  });

  if (!session) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid or expired challenge token",
      },
      { status: 404 }
    );
  }

  const certificate = await Certificate.findById(session.certificateId);
  if (!certificate) {
    return NextResponse.json(
      {
        success: false,
        error: "Certificate record not found",
      },
      { status: 404 }
    );
  }
  try {
    if (!session.dnsVerified) {
      return NextResponse.json(
        {
          success: false,
          error: "DNS records not verified. Please verify DNS records first.",
        },
        { status: 400 }
      );
    }

    // Check if this challenge was already attempted
    if (certificate.status === "failed" || certificate.status === "issued") {
      return NextResponse.json(
        {
          success: false,
          error:
            "This challenge has already been used. Please generate a new certificate request.",
        },
        { status: 400 }
      );
    }

    // IMPORTANT: Do a final DNS check before proceeding
    console.log("🔍 Final DNS verification before certificate generation...");

    // Group challenges by record name for wildcard support
    const recordsToCheck: { [key: string]: string[] } = {};

    for (const challenge of session.challenges) {
      const recordName = challenge.dnsRecord.name;
      if (!recordsToCheck[recordName]) {
        recordsToCheck[recordName] = [];
      }
      recordsToCheck[recordName].push(challenge.dnsRecord.value);
    }

    // Verify DNS one more time using authoritative nameservers
    for (const [recordName, expectedValues] of Object.entries(recordsToCheck)) {
      console.log(`\nFinal check for ${recordName}`);

      // Try to get authoritative nameservers for the domain
      const domain = recordName.replace("_acme-challenge.", "");
      let authoritativeNS: string[] = [];

      try {
        const resolver = new dns.Resolver();
        resolver.setServers(["8.8.8.8"]);
        const nsRecords = await resolver.resolveNs(domain);

        // Get IPs for nameservers
        for (const ns of nsRecords.slice(0, 2)) {
          // Check first 2 nameservers
          try {
            const ips = await resolver.resolve4(ns);
            if (ips.length > 0) {
              authoritativeNS.push(ips[0]);
            }
          } catch {}
        }
      } catch (error) {
        console.log(
          "Could not get authoritative nameservers, using public DNS"
        );
      }

      // Check both authoritative and public DNS
      const dnsServers = [
        ...authoritativeNS,
        "8.8.8.8",
        "1.1.1.1",
        "8.8.4.4", // Google Secondary
        "1.0.0.1", // Cloudflare Secondary
      ];

      let foundAllValues = false;
      let foundRecords: string[] = [];

      for (const server of dnsServers) {
        try {
          const resolver = new dns.Resolver();
          resolver.setServers([server]);

          const txtRecords = await resolver.resolveTxt(recordName);
          const flatRecords = txtRecords.map((chunks) => chunks.join(""));

          console.log(`DNS ${server}: Found ${flatRecords.length} TXT records`);

          // Check if all expected values are present
          const allPresent = expectedValues.every((expected) =>
            flatRecords.some((record) => record === expected)
          );

          if (allPresent) {
            foundAllValues = true;
            foundRecords = flatRecords;
            console.log(`✅ All expected values found on ${server}`);
            break;
          }
        } catch (error) {
          console.log(`DNS ${server}: No records found`);
        }
      }

      if (!foundAllValues) {
        console.error(`❌ DNS validation failed for ${recordName}`);
        console.error(`Expected: ${expectedValues.join(", ")}`);
        console.error(`Found: ${foundRecords.join(", ")}`);

        return NextResponse.json(
          {
            success: false,
            error:
              "DNS records validation failed. Let's Encrypt may not be able to see your DNS records yet.",
            details: {
              recordName,
              expected: expectedValues,
              found: foundRecords,
            },
            troubleshooting: [
              "DNS propagation can take longer for some providers (up to 48 hours)",
              "Try using a different DNS provider if possible",
              "Ensure records are added to the authoritative nameserver",
              "Clear DNS cache on your nameservers",
              "Wait at least 30 minutes before retrying",
              "Try generating a certificate without wildcard (single domain only)",
            ],
          },
          { status: 400 }
        );
      }
    }

    console.log(
      "✅ Final DNS verification passed, proceeding with ACME challenge..."
    );

    // Add a delay to ensure global propagation
    console.log("⏳ Waiting 30 seconds for global DNS propagation...");
    await new Promise((resolve) => setTimeout(resolve, 30000));

    const client = await getAcmeClient();
    console.log("🔐 Completing ACME challenges...");

    // Process challenges one by one with better error handling
    for (const challenge of session.challenges) {
      try {
        console.log(`\nProcessing challenge for ${challenge.domain}`);
        console.log(`Challenge URL: ${challenge.url}`);

        // Notify ACME server that we're ready
        await client.completeChallenge({
          url: challenge.url,
          type: "http-01",
          token: "",
          status: "pending",
        });

        console.log("⏳ Waiting for Let's Encrypt validation...");

        // Wait for validation with longer timeout
        try {
          await client.waitForValidStatus({
            url: challenge.url,
            interval: 5000, // Check every 5 seconds
            maxAttempts: 24, // Total 2 minutes
          });

          console.log(`✅ Challenge validated for ${challenge.domain}`);
        } catch (validationError: any) {
          console.error(`❌ Validation failed:`, validationError);

          // Try to get more details about the failure
          if (validationError.message) {
            console.error(`Error details: ${validationError.message}`);
          }

          throw validationError;
        }
      } finally {
        return;
      }
    }
  } catch (error: any) {
    console.log(error);
  }
}

// async function completeCertificateGeneration(challengeToken: string) {
//   if (!challengeToken) {
//     return NextResponse.json(
//       {
//         success: false,
//         error: "Challenge token is required",
//       },
//       { status: 400 }
//     );
//   }

//   const session = await ChallengeSession.findOne({
//     sessionToken: challengeToken,
//   });

//   if (!session) {
//     return NextResponse.json(
//       {
//         success: false,
//         error: "Invalid or expired challenge token",
//       },
//       { status: 404 }
//     );
//   }

//   const certificate = await Certificate.findById(session.certificateId);
//   if (!certificate) {
//     return NextResponse.json(
//       {
//         success: false,
//         error: "Certificate record not found",
//       },
//       { status: 404 }
//     );
//   }

//   try {
//     if (!session.dnsVerified) {
//       return NextResponse.json(
//         {
//           success: false,
//           error: "DNS records not verified. Please verify DNS records first.",
//         },
//         { status: 400 }
//       );
//     }

//     const client = await getAcmeClient();

//     console.log("🔐 Completing ACME challenges...");

//     // Complete each challenge
//     for (const challenge of session.challenges) {
//       try {
//         await client.completeChallenge({
//           url: challenge.url,
//           type: "dns-01", // Fixed: was "http-01"
//           token: challenge.token,
//           status: "pending",
//         });
//         await client.waitForValidStatus({ url: challenge.url });
//         console.log(`✅ Challenge validated for ${challenge.domain}`);
//       } catch (error) {
//         console.error(`❌ Challenge failed for ${challenge.domain}:`, error);

//         certificate.status = "failed";
//         await certificate.save();

//         throw new Error(
//           `Challenge validation failed. Please ensure DNS records are correctly configured.`
//         );
//       }
//     }

//     // Finalize order and get certificate
//     console.log("📝 Finalizing certificate...");
//     const finalizedOrder = await client.finalizeOrder(
//       session.acmeOrder,
//       session.csr
//     );
//     const cert = await client.getCertificate(finalizedOrder);

//     // Parse certificate chain
//     const certParts = cert.split(/(?=-----BEGIN CERTIFICATE-----)/g);
//     const mainCert = certParts[0];
//     const caCerts = certParts.slice(1).join("");

//     const certificateData = {
//       certificate: mainCert,
//       privateKey: session.privateKey,
//       caBundle: caCerts,
//       fullChain: cert,
//     };

//     // Update certificate record
//     certificate.status = "issued";
//     certificate.certificateIssued = true;
//     certificate.issuedAt = new Date();
//     certificate.expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
//     await certificate.save();

//     // Clean up session
//     await ChallengeSession.findByIdAndDelete(session._id);

//     console.log(`🎉 Certificate issued for ${session.domain}`);

//     return NextResponse.json({
//       success: true,
//       domain: session.domain,
//       certificates: certificateData,
//       validFor: 90,
//       expiresAt: certificate.expiresAt,
//       message:
//         "🎉 Your free 90-day SSL certificate has been generated successfully!",
//     });
//   } catch (error) {
//     console.error("Certificate generation error:", error);

//     certificate.status = "failed";
//     await certificate.save();

//     return NextResponse.json(
//       {
//         success: false,
//         error:
//           error instanceof Error
//             ? error.message
//             : "Certificate generation failed",
//         troubleshooting: [
//           "Ensure DNS TXT records are correctly added",
//           "Wait for full DNS propagation (can take up to 15 minutes)",
//           "Check if you've exceeded the weekly limit for this domain",
//           "Try without wildcard if wildcard certificate fails",
//         ],
//       },
//       { status: 500 }
//     );
//   }
// }

// Simple GET endpoint for checking certificate status

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const domain = searchParams.get("domain");

    if (!domain) {
      return NextResponse.json(
        {
          success: false,
          error: "Domain parameter is required",
        },
        { status: 400 }
      );
    }

    // Get recent certificates for this domain
    const recentCertificates = await Certificate.find({
      domain: domain.toLowerCase(),
    })
      .select("status createdAt issuedAt expiresAt certificateIssued")
      .sort({ createdAt: -1 })
      .limit(5);

    // Count certificates issued this week
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weeklyCount = await Certificate.countDocuments({
      domain: domain.toLowerCase(),
      createdAt: { $gte: oneWeekAgo },
      status: { $in: ["issued", "validated"] },
    });

    return NextResponse.json({
      success: true,
      domain,
      weeklyLimit: 5,
      weeklyUsed: weeklyCount,
      canGenerate: weeklyCount < 5,
      recentCertificates,
    });
  } catch (error) {
    console.error("Certificate check error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to check certificate status",
      },
      { status: 500 }
    );
  }
}

// // app/api/ssl-as-service/route.ts - Simplified Free SSL Service
// import { NextRequest, NextResponse } from "next/server";
// import * as acme from "acme-client";
// import { Certificate, createHash } from "crypto";
// import * as dns from "dns/promises";
// import { connectDB } from "../../../lib/mongodb/connection";
// import RateLimit from "../../../lib/mongodb/models/RateLimit";
// import Certificates from "../../../lib/mongodb/models/Certificates";
// import ChallengeSession from "../../../lib/mongodb/models/ChallengeSession";

// // Initialize ACME client
// let acmeClient: acme.Client;

// async function getAcmeClient() {
//   if (!acmeClient) {
//     acmeClient = new acme.Client({
//       directoryUrl:
//         process.env.NODE_ENV === "production"
//           ? acme.directory.letsencrypt.production
//           : acme.directory.letsencrypt.staging,
//       accountKey: await acme.crypto.createPrivateKey(),
//     });
//   }
//   return acmeClient;
// }

// // Rate limiting helper
// async function checkRateLimit(
//   ipAddress: string,
//   domain: string
// ): Promise<{ allowed: boolean; message?: string }> {
//   await connectDB();

//   // IP-based rate limiting (10 requests per hour)
//   const ipWindowStart = new Date(Date.now() - 3600000); // 1 hour
//   const ipLimit = 10;

//   const ipRateLimit = await RateLimit.findOne({
//     identifier: ipAddress,
//     type: "ip",
//     endpoint: "/api/ssl-as-service",
//     windowStart: { $gte: ipWindowStart },
//   }).exec();

//   if (ipRateLimit) {
//     if (
//       ipRateLimit.blocked &&
//       ipRateLimit.blockedUntil &&
//       ipRateLimit.blockedUntil > new Date()
//     ) {
//       return {
//         allowed: false,
//         message: `Too many requests. Please try again after ${ipRateLimit.blockedUntil.toLocaleTimeString()}.`,
//       };
//     }

//     if (ipRateLimit.requests >= ipLimit) {
//       ipRateLimit.blocked = true;
//       ipRateLimit.blockedUntil = new Date(Date.now() + 3600000);
//       await ipRateLimit.save();
//       return {
//         allowed: false,
//         message: "Rate limit exceeded. Please try again in 1 hour.",
//       };
//     }

//     ipRateLimit.requests += 1;
//     await ipRateLimit.save();
//   } else {
//     await new RateLimit({
//       identifier: ipAddress,
//       type: "ip",
//       endpoint: "/api/ssl-as-service",
//       requests: 1,
//       windowStart: new Date(),
//     }).save();
//   }

//   // Domain-based rate limiting (5 certificates per week)
//   const domainWindowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 1 week
//   const domainLimit = 5;

//   const domainCertCount = await Certificates.countDocuments({
//     domain: domain.toLowerCase(),
//     createdAt: { $gte: domainWindowStart },
//     status: { $in: ["issued", "validated"] },
//   }).exec();

//   if (domainCertCount >= domainLimit) {
//     return {
//       allowed: false,
//       message: `Maximum certificates (${domainLimit}) reached for ${domain} this week. Please try again next week.`,
//     };
//   }

//   return { allowed: true };
// }

// export async function POST(request: NextRequest) {
//   try {
//     await connectDB();

//     const body = await request.json();
//     const {
//       domain,
//       email,
//       includeWildcard = true,
//       step,
//       challengeToken,
//     } = body;

//     // Get IP address
//     const ipAddress =
//       request.headers.get("x-forwarded-for")?.split(",")[0] ||
//       request.headers.get("x-real-ip") ||
//       "unknown";

//     // Validate inputs
//     if (!domain || !email) {
//       return NextResponse.json(
//         {
//           success: false,
//           error: "Domain and email are required",
//         },
//         { status: 400 }
//       );
//     }

//     // Domain validation
//     const domainRegex =
//       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
//     if (!domainRegex.test(domain)) {
//       return NextResponse.json(
//         {
//           success: false,
//           error:
//             "Invalid domain format. Please enter a valid domain (e.g., example.com)",
//         },
//         { status: 400 }
//       );
//     }

//     // Email validation
//     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//     if (!emailRegex.test(email)) {
//       return NextResponse.json(
//         {
//           success: false,
//           error: "Invalid email format",
//         },
//         { status: 400 }
//       );
//     }

//     switch (step) {
//       case "generate-challenge":
//         // Check rate limits for new certificate generation
//         const rateCheck = await checkRateLimit(ipAddress, domain);
//         if (!rateCheck.allowed) {
//           return NextResponse.json(
//             {
//               success: false,
//               error: rateCheck.message,
//             },
//             { status: 429 }
//           );
//         }
//         return await generateACMEChallenge(
//           domain,
//           email,
//           includeWildcard,
//           ipAddress
//         );

//       case "verify-dns":
//         return await verifyDNSRecords(challengeToken);

//       case "complete-certificate":
//         return await completeCertificateGeneration(challengeToken);

//       default:
//         return NextResponse.json(
//           {
//             success: false,
//             error:
//               "Invalid step. Use: generate-challenge, verify-dns, or complete-certificate",
//           },
//           { status: 400 }
//         );
//     }
//   } catch (error) {
//     console.error("SSL Service error:", error);
//     return NextResponse.json(
//       {
//         success: false,
//         error: error instanceof Error ? error.message : "Unknown error",
//       },
//       { status: 500 }
//     );
//   }
// }

// async function generateACMEChallenge(
//   domain: string,
//   email: string,
//   includeWildcard: boolean,
//   ipAddress: string
// ) {
//   try {
//     const client = await getAcmeClient();

//     // Create ACME account
//     await client.createAccount({
//       termsOfServiceAgreed: true,
//       contact: [`mailto:${email}`],
//     });

//     // Create certificate record
//     const certificate = new Certificates({
//       domain,
//       email,
//       type: includeWildcard ? "wildcard" : "single",
//       status: "pending",
//       domains: includeWildcard ? [domain, `*.${domain}`] : [domain],
//       ipAddress,
//     });
//     await certificate.save();

//     const domains = certificate.domains;

//     // Create private key and CSR
//     const privateKey = await acme.crypto.createPrivateKey();
//     const privateKeyPem = privateKey
//       .export({
//         type: "pkcs8",
//         format: "pem",
//       })
//       .toString();

//     const [key, csr] = await acme.crypto.createCsr({
//       commonName: domain,
//       altNames: domains,
//     });

//     // Create order
//     const order = await client.createOrder({
//       identifiers: domains.map((d) => ({ type: "dns", value: d })),
//     });

//     // Get authorizations and create challenges
//     const authorizations = await client.getAuthorizations(order);
//     const challenges = [];
//     const dnsRecords = [];

//     for (const authorization of authorizations) {
//       const challenge = authorization.challenges.find(
//         (c) => c.type === "dns-01"
//       );
//       if (!challenge) {
//         throw new Error(
//           `No DNS challenge found for ${authorization.identifier.value}`
//         );
//       }

//       const keyAuthorization = await client.getChallengeKeyAuthorization(
//         challenge
//       );
//       const dnsRecordValue = createHash("sha256")
//         .update(keyAuthorization)
//         .digest("base64url");

//       const domainName = authorization.identifier.value;
//       const recordName = `_acme-challenge.${domainName.replace("*.", "")}`;

//       const challengeData = {
//         domain: domainName,
//         token: challenge.token,
//         keyAuthorization,
//         url: challenge.url,
//         dnsRecord: {
//           name: recordName,
//           type: "TXT",
//           value: dnsRecordValue,
//           ttl: 300,
//         },
//       };

//       challenges.push(challengeData);
//       dnsRecords.push(challengeData.dnsRecord);

//       certificate.challenges.push({
//         domain: domainName,
//         type: "dns-01",
//         status: "pending",
//         token: challenge.token,
//         keyAuthorization,
//         dnsRecord: challengeData.dnsRecord,
//       });
//     }

//     // Generate session token
//     const sessionToken = `ssl-${Date.now()}-${Math.random()
//       .toString(36)
//       .substr(2, 9)}`;

//     // Create challenge session
//     const session = new ChallengeSession({
//       sessionToken,
//       certificateId: certificate._id,
//       domain,
//       email,
//       includeWildcard,
//       acmeOrder: order,
//       authorizations,
//       challenges,
//       privateKey: privateKeyPem,
//       csr: csr.toString(),
//       expiresAt: new Date(Date.now() + 3600000), // 1 hour
//     });
//     await session.save();

//     certificate.status = "dns-pending";
//     await certificate.save();

//     console.log(`✅ Challenge created for ${domain}`);

//     return NextResponse.json({
//       success: true,
//       domain,
//       dnsRecords,
//       challengeToken: sessionToken,
//       expiresIn: "1 hour",
//       instructions: [
//         "Add the DNS TXT record(s) to your domain's DNS settings",
//         "Wait 5-10 minutes for DNS propagation",
//         "Click 'Verify DNS Records' to check if records are live",
//         "Once verified, click 'Generate SSL Certificate' to get your free 90-day certificate",
//       ],
//     });
//   } catch (error) {
//     console.error("ACME challenge error:", error);
//     return NextResponse.json(
//       {
//         success: false,
//         error: `Failed to generate challenge: ${
//           error instanceof Error ? error.message : "Unknown error"
//         }`,
//       },
//       { status: 500 }
//     );
//   }
// }

// async function verifyDNSRecords(challengeToken: string) {
//   if (!challengeToken) {
//     return NextResponse.json(
//       {
//         success: false,
//         error: "Challenge token is required",
//       },
//       { status: 400 }
//     );
//   }

//   const session = await ChallengeSession.findOne({
//     sessionToken: challengeToken,
//   }).exec();
//   if (!session) {
//     return NextResponse.json(
//       {
//         success: false,
//         error:
//           "Invalid or expired challenge token. Please generate a new certificate request.",
//       },
//       { status: 404 }
//     );
//   }

//   session.dnsVerificationAttempts += 1;
//   session.lastDnsCheck = new Date();
//   await session.save();

//   const results: { [key: string]: boolean } = {};
//   let allVerified = true;

//   // DNS resolver setup
//   const resolver = new dns.Resolver();
//   resolver.setServers(["8.8.8.8", "1.1.1.1", "9.9.9.9"]);

//   for (const challenge of session.challenges) {
//     const recordName = challenge.dnsRecord.name;
//     const expectedValue = challenge.dnsRecord.value;
//     let found = false;

//     for (const server of ["8.8.8.8", "1.1.1.1", "9.9.9.9"]) {
//       try {
//         resolver.setServers([server]);
//         const txtRecords = await resolver.resolveTxt(recordName);
//         const flatRecords = txtRecords.map((chunks) => chunks.join(""));

//         if (flatRecords.includes(expectedValue)) {
//           found = true;
//           break;
//         }
//       } catch (error) {
//         // DNS record not found on this server, try next
//       }
//     }

//     results[recordName] = found;

//     if (!found) {
//       allVerified = false;
//     } else {
//       // Update challenge status
//       await Certificate.updateOne(
//         {
//           _id: session.certificateId,
//           "challenges.domain": challenge.domain,
//         },
//         {
//           $set: {
//             "challenges.$.status": "valid",
//             "challenges.$.validatedAt": new Date(),
//           },
//         }
//       ).exec();
//     }
//   }

//   if (allVerified) {
//     session.dnsVerified = true;
//     await session.save();

//     await Certificate.updateOne(
//       { _id: session.certificateId },
//       { status: "validated" }
//     ).exec();
//   }

//   return NextResponse.json({
//     success: true,
//     domain: session.domain,
//     verified: allVerified,
//     results,
//     attempts: session.dnsVerificationAttempts,
//     message: allVerified
//       ? "✅ All DNS records verified successfully! You can now generate your certificate."
//       : "⏳ DNS records not yet detected. Please wait a few more minutes for DNS propagation and try again.",
//   });
// }

// async function completeCertificateGeneration(challengeToken: string) {
//   if (!challengeToken) {
//     return NextResponse.json(
//       {
//         success: false,
//         error: "Challenge token is required",
//       },
//       { status: 400 }
//     );
//   }

//   const session = await ChallengeSession.findOne({
//     sessionToken: challengeToken,
//   }).exec();
//   if (!session) {
//     return NextResponse.json(
//       {
//         success: false,
//         error: "Invalid or expired challenge token",
//       },
//       { status: 404 }
//     );
//   }

//   const certificate = await Certificates.findById(session.certificateId).exec();
//   if (!certificate) {
//     return NextResponse.json(
//       {
//         success: false,
//         error: "Certificate record not found",
//       },
//       { status: 404 }
//     );
//   }

//   try {
//     if (!session.dnsVerified) {
//       return NextResponse.json(
//         {
//           success: false,
//           error: "DNS records not verified. Please verify DNS records first.",
//         },
//         { status: 400 }
//       );
//     }

//     const client = await getAcmeClient();

//     console.log("🔐 Completing ACME challenges...");

//     // Complete each challenge
//     for (const challenge of session.challenges) {
//       try {
//         await client.completeChallenge({
//           url: challenge.url,
//           type: "http-01",
//           token: "",
//           status: "pending",
//         });
//         await client.waitForValidStatus({ url: challenge.url });
//         console.log(`✅ Challenge validated for ${challenge.domain}`);
//       } catch (error) {
//         console.error(`❌ Challenge failed for ${challenge.domain}:`, error);

//         certificate.status = "failed";
//         await certificate.save();

//         throw new Error(
//           `Challenge validation failed. Please ensure DNS records are correctly configured.`
//         );
//       }
//     }

//     // Finalize order and get certificate
//     console.log("📝 Finalizing certificate...");
//     const finalizedOrder = await client.finalizeOrder(
//       session.acmeOrder,
//       session.csr
//     );
//     const cert = await client.getCertificate(finalizedOrder);

//     // Parse certificate chain
//     const certParts = cert.split(/(?=-----BEGIN CERTIFICATE-----)/g);
//     const mainCert = certParts[0];
//     const caCerts = certParts.slice(1).join("");

//     const certificateData = {
//       certificate: mainCert,
//       privateKey: session.privateKey,
//       caBundle: caCerts,
//       fullChain: cert,
//     };

//     // Update certificate record
//     certificate.status = "issued";
//     certificate.certificateIssued = true;
//     certificate.issuedAt = new Date();
//     certificate.expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
//     await certificate.save();

//     // Clean up session
//     await ChallengeSession.findByIdAndDelete({ _id: session._id });

//     console.log(`🎉 Certificate issued for ${session.domain}`);

//     return NextResponse.json({
//       success: true,
//       domain: session.domain,
//       certificates: certificateData,
//       validFor: 90,
//       expiresAt: certificate.expiresAt,
//       message:
//         "🎉 Your free 90-day SSL certificate has been generated successfully!",
//     });
//   } catch (error) {
//     console.error("Certificate generation error:", error);

//     certificate.status = "failed";
//     await certificate.save();

//     return NextResponse.json(
//       {
//         success: false,
//         error:
//           error instanceof Error
//             ? error.message
//             : "Certificate generation failed",
//         troubleshooting: [
//           "Ensure DNS TXT records are correctly added",
//           "Wait for full DNS propagation (can take up to 15 minutes)",
//           "Check if you've exceeded the weekly limit for this domain",
//           "Try without wildcard if wildcard certificate fails",
//         ],
//       },
//       { status: 500 }
//     );
//   }
// }

// // Simple GET endpoint for checking certificate status
// export async function GET(request: NextRequest) {
//   try {
//     await connectDB();

//     const { searchParams } = new URL(request.url);
//     const domain = searchParams.get("domain");

//     if (!domain) {
//       return NextResponse.json(
//         {
//           success: false,
//           error: "Domain parameter is required",
//         },
//         { status: 400 }
//       );
//     }

//     // Get recent certificates for this domain
//     const recentCertificates = await Certificates.find({
//       domain: domain.toLowerCase(),
//     })
//       .select("status createdAt issuedAt expiresAt certificateIssued")
//       .sort("-createdAt")
//       .limit(5)
//       .exec();

//     // Count certificates issued this week
//     const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
//     const weeklyCount = await Certificates.countDocuments({
//       domain: domain.toLowerCase(),
//       createdAt: { $gte: oneWeekAgo },
//       status: { $in: ["issued", "validated"] },
//     }).exec();

//     return NextResponse.json({
//       success: true,
//       domain,
//       weeklyLimit: 5,
//       weeklyUsed: weeklyCount,
//       canGenerate: weeklyCount < 5,
//       recentCertificates,
//     });
//   } catch (error) {
//     console.error("Certificate check error:", error);
//     return NextResponse.json(
//       {
//         success: false,
//         error: "Failed to check certificate status",
//       },
//       { status: 500 }
//     );
//   }
// }

// // app/api/ssl-as-service/route.ts - PRODUCTION READY VERSION
// import { NextRequest, NextResponse } from "next/server";
// import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
// import path from "path";
// import { execSync } from "child_process";

// interface SSLServiceRequest {
//   domain: string;
//   email: string;
//   includeWildcard?: boolean;
//   step: "generate-challenge" | "complete-certificate" | "verify-dns";
//   challengeToken?: string;
//   dnsVerified?: boolean; // Add this field
// }

// // Store challenge data (use Redis/Database in production)
// const challengeStore = new Map<string, any>();

// export async function POST(request: NextRequest) {
//   console.log("🚀 SSL Service API called");

//   try {
//     const body: SSLServiceRequest = await request.json();
//     const {
//       domain,
//       email,
//       includeWildcard = true,
//       step,
//       challengeToken,
//       dnsVerified,
//     } = body;

//     // Validate inputs
//     if (!domain || !email) {
//       return NextResponse.json(
//         {
//           success: false,
//           error: "Domain and email are required",
//           troubleshooting: ["Please provide both domain and email"],
//         },
//         { status: 400 }
//       );
//     }

//     // Validate domain format
//     const domainRegex =
//       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
//     if (!domainRegex.test(domain)) {
//       return NextResponse.json(
//         {
//           success: false,
//           error: "Invalid domain format",
//           troubleshooting: ["Domain should be in format: example.com"],
//         },
//         { status: 400 }
//       );
//     }

//     switch (step) {
//       case "generate-challenge":
//         return await generateDNSChallenge(domain, email, includeWildcard);
//       case "verify-dns":
//         return await verifyDNSRecords(domain, challengeToken);
//       case "complete-certificate":
//         return await generateCertificateFixed(
//           domain,
//           email,
//           includeWildcard,
//           challengeToken,
//           dnsVerified
//         );
//       default:
//         return NextResponse.json(
//           {
//             success: false,
//             error: "Invalid step parameter",
//             troubleshooting: [
//               "Use: generate-challenge, verify-dns, or complete-certificate",
//             ],
//           },
//           { status: 400 }
//         );
//     }
//   } catch (error) {
//     console.error("❌ SSL Service error:", error);
//     return NextResponse.json(
//       {
//         success: false,
//         error: `Internal server error: ${
//           error instanceof Error ? error.message : "Unknown error"
//         }`,
//         troubleshooting: ["Check server logs", "Verify system requirements"],
//       },
//       { status: 500 }
//     );
//   }
// }

// async function generateDNSChallenge(
//   domain: string,
//   email: string,
//   includeWildcard: boolean
// ) {
//   console.log(`📋 Generating DNS challenge for: ${domain}`);

//   try {
//     // Check system requirements first
//     try {
//       execSync("which certbot", { encoding: "utf8" });
//     } catch {
//       return NextResponse.json({
//         success: false,
//         error: "Certbot not installed",
//         troubleshooting: ["Install certbot: sudo apt install certbot"],
//       });
//     }

//     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
//     const challengeToken = `challenge-${Date.now()}-${Math.random()
//       .toString(36)
//       .substr(2, 9)}`;

//     // Register with Let's Encrypt if needed
//     try {
//       execSync(
//         `sudo certbot register --agree-tos --email "${email}" --non-interactive`,
//         {
//           timeout: 30000,
//         }
//       );
//     } catch (regError) {
//       console.log("ℹ️ Registration result:", regError);
//     }

//     // Generate realistic challenge values
//     const dnsRecords = domains.map((d) => {
//       const challengeDomain = d.startsWith("*.") ? d.substring(2) : d;
//       const chars =
//         "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
//       let challengeValue = "";
//       for (let i = 0; i < 43; i++) {
//         challengeValue += chars.charAt(
//           Math.floor(Math.random() * chars.length)
//         );
//       }

//       return {
//         name: `_acme-challenge.${challengeDomain}`,
//         type: "TXT",
//         value: challengeValue,
//         ttl: 300,
//       };
//     });

//     // Store challenge data
//     challengeStore.set(challengeToken, {
//       domain,
//       email,
//       includeWildcard,
//       dnsRecords,
//       timestamp: Date.now(),
//     });

//     console.log(`✅ DNS challenge generated for ${domain}`);

//     return NextResponse.json({
//       success: true,
//       step: "awaiting-dns",
//       domain,
//       dnsRecords,
//       challengeToken,
//       instructions: [
//         `Add DNS TXT records for ${domain}`,
//         "Wait 5-10 minutes for DNS propagation",
//         "Use 'Verify DNS Records' to check when ready",
//         "Only proceed after successful verification",
//       ],
//       nextStep: "Add DNS records, then verify",
//     });
//   } catch (error) {
//     return NextResponse.json({
//       success: false,
//       error: `Failed to generate challenge: ${
//         error instanceof Error ? error.message : "Unknown"
//       }`,
//       troubleshooting: ["Check certbot installation", "Verify email format"],
//     });
//   }
// }

// async function verifyDNSRecords(domain: string, challengeToken?: string) {
//   console.log(`🔍 Verifying DNS records for: ${domain}`);

//   if (!challengeToken || !challengeStore.has(challengeToken)) {
//     return NextResponse.json({
//       success: false,
//       error: "Invalid or expired challenge token",
//       troubleshooting: ["Generate a new challenge"],
//     });
//   }

//   const challengeData = challengeStore.get(challengeToken);
//   const results: { [key: string]: boolean } = {};
//   let allVerified = true;

//   for (const record of challengeData.dnsRecords) {
//     let recordFound = false;

//     try {
//       // Try dig first (most reliable)
//       const digOutput = execSync(`dig +short TXT "${record.name}" @8.8.8.8`, {
//         encoding: "utf8",
//         timeout: 10000,
//       });

//       const txtRecords = digOutput
//         .split("\n")
//         .map((line) => line.trim().replace(/^"|"$/g, ""))
//         .filter((line) => line.length > 0);

//       recordFound = txtRecords.some((txt) => txt === record.value);
//       console.log(
//         `📋 DNS check for ${record.name}: ${
//           recordFound ? "FOUND" : "NOT FOUND"
//         }`
//       );
//     } catch (digError) {
//       console.log(`⚠️ dig failed for ${record.name}, trying DNS over HTTPS...`);

//       // Fallback to DNS over HTTPS
//       try {
//         const response = await fetch(
//           `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(
//             record.name
//           )}&type=TXT`,
//           {
//             headers: { Accept: "application/dns-json" },
//             signal: AbortSignal.timeout(10000),
//           }
//         );

//         if (response.ok) {
//           const dnsData = await response.json();
//           if (dnsData.Answer) {
//             recordFound = dnsData.Answer.some(
//               (answer: any) =>
//                 answer.type === 16 &&
//                 answer.data.replace(/^"|"$/g, "") === record.value
//             );
//           }
//         }
//       } catch (httpError) {
//         console.log(`⚠️ DNS over HTTPS also failed for ${record.name}`);
//       }
//     }

//     results[record.name] = recordFound;
//     if (!recordFound) allVerified = false;
//   }

//   return NextResponse.json({
//     success: true,
//     step: "dns-verification",
//     domain,
//     verified: allVerified,
//     results,
//     message: allVerified
//       ? "All DNS records verified successfully!"
//       : "Some DNS records are not yet propagated. Please wait and try again.",
//   });
// }

// async function generateCertificateFixed(
//   domain: string,
//   email: string,
//   includeWildcard: boolean,
//   challengeToken?: string,
//   frontendDnsVerified?: boolean
// ) {
//   console.log(`🔐 Generating certificate for: ${domain}`);

//   if (!challengeToken || !challengeStore.has(challengeToken)) {
//     return NextResponse.json({
//       success: false,
//       error: "Invalid or expired challenge token",
//       troubleshooting: ["Generate a new challenge"],
//     });
//   }

//   try {
//     // Final DNS verification
//     const verifyResponse = await verifyDNSRecords(domain, challengeToken);
//     const verifyData = await verifyResponse.json();

//     if (!verifyData.verified) {
//       return NextResponse.json({
//         success: false,
//         error: "DNS records not verified",
//         troubleshooting: [
//           "Use 'Verify DNS Records' button first",
//           "Wait for DNS propagation",
//           "Check DNS records manually",
//         ],
//       });
//     }

//     const certName =
//       domain.replace(/\./g, "-") + (includeWildcard ? "-wildcard" : "");

//     // For DNS challenge, we always use manual mode (never standalone)
//     // Create auth hooks for DNS challenge automation
//     const hookDir = "/tmp/certbot-hooks";
//     mkdirSync(hookDir, { recursive: true });

//     // Create a working auth hook that doesn't do anything (DNS already configured)
//     const authHookPath = path.join(hookDir, `auth-${Date.now()}.sh`);
//     writeFileSync(
//       authHookPath,
//       `#!/bin/bash
// echo "DNS challenge auth hook called for $CERTBOT_DOMAIN"
// echo "Challenge value: $CERTBOT_VALIDATION"
// # DNS records are already configured manually by the user
// sleep 2
// exit 0
// `
//     );

//     const cleanupHookPath = path.join(hookDir, `cleanup-${Date.now()}.sh`);
//     writeFileSync(
//       cleanupHookPath,
//       `#!/bin/bash
// echo "DNS challenge cleanup hook called for $CERTBOT_DOMAIN"
// # No cleanup needed since DNS records were added manually
// exit 0
// `
//     );

//     execSync(`chmod +x "${authHookPath}" "${cleanupHookPath}"`);

//     // Build domain list
//     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
//     const domainFlags = domains.map((d) => `-d "${d}"`).join(" ");

//     // ALWAYS use manual DNS challenge (never standalone for DNS challenges)
//     const certbotCommand = `sudo certbot certonly \\
//       --manual \\
//       --preferred-challenges dns \\
//       --manual-auth-hook "${authHookPath}" \\
//       --manual-cleanup-hook "${cleanupHookPath}" \\
//       --agree-tos \\
//       --email "${email}" \\
//       --cert-name "${certName}" \\
//       --non-interactive \\
//       --expand \\
//       --manual-public-ip-logging-ok \\
//       ${domainFlags}`;

//     console.log(`🚀 Running DNS challenge certbot command for ${domain}...`);
//     console.log(`Command: ${certbotCommand}`);

//     try {
//       const output = execSync(certbotCommand, {
//         encoding: "utf8",
//         timeout: 300000, // 5 minutes
//         stdio: ["pipe", "pipe", "pipe"],
//       });

//       console.log("✅ Certbot execution completed");
//       console.log("📋 Output snippet:", output.substring(0, 500));
//     } catch (certbotError) {
//       console.error("❌ Certbot command failed:", certbotError);

//       // Enhanced fallback: try without wildcard if wildcard fails
//       if (includeWildcard) {
//         console.log("🔄 Trying single domain without wildcard...");
//         const fallbackCertName = domain.replace(/\./g, "-");
//         const fallbackCommand = `sudo certbot certonly \\
//           --manual \\
//           --preferred-challenges dns \\
//           --manual-auth-hook "${authHookPath}" \\
//           --manual-cleanup-hook "${cleanupHookPath}" \\
//           --agree-tos \\
//           --email "${email}" \\
//           --cert-name "${fallbackCertName}" \\
//           --non-interactive \\
//           --expand \\
//           --manual-public-ip-logging-ok \\
//           -d "${domain}"`;

//         try {
//           const fallbackOutput = execSync(fallbackCommand, {
//             encoding: "utf8",
//             timeout: 300000,
//           });
//           console.log(
//             "✅ Fallback succeeded:",
//             fallbackOutput.substring(0, 200)
//           );
//           let certificatePath = `/etc/letsencrypt/live/${certName}`;
//           certificatePath = `/etc/letsencrypt/live/${fallbackCertName}`;
//         } catch (fallbackError) {
//           throw new Error(
//             `Both wildcard and single domain DNS challenge failed. Primary error: ${
//               certbotError instanceof Error ? certbotError.message : "Unknown"
//             }. Fallback error: ${
//               fallbackError instanceof Error ? fallbackError.message : "Unknown"
//             }`
//           );
//         }
//       } else {
//         // For single domain failure, provide detailed error
//         throw new Error(
//           `DNS challenge failed for ${domain}. Error: ${
//             certbotError instanceof Error ? certbotError.message : "Unknown"
//           }`
//         );
//       }
//     }
//     let certificatePath = `/etc/letsencrypt/live/${certName}`;
//     // Set the certificate path (remove duplicate declaration)
//     certificatePath = `/etc/letsencrypt/live/${certName}`;

//     // Determine certificate path

//     // If original path doesn't exist, try alternatives
//     if (!existsSync(certificatePath)) {
//       const alternatives = [
//         `/etc/letsencrypt/live/${domain.replace(/\./g, "-")}`,
//         `/etc/letsencrypt/live/${domain}`,
//       ];

//       for (const altPath of alternatives) {
//         if (existsSync(altPath)) {
//           certificatePath = altPath;
//           break;
//         }
//       }
//     }

//     if (!existsSync(certificatePath)) {
//       // List available certificates for debugging
//       try {
//         const listOutput = execSync("sudo ls -la /etc/letsencrypt/live/", {
//           encoding: "utf8",
//         });
//         console.log("📋 Available certificates:", listOutput);
//       } catch {}

//       throw new Error(
//         `Certificate not found. Expected path: ${certificatePath}`
//       );
//     }

//     console.log(`📂 Reading certificates from: ${certificatePath}`);

//     // Read certificate files
//     const certificates = {
//       certificate: readFileSync(path.join(certificatePath, "cert.pem"), "utf8"),
//       privateKey: readFileSync(
//         path.join(certificatePath, "privkey.pem"),
//         "utf8"
//       ),
//       caBundle: readFileSync(path.join(certificatePath, "chain.pem"), "utf8"),
//       fullChain: readFileSync(
//         path.join(certificatePath, "fullchain.pem"),
//         "utf8"
//       ),
//     };

//     // Clean up
//     challengeStore.delete(challengeToken);

//     console.log(`🎉 SSL certificates generated successfully for ${domain}`);

//     return NextResponse.json({
//       success: true,
//       step: "certificates-ready",
//       domain,
//       certificates,
//       installationInstructions: [
//         "🎉 SSL Certificates generated successfully!",
//         "Install in your hosting control panel:",
//         "1. Certificate (CRT): Use 'certificate' content",
//         "2. Private Key (KEY): Use 'privateKey' content",
//         "3. CA Bundle: Use 'caBundle' content",
//         "4. Test SSL: https://www.ssllabs.com/ssltest/",
//         "5. Set up auto-renewal (90-day expiry)",
//       ],
//     });
//   } catch (error) {
//     console.error("❌ Certificate generation error:", error);

//     return NextResponse.json({
//       success: false,
//       error: `Certificate generation failed: ${
//         error instanceof Error ? error.message : "Unknown error"
//       }`,
//       troubleshooting: [
//         "Verify DNS records are correctly configured",
//         "Check DNS propagation: dig TXT _acme-challenge.yourdomain.com @8.8.8.8",
//         "Ensure no Let's Encrypt rate limiting (5 certs/week/domain)",
//         "Check certbot logs: sudo tail -100 /var/log/letsencrypt/letsencrypt.log",
//         "Try without wildcard option first",
//         "Verify domain is accessible from internet",
//         "Check server permissions for certbot",
//         "Wait for DNS propagation (up to 15 minutes)",
//       ],
//     });
//   }
// }

// // Cleanup old challenge data
// setInterval(() => {
//   const now = Date.now();
//   for (const [token, data] of challengeStore.entries()) {
//     if (now - data.timestamp > 3600000) {
//       // 1 hour
//       challengeStore.delete(token);
//     }
//   }
// }, 300000); // Clean up every 5 minutes
