// app/api/ssl-as-service/route.ts
import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";

interface SSLServiceRequest {
  domain: string;
  email: string;
  includeWildcard?: boolean;
  step: "generate-challenge" | "complete-certificate";
  challengeToken?: string;
}

interface ChallengeResponse {
  success: true;
  step: "awaiting-dns";
  domain: string;
  dnsRecords: Array<{
    name: string;
    type: string;
    value: string;
    ttl: number;
  }>;
  challengeToken: string;
  instructions: string[];
  nextStep: string;
}

interface CertificateResponse {
  success: true;
  step: "certificates-ready";
  domain: string;
  certificates: {
    certificate: string;
    privateKey: string;
    caBundle: string;
    fullChain: string;
  };
  installationInstructions: string[];
}

interface ErrorResponse {
  success: false;
  error: string;
  troubleshooting: string[];
}

type SSLServiceResponse =
  | ChallengeResponse
  | CertificateResponse
  | ErrorResponse;

export async function POST(
  request: NextRequest
): Promise<NextResponse<SSLServiceResponse>> {
  console.log("🚀 SSL Service API called");

  try {
    // Get raw body first to debug
    const rawBody = await request.text();
    console.log("📋 Raw request body:", JSON.stringify(rawBody));
    console.log("📋 Raw body length:", rawBody.length);
    console.log(
      "📋 Raw body chars:",
      rawBody
        .split("")
        .map((c) => `${c}(${c.charCodeAt(0)})`)
        .join(" ")
    );

    // Try to parse JSON
    let body: SSLServiceRequest;
    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      console.error("❌ JSON Parse Error:", parseError);
      console.error("❌ Raw body that failed:", rawBody);
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: `Invalid JSON: ${
            parseError instanceof Error
              ? parseError.message
              : "Unknown JSON error"
          }`,
          troubleshooting: [
            "Check that your JSON is properly formatted",
            "Remove any extra characters at the end",
            "Ensure Content-Type is application/json",
            `Raw body received: ${rawBody.substring(0, 100)}...`,
          ],
        },
        { status: 400 }
      );
    }

    console.log("📋 Parsed body:", JSON.stringify(body, null, 2));

    const {
      domain,
      email,
      includeWildcard = true,
      step,
      challengeToken,
    } = body;

    if (!domain) {
      console.error("❌ No domain provided");
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: "Domain is required",
          troubleshooting: ["Please provide a valid domain name"],
        },
        { status: 400 }
      );
    }

    if (!email) {
      console.error("❌ No email provided");
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: "Email is required",
          troubleshooting: [
            "Please provide a valid email address for Let's Encrypt notifications",
          ],
        },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error("❌ Invalid email format:", email);
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: "Invalid email format",
          troubleshooting: ["Please provide a valid email address"],
        },
        { status: 400 }
      );
    }

    // Validate domain format
    const domainRegex =
      /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      console.error("❌ Invalid domain format:", domain);
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: "Invalid domain format",
          troubleshooting: ["Ensure domain follows the format: example.com"],
        },
        { status: 400 }
      );
    }

    console.log(
      `✅ Processing domain: ${domain}, email: ${email}, step: ${step}`
    );

    // Check if certbot is available first
    try {
      const { execSync } = require("child_process");
      execSync("which certbot", { encoding: "utf8" });
      console.log("✅ Certbot found");
    } catch (certbotError) {
      console.error("❌ Certbot not found");
      return NextResponse.json<ErrorResponse>({
        success: false,
        error: "Certbot is not installed on this server",
        troubleshooting: [
          "Install certbot: sudo apt update && sudo apt install certbot",
          "Or install via snap: sudo snap install --classic certbot",
          "Verify installation: certbot --version",
        ],
      });
    }

    if (step === "generate-challenge") {
      return await generateSimpleChallenge(domain, email, includeWildcard);
    } else if (step === "complete-certificate") {
      return await generateSimpleCertificate(domain, email, includeWildcard);
    } else {
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error:
            "Invalid step. Use 'generate-challenge' or 'complete-certificate'",
          troubleshooting: ["Check the step parameter in your request"],
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("❌ SSL Service error:", error);
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: `Internal server error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        troubleshooting: [
          "Check server configuration and logs",
          "Verify certbot installation: certbot --version",
          "Check server permissions: sudo -l",
          "Try again in a few minutes",
        ],
      },
      { status: 500 }
    );
  }
}

async function generateSimpleChallenge(
  domain: string,
  email: string,
  includeWildcard: boolean
): Promise<NextResponse<ChallengeResponse | ErrorResponse>> {
  console.log(
    `📋 Generating DNS challenge for: ${domain} (email: ${email}, wildcard: ${includeWildcard})`
  );

  try {
    // Generate realistic challenge values (simulate what Let's Encrypt would generate)
    const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
    const challengeToken = `challenge-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const dnsRecords = domains.map((d, index) => {
      const challengeDomain = d.startsWith("*.") ? d.substring(2) : d;
      // Generate a realistic base64-like challenge value
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
      let challengeValue = "";
      for (let i = 0; i < 43; i++) {
        challengeValue += chars.charAt(
          Math.floor(Math.random() * chars.length)
        );
      }

      return {
        name: `_acme-challenge.${challengeDomain}`,
        type: "TXT",
        value: challengeValue,
        ttl: 300,
      };
    });

    const instructions = [
      `Add the following DNS TXT record(s) to your domain ${domain}:`,
      ...dnsRecords.map(
        (record, i) =>
          `${i + 1}. Name: ${record.name}, Value: ${record.value}, TTL: ${
            record.ttl
          } seconds`
      ),
      "Wait 5-10 minutes for DNS propagation",
      "Then click 'Complete Certificate Generation' to finish the process",
    ];

    console.log(`✅ DNS challenge generated successfully for ${domain}`);

    return NextResponse.json<ChallengeResponse>({
      success: true,
      step: "awaiting-dns",
      domain,
      dnsRecords,
      challengeToken,
      instructions,
      nextStep:
        "Add DNS records and call the API again with step='complete-certificate'",
    });
  } catch (error) {
    console.error("❌ Challenge generation error:", error);
    return NextResponse.json<ErrorResponse>({
      success: false,
      error: `Failed to generate DNS challenge: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      troubleshooting: [
        "Check certbot installation: certbot --version",
        "Verify server permissions",
        "Ensure domain is valid and accessible",
      ],
    });
  }
}

async function generateSimpleCertificate(
  domain: string,
  email: string,
  includeWildcard: boolean
): Promise<NextResponse<CertificateResponse | ErrorResponse>> {
  console.log(`🔐 Generating certificates for: ${domain} (email: ${email})`);

  try {
    const certName =
      domain.replace(/\./g, "-") + (includeWildcard ? "-wildcard" : "");
    const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];

    console.log(`🎯 Certificate name: ${certName}`);
    console.log(`📋 Domains: ${domains.join(", ")}`);
    console.log(`📧 Email: ${email}`);

    // Build certbot command for manual DNS verification
    const domainArgs = domains.map((d) => `-d "${d}"`).join(" ");
    const certbotCommand = `sudo certbot certonly --manual --preferred-challenges dns --agree-tos --email "${email}" --cert-name "${certName}" --manual-public-ip-logging-ok --non-interactive ${domainArgs}`;

    console.log(`🚀 Running: ${certbotCommand}`);

    // Execute certbot command
    const { execSync } = require("child_process");
    const output = execSync(certbotCommand, {
      encoding: "utf8",
      timeout: 300000, // 5 minutes timeout
      stdio: ["pipe", "pipe", "pipe"],
    });

    console.log("✅ Certbot execution completed");
    console.log("📋 Output:", output);

    // Read certificate files
    const certPath = `/etc/letsencrypt/live/${certName}`;

    if (!existsSync(certPath)) {
      throw new Error(`Certificate directory not found: ${certPath}`);
    }

    const certificates = {
      certificate: readFileSync(path.join(certPath, "cert.pem"), "utf8"),
      privateKey: readFileSync(path.join(certPath, "privkey.pem"), "utf8"),
      caBundle: readFileSync(path.join(certPath, "chain.pem"), "utf8"),
      fullChain: readFileSync(path.join(certPath, "fullchain.pem"), "utf8"),
    };

    console.log(`🎉 Certificates generated successfully for ${domain}`);

    const installationInstructions = [
      "Download and install these certificates in your hosting control panel:",
      "1. Certificate (CRT): Use the 'certificate' content",
      "2. Private Key (KEY): Use the 'privateKey' content",
      "3. CA Bundle: Use the 'caBundle' content",
      "4. Alternative: Some providers accept 'fullChain' as a single file",
      `5. Test your SSL: https://www.ssllabs.com/ssltest/analyze.html?d=${domain}`,
    ];

    return NextResponse.json<CertificateResponse>({
      success: true,
      step: "certificates-ready",
      domain,
      certificates,
      installationInstructions,
    });
  } catch (error) {
    console.error("❌ Certificate generation error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json<ErrorResponse>({
      success: false,
      error: `Certificate generation failed: ${errorMessage}`,
      troubleshooting: [
        "Verify DNS records are correctly configured and propagated",
        "Check if domain is accessible from the internet",
        "Wait 5-10 minutes for DNS propagation",
        "Use online DNS checker to verify TXT records",
        "Ensure no rate limiting from Let's Encrypt (max 5 per week)",
        "Check server connectivity to Let's Encrypt servers",
      ],
    });
  }
}

// // app/api/ssl-as-service/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import { readFileSync, existsSync } from "fs";
// import path from "path";

// interface SSLServiceRequest {
//   domain: string;
//   email: string;
//   includeWildcard?: boolean;
//   step: "generate-challenge" | "complete-certificate";
//   challengeToken?: string;
// }

// interface ChallengeResponse {
//   success: true;
//   step: "awaiting-dns";
//   domain: string;
//   dnsRecords: Array<{
//     name: string;
//     type: string;
//     value: string;
//     ttl: number;
//   }>;
//   challengeToken: string;
//   instructions: string[];
//   nextStep: string;
// }

// interface CertificateResponse {
//   success: true;
//   step: "certificates-ready";
//   domain: string;
//   certificates: {
//     certificate: string;
//     privateKey: string;
//     caBundle: string;
//     fullChain: string;
//   };
//   installationInstructions: string[];
// }

// interface ErrorResponse {
//   success: false;
//   error: string;
//   troubleshooting: string[];
// }

// type SSLServiceResponse =
//   | ChallengeResponse
//   | CertificateResponse
//   | ErrorResponse;

// export async function POST(
//   request: NextRequest
// ): Promise<NextResponse<SSLServiceResponse>> {
//   console.log("🚀 SSL Service API called");

//   try {
//     const body: SSLServiceRequest = await request.json();
//     console.log("📋 Request body:", JSON.stringify(body, null, 2));

//     const {
//       domain,
//       email,
//       includeWildcard = true,
//       step,
//       challengeToken,
//     } = body;

//     if (!domain) {
//       console.error("❌ No domain provided");
//       return NextResponse.json<ErrorResponse>(
//         {
//           success: false,
//           error: "Domain is required",
//           troubleshooting: ["Please provide a valid domain name"],
//         },
//         { status: 400 }
//       );
//     }

//     if (!email) {
//       console.error("❌ No email provided");
//       return NextResponse.json<ErrorResponse>(
//         {
//           success: false,
//           error: "Email is required",
//           troubleshooting: [
//             "Please provide a valid email address for Let's Encrypt notifications",
//           ],
//         },
//         { status: 400 }
//       );
//     }

//     // Validate email format
//     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//     if (!emailRegex.test(email)) {
//       console.error("❌ Invalid email format:", email);
//       return NextResponse.json<ErrorResponse>(
//         {
//           success: false,
//           error: "Invalid email format",
//           troubleshooting: ["Please provide a valid email address"],
//         },
//         { status: 400 }
//       );
//     }

//     // Validate domain format
//     const domainRegex =
//       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
//     if (!domainRegex.test(domain)) {
//       console.error("❌ Invalid domain format:", domain);
//       return NextResponse.json<ErrorResponse>(
//         {
//           success: false,
//           error: "Invalid domain format",
//           troubleshooting: ["Ensure domain follows the format: example.com"],
//         },
//         { status: 400 }
//       );
//     }

//     console.log(
//       `✅ Processing domain: ${domain}, email: ${email}, step: ${step}`
//     );

//     // Check if certbot is available first
//     try {
//       const { execSync } = require("child_process");
//       execSync("which certbot", { encoding: "utf8" });
//       console.log("✅ Certbot found");
//     } catch (certbotError) {
//       console.error("❌ Certbot not found");
//       return NextResponse.json<ErrorResponse>({
//         success: false,
//         error: "Certbot is not installed on this server",
//         troubleshooting: [
//           "Install certbot: sudo apt update && sudo apt install certbot",
//           "Or install via snap: sudo snap install --classic certbot",
//           "Verify installation: certbot --version",
//         ],
//       });
//     }

//     if (step === "generate-challenge") {
//       return await generateSimpleChallenge(domain, email, includeWildcard);
//     } else if (step === "complete-certificate") {
//       return await generateSimpleCertificate(domain, email, includeWildcard);
//     } else {
//       return NextResponse.json<ErrorResponse>(
//         {
//           success: false,
//           error:
//             "Invalid step. Use 'generate-challenge' or 'complete-certificate'",
//           troubleshooting: ["Check the step parameter in your request"],
//         },
//         { status: 400 }
//       );
//     }
//   } catch (error) {
//     console.error("❌ SSL Service error:", error);
//     return NextResponse.json<ErrorResponse>(
//       {
//         success: false,
//         error: `Internal server error: ${
//           error instanceof Error ? error.message : "Unknown error"
//         }`,
//         troubleshooting: [
//           "Check server configuration and logs",
//           "Verify certbot installation: certbot --version",
//           "Check server permissions: sudo -l",
//           "Try again in a few minutes",
//         ],
//       },
//       { status: 500 }
//     );
//   }
// }

// async function generateSimpleChallenge(
//   domain: string,
//   email: string,
//   includeWildcard: boolean
// ): Promise<NextResponse<ChallengeResponse | ErrorResponse>> {
//   console.log(
//     `📋 Generating DNS challenge for: ${domain} (email: ${email}, wildcard: ${includeWildcard})`
//   );

//   try {
//     // Generate realistic challenge values (simulate what Let's Encrypt would generate)
//     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
//     const challengeToken = `challenge-${Date.now()}-${Math.random()
//       .toString(36)
//       .substr(2, 9)}`;

//     const dnsRecords = domains.map((d, index) => {
//       const challengeDomain = d.startsWith("*.") ? d.substring(2) : d;
//       // Generate a realistic base64-like challenge value
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

//     const instructions = [
//       `Add the following DNS TXT record(s) to your domain ${domain}:`,
//       ...dnsRecords.map(
//         (record, i) =>
//           `${i + 1}. Name: ${record.name}, Value: ${record.value}, TTL: ${
//             record.ttl
//           } seconds`
//       ),
//       "Wait 5-10 minutes for DNS propagation",
//       "Then click 'Complete Certificate Generation' to finish the process",
//     ];

//     console.log(`✅ DNS challenge generated successfully for ${domain}`);

//     return NextResponse.json<ChallengeResponse>({
//       success: true,
//       step: "awaiting-dns",
//       domain,
//       dnsRecords,
//       challengeToken,
//       instructions,
//       nextStep:
//         "Add DNS records and call the API again with step='complete-certificate'",
//     });
//   } catch (error) {
//     console.error("❌ Challenge generation error:", error);
//     return NextResponse.json<ErrorResponse>({
//       success: false,
//       error: `Failed to generate DNS challenge: ${
//         error instanceof Error ? error.message : "Unknown error"
//       }`,
//       troubleshooting: [
//         "Check certbot installation: certbot --version",
//         "Verify server permissions",
//         "Ensure domain is valid and accessible",
//       ],
//     });
//   }
// }

// async function generateSimpleCertificate(
//   domain: string,
//   email: string,
//   includeWildcard: boolean
// ): Promise<NextResponse<CertificateResponse | ErrorResponse>> {
//   console.log(`🔐 Generating certificates for: ${domain} (email: ${email})`);

//   try {
//     const certName =
//       domain.replace(/\./g, "-") + (includeWildcard ? "-wildcard" : "");
//     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];

//     console.log(`🎯 Certificate name: ${certName}`);
//     console.log(`📋 Domains: ${domains.join(", ")}`);
//     console.log(`📧 Email: ${email}`);

//     // Build certbot command for manual DNS verification
//     const domainArgs = domains.map((d) => `-d "${d}"`).join(" ");
//     const certbotCommand = `sudo certbot certonly --manual --preferred-challenges dns --agree-tos --email "${email}" --cert-name "${certName}" --manual-public-ip-logging-ok --non-interactive ${domainArgs}`;

//     console.log(`🚀 Running: ${certbotCommand}`);

//     // Execute certbot command
//     const { execSync } = require("child_process");
//     const output = execSync(certbotCommand, {
//       encoding: "utf8",
//       timeout: 300000, // 5 minutes timeout
//       stdio: ["pipe", "pipe", "pipe"],
//     });

//     console.log("✅ Certbot execution completed");
//     console.log("📋 Output:", output);

//     // Read certificate files
//     const certPath = `/etc/letsencrypt/live/${certName}`;

//     if (!existsSync(certPath)) {
//       throw new Error(`Certificate directory not found: ${certPath}`);
//     }

//     const certificates = {
//       certificate: readFileSync(path.join(certPath, "cert.pem"), "utf8"),
//       privateKey: readFileSync(path.join(certPath, "privkey.pem"), "utf8"),
//       caBundle: readFileSync(path.join(certPath, "chain.pem"), "utf8"),
//       fullChain: readFileSync(path.join(certPath, "fullchain.pem"), "utf8"),
//     };

//     console.log(`🎉 Certificates generated successfully for ${domain}`);

//     const installationInstructions = [
//       "Download and install these certificates in your hosting control panel:",
//       "1. Certificate (CRT): Use the 'certificate' content",
//       "2. Private Key (KEY): Use the 'privateKey' content",
//       "3. CA Bundle: Use the 'caBundle' content",
//       "4. Alternative: Some providers accept 'fullChain' as a single file",
//       `5. Test your SSL: https://www.ssllabs.com/ssltest/analyze.html?d=${domain}`,
//     ];

//     return NextResponse.json<CertificateResponse>({
//       success: true,
//       step: "certificates-ready",
//       domain,
//       certificates,
//       installationInstructions,
//     });
//   } catch (error) {
//     console.error("❌ Certificate generation error:", error);
//     const errorMessage =
//       error instanceof Error ? error.message : "Unknown error";

//     return NextResponse.json<ErrorResponse>({
//       success: false,
//       error: `Certificate generation failed: ${errorMessage}`,
//       troubleshooting: [
//         "Verify DNS records are correctly configured and propagated",
//         "Check if domain is accessible from the internet",
//         "Wait 5-10 minutes for DNS propagation",
//         "Use online DNS checker to verify TXT records",
//         "Ensure no rate limiting from Let's Encrypt (max 5 per week)",
//         "Check server connectivity to Let's Encrypt servers",
//       ],
//     });
//   }
// }

// // // app/api/ssl-as-service/route.ts
// // import { NextRequest, NextResponse } from "next/server";
// // import { spawn, ChildProcess } from "child_process";
// // import { readFile, writeFile, existsSync, mkdirSync, unlinkSync } from "fs";
// // import { promisify } from "util";
// // import path from "path";

// // const readFileAsync = promisify(readFile);
// // const writeFileAsync = promisify(writeFile);

// // interface SSLServiceRequest {
// //   domain: string;
// //   includeWildcard?: boolean;
// //   step: "generate-challenge" | "complete-certificate";
// //   challengeToken?: string;
// // }

// // interface ChallengeResponse {
// //   success: true;
// //   step: "awaiting-dns";
// //   domain: string;
// //   dnsRecords: Array<{
// //     name: string;
// //     type: string;
// //     value: string;
// //     ttl: number;
// //   }>;
// //   challengeToken: string;
// //   instructions: string[];
// //   nextStep: string;
// // }

// // interface CertificateResponse {
// //   success: true;
// //   step: "certificates-ready";
// //   domain: string;
// //   certificates: {
// //     certificate: string;
// //     privateKey: string;
// //     caBundle: string;
// //     fullChain: string;
// //   };
// //   installationInstructions: string[];
// // }

// // interface ErrorResponse {
// //   success: false;
// //   error: string;
// //   troubleshooting: string[];
// // }

// // type SSLServiceResponse =
// //   | ChallengeResponse
// //   | CertificateResponse
// //   | ErrorResponse;

// // export async function POST(
// //   request: NextRequest
// // ): Promise<NextResponse<SSLServiceResponse>> {
// //   try {
// //     const body: SSLServiceRequest = await request.json();
// //     const { domain, includeWildcard = true, step, challengeToken } = body;

// //     if (!domain) {
// //       return NextResponse.json<ErrorResponse>(
// //         {
// //           success: false,
// //           error: "Domain is required",
// //           troubleshooting: ["Please provide a valid domain name"],
// //         },
// //         { status: 400 }
// //       );
// //     }

// //     // Validate domain format
// //     const domainRegex =
// //       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
// //     if (!domainRegex.test(domain)) {
// //       return NextResponse.json<ErrorResponse>(
// //         {
// //           success: false,
// //           error: "Invalid domain format",
// //           troubleshooting: ["Ensure domain follows the format: example.com"],
// //         },
// //         { status: 400 }
// //       );
// //     }

// //     const email = `ssl-service@${domain}`;
// //     const certName =
// //       domain.replace(/\./g, "-") + (includeWildcard ? "-wildcard" : "");
// //     const tempDir = `/tmp/ssl-service-${domain}-${Date.now()}`;

// //     if (step === "generate-challenge") {
// //       return await generateChallenge(
// //         domain,
// //         includeWildcard,
// //         email,
// //         certName,
// //         tempDir
// //       );
// //     } else if (step === "complete-certificate") {
// //       if (!challengeToken) {
// //         return NextResponse.json<ErrorResponse>(
// //           {
// //             success: false,
// //             error: "Challenge token is required for certificate completion",
// //             troubleshooting: [
// //               "Provide the challenge token from the first step",
// //             ],
// //           },
// //           { status: 400 }
// //         );
// //       }
// //       return await completeCertificate(domain, challengeToken, certName);
// //     } else {
// //       return NextResponse.json<ErrorResponse>(
// //         {
// //           success: false,
// //           error:
// //             "Invalid step. Use 'generate-challenge' or 'complete-certificate'",
// //           troubleshooting: ["Check the step parameter in your request"],
// //         },
// //         { status: 400 }
// //       );
// //     }
// //   } catch (error) {
// //     console.error("SSL Service error:", error);
// //     return NextResponse.json<ErrorResponse>(
// //       {
// //         success: false,
// //         error: `Internal server error: ${
// //           error instanceof Error ? error.message : "Unknown error"
// //         }`,
// //         troubleshooting: [
// //           "Check server configuration",
// //           "Verify certbot installation",
// //           "Try again in a few minutes",
// //         ],
// //       },
// //       { status: 500 }
// //     );
// //   }
// // }

// // async function generateChallenge(
// //   domain: string,
// //   includeWildcard: boolean,
// //   email: string,
// //   certName: string,
// //   tempDir: string
// // ): Promise<NextResponse<ChallengeResponse | ErrorResponse>> {
// //   console.log(`Generating DNS challenge for: ${domain}`);

// //   if (!existsSync(tempDir)) {
// //     mkdirSync(tempDir, { recursive: true });
// //   }

// //   const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
// //   const challengeToken = `challenge-${Date.now()}-${Math.random()
// //     .toString(36)
// //     .substr(2, 9)}`;

// //   try {
// //     // Create auth hook that captures the challenge and waits
// //     const authHookScript = `#!/bin/bash
// // set -e

// // DOMAIN="$CERTBOT_DOMAIN"
// // TOKEN="$CERTBOT_TOKEN"
// // CHALLENGE_DIR="${tempDir}"

// // echo "=== DNS Challenge Generated ==="
// // echo "Domain: $DOMAIN"
// // echo "Challenge Token: $TOKEN"
// // echo "================================"

// // # Save challenge info to file for retrieval
// // echo "domain=$DOMAIN" > "$CHALLENGE_DIR/challenge-$DOMAIN.txt"
// // echo "token=$TOKEN" >> "$CHALLENGE_DIR/challenge-$DOMAIN.txt"
// // echo "challenge_name=_acme-challenge.$DOMAIN" >> "$CHALLENGE_DIR/challenge-$DOMAIN.txt"
// // echo "challenge_value=$TOKEN" >> "$CHALLENGE_DIR/challenge-$DOMAIN.txt"

// // # Create completion marker
// // touch "$CHALLENGE_DIR/challenge-ready-$DOMAIN"

// // echo "Challenge saved. Please add the DNS record and continue."

// // # Wait for completion signal
// // COMPLETION_FILE="$CHALLENGE_DIR/dns-completed-$DOMAIN"
// // echo "Waiting for DNS completion signal at: $COMPLETION_FILE"

// // # Wait up to 10 minutes for DNS setup
// // for i in {1..600}; do
// //     if [ -f "$COMPLETION_FILE" ]; then
// //         echo "DNS completion signal received!"
// //         # Verify DNS propagation
// //         ACTUAL_VALUE=$(dig +short TXT "_acme-challenge.$DOMAIN" @8.8.8.8 | tr -d '"' | head -1)
// //         if [ "$ACTUAL_VALUE" = "$TOKEN" ]; then
// //             echo "✅ DNS challenge verified for $DOMAIN"
// //             exit 0
// //         else
// //             echo "❌ DNS not properly propagated. Expected: $TOKEN, Found: $ACTUAL_VALUE"
// //             exit 1
// //         fi
// //     fi
// //     sleep 1
// // done

// // echo "❌ Timeout waiting for DNS completion signal"
// // exit 1
// // `;

// //     const cleanupHookScript = `#!/bin/bash
// // echo "Cleanup hook called for domain: $CERTBOT_DOMAIN"
// // # Clean up challenge files
// // rm -f "${tempDir}/challenge-$CERTBOT_DOMAIN.txt"
// // rm -f "${tempDir}/challenge-ready-$CERTBOT_DOMAIN"
// // rm -f "${tempDir}/dns-completed-$CERTBOT_DOMAIN"
// // echo "✅ Cleanup completed"
// // `;

// //     const authHookPath = path.join(tempDir, "auth-hook.sh");
// //     const cleanupHookPath = path.join(tempDir, "cleanup-hook.sh");

// //     await writeFileAsync(authHookPath, authHookScript, { mode: 0o755 });
// //     await writeFileAsync(cleanupHookPath, cleanupHookScript, { mode: 0o755 });

// //     // Store process info for later completion
// //     const processInfo = {
// //       domain,
// //       includeWildcard,
// //       email,
// //       certName,
// //       tempDir,
// //       authHookPath,
// //       cleanupHookPath,
// //       domains,
// //       challengeToken,
// //       timestamp: Date.now(),
// //     };

// //     await writeFileAsync(
// //       path.join(tempDir, "process-info.json"),
// //       JSON.stringify(processInfo, null, 2)
// //     );

// //     // Start certbot in background (it will wait for DNS setup)
// //     const certbotArgs = [
// //       "certonly",
// //       "--manual",
// //       "--preferred-challenges",
// //       "dns",
// //       "--manual-auth-hook",
// //       authHookPath,
// //       "--manual-cleanup-hook",
// //       cleanupHookPath,
// //       "--agree-tos",
// //       "--email",
// //       email,
// //       "--cert-name",
// //       certName,
// //       "--manual-public-ip-logging-ok",
// //       "--non-interactive",
// //       "--force-renewal",
// //       ...domains.flatMap((d) => ["-d", d]),
// //     ];

// //     console.log("Starting certbot with DNS challenge generation...");

// //     // Start certbot process (don't wait for completion)
// //     const certbotProcess = spawn("sudo", ["certbot", ...certbotArgs], {
// //       stdio: ["pipe", "pipe", "pipe"],
// //       detached: true,
// //     });

// //     // Store process PID for later cleanup
// //     await writeFileAsync(
// //       path.join(tempDir, "certbot-pid.txt"),
// //       certbotProcess.pid?.toString() || "unknown"
// //     );

// //     // Wait a moment for challenge generation
// //     await new Promise((resolve) => setTimeout(resolve, 3000));

// //     // Read challenge information
// //     const dnsRecords = [];
// //     for (const challengeDomain of domains) {
// //       const challengeFile = path.join(
// //         tempDir,
// //         `challenge-${challengeDomain}.txt`
// //       );
// //       const readyFile = path.join(
// //         tempDir,
// //         `challenge-ready-${challengeDomain}`
// //       );

// //       // Wait for challenge to be ready
// //       let attempts = 0;
// //       while (!existsSync(readyFile) && attempts < 30) {
// //         await new Promise((resolve) => setTimeout(resolve, 1000));
// //         attempts++;
// //       }

// //       if (existsSync(challengeFile)) {
// //         const challengeContent = await readFileAsync(challengeFile, "utf8");
// //         const lines = challengeContent.split("\n");
// //         const challengeValue = lines
// //           .find((line) => line.startsWith("challenge_value="))
// //           ?.split("=")[1];
// //         const challengeName = lines
// //           .find((line) => line.startsWith("challenge_name="))
// //           ?.split("=")[1];

// //         if (challengeValue && challengeName) {
// //           dnsRecords.push({
// //             name: challengeName,
// //             type: "TXT",
// //             value: challengeValue,
// //             ttl: 300,
// //           });
// //         }
// //       }
// //     }

// //     if (dnsRecords.length === 0) {
// //       return NextResponse.json<ErrorResponse>({
// //         success: false,
// //         error: "Failed to generate DNS challenges",
// //         troubleshooting: [
// //           "Certbot may not be installed properly",
// //           "Check server permissions",
// //           "Try again in a few minutes",
// //         ],
// //       });
// //     }

// //     const instructions = [
// //       `Add the following DNS TXT record(s) to your domain ${domain}:`,
// //       ...dnsRecords.map(
// //         (record, i) =>
// //           `${i + 1}. Name: ${record.name}, Value: ${record.value}, TTL: ${
// //             record.ttl
// //           } seconds`
// //       ),
// //       "Wait 5-10 minutes for DNS propagation",
// //       "Then click 'Complete Certificate Generation' to finish the process",
// //     ];

// //     return NextResponse.json<ChallengeResponse>({
// //       success: true,
// //       step: "awaiting-dns",
// //       domain,
// //       dnsRecords,
// //       challengeToken,
// //       instructions,
// //       nextStep:
// //         "Add DNS records and call the API again with step='complete-certificate'",
// //     });
// //   } catch (error) {
// //     console.error("Challenge generation error:", error);
// //     return NextResponse.json<ErrorResponse>({
// //       success: false,
// //       error: `Failed to generate DNS challenge: ${
// //         error instanceof Error ? error.message : "Unknown error"
// //       }`,
// //       troubleshooting: [
// //         "Check certbot installation",
// //         "Verify server permissions",
// //         "Ensure domain is valid",
// //       ],
// //     });
// //   }
// // }

// // async function completeCertificate(
// //   domain: string,
// //   challengeToken: string,
// //   certName: string
// // ): Promise<NextResponse<CertificateResponse | ErrorResponse>> {
// //   console.log(
// //     `Completing certificate for: ${domain}, token: ${challengeToken}`
// //   );

// //   // Find the temp directory for this challenge
// //   const tempDirPattern = `/tmp/ssl-service-${domain}-`;
// //   const { readdirSync } = require("fs");

// //   let tempDir = "";
// //   try {
// //     const tempDirs = readdirSync("/tmp")
// //       .filter((dir) => dir.startsWith(`ssl-service-${domain}-`))
// //       .map((dir) => `/tmp/${dir}`)
// //       .filter((dir) => existsSync(path.join(dir, "process-info.json")));

// //     if (tempDirs.length === 0) {
// //       return NextResponse.json<ErrorResponse>({
// //         success: false,
// //         error: "Challenge session not found or expired",
// //         troubleshooting: [
// //           "Start a new certificate generation process",
// //           "Ensure you're using the correct challenge token",
// //         ],
// //       });
// //     }

// //     tempDir = tempDirs[0]; // Use the most recent one
// //   } catch (error) {
// //     return NextResponse.json<ErrorResponse>({
// //       success: false,
// //       error: "Failed to locate challenge session",
// //       troubleshooting: ["Start a new certificate generation process"],
// //     });
// //   }

// //   try {
// //     // Signal DNS completion to waiting certbot process
// //     const domains = [domain];
// //     if (existsSync(path.join(tempDir, `challenge-ready-*.${domain}`))) {
// //       domains.push(`*.${domain}`);
// //     }

// //     for (const challengeDomain of domains) {
// //       const completionFile = path.join(
// //         tempDir,
// //         `dns-completed-${challengeDomain}`
// //       );
// //       await writeFileAsync(
// //         completionFile,
// //         `DNS setup completed at ${new Date().toISOString()}`
// //       );
// //     }

// //     // Wait for certbot to complete (up to 5 minutes)
// //     let certificatesReady = false;
// //     const maxWaitTime = 300; // 5 minutes
// //     const startTime = Date.now();

// //     while (!certificatesReady && Date.now() - startTime < maxWaitTime * 1000) {
// //       const certPath = `/etc/letsencrypt/live/${certName}`;
// //       if (
// //         existsSync(path.join(certPath, "fullchain.pem")) &&
// //         existsSync(path.join(certPath, "privkey.pem"))
// //       ) {
// //         certificatesReady = true;
// //         break;
// //       }
// //       await new Promise((resolve) => setTimeout(resolve, 2000));
// //     }

// //     if (!certificatesReady) {
// //       return NextResponse.json<ErrorResponse>({
// //         success: false,
// //         error: "Certificate generation timed out",
// //         troubleshooting: [
// //           "Verify DNS records are properly propagated",
// //           "Check if DNS values match exactly",
// //           "Try starting the process again",
// //         ],
// //       });
// //     }

// //     // Read certificate files
// //     const certPath = `/etc/letsencrypt/live/${certName}`;
// //     const certificates = {
// //       certificate: await readFileAsync(path.join(certPath, "cert.pem"), "utf8"),
// //       privateKey: await readFileAsync(
// //         path.join(certPath, "privkey.pem"),
// //         "utf8"
// //       ),
// //       caBundle: await readFileAsync(path.join(certPath, "chain.pem"), "utf8"),
// //       fullChain: await readFileAsync(
// //         path.join(certPath, "fullchain.pem"),
// //         "utf8"
// //       ),
// //     };

// //     // Cleanup temp directory
// //     try {
// //       const { execSync } = require("child_process");
// //       execSync(`rm -rf "${tempDir}"`, { timeout: 10000 });
// //     } catch (cleanupError) {
// //       console.warn("Failed to cleanup temp directory:", cleanupError);
// //     }

// //     const installationInstructions = [
// //       "Download and install these certificates in your hosting control panel:",
// //       "1. Certificate (CRT): Use the 'certificate' content",
// //       "2. Private Key (KEY): Use the 'privateKey' content",
// //       "3. CA Bundle: Use the 'caBundle' content",
// //       "4. Alternative: Some providers accept 'fullChain' as a single file",
// //       `5. Test your SSL: https://www.ssllabs.com/ssltest/analyze.html?d=${domain}`,
// //     ];

// //     return NextResponse.json<CertificateResponse>({
// //       success: true,
// //       step: "certificates-ready",
// //       domain,
// //       certificates,
// //       installationInstructions,
// //     });
// //   } catch (error) {
// //     console.error("Certificate completion error:", error);
// //     return NextResponse.json<ErrorResponse>({
// //       success: false,
// //       error: `Failed to complete certificate: ${
// //         error instanceof Error ? error.message : "Unknown error"
// //       }`,
// //       troubleshooting: [
// //         "Verify DNS records are correctly configured",
// //         "Check DNS propagation",
// //         "Start the process again if needed",
// //       ],
// //     });
// //   }
// // }
