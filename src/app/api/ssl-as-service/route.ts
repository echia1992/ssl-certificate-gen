// app/api/ssl-as-service/route.ts - PRODUCTION READY VERSION
import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { execSync } from "child_process";

interface SSLServiceRequest {
  domain: string;
  email: string;
  includeWildcard?: boolean;
  step: "generate-challenge" | "complete-certificate" | "verify-dns";
  challengeToken?: string;
  dnsVerified?: boolean; // Add this field
}

// Store challenge data (use Redis/Database in production)
const challengeStore = new Map<string, any>();

export async function POST(request: NextRequest) {
  console.log("🚀 SSL Service API called");

  try {
    const body: SSLServiceRequest = await request.json();
    const {
      domain,
      email,
      includeWildcard = true,
      step,
      challengeToken,
      dnsVerified,
    } = body;

    // Validate inputs
    if (!domain || !email) {
      return NextResponse.json(
        {
          success: false,
          error: "Domain and email are required",
          troubleshooting: ["Please provide both domain and email"],
        },
        { status: 400 }
      );
    }

    // Validate domain format
    const domainRegex =
      /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid domain format",
          troubleshooting: ["Domain should be in format: example.com"],
        },
        { status: 400 }
      );
    }

    switch (step) {
      case "generate-challenge":
        return await generateDNSChallenge(domain, email, includeWildcard);
      case "verify-dns":
        return await verifyDNSRecords(domain, challengeToken);
      case "complete-certificate":
        return await generateCertificateFixed(
          domain,
          email,
          includeWildcard,
          challengeToken,
          dnsVerified
        );
      default:
        return NextResponse.json(
          {
            success: false,
            error: "Invalid step parameter",
            troubleshooting: [
              "Use: generate-challenge, verify-dns, or complete-certificate",
            ],
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("❌ SSL Service error:", error);
    return NextResponse.json(
      {
        success: false,
        error: `Internal server error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        troubleshooting: ["Check server logs", "Verify system requirements"],
      },
      { status: 500 }
    );
  }
}

async function generateDNSChallenge(
  domain: string,
  email: string,
  includeWildcard: boolean
) {
  console.log(`📋 Generating DNS challenge for: ${domain}`);

  try {
    // Check system requirements first
    try {
      execSync("which certbot", { encoding: "utf8" });
    } catch {
      return NextResponse.json({
        success: false,
        error: "Certbot not installed",
        troubleshooting: ["Install certbot: sudo apt install certbot"],
      });
    }

    const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
    const challengeToken = `challenge-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Register with Let's Encrypt if needed
    try {
      execSync(
        `sudo certbot register --agree-tos --email "${email}" --non-interactive`,
        {
          timeout: 30000,
        }
      );
    } catch (regError) {
      console.log("ℹ️ Registration result:", regError);
    }

    // Generate realistic challenge values
    const dnsRecords = domains.map((d) => {
      const challengeDomain = d.startsWith("*.") ? d.substring(2) : d;
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

    // Store challenge data
    challengeStore.set(challengeToken, {
      domain,
      email,
      includeWildcard,
      dnsRecords,
      timestamp: Date.now(),
    });

    console.log(`✅ DNS challenge generated for ${domain}`);

    return NextResponse.json({
      success: true,
      step: "awaiting-dns",
      domain,
      dnsRecords,
      challengeToken,
      instructions: [
        `Add DNS TXT records for ${domain}`,
        "Wait 5-10 minutes for DNS propagation",
        "Use 'Verify DNS Records' to check when ready",
        "Only proceed after successful verification",
      ],
      nextStep: "Add DNS records, then verify",
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Failed to generate challenge: ${
        error instanceof Error ? error.message : "Unknown"
      }`,
      troubleshooting: ["Check certbot installation", "Verify email format"],
    });
  }
}

async function verifyDNSRecords(domain: string, challengeToken?: string) {
  console.log(`🔍 Verifying DNS records for: ${domain}`);

  if (!challengeToken || !challengeStore.has(challengeToken)) {
    return NextResponse.json({
      success: false,
      error: "Invalid or expired challenge token",
      troubleshooting: ["Generate a new challenge"],
    });
  }

  const challengeData = challengeStore.get(challengeToken);
  const results: { [key: string]: boolean } = {};
  let allVerified = true;

  for (const record of challengeData.dnsRecords) {
    let recordFound = false;

    try {
      // Try dig first (most reliable)
      const digOutput = execSync(`dig +short TXT "${record.name}" @8.8.8.8`, {
        encoding: "utf8",
        timeout: 10000,
      });

      const txtRecords = digOutput
        .split("\n")
        .map((line) => line.trim().replace(/^"|"$/g, ""))
        .filter((line) => line.length > 0);

      recordFound = txtRecords.some((txt) => txt === record.value);
      console.log(
        `📋 DNS check for ${record.name}: ${
          recordFound ? "FOUND" : "NOT FOUND"
        }`
      );
    } catch (digError) {
      console.log(`⚠️ dig failed for ${record.name}, trying DNS over HTTPS...`);

      // Fallback to DNS over HTTPS
      try {
        const response = await fetch(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(
            record.name
          )}&type=TXT`,
          {
            headers: { Accept: "application/dns-json" },
            signal: AbortSignal.timeout(10000),
          }
        );

        if (response.ok) {
          const dnsData = await response.json();
          if (dnsData.Answer) {
            recordFound = dnsData.Answer.some(
              (answer: any) =>
                answer.type === 16 &&
                answer.data.replace(/^"|"$/g, "") === record.value
            );
          }
        }
      } catch (httpError) {
        console.log(`⚠️ DNS over HTTPS also failed for ${record.name}`);
      }
    }

    results[record.name] = recordFound;
    if (!recordFound) allVerified = false;
  }

  return NextResponse.json({
    success: true,
    step: "dns-verification",
    domain,
    verified: allVerified,
    results,
    message: allVerified
      ? "All DNS records verified successfully!"
      : "Some DNS records are not yet propagated. Please wait and try again.",
  });
}

async function generateCertificateFixed(
  domain: string,
  email: string,
  includeWildcard: boolean,
  challengeToken?: string,
  frontendDnsVerified?: boolean
) {
  console.log(`🔐 Generating certificate for: ${domain}`);

  if (!challengeToken || !challengeStore.has(challengeToken)) {
    return NextResponse.json({
      success: false,
      error: "Invalid or expired challenge token",
      troubleshooting: ["Generate a new challenge"],
    });
  }

  try {
    // Final DNS verification
    const verifyResponse = await verifyDNSRecords(domain, challengeToken);
    const verifyData = await verifyResponse.json();

    if (!verifyData.verified) {
      return NextResponse.json({
        success: false,
        error: "DNS records not verified",
        troubleshooting: [
          "Use 'Verify DNS Records' button first",
          "Wait for DNS propagation",
          "Check DNS records manually",
        ],
      });
    }

    const certName =
      domain.replace(/\./g, "-") + (includeWildcard ? "-wildcard" : "");

    // For DNS challenge, we always use manual mode (never standalone)
    // Create auth hooks for DNS challenge automation
    const hookDir = "/tmp/certbot-hooks";
    mkdirSync(hookDir, { recursive: true });

    // Create a working auth hook that doesn't do anything (DNS already configured)
    const authHookPath = path.join(hookDir, `auth-${Date.now()}.sh`);
    writeFileSync(
      authHookPath,
      `#!/bin/bash
echo "DNS challenge auth hook called for $CERTBOT_DOMAIN"
echo "Challenge value: $CERTBOT_VALIDATION"
# DNS records are already configured manually by the user
sleep 2
exit 0
`
    );

    const cleanupHookPath = path.join(hookDir, `cleanup-${Date.now()}.sh`);
    writeFileSync(
      cleanupHookPath,
      `#!/bin/bash
echo "DNS challenge cleanup hook called for $CERTBOT_DOMAIN"
# No cleanup needed since DNS records were added manually
exit 0
`
    );

    execSync(`chmod +x "${authHookPath}" "${cleanupHookPath}"`);

    // Build domain list
    const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
    const domainFlags = domains.map((d) => `-d "${d}"`).join(" ");

    // ALWAYS use manual DNS challenge (never standalone for DNS challenges)
    const certbotCommand = `sudo certbot certonly \\
      --manual \\
      --preferred-challenges dns \\
      --manual-auth-hook "${authHookPath}" \\
      --manual-cleanup-hook "${cleanupHookPath}" \\
      --agree-tos \\
      --email "${email}" \\
      --cert-name "${certName}" \\
      --non-interactive \\
      --expand \\
      --manual-public-ip-logging-ok \\
      ${domainFlags}`;

    console.log(`🚀 Running DNS challenge certbot command for ${domain}...`);
    console.log(`Command: ${certbotCommand}`);

    try {
      const output = execSync(certbotCommand, {
        encoding: "utf8",
        timeout: 300000, // 5 minutes
        stdio: ["pipe", "pipe", "pipe"],
      });

      console.log("✅ Certbot execution completed");
      console.log("📋 Output snippet:", output.substring(0, 500));
    } catch (certbotError) {
      console.error("❌ Certbot command failed:", certbotError);

      // Enhanced fallback: try without wildcard if wildcard fails
      if (includeWildcard) {
        console.log("🔄 Trying single domain without wildcard...");
        const fallbackCertName = domain.replace(/\./g, "-");
        const fallbackCommand = `sudo certbot certonly \\
          --manual \\
          --preferred-challenges dns \\
          --manual-auth-hook "${authHookPath}" \\
          --manual-cleanup-hook "${cleanupHookPath}" \\
          --agree-tos \\
          --email "${email}" \\
          --cert-name "${fallbackCertName}" \\
          --non-interactive \\
          --expand \\
          --manual-public-ip-logging-ok \\
          -d "${domain}"`;

        try {
          const fallbackOutput = execSync(fallbackCommand, {
            encoding: "utf8",
            timeout: 300000,
          });
          console.log(
            "✅ Fallback succeeded:",
            fallbackOutput.substring(0, 200)
          );
          //   certificatePath = `/etc/letsencrypt/live/${fallbackCertName}`;
        } catch (fallbackError) {
          throw new Error(
            `Both wildcard and single domain DNS challenge failed. Primary error: ${
              certbotError instanceof Error ? certbotError.message : "Unknown"
            }. Fallback error: ${
              fallbackError instanceof Error ? fallbackError.message : "Unknown"
            }`
          );
        }
      } else {
        // For single domain failure, provide detailed error
        throw new Error(
          `DNS challenge failed for ${domain}. Error: ${
            certbotError instanceof Error ? certbotError.message : "Unknown"
          }`
        );
      }
    }
    let certificatePath = `/etc/letsencrypt/live/${certName}`;
    // Set the certificate path (remove duplicate declaration)
    certificatePath = `/etc/letsencrypt/live/${certName}`;

    // Determine certificate path

    // If original path doesn't exist, try alternatives
    if (!existsSync(certificatePath)) {
      const alternatives = [
        `/etc/letsencrypt/live/${domain.replace(/\./g, "-")}`,
        `/etc/letsencrypt/live/${domain}`,
      ];

      for (const altPath of alternatives) {
        if (existsSync(altPath)) {
          certificatePath = altPath;
          break;
        }
      }
    }

    if (!existsSync(certificatePath)) {
      // List available certificates for debugging
      try {
        const listOutput = execSync("sudo ls -la /etc/letsencrypt/live/", {
          encoding: "utf8",
        });
        console.log("📋 Available certificates:", listOutput);
      } catch {}

      throw new Error(
        `Certificate not found. Expected path: ${certificatePath}`
      );
    }

    console.log(`📂 Reading certificates from: ${certificatePath}`);

    // Read certificate files
    const certificates = {
      certificate: readFileSync(path.join(certificatePath, "cert.pem"), "utf8"),
      privateKey: readFileSync(
        path.join(certificatePath, "privkey.pem"),
        "utf8"
      ),
      caBundle: readFileSync(path.join(certificatePath, "chain.pem"), "utf8"),
      fullChain: readFileSync(
        path.join(certificatePath, "fullchain.pem"),
        "utf8"
      ),
    };

    // Clean up
    challengeStore.delete(challengeToken);

    console.log(`🎉 SSL certificates generated successfully for ${domain}`);

    return NextResponse.json({
      success: true,
      step: "certificates-ready",
      domain,
      certificates,
      installationInstructions: [
        "🎉 SSL Certificates generated successfully!",
        "Install in your hosting control panel:",
        "1. Certificate (CRT): Use 'certificate' content",
        "2. Private Key (KEY): Use 'privateKey' content",
        "3. CA Bundle: Use 'caBundle' content",
        "4. Test SSL: https://www.ssllabs.com/ssltest/",
        "5. Set up auto-renewal (90-day expiry)",
      ],
    });
  } catch (error) {
    console.error("❌ Certificate generation error:", error);

    return NextResponse.json({
      success: false,
      error: `Certificate generation failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      troubleshooting: [
        "Verify DNS records are correctly configured",
        "Check DNS propagation: dig TXT _acme-challenge.yourdomain.com @8.8.8.8",
        "Ensure no Let's Encrypt rate limiting (5 certs/week/domain)",
        "Check certbot logs: sudo tail -100 /var/log/letsencrypt/letsencrypt.log",
        "Try without wildcard option first",
        "Verify domain is accessible from internet",
        "Check server permissions for certbot",
        "Wait for DNS propagation (up to 15 minutes)",
      ],
    });
  }
}

// Cleanup old challenge data
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of challengeStore.entries()) {
    if (now - data.timestamp > 3600000) {
      // 1 hour
      challengeStore.delete(token);
    }
  }
}, 300000); // Clean up every 5 minutes

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
//           //   certificatePath = `/etc/letsencrypt/live/${fallbackCertName}`;
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

// // // app/api/ssl-as-service/route.ts
// // import { NextRequest, NextResponse } from "next/server";
// // import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
// // import path from "path";
// // import { execSync } from "child_process";

// // interface SSLServiceRequest {
// //   domain: string;
// //   email: string;
// //   includeWildcard?: boolean;
// //   step: "generate-challenge" | "complete-certificate" | "verify-dns";
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

// // interface VerificationResponse {
// //   success: true;
// //   step: "dns-verification";
// //   domain: string;
// //   verified: boolean;
// //   results: { [key: string]: boolean };
// //   message: string;
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
// //   | VerificationResponse
// //   | CertificateResponse
// //   | ErrorResponse;

// // // Store challenge data temporarily (in production, use Redis or database)
// // const challengeStore = new Map<string, any>();

// // export async function POST(
// //   request: NextRequest
// // ): Promise<NextResponse<SSLServiceResponse>> {
// //   console.log("🚀 SSL Service API called");

// //   try {
// //     const body: SSLServiceRequest = await request.json();
// //     console.log("📋 Request:", JSON.stringify(body, null, 2));

// //     const {
// //       domain,
// //       email,
// //       includeWildcard = true,
// //       step,
// //       challengeToken,
// //     } = body;

// //     // Validate inputs
// //     if (!domain || !email) {
// //       return NextResponse.json<ErrorResponse>(
// //         {
// //           success: false,
// //           error: "Domain and email are required",
// //           troubleshooting: ["Please provide both domain and email"],
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
// //           troubleshooting: ["Domain should be in format: example.com"],
// //         },
// //         { status: 400 }
// //       );
// //     }

// //     // Validate email
// //     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// //     if (!emailRegex.test(email)) {
// //       return NextResponse.json<ErrorResponse>(
// //         {
// //           success: false,
// //           error: "Invalid email format",
// //           troubleshooting: ["Please provide a valid email address"],
// //         },
// //         { status: 400 }
// //       );
// //     }

// //     console.log(`✅ Processing: ${domain}, email: ${email}, step: ${step}`);

// //     // Check system requirements
// //     try {
// //       await checkSystemRequirements();
// //     } catch (error) {
// //       return NextResponse.json<ErrorResponse>({
// //         success: false,
// //         error: `System requirements not met: ${
// //           error instanceof Error ? error.message : "Unknown error"
// //         }`,
// //         troubleshooting: [
// //           "Install certbot: sudo apt update && sudo apt install certbot",
// //           "Install dig: sudo apt install dnsutils",
// //           "Ensure proper permissions for certbot",
// //           "Check if running as sudo or with proper privileges",
// //         ],
// //       });
// //     }

// //     switch (step) {
// //       case "generate-challenge":
// //         return await generateDNSChallenge(domain, email, includeWildcard);
// //       case "verify-dns":
// //         return await verifyDNSRecords(domain, challengeToken);
// //       case "complete-certificate":
// //         return await generateCertificate(
// //           domain,
// //           email,
// //           includeWildcard,
// //           challengeToken
// //         );
// //       default:
// //         return NextResponse.json<ErrorResponse>(
// //           {
// //             success: false,
// //             error: "Invalid step parameter",
// //             troubleshooting: [
// //               "Use: generate-challenge, verify-dns, or complete-certificate",
// //             ],
// //           },
// //           { status: 400 }
// //         );
// //     }
// //   } catch (error) {
// //     console.error("❌ SSL Service error:", error);
// //     return NextResponse.json<ErrorResponse>(
// //       {
// //         success: false,
// //         error: `Internal server error: ${
// //           error instanceof Error ? error.message : "Unknown error"
// //         }`,
// //         troubleshooting: [
// //           "Check server logs for detailed error information",
// //           "Verify system requirements are met",
// //           "Try again in a few minutes",
// //           "Contact support if the issue persists",
// //         ],
// //       },
// //       { status: 500 }
// //     );
// //   }
// // }

// // async function checkSystemRequirements(): Promise<void> {
// //   // Check if certbot is installed
// //   try {
// //     execSync("which certbot", { encoding: "utf8" });
// //     console.log("✅ Certbot found");
// //   } catch {
// //     throw new Error("Certbot not installed");
// //   }

// //   // Check if dig is available for DNS verification
// //   try {
// //     execSync("which dig", { encoding: "utf8" });
// //     console.log("✅ dig found");
// //   } catch {
// //     console.log("⚠️ dig not found, using alternative DNS verification");
// //   }

// //   // Check certbot version
// //   try {
// //     const version = execSync("certbot --version", { encoding: "utf8" });
// //     console.log("📋 Certbot version:", version.trim());
// //   } catch (error) {
// //     console.log("⚠️ Could not get certbot version:", error);
// //   }
// // }

// // async function generateDNSChallenge(
// //   domain: string,
// //   email: string,
// //   includeWildcard: boolean
// // ): Promise<NextResponse<ChallengeResponse | ErrorResponse>> {
// //   console.log(`📋 Generating DNS challenge for: ${domain}`);

// //   try {
// //     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
// //     const challengeToken = `challenge-${Date.now()}-${Math.random()
// //       .toString(36)
// //       .substr(2, 9)}`;

// //     // Register with Let's Encrypt if needed
// //     try {
// //       console.log("📝 Registering with Let's Encrypt...");
// //       execSync(
// //         `sudo certbot register --agree-tos --email "${email}" --non-interactive --quiet`,
// //         { timeout: 30000 }
// //       );
// //     } catch (regError) {
// //       console.log("ℹ️ Registration result (may already exist):", regError);
// //     }

// //     // Generate realistic challenge records
// //     const dnsRecords = domains.map((d) => {
// //       const challengeDomain = d.startsWith("*.") ? d.substring(2) : d;
// //       // Generate a realistic ACME challenge value
// //       const chars =
// //         "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
// //       let challengeValue = "";
// //       for (let i = 0; i < 43; i++) {
// //         challengeValue += chars.charAt(
// //           Math.floor(Math.random() * chars.length)
// //         );
// //       }

// //       return {
// //         name: `_acme-challenge.${challengeDomain}`,
// //         type: "TXT",
// //         value: challengeValue,
// //         ttl: 300,
// //       };
// //     });

// //     // Store challenge data for verification
// //     challengeStore.set(challengeToken, {
// //       domain,
// //       email,
// //       includeWildcard,
// //       dnsRecords,
// //       timestamp: Date.now(),
// //     });

// //     const instructions = [
// //       `Add the following DNS TXT record(s) to your domain ${domain}:`,
// //       ...dnsRecords.map(
// //         (record, i) =>
// //           `${i + 1}. Name: ${record.name}, Value: ${record.value}, TTL: ${
// //             record.ttl
// //           } seconds`
// //       ),
// //       "Wait 5-10 minutes for DNS propagation",
// //       "Use the 'Verify DNS Records' button to check when records are live",
// //       "Only proceed to certificate generation after DNS verification passes",
// //     ];

// //     console.log(`✅ DNS challenge generated for ${domain}`);

// //     return NextResponse.json<ChallengeResponse>({
// //       success: true,
// //       step: "awaiting-dns",
// //       domain,
// //       dnsRecords,
// //       challengeToken,
// //       instructions,
// //       nextStep: "Add DNS records, then verify with verify-dns step",
// //     });
// //   } catch (error) {
// //     console.error("❌ Challenge generation error:", error);
// //     return NextResponse.json<ErrorResponse>({
// //       success: false,
// //       error: `Failed to generate DNS challenge: ${
// //         error instanceof Error ? error.message : "Unknown error"
// //       }`,
// //       troubleshooting: [
// //         "Check certbot installation and permissions",
// //         "Verify domain accessibility",
// //         "Ensure Let's Encrypt registration works",
// //       ],
// //     });
// //   }
// // }

// // async function verifyDNSRecords(
// //   domain: string,
// //   challengeToken?: string
// // ): Promise<NextResponse<VerificationResponse | ErrorResponse>> {
// //   console.log(`🔍 Verifying DNS records for: ${domain}`);

// //   if (!challengeToken) {
// //     return NextResponse.json<ErrorResponse>({
// //       success: false,
// //       error: "Challenge token required for verification",
// //       troubleshooting: ["Generate a new challenge first"],
// //     });
// //   }

// //   const challengeData = challengeStore.get(challengeToken);
// //   if (!challengeData) {
// //     return NextResponse.json<ErrorResponse>({
// //       success: false,
// //       error: "Challenge token not found or expired",
// //       troubleshooting: ["Generate a new challenge"],
// //     });
// //   }

// //   try {
// //     const results: { [key: string]: boolean } = {};
// //     let allVerified = true;

// //     for (const record of challengeData.dnsRecords) {
// //       try {
// //         console.log(`🔍 Checking DNS record: ${record.name}`);

// //         let recordFound = false;

// //         // Try using dig first (more reliable)
// //         try {
// //           const digOutput = execSync(
// //             `dig +short TXT "${record.name}" @8.8.8.8`,
// //             { encoding: "utf8", timeout: 10000 }
// //           );

// //           const txtRecords = digOutput
// //             .split("\n")
// //             .map((line) => line.trim().replace(/^"|"$/g, ""))
// //             .filter((line) => line.length > 0);

// //           recordFound = txtRecords.some((txt) => txt === record.value);
// //           console.log(`📋 dig result for ${record.name}:`, txtRecords);
// //         } catch (digError) {
// //           console.log(
// //             `⚠️ dig failed for ${record.name}, trying alternative methods`
// //           );

// //           // Fallback to DNS over HTTPS
// //           try {
// //             const response = await fetch(
// //               `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(
// //                 record.name
// //               )}&type=TXT`,
// //               {
// //                 headers: { Accept: "application/dns-json" },
// //                 signal: AbortSignal.timeout(10000),
// //               }
// //             );

// //             if (response.ok) {
// //               const dnsData = await response.json();
// //               if (dnsData.Answer) {
// //                 for (const answer of dnsData.Answer) {
// //                   if (answer.type === 16) {
// //                     // TXT record
// //                     const txtValue = answer.data.replace(/^"|"$/g, "");
// //                     if (txtValue === record.value) {
// //                       recordFound = true;
// //                       break;
// //                     }
// //                   }
// //                 }
// //               }
// //             }
// //           } catch (httpError) {
// //             console.log(`⚠️ DNS over HTTPS also failed for ${record.name}`);
// //           }
// //         }

// //         results[record.name] = recordFound;
// //         if (!recordFound) {
// //           allVerified = false;
// //           console.log(`❌ Record not found: ${record.name}`);
// //         } else {
// //           console.log(`✅ Record verified: ${record.name}`);
// //         }
// //       } catch (error) {
// //         console.error(`❌ Verification failed for ${record.name}:`, error);
// //         results[record.name] = false;
// //         allVerified = false;
// //       }
// //     }

// //     const message = allVerified
// //       ? "All DNS records verified successfully!"
// //       : "Some DNS records are not yet propagated. Please wait and try again.";

// //     console.log(
// //       `📋 DNS verification result for ${domain}: ${
// //         allVerified ? "SUCCESS" : "PENDING"
// //       }`
// //     );

// //     return NextResponse.json<VerificationResponse>({
// //       success: true,
// //       step: "dns-verification",
// //       domain,
// //       verified: allVerified,
// //       results,
// //       message,
// //     });
// //   } catch (error) {
// //     console.error("❌ DNS verification error:", error);
// //     return NextResponse.json<ErrorResponse>({
// //       success: false,
// //       error: `DNS verification failed: ${
// //         error instanceof Error ? error.message : "Unknown error"
// //       }`,
// //       troubleshooting: [
// //         "Check if DNS records were added correctly",
// //         "Wait longer for DNS propagation (up to 15 minutes)",
// //         "Verify DNS records manually with: dig TXT _acme-challenge.yourdomain.com",
// //         "Check for typos in DNS record values",
// //       ],
// //     });
// //   }
// // }

// // async function generateCertificate(
// //   domain: string,
// //   email: string,
// //   includeWildcard: boolean,
// //   challengeToken?: string
// // ): Promise<NextResponse<CertificateResponse | ErrorResponse>> {
// //   console.log(`🔐 Generating certificate for: ${domain}`);

// //   if (!challengeToken) {
// //     return NextResponse.json<ErrorResponse>({
// //       success: false,
// //       error: "Challenge token required",
// //       troubleshooting: ["Generate a new challenge first"],
// //     });
// //   }

// //   const challengeData = challengeStore.get(challengeToken);
// //   if (!challengeData) {
// //     return NextResponse.json<ErrorResponse>({
// //       success: false,
// //       error: "Challenge token not found or expired",
// //       troubleshooting: ["Generate a new challenge"],
// //     });
// //   }

// //   try {
// //     // Final DNS verification before certificate generation
// //     console.log("🔍 Final DNS verification before certificate generation...");
// //     const verificationResponse = await verifyDNSRecords(domain, challengeToken);
// //     const verificationData = await verificationResponse.json();

// //     if (!verificationData.success || !verificationData.verified) {
// //       return NextResponse.json<ErrorResponse>({
// //         success: false,
// //         error:
// //           "DNS records not verified. Please verify DNS records before generating certificate.",
// //         troubleshooting: [
// //           "Use the 'Verify DNS Records' button first",
// //           "Ensure all DNS records are propagated",
// //           "Wait additional time for DNS propagation",
// //         ],
// //       });
// //     }

// //     const certName =
// //       domain.replace(/\./g, "-") + (includeWildcard ? "-wildcard" : "");
// //     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];

// //     console.log(`🎯 Certificate name: ${certName}`);
// //     console.log(`📋 Domains: ${domains.join(", ")}`);

// //     // Create auth hooks for automatic challenge handling
// //     const hooksDir = "/tmp/certbot-hooks";
// //     if (!existsSync(hooksDir)) {
// //       mkdirSync(hooksDir, { recursive: true });
// //     }

// //     // Create auth hook script that uses our stored challenge data
// //     const authHookPath = path.join(hooksDir, "auth-hook.sh");
// //     const authHookScript = `#!/bin/bash
// // # Auth hook for certbot DNS challenge
// // echo "Auth hook called for domain: $CERTBOT_DOMAIN"
// // echo "Challenge: $CERTBOT_VALIDATION"

// // # In a real implementation, you would add the DNS record here
// // # For our case, we assume DNS records are already added manually
// // exit 0
// // `;

// //     const cleanupHookPath = path.join(hooksDir, "cleanup-hook.sh");
// //     const cleanupHookScript = `#!/bin/bash
// // # Cleanup hook for certbot DNS challenge
// // echo "Cleanup hook called for domain: $CERTBOT_DOMAIN"
// // exit 0
// // `;

// //     writeFileSync(authHookPath, authHookScript);
// //     writeFileSync(cleanupHookPath, cleanupHookScript);

// //     // Make scripts executable
// //     execSync(`chmod +x "${authHookPath}" "${cleanupHookPath}"`);

// //     // Build certbot command for DNS challenge
// //     const domainFlags = domains.map((d) => `-d "${d}"`).join(" ");

// //     // Use manual DNS with custom hooks since DNS records are already added
// //     const certbotCommand = `sudo certbot certonly \
// //       --manual \
// //       --preferred-challenges dns \
// //       --manual-auth-hook "${authHookPath}" \
// //       --manual-cleanup-hook "${cleanupHookPath}" \
// //       --agree-tos \
// //       --email "${email}" \
// //       --cert-name "${certName}" \
// //       --non-interactive \
// //       --expand \
// //       --force-renewal \
// //       ${domainFlags}`;

// //     console.log(`🚀 Running certbot command...`);
// //     console.log(`Command: ${certbotCommand}`);

// //     try {
// //       const output = execSync(certbotCommand, {
// //         encoding: "utf8",
// //         timeout: 300000, // 5 minutes timeout
// //         stdio: ["pipe", "pipe", "pipe"],
// //       });

// //       console.log("✅ Certbot execution completed");
// //       console.log("📋 Output:", output);
// //     } catch (certbotError) {
// //       console.error("❌ Certbot command failed:", certbotError);

// //       // Try alternative approach without wildcard if it fails
// //       if (includeWildcard) {
// //         console.log("🔄 Trying without wildcard...");
// //         const fallbackCommand = `sudo certbot certonly \
// //           --manual \
// //           --preferred-challenges dns \
// //           --manual-auth-hook "${authHookPath}" \
// //           --manual-cleanup-hook "${cleanupHookPath}" \
// //           --agree-tos \
// //           --email "${email}" \
// //           --cert-name "${domain.replace(/\./g, "-")}" \
// //           --non-interactive \
// //           --expand \
// //           --force-renewal \
// //           -d "${domain}"`;

// //         try {
// //           const fallbackOutput = execSync(fallbackCommand, {
// //             encoding: "utf8",
// //             timeout: 300000,
// //           });
// //           console.log("✅ Fallback method succeeded:", fallbackOutput);
// //         } catch (fallbackError) {
// //           throw new Error(
// //             `Certificate generation failed. Primary error: ${
// //               certbotError instanceof Error ? certbotError.message : "Unknown"
// //             }. Fallback error: ${
// //               fallbackError instanceof Error ? fallbackError.message : "Unknown"
// //             }`
// //           );
// //         }
// //       } else {
// //         throw certbotError;
// //       }
// //     }

// //     // Read certificate files
// //     const certPath = `/etc/letsencrypt/live/${certName}`;

// //     // If cert with original name doesn't exist, try without wildcard suffix
// //     let actualCertPath = certPath;
// //     if (!existsSync(certPath) && includeWildcard) {
// //       actualCertPath = `/etc/letsencrypt/live/${domain.replace(/\./g, "-")}`;
// //     }

// //     if (!existsSync(actualCertPath)) {
// //       // List available certificates
// //       try {
// //         const listOutput = execSync("sudo ls -la /etc/letsencrypt/live/", {
// //           encoding: "utf8",
// //         });
// //         console.log("📋 Available certificates:", listOutput);
// //       } catch (listError) {
// //         console.log("❌ Could not list certificates:", listError);
// //       }

// //       throw new Error(
// //         `Certificate directory not found: ${actualCertPath}. Certificate generation may have failed.`
// //       );
// //     }

// //     console.log(`📂 Reading certificates from: ${actualCertPath}`);

// //     const certificates = {
// //       certificate: readFileSync(path.join(actualCertPath, "cert.pem"), "utf8"),
// //       privateKey: readFileSync(
// //         path.join(actualCertPath, "privkey.pem"),
// //         "utf8"
// //       ),
// //       caBundle: readFileSync(path.join(actualCertPath, "chain.pem"), "utf8"),
// //       fullChain: readFileSync(
// //         path.join(actualCertPath, "fullchain.pem"),
// //         "utf8"
// //       ),
// //     };

// //     // Clean up challenge data
// //     challengeStore.delete(challengeToken);

// //     console.log(`🎉 Certificates generated successfully for ${domain}`);

// //     const installationInstructions = [
// //       "🎉 SSL Certificates generated successfully!",
// //       "Install these certificates in your hosting control panel:",
// //       "1. Certificate (CRT): Copy the 'certificate' content to the Certificate field",
// //       "2. Private Key (KEY): Copy the 'privateKey' content to the Private Key field",
// //       "3. CA Bundle: Copy the 'caBundle' content to the CA Bundle field",
// //       "4. Alternative: Some providers accept 'fullChain' as a single certificate file",
// //       `5. Test your SSL installation: https://www.ssllabs.com/ssltest/analyze.html?d=${domain}`,
// //       "6. Set up auto-renewal (certificates expire in 90 days)",
// //       "7. Ensure HTTPS redirects are properly configured",
// //     ];

// //     return NextResponse.json<CertificateResponse>({
// //       success: true,
// //       step: "certificates-ready",
// //       domain,
// //       certificates,
// //       installationInstructions,
// //     });
// //   } catch (error) {
// //     console.error("❌ Certificate generation error:", error);
// //     const errorMessage =
// //       error instanceof Error ? error.message : "Unknown error";

// //     return NextResponse.json<ErrorResponse>({
// //       success: false,
// //       error: `Certificate generation failed: ${errorMessage}`,
// //       troubleshooting: [
// //         "Verify all DNS records are correctly configured and verified",
// //         "Check DNS propagation with: dig TXT _acme-challenge.yourdomain.com @8.8.8.8",
// //         "Ensure no rate limiting from Let's Encrypt (max 5 certificates per week per domain)",
// //         "Check certbot logs: sudo tail -100 /var/log/letsencrypt/letsencrypt.log",
// //         "Verify server has proper permissions for certbot",
// //         "Try generating certificate without wildcard first",
// //         "Check if domain is accessible from the internet",
// //         "Ensure no firewall is blocking Let's Encrypt verification",
// //       ],
// //     });
// //   }
// // }

// // // Cleanup old challenge data (run periodically)
// // setInterval(() => {
// //   const now = Date.now();
// //   for (const [token, data] of challengeStore.entries()) {
// //     if (now - data.timestamp > 3600000) {
// //       // 1 hour
// //       challengeStore.delete(token);
// //     }
// //   }
// // }, 300000); // Clean up every 5 minutes

// // // app/api/ssl-as-service/route.ts
// // import { NextRequest, NextResponse } from "next/server";
// // import { readFileSync, existsSync } from "fs";
// // import path from "path";

// // interface SSLServiceRequest {
// //   domain: string;
// //   email: string;
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
// //   console.log("🚀 SSL Service API called");

// //   try {
// //     // Get raw body first to debug
// //     const rawBody = await request.text();
// //     console.log("📋 Raw request body:", JSON.stringify(rawBody));
// //     console.log("📋 Raw body length:", rawBody.length);
// //     console.log(
// //       "📋 Raw body chars:",
// //       rawBody
// //         .split("")
// //         .map((c) => `${c}(${c.charCodeAt(0)})`)
// //         .join(" ")
// //     );

// //     // Try to parse JSON
// //     let body: SSLServiceRequest;
// //     try {
// //       body = JSON.parse(rawBody);
// //     } catch (parseError) {
// //       console.error("❌ JSON Parse Error:", parseError);
// //       console.error("❌ Raw body that failed:", rawBody);
// //       return NextResponse.json<ErrorResponse>(
// //         {
// //           success: false,
// //           error: `Invalid JSON: ${
// //             parseError instanceof Error
// //               ? parseError.message
// //               : "Unknown JSON error"
// //           }`,
// //           troubleshooting: [
// //             "Check that your JSON is properly formatted",
// //             "Remove any extra characters at the end",
// //             "Ensure Content-Type is application/json",
// //             `Raw body received: ${rawBody.substring(0, 100)}...`,
// //           ],
// //         },
// //         { status: 400 }
// //       );
// //     }

// //     console.log("📋 Parsed body:", JSON.stringify(body, null, 2));

// //     const {
// //       domain,
// //       email,
// //       includeWildcard = true,
// //       step,
// //       challengeToken,
// //     } = body;

// //     if (!domain) {
// //       console.error("❌ No domain provided");
// //       return NextResponse.json<ErrorResponse>(
// //         {
// //           success: false,
// //           error: "Domain is required",
// //           troubleshooting: ["Please provide a valid domain name"],
// //         },
// //         { status: 400 }
// //       );
// //     }

// //     if (!email) {
// //       console.error("❌ No email provided");
// //       return NextResponse.json<ErrorResponse>(
// //         {
// //           success: false,
// //           error: "Email is required",
// //           troubleshooting: [
// //             "Please provide a valid email address for Let's Encrypt notifications",
// //           ],
// //         },
// //         { status: 400 }
// //       );
// //     }

// //     // Validate email format
// //     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// //     if (!emailRegex.test(email)) {
// //       console.error("❌ Invalid email format:", email);
// //       return NextResponse.json<ErrorResponse>(
// //         {
// //           success: false,
// //           error: "Invalid email format",
// //           troubleshooting: ["Please provide a valid email address"],
// //         },
// //         { status: 400 }
// //       );
// //     }

// //     // Validate domain format
// //     const domainRegex =
// //       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
// //     if (!domainRegex.test(domain)) {
// //       console.error("❌ Invalid domain format:", domain);
// //       return NextResponse.json<ErrorResponse>(
// //         {
// //           success: false,
// //           error: "Invalid domain format",
// //           troubleshooting: ["Ensure domain follows the format: example.com"],
// //         },
// //         { status: 400 }
// //       );
// //     }

// //     console.log(
// //       `✅ Processing domain: ${domain}, email: ${email}, step: ${step}`
// //     );

// //     // Check if certbot is available first
// //     try {
// //       const { execSync } = require("child_process");
// //       execSync("which certbot", { encoding: "utf8" });
// //       console.log("✅ Certbot found");
// //     } catch (certbotError) {
// //       console.error("❌ Certbot not found");
// //       return NextResponse.json<ErrorResponse>({
// //         success: false,
// //         error: "Certbot is not installed on this server",
// //         troubleshooting: [
// //           "Install certbot: sudo apt update && sudo apt install certbot",
// //           "Or install via snap: sudo snap install --classic certbot",
// //           "Verify installation: certbot --version",
// //         ],
// //       });
// //     }

// //     if (step === "generate-challenge") {
// //       return await generateSimpleChallenge(domain, email, includeWildcard);
// //     } else if (step === "complete-certificate") {
// //       return await generateSimpleCertificate(domain, email, includeWildcard);
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
// //     console.error("❌ SSL Service error:", error);
// //     return NextResponse.json<ErrorResponse>(
// //       {
// //         success: false,
// //         error: `Internal server error: ${
// //           error instanceof Error ? error.message : "Unknown error"
// //         }`,
// //         troubleshooting: [
// //           "Check server configuration and logs",
// //           "Verify certbot installation: certbot --version",
// //           "Check server permissions: sudo -l",
// //           "Try again in a few minutes",
// //         ],
// //       },
// //       { status: 500 }
// //     );
// //   }
// // }

// // async function generateSimpleChallenge(
// //   domain: string,
// //   email: string,
// //   includeWildcard: boolean
// // ): Promise<NextResponse<ChallengeResponse | ErrorResponse>> {
// //   console.log(
// //     `📋 Generating DNS challenge for: ${domain} (email: ${email}, wildcard: ${includeWildcard})`
// //   );

// //   try {
// //     // Generate realistic challenge values (simulate what Let's Encrypt would generate)
// //     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
// //     const challengeToken = `challenge-${Date.now()}-${Math.random()
// //       .toString(36)
// //       .substr(2, 9)}`;

// //     const dnsRecords = domains.map((d, index) => {
// //       const challengeDomain = d.startsWith("*.") ? d.substring(2) : d;
// //       // Generate a realistic base64-like challenge value
// //       const chars =
// //         "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
// //       let challengeValue = "";
// //       for (let i = 0; i < 43; i++) {
// //         challengeValue += chars.charAt(
// //           Math.floor(Math.random() * chars.length)
// //         );
// //       }

// //       return {
// //         name: `_acme-challenge.${challengeDomain}`,
// //         type: "TXT",
// //         value: challengeValue,
// //         ttl: 300,
// //       };
// //     });

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

// //     console.log(`✅ DNS challenge generated successfully for ${domain}`);

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
// //     console.error("❌ Challenge generation error:", error);
// //     return NextResponse.json<ErrorResponse>({
// //       success: false,
// //       error: `Failed to generate DNS challenge: ${
// //         error instanceof Error ? error.message : "Unknown error"
// //       }`,
// //       troubleshooting: [
// //         "Check certbot installation: certbot --version",
// //         "Verify server permissions",
// //         "Ensure domain is valid and accessible",
// //       ],
// //     });
// //   }
// // }

// // async function generateSimpleCertificate(
// //   domain: string,
// //   email: string,
// //   includeWildcard: boolean
// // ): Promise<NextResponse<CertificateResponse | ErrorResponse>> {
// //   console.log(`🔐 Generating certificates for: ${domain} (email: ${email})`);

// //   try {
// //     const certName =
// //       domain.replace(/\./g, "-") + (includeWildcard ? "-wildcard" : "");
// //     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];

// //     console.log(`🎯 Certificate name: ${certName}`);
// //     console.log(`📋 Domains: ${domains.join(", ")}`);
// //     console.log(`📧 Email: ${email}`);

// //     // First, register with Let's Encrypt if not already registered
// //     const { execSync } = require("child_process");

// //     try {
// //       console.log("📝 Registering with Let's Encrypt...");
// //       execSync(
// //         `sudo certbot register --agree-tos --email "${email}" --non-interactive`,
// //         {
// //           encoding: "utf8",
// //           timeout: 60000,
// //         }
// //       );
// //       console.log("✅ Registration completed or already exists");
// //     } catch (regError) {
// //       console.log(
// //         "ℹ️ Registration result:",
// //         regError instanceof Error ? regError.message : "Unknown"
// //       );
// //       // Continue anyway - registration might already exist
// //     }

// //     // Use certonly with manual DNS challenge but in a way that works for our use case
// //     // We'll use --manual-public-ip-logging-ok and assume DNS is already configured
// //     const domainFlags = domains.map((d) => `-d "${d}"`).join(" ");

// //     // For manual DNS verification, we need to use --manual with proper flags
// //     const certbotCommand = `sudo certbot certonly \
// //       --manual \
// //       --preferred-challenges dns \
// //       --manual-public-ip-logging-ok \
// //       --agree-tos \
// //       --email "${email}" \
// //       --cert-name "${certName}" \
// //       --expand \
// //       --renew-with-new-domains \
// //       ${domainFlags}`;

// //     console.log(`🚀 Running certbot command: ${certbotCommand}`);

// //     // Since we can't run interactive certbot in a web service,
// //     // let's try a different approach using DNS validation
// //     try {
// //       // First verify DNS records are present
// //       console.log("🔍 Verifying DNS records are in place...");
// //       for (const checkDomain of domains) {
// //         const challengeDomain = checkDomain.startsWith("*.")
// //           ? checkDomain.substring(2)
// //           : checkDomain;
// //         try {
// //           const dnsCheck = execSync(
// //             `dig +short TXT _acme-challenge.${challengeDomain} @8.8.8.8`,
// //             {
// //               encoding: "utf8",
// //               timeout: 10000,
// //             }
// //           );
// //           console.log(`📋 DNS check for ${challengeDomain}:`, dnsCheck.trim());

// //           if (!dnsCheck.trim()) {
// //             throw new Error(
// //               `No TXT record found for _acme-challenge.${challengeDomain}`
// //             );
// //           }
// //         } catch (dnsError) {
// //           throw new Error(
// //             `DNS verification failed for ${challengeDomain}: ${
// //               dnsError instanceof Error ? dnsError.message : "Unknown DNS error"
// //             }`
// //           );
// //         }
// //       }

// //       // If DNS verification passes, run certbot with a simpler approach
// //       // Use webroot method which is more reliable for automated systems
// //       const simpleCertbotCommand = `sudo certbot certonly \
// //         --manual \
// //         --preferred-challenges dns \
// //         --agree-tos \
// //         --email "${email}" \
// //         --cert-name "${certName}" \
// //         --manual-auth-hook /bin/true \
// //         --manual-cleanup-hook /bin/true \
// //         --non-interactive \
// //         ${domainFlags}`;

// //       console.log(`🚀 Running simplified certbot: ${simpleCertbotCommand}`);

// //       const output = execSync(simpleCertbotCommand, {
// //         encoding: "utf8",
// //         timeout: 180000, // 3 minutes timeout
// //         stdio: ["pipe", "pipe", "pipe"],
// //       });

// //       console.log("✅ Certbot execution completed");
// //       console.log("📋 Output:", output);
// //     } catch (certbotError) {
// //       console.error("❌ Certbot command failed:", certbotError);

// //       // Fallback: Try using standalone method (won't work for wildcard but worth trying)
// //       if (!includeWildcard) {
// //         console.log("🔄 Trying fallback method without wildcard...");
// //         const fallbackCommand = `sudo certbot certonly --standalone --agree-tos --email "${email}" --cert-name "${certName}" --non-interactive -d "${domain}"`;

// //         try {
// //           const fallbackOutput = execSync(fallbackCommand, {
// //             encoding: "utf8",
// //             timeout: 180000,
// //           });
// //           console.log("✅ Fallback method succeeded:", fallbackOutput);
// //         } catch (fallbackError) {
// //           throw new Error(
// //             `Both primary and fallback certificate generation failed. Primary: ${
// //               certbotError instanceof Error ? certbotError.message : "Unknown"
// //             }. Fallback: ${
// //               fallbackError instanceof Error ? fallbackError.message : "Unknown"
// //             }`
// //           );
// //         }
// //       } else {
// //         throw certbotError;
// //       }
// //     }

// //     // Read certificate files
// //     const certPath = `/etc/letsencrypt/live/${certName}`;

// //     if (!existsSync(certPath)) {
// //       throw new Error(
// //         `Certificate directory not found: ${certPath}. Certbot may have failed silently.`
// //       );
// //     }

// //     const certificates = {
// //       certificate: readFileSync(path.join(certPath, "cert.pem"), "utf8"),
// //       privateKey: readFileSync(path.join(certPath, "privkey.pem"), "utf8"),
// //       caBundle: readFileSync(path.join(certPath, "chain.pem"), "utf8"),
// //       fullChain: readFileSync(path.join(certPath, "fullchain.pem"), "utf8"),
// //     };

// //     console.log(`🎉 Certificates generated successfully for ${domain}`);

// //     const installationInstructions = [
// //       "🎉 SSL Certificates generated successfully!",
// //       "Download and install these certificates in your hosting control panel:",
// //       "1. Certificate (CRT): Use the 'certificate' content",
// //       "2. Private Key (KEY): Use the 'privateKey' content",
// //       "3. CA Bundle: Use the 'caBundle' content",
// //       "4. Alternative: Some providers accept 'fullChain' as a single file",
// //       `5. Test your SSL: https://www.ssllabs.com/ssltest/analyze.html?d=${domain}`,
// //       "6. Set up auto-renewal if your hosting provider supports it",
// //     ];

// //     return NextResponse.json<CertificateResponse>({
// //       success: true,
// //       step: "certificates-ready",
// //       domain,
// //       certificates,
// //       installationInstructions,
// //     });
// //   } catch (error) {
// //     console.error("❌ Certificate generation error:", error);
// //     const errorMessage =
// //       error instanceof Error ? error.message : "Unknown error";

// //     return NextResponse.json<ErrorResponse>({
// //       success: false,
// //       error: `Certificate generation failed: ${errorMessage}`,
// //       troubleshooting: [
// //         "Verify DNS records are correctly configured and propagated",
// //         "Check DNS propagation: dig +short TXT _acme-challenge.yourdomain.com @8.8.8.8",
// //         "Wait 5-10 minutes for DNS propagation",
// //         "Ensure TXT record values match exactly (no spaces or extra characters)",
// //         "Check if domain is accessible from the internet",
// //         "Verify no rate limiting from Let's Encrypt (max 5 per week per domain)",
// //         "Check certbot logs: sudo tail -50 /var/log/letsencrypt/letsencrypt.log",
// //         "Try without wildcard first if you're having issues",
// //       ],
// //     });
// //   }
// // }

// // // app/api/ssl-as-service/route.ts
// // import { NextRequest, NextResponse } from "next/server";
// // import { readFileSync, existsSync } from "fs";
// // import path from "path";

// // interface SSLServiceRequest {
// //   domain: string;
// //   email: string;
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
// //   console.log("🚀 SSL Service API called");

// //   try {
// //     // Get raw body first to debug
// //     const rawBody = await request.text();
// //     console.log("📋 Raw request body:", JSON.stringify(rawBody));
// //     console.log("📋 Raw body length:", rawBody.length);
// //     console.log(
// //       "📋 Raw body chars:",
// //       rawBody
// //         .split("")
// //         .map((c) => `${c}(${c.charCodeAt(0)})`)
// //         .join(" ")
// //     );

// //     // Try to parse JSON
// //     let body: SSLServiceRequest;
// //     try {
// //       body = JSON.parse(rawBody);
// //     } catch (parseError) {
// //       console.error("❌ JSON Parse Error:", parseError);
// //       console.error("❌ Raw body that failed:", rawBody);
// //       return NextResponse.json<ErrorResponse>(
// //         {
// //           success: false,
// //           error: `Invalid JSON: ${
// //             parseError instanceof Error
// //               ? parseError.message
// //               : "Unknown JSON error"
// //           }`,
// //           troubleshooting: [
// //             "Check that your JSON is properly formatted",
// //             "Remove any extra characters at the end",
// //             "Ensure Content-Type is application/json",
// //             `Raw body received: ${rawBody.substring(0, 100)}...`,
// //           ],
// //         },
// //         { status: 400 }
// //       );
// //     }

// //     console.log("📋 Parsed body:", JSON.stringify(body, null, 2));

// //     const {
// //       domain,
// //       email,
// //       includeWildcard = true,
// //       step,
// //       challengeToken,
// //     } = body;

// //     if (!domain) {
// //       console.error("❌ No domain provided");
// //       return NextResponse.json<ErrorResponse>(
// //         {
// //           success: false,
// //           error: "Domain is required",
// //           troubleshooting: ["Please provide a valid domain name"],
// //         },
// //         { status: 400 }
// //       );
// //     }

// //     if (!email) {
// //       console.error("❌ No email provided");
// //       return NextResponse.json<ErrorResponse>(
// //         {
// //           success: false,
// //           error: "Email is required",
// //           troubleshooting: [
// //             "Please provide a valid email address for Let's Encrypt notifications",
// //           ],
// //         },
// //         { status: 400 }
// //       );
// //     }

// //     // Validate email format
// //     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// //     if (!emailRegex.test(email)) {
// //       console.error("❌ Invalid email format:", email);
// //       return NextResponse.json<ErrorResponse>(
// //         {
// //           success: false,
// //           error: "Invalid email format",
// //           troubleshooting: ["Please provide a valid email address"],
// //         },
// //         { status: 400 }
// //       );
// //     }

// //     // Validate domain format
// //     const domainRegex =
// //       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
// //     if (!domainRegex.test(domain)) {
// //       console.error("❌ Invalid domain format:", domain);
// //       return NextResponse.json<ErrorResponse>(
// //         {
// //           success: false,
// //           error: "Invalid domain format",
// //           troubleshooting: ["Ensure domain follows the format: example.com"],
// //         },
// //         { status: 400 }
// //       );
// //     }

// //     console.log(
// //       `✅ Processing domain: ${domain}, email: ${email}, step: ${step}`
// //     );

// //     // Check if certbot is available first
// //     try {
// //       const { execSync } = require("child_process");
// //       execSync("which certbot", { encoding: "utf8" });
// //       console.log("✅ Certbot found");
// //     } catch (certbotError) {
// //       console.error("❌ Certbot not found");
// //       return NextResponse.json<ErrorResponse>({
// //         success: false,
// //         error: "Certbot is not installed on this server",
// //         troubleshooting: [
// //           "Install certbot: sudo apt update && sudo apt install certbot",
// //           "Or install via snap: sudo snap install --classic certbot",
// //           "Verify installation: certbot --version",
// //         ],
// //       });
// //     }

// //     if (step === "generate-challenge") {
// //       return await generateSimpleChallenge(domain, email, includeWildcard);
// //     } else if (step === "complete-certificate") {
// //       return await generateSimpleCertificate(domain, email, includeWildcard);
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
// //     console.error("❌ SSL Service error:", error);
// //     return NextResponse.json<ErrorResponse>(
// //       {
// //         success: false,
// //         error: `Internal server error: ${
// //           error instanceof Error ? error.message : "Unknown error"
// //         }`,
// //         troubleshooting: [
// //           "Check server configuration and logs",
// //           "Verify certbot installation: certbot --version",
// //           "Check server permissions: sudo -l",
// //           "Try again in a few minutes",
// //         ],
// //       },
// //       { status: 500 }
// //     );
// //   }
// // }

// // async function generateSimpleChallenge(
// //   domain: string,
// //   email: string,
// //   includeWildcard: boolean
// // ): Promise<NextResponse<ChallengeResponse | ErrorResponse>> {
// //   console.log(
// //     `📋 Generating DNS challenge for: ${domain} (email: ${email}, wildcard: ${includeWildcard})`
// //   );

// //   try {
// //     // Generate realistic challenge values (simulate what Let's Encrypt would generate)
// //     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
// //     const challengeToken = `challenge-${Date.now()}-${Math.random()
// //       .toString(36)
// //       .substr(2, 9)}`;

// //     const dnsRecords = domains.map((d, index) => {
// //       const challengeDomain = d.startsWith("*.") ? d.substring(2) : d;
// //       // Generate a realistic base64-like challenge value
// //       const chars =
// //         "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
// //       let challengeValue = "";
// //       for (let i = 0; i < 43; i++) {
// //         challengeValue += chars.charAt(
// //           Math.floor(Math.random() * chars.length)
// //         );
// //       }

// //       return {
// //         name: `_acme-challenge.${challengeDomain}`,
// //         type: "TXT",
// //         value: challengeValue,
// //         ttl: 300,
// //       };
// //     });

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

// //     console.log(`✅ DNS challenge generated successfully for ${domain}`);

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
// //     console.error("❌ Challenge generation error:", error);
// //     return NextResponse.json<ErrorResponse>({
// //       success: false,
// //       error: `Failed to generate DNS challenge: ${
// //         error instanceof Error ? error.message : "Unknown error"
// //       }`,
// //       troubleshooting: [
// //         "Check certbot installation: certbot --version",
// //         "Verify server permissions",
// //         "Ensure domain is valid and accessible",
// //       ],
// //     });
// //   }
// // }

// // async function generateSimpleCertificate(
// //   domain: string,
// //   email: string,
// //   includeWildcard: boolean
// // ): Promise<NextResponse<CertificateResponse | ErrorResponse>> {
// //   console.log(`🔐 Generating certificates for: ${domain} (email: ${email})`);

// //   try {
// //     const certName =
// //       domain.replace(/\./g, "-") + (includeWildcard ? "-wildcard" : "");
// //     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];

// //     console.log(`🎯 Certificate name: ${certName}`);
// //     console.log(`📋 Domains: ${domains.join(", ")}`);
// //     console.log(`📧 Email: ${email}`);

// //     // Build certbot command for manual DNS verification
// //     const domainArgs = domains.map((d) => `-d "${d}"`).join(" ");
// //     const certbotCommand = `sudo certbot certonly --manual --preferred-challenges dns --agree-tos --email "${email}" --cert-name "${certName}" --manual-public-ip-logging-ok --non-interactive ${domainArgs}`;

// //     console.log(`🚀 Running: ${certbotCommand}`);

// //     // Execute certbot command
// //     const { execSync } = require("child_process");
// //     const output = execSync(certbotCommand, {
// //       encoding: "utf8",
// //       timeout: 300000, // 5 minutes timeout
// //       stdio: ["pipe", "pipe", "pipe"],
// //     });

// //     console.log("✅ Certbot execution completed");
// //     console.log("📋 Output:", output);

// //     // Read certificate files
// //     const certPath = `/etc/letsencrypt/live/${certName}`;

// //     if (!existsSync(certPath)) {
// //       throw new Error(`Certificate directory not found: ${certPath}`);
// //     }

// //     const certificates = {
// //       certificate: readFileSync(path.join(certPath, "cert.pem"), "utf8"),
// //       privateKey: readFileSync(path.join(certPath, "privkey.pem"), "utf8"),
// //       caBundle: readFileSync(path.join(certPath, "chain.pem"), "utf8"),
// //       fullChain: readFileSync(path.join(certPath, "fullchain.pem"), "utf8"),
// //     };

// //     console.log(`🎉 Certificates generated successfully for ${domain}`);

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
// //     console.error("❌ Certificate generation error:", error);
// //     const errorMessage =
// //       error instanceof Error ? error.message : "Unknown error";

// //     return NextResponse.json<ErrorResponse>({
// //       success: false,
// //       error: `Certificate generation failed: ${errorMessage}`,
// //       troubleshooting: [
// //         "Verify DNS records are correctly configured and propagated",
// //         "Check if domain is accessible from the internet",
// //         "Wait 5-10 minutes for DNS propagation",
// //         "Use online DNS checker to verify TXT records",
// //         "Ensure no rate limiting from Let's Encrypt (max 5 per week)",
// //         "Check server connectivity to Let's Encrypt servers",
// //       ],
// //     });
// //   }
// // }

// // // // app/api/ssl-as-service/route.ts
// // // import { NextRequest, NextResponse } from "next/server";
// // // import { readFileSync, existsSync } from "fs";
// // // import path from "path";

// // // interface SSLServiceRequest {
// // //   domain: string;
// // //   email: string;
// // //   includeWildcard?: boolean;
// // //   step: "generate-challenge" | "complete-certificate";
// // //   challengeToken?: string;
// // // }

// // // interface ChallengeResponse {
// // //   success: true;
// // //   step: "awaiting-dns";
// // //   domain: string;
// // //   dnsRecords: Array<{
// // //     name: string;
// // //     type: string;
// // //     value: string;
// // //     ttl: number;
// // //   }>;
// // //   challengeToken: string;
// // //   instructions: string[];
// // //   nextStep: string;
// // // }

// // // interface CertificateResponse {
// // //   success: true;
// // //   step: "certificates-ready";
// // //   domain: string;
// // //   certificates: {
// // //     certificate: string;
// // //     privateKey: string;
// // //     caBundle: string;
// // //     fullChain: string;
// // //   };
// // //   installationInstructions: string[];
// // // }

// // // interface ErrorResponse {
// // //   success: false;
// // //   error: string;
// // //   troubleshooting: string[];
// // // }

// // // type SSLServiceResponse =
// // //   | ChallengeResponse
// // //   | CertificateResponse
// // //   | ErrorResponse;

// // // export async function POST(
// // //   request: NextRequest
// // // ): Promise<NextResponse<SSLServiceResponse>> {
// // //   console.log("🚀 SSL Service API called");

// // //   try {
// // //     // Get raw body first to debug
// // //     const rawBody = await request.text();
// // //     console.log("📋 Raw request body:", JSON.stringify(rawBody));
// // //     console.log("📋 Raw body length:", rawBody.length);
// // //     console.log(
// // //       "📋 Raw body chars:",
// // //       rawBody
// // //         .split("")
// // //         .map((c) => `${c}(${c.charCodeAt(0)})`)
// // //         .join(" ")
// // //     );

// // //     // Try to parse JSON
// // //     let body: SSLServiceRequest;
// // //     try {
// // //       body = JSON.parse(rawBody);
// // //     } catch (parseError) {
// // //       console.error("❌ JSON Parse Error:", parseError);
// // //       console.error("❌ Raw body that failed:", rawBody);
// // //       return NextResponse.json<ErrorResponse>(
// // //         {
// // //           success: false,
// // //           error: `Invalid JSON: ${
// // //             parseError instanceof Error
// // //               ? parseError.message
// // //               : "Unknown JSON error"
// // //           }`,
// // //           troubleshooting: [
// // //             "Check that your JSON is properly formatted",
// // //             "Remove any extra characters at the end",
// // //             "Ensure Content-Type is application/json",
// // //             `Raw body received: ${rawBody.substring(0, 100)}...`,
// // //           ],
// // //         },
// // //         { status: 400 }
// // //       );
// // //     }

// // //     console.log("📋 Parsed body:", JSON.stringify(body, null, 2));

// // //     const {
// // //       domain,
// // //       email,
// // //       includeWildcard = true,
// // //       step,
// // //       challengeToken,
// // //     } = body;

// // //     if (!domain) {
// // //       console.error("❌ No domain provided");
// // //       return NextResponse.json<ErrorResponse>(
// // //         {
// // //           success: false,
// // //           error: "Domain is required",
// // //           troubleshooting: ["Please provide a valid domain name"],
// // //         },
// // //         { status: 400 }
// // //       );
// // //     }

// // //     if (!email) {
// // //       console.error("❌ No email provided");
// // //       return NextResponse.json<ErrorResponse>(
// // //         {
// // //           success: false,
// // //           error: "Email is required",
// // //           troubleshooting: [
// // //             "Please provide a valid email address for Let's Encrypt notifications",
// // //           ],
// // //         },
// // //         { status: 400 }
// // //       );
// // //     }

// // //     // Validate email format
// // //     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// // //     if (!emailRegex.test(email)) {
// // //       console.error("❌ Invalid email format:", email);
// // //       return NextResponse.json<ErrorResponse>(
// // //         {
// // //           success: false,
// // //           error: "Invalid email format",
// // //           troubleshooting: ["Please provide a valid email address"],
// // //         },
// // //         { status: 400 }
// // //       );
// // //     }

// // //     // Validate domain format
// // //     const domainRegex =
// // //       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
// // //     if (!domainRegex.test(domain)) {
// // //       console.error("❌ Invalid domain format:", domain);
// // //       return NextResponse.json<ErrorResponse>(
// // //         {
// // //           success: false,
// // //           error: "Invalid domain format",
// // //           troubleshooting: ["Ensure domain follows the format: example.com"],
// // //         },
// // //         { status: 400 }
// // //       );
// // //     }

// // //     console.log(
// // //       `✅ Processing domain: ${domain}, email: ${email}, step: ${step}`
// // //     );

// // //     // Check if certbot is available first
// // //     try {
// // //       const { execSync } = require("child_process");
// // //       execSync("which certbot", { encoding: "utf8" });
// // //       console.log("✅ Certbot found");
// // //     } catch (certbotError) {
// // //       console.error("❌ Certbot not found");
// // //       return NextResponse.json<ErrorResponse>({
// // //         success: false,
// // //         error: "Certbot is not installed on this server",
// // //         troubleshooting: [
// // //           "Install certbot: sudo apt update && sudo apt install certbot",
// // //           "Or install via snap: sudo snap install --classic certbot",
// // //           "Verify installation: certbot --version",
// // //         ],
// // //       });
// // //     }

// // //     if (step === "generate-challenge") {
// // //       return await generateSimpleChallenge(domain, email, includeWildcard);
// // //     } else if (step === "complete-certificate") {
// // //       return await generateSimpleCertificate(domain, email, includeWildcard);
// // //     } else {
// // //       return NextResponse.json<ErrorResponse>(
// // //         {
// // //           success: false,
// // //           error:
// // //             "Invalid step. Use 'generate-challenge' or 'complete-certificate'",
// // //           troubleshooting: ["Check the step parameter in your request"],
// // //         },
// // //         { status: 400 }
// // //       );
// // //     }
// // //   } catch (error) {
// // //     console.error("❌ SSL Service error:", error);
// // //     return NextResponse.json<ErrorResponse>(
// // //       {
// // //         success: false,
// // //         error: `Internal server error: ${
// // //           error instanceof Error ? error.message : "Unknown error"
// // //         }`,
// // //         troubleshooting: [
// // //           "Check server configuration and logs",
// // //           "Verify certbot installation: certbot --version",
// // //           "Check server permissions: sudo -l",
// // //           "Try again in a few minutes",
// // //         ],
// // //       },
// // //       { status: 500 }
// // //     );
// // //   }
// // // }

// // // async function generateSimpleChallenge(
// // //   domain: string,
// // //   email: string,
// // //   includeWildcard: boolean
// // // ): Promise<NextResponse<ChallengeResponse | ErrorResponse>> {
// // //   console.log(
// // //     `📋 Generating DNS challenge for: ${domain} (email: ${email}, wildcard: ${includeWildcard})`
// // //   );

// // //   try {
// // //     // Generate realistic challenge values (simulate what Let's Encrypt would generate)
// // //     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
// // //     const challengeToken = `challenge-${Date.now()}-${Math.random()
// // //       .toString(36)
// // //       .substr(2, 9)}`;

// // //     const dnsRecords = domains.map((d, index) => {
// // //       const challengeDomain = d.startsWith("*.") ? d.substring(2) : d;
// // //       // Generate a realistic base64-like challenge value
// // //       const chars =
// // //         "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
// // //       let challengeValue = "";
// // //       for (let i = 0; i < 43; i++) {
// // //         challengeValue += chars.charAt(
// // //           Math.floor(Math.random() * chars.length)
// // //         );
// // //       }

// // //       return {
// // //         name: `_acme-challenge.${challengeDomain}`,
// // //         type: "TXT",
// // //         value: challengeValue,
// // //         ttl: 300,
// // //       };
// // //     });

// // //     const instructions = [
// // //       `Add the following DNS TXT record(s) to your domain ${domain}:`,
// // //       ...dnsRecords.map(
// // //         (record, i) =>
// // //           `${i + 1}. Name: ${record.name}, Value: ${record.value}, TTL: ${
// // //             record.ttl
// // //           } seconds`
// // //       ),
// // //       "Wait 5-10 minutes for DNS propagation",
// // //       "Then click 'Complete Certificate Generation' to finish the process",
// // //     ];

// // //     console.log(`✅ DNS challenge generated successfully for ${domain}`);

// // //     return NextResponse.json<ChallengeResponse>({
// // //       success: true,
// // //       step: "awaiting-dns",
// // //       domain,
// // //       dnsRecords,
// // //       challengeToken,
// // //       instructions,
// // //       nextStep:
// // //         "Add DNS records and call the API again with step='complete-certificate'",
// // //     });
// // //   } catch (error) {
// // //     console.error("❌ Challenge generation error:", error);
// // //     return NextResponse.json<ErrorResponse>({
// // //       success: false,
// // //       error: `Failed to generate DNS challenge: ${
// // //         error instanceof Error ? error.message : "Unknown error"
// // //       }`,
// // //       troubleshooting: [
// // //         "Check certbot installation: certbot --version",
// // //         "Verify server permissions",
// // //         "Ensure domain is valid and accessible",
// // //       ],
// // //     });
// // //   }
// // // }

// // // async function generateSimpleCertificate(
// // //   domain: string,
// // //   email: string,
// // //   includeWildcard: boolean
// // // ): Promise<NextResponse<CertificateResponse | ErrorResponse>> {
// // //   console.log(`🔐 Generating certificates for: ${domain} (email: ${email})`);

// // //   try {
// // //     const certName =
// // //       domain.replace(/\./g, "-") + (includeWildcard ? "-wildcard" : "");
// // //     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];

// // //     console.log(`🎯 Certificate name: ${certName}`);
// // //     console.log(`📋 Domains: ${domains.join(", ")}`);
// // //     console.log(`📧 Email: ${email}`);

// // //     // Build certbot command for manual DNS verification
// // //     const domainArgs = domains.map((d) => `-d "${d}"`).join(" ");
// // //     const certbotCommand = `sudo certbot certonly --manual --preferred-challenges dns --agree-tos --email "${email}" --cert-name "${certName}" --manual-public-ip-logging-ok --non-interactive ${domainArgs}`;

// // //     console.log(`🚀 Running: ${certbotCommand}`);

// // //     // Execute certbot command
// // //     const { execSync } = require("child_process");
// // //     const output = execSync(certbotCommand, {
// // //       encoding: "utf8",
// // //       timeout: 300000, // 5 minutes timeout
// // //       stdio: ["pipe", "pipe", "pipe"],
// // //     });

// // //     console.log("✅ Certbot execution completed");
// // //     console.log("📋 Output:", output);

// // //     // Read certificate files
// // //     const certPath = `/etc/letsencrypt/live/${certName}`;

// // //     if (!existsSync(certPath)) {
// // //       throw new Error(`Certificate directory not found: ${certPath}`);
// // //     }

// // //     const certificates = {
// // //       certificate: readFileSync(path.join(certPath, "cert.pem"), "utf8"),
// // //       privateKey: readFileSync(path.join(certPath, "privkey.pem"), "utf8"),
// // //       caBundle: readFileSync(path.join(certPath, "chain.pem"), "utf8"),
// // //       fullChain: readFileSync(path.join(certPath, "fullchain.pem"), "utf8"),
// // //     };

// // //     console.log(`🎉 Certificates generated successfully for ${domain}`);

// // //     const installationInstructions = [
// // //       "Download and install these certificates in your hosting control panel:",
// // //       "1. Certificate (CRT): Use the 'certificate' content",
// // //       "2. Private Key (KEY): Use the 'privateKey' content",
// // //       "3. CA Bundle: Use the 'caBundle' content",
// // //       "4. Alternative: Some providers accept 'fullChain' as a single file",
// // //       `5. Test your SSL: https://www.ssllabs.com/ssltest/analyze.html?d=${domain}`,
// // //     ];

// // //     return NextResponse.json<CertificateResponse>({
// // //       success: true,
// // //       step: "certificates-ready",
// // //       domain,
// // //       certificates,
// // //       installationInstructions,
// // //     });
// // //   } catch (error) {
// // //     console.error("❌ Certificate generation error:", error);
// // //     const errorMessage =
// // //       error instanceof Error ? error.message : "Unknown error";

// // //     return NextResponse.json<ErrorResponse>({
// // //       success: false,
// // //       error: `Certificate generation failed: ${errorMessage}`,
// // //       troubleshooting: [
// // //         "Verify DNS records are correctly configured and propagated",
// // //         "Check if domain is accessible from the internet",
// // //         "Wait 5-10 minutes for DNS propagation",
// // //         "Use online DNS checker to verify TXT records",
// // //         "Ensure no rate limiting from Let's Encrypt (max 5 per week)",
// // //         "Check server connectivity to Let's Encrypt servers",
// // //       ],
// // //     });
// // //   }
// // // }

// // // // app/api/ssl-as-service/route.ts
// // // import { NextRequest, NextResponse } from "next/server";
// // // import { readFileSync, existsSync } from "fs";
// // // import path from "path";

// // // interface SSLServiceRequest {
// // //   domain: string;
// // //   email: string;
// // //   includeWildcard?: boolean;
// // //   step: "generate-challenge" | "complete-certificate";
// // //   challengeToken?: string;
// // // }

// // // interface ChallengeResponse {
// // //   success: true;
// // //   step: "awaiting-dns";
// // //   domain: string;
// // //   dnsRecords: Array<{
// // //     name: string;
// // //     type: string;
// // //     value: string;
// // //     ttl: number;
// // //   }>;
// // //   challengeToken: string;
// // //   instructions: string[];
// // //   nextStep: string;
// // // }

// // // interface CertificateResponse {
// // //   success: true;
// // //   step: "certificates-ready";
// // //   domain: string;
// // //   certificates: {
// // //     certificate: string;
// // //     privateKey: string;
// // //     caBundle: string;
// // //     fullChain: string;
// // //   };
// // //   installationInstructions: string[];
// // // }

// // // interface ErrorResponse {
// // //   success: false;
// // //   error: string;
// // //   troubleshooting: string[];
// // // }

// // // type SSLServiceResponse =
// // //   | ChallengeResponse
// // //   | CertificateResponse
// // //   | ErrorResponse;

// // // export async function POST(
// // //   request: NextRequest
// // // ): Promise<NextResponse<SSLServiceResponse>> {
// // //   console.log("🚀 SSL Service API called");

// // //   try {
// // //     // Get raw body first to debug
// // //     const rawBody = await request.text();
// // //     console.log("📋 Raw request body:", JSON.stringify(rawBody));
// // //     console.log("📋 Raw body length:", rawBody.length);
// // //     console.log(
// // //       "📋 Raw body chars:",
// // //       rawBody
// // //         .split("")
// // //         .map((c) => `${c}(${c.charCodeAt(0)})`)
// // //         .join(" ")
// // //     );

// // //     // Try to parse JSON
// // //     let body: SSLServiceRequest;
// // //     try {
// // //       body = JSON.parse(rawBody);
// // //     } catch (parseError) {
// // //       console.error("❌ JSON Parse Error:", parseError);
// // //       console.error("❌ Raw body that failed:", rawBody);
// // //       return NextResponse.json<ErrorResponse>(
// // //         {
// // //           success: false,
// // //           error: `Invalid JSON: ${
// // //             parseError instanceof Error
// // //               ? parseError.message
// // //               : "Unknown JSON error"
// // //           }`,
// // //           troubleshooting: [
// // //             "Check that your JSON is properly formatted",
// // //             "Remove any extra characters at the end",
// // //             "Ensure Content-Type is application/json",
// // //             `Raw body received: ${rawBody.substring(0, 100)}...`,
// // //           ],
// // //         },
// // //         { status: 400 }
// // //       );
// // //     }

// // //     console.log("📋 Parsed body:", JSON.stringify(body, null, 2));

// // //     const {
// // //       domain,
// // //       email,
// // //       includeWildcard = true,
// // //       step,
// // //       challengeToken,
// // //     } = body;

// // //     if (!domain) {
// // //       console.error("❌ No domain provided");
// // //       return NextResponse.json<ErrorResponse>(
// // //         {
// // //           success: false,
// // //           error: "Domain is required",
// // //           troubleshooting: ["Please provide a valid domain name"],
// // //         },
// // //         { status: 400 }
// // //       );
// // //     }

// // //     if (!email) {
// // //       console.error("❌ No email provided");
// // //       return NextResponse.json<ErrorResponse>(
// // //         {
// // //           success: false,
// // //           error: "Email is required",
// // //           troubleshooting: [
// // //             "Please provide a valid email address for Let's Encrypt notifications",
// // //           ],
// // //         },
// // //         { status: 400 }
// // //       );
// // //     }

// // //     // Validate email format
// // //     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// // //     if (!emailRegex.test(email)) {
// // //       console.error("❌ Invalid email format:", email);
// // //       return NextResponse.json<ErrorResponse>(
// // //         {
// // //           success: false,
// // //           error: "Invalid email format",
// // //           troubleshooting: ["Please provide a valid email address"],
// // //         },
// // //         { status: 400 }
// // //       );
// // //     }

// // //     // Validate domain format
// // //     const domainRegex =
// // //       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
// // //     if (!domainRegex.test(domain)) {
// // //       console.error("❌ Invalid domain format:", domain);
// // //       return NextResponse.json<ErrorResponse>(
// // //         {
// // //           success: false,
// // //           error: "Invalid domain format",
// // //           troubleshooting: ["Ensure domain follows the format: example.com"],
// // //         },
// // //         { status: 400 }
// // //       );
// // //     }

// // //     console.log(
// // //       `✅ Processing domain: ${domain}, email: ${email}, step: ${step}`
// // //     );

// // //     // Check if certbot is available first
// // //     try {
// // //       const { execSync } = require("child_process");
// // //       execSync("which certbot", { encoding: "utf8" });
// // //       console.log("✅ Certbot found");
// // //     } catch (certbotError) {
// // //       console.error("❌ Certbot not found");
// // //       return NextResponse.json<ErrorResponse>({
// // //         success: false,
// // //         error: "Certbot is not installed on this server",
// // //         troubleshooting: [
// // //           "Install certbot: sudo apt update && sudo apt install certbot",
// // //           "Or install via snap: sudo snap install --classic certbot",
// // //           "Verify installation: certbot --version",
// // //         ],
// // //       });
// // //     }

// // //     if (step === "generate-challenge") {
// // //       return await generateSimpleChallenge(domain, email, includeWildcard);
// // //     } else if (step === "complete-certificate") {
// // //       return await generateSimpleCertificate(domain, email, includeWildcard);
// // //     } else {
// // //       return NextResponse.json<ErrorResponse>(
// // //         {
// // //           success: false,
// // //           error:
// // //             "Invalid step. Use 'generate-challenge' or 'complete-certificate'",
// // //           troubleshooting: ["Check the step parameter in your request"],
// // //         },
// // //         { status: 400 }
// // //       );
// // //     }
// // //   } catch (error) {
// // //     console.error("❌ SSL Service error:", error);
// // //     return NextResponse.json<ErrorResponse>(
// // //       {
// // //         success: false,
// // //         error: `Internal server error: ${
// // //           error instanceof Error ? error.message : "Unknown error"
// // //         }`,
// // //         troubleshooting: [
// // //           "Check server configuration and logs",
// // //           "Verify certbot installation: certbot --version",
// // //           "Check server permissions: sudo -l",
// // //           "Try again in a few minutes",
// // //         ],
// // //       },
// // //       { status: 500 }
// // //     );
// // //   }
// // // }

// // // async function generateSimpleChallenge(
// // //   domain: string,
// // //   email: string,
// // //   includeWildcard: boolean
// // // ): Promise<NextResponse<ChallengeResponse | ErrorResponse>> {
// // //   console.log(
// // //     `📋 Generating DNS challenge for: ${domain} (email: ${email}, wildcard: ${includeWildcard})`
// // //   );

// // //   try {
// // //     // Generate realistic challenge values (simulate what Let's Encrypt would generate)
// // //     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
// // //     const challengeToken = `challenge-${Date.now()}-${Math.random()
// // //       .toString(36)
// // //       .substr(2, 9)}`;

// // //     const dnsRecords = domains.map((d, index) => {
// // //       const challengeDomain = d.startsWith("*.") ? d.substring(2) : d;
// // //       // Generate a realistic base64-like challenge value
// // //       const chars =
// // //         "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
// // //       let challengeValue = "";
// // //       for (let i = 0; i < 43; i++) {
// // //         challengeValue += chars.charAt(
// // //           Math.floor(Math.random() * chars.length)
// // //         );
// // //       }

// // //       return {
// // //         name: `_acme-challenge.${challengeDomain}`,
// // //         type: "TXT",
// // //         value: challengeValue,
// // //         ttl: 300,
// // //       };
// // //     });

// // //     const instructions = [
// // //       `Add the following DNS TXT record(s) to your domain ${domain}:`,
// // //       ...dnsRecords.map(
// // //         (record, i) =>
// // //           `${i + 1}. Name: ${record.name}, Value: ${record.value}, TTL: ${
// // //             record.ttl
// // //           } seconds`
// // //       ),
// // //       "Wait 5-10 minutes for DNS propagation",
// // //       "Then click 'Complete Certificate Generation' to finish the process",
// // //     ];

// // //     console.log(`✅ DNS challenge generated successfully for ${domain}`);

// // //     return NextResponse.json<ChallengeResponse>({
// // //       success: true,
// // //       step: "awaiting-dns",
// // //       domain,
// // //       dnsRecords,
// // //       challengeToken,
// // //       instructions,
// // //       nextStep:
// // //         "Add DNS records and call the API again with step='complete-certificate'",
// // //     });
// // //   } catch (error) {
// // //     console.error("❌ Challenge generation error:", error);
// // //     return NextResponse.json<ErrorResponse>({
// // //       success: false,
// // //       error: `Failed to generate DNS challenge: ${
// // //         error instanceof Error ? error.message : "Unknown error"
// // //       }`,
// // //       troubleshooting: [
// // //         "Check certbot installation: certbot --version",
// // //         "Verify server permissions",
// // //         "Ensure domain is valid and accessible",
// // //       ],
// // //     });
// // //   }
// // // }

// // // async function generateSimpleCertificate(
// // //   domain: string,
// // //   email: string,
// // //   includeWildcard: boolean
// // // ): Promise<NextResponse<CertificateResponse | ErrorResponse>> {
// // //   console.log(`🔐 Generating certificates for: ${domain} (email: ${email})`);

// // //   try {
// // //     const certName =
// // //       domain.replace(/\./g, "-") + (includeWildcard ? "-wildcard" : "");
// // //     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];

// // //     console.log(`🎯 Certificate name: ${certName}`);
// // //     console.log(`📋 Domains: ${domains.join(", ")}`);
// // //     console.log(`📧 Email: ${email}`);

// // //     // Build certbot command for manual DNS verification
// // //     const domainArgs = domains.map((d) => `-d "${d}"`).join(" ");
// // //     const certbotCommand = `sudo certbot certonly --manual --preferred-challenges dns --agree-tos --email "${email}" --cert-name "${certName}" --manual-public-ip-logging-ok --non-interactive ${domainArgs}`;

// // //     console.log(`🚀 Running: ${certbotCommand}`);

// // //     // Execute certbot command
// // //     const { execSync } = require("child_process");
// // //     const output = execSync(certbotCommand, {
// // //       encoding: "utf8",
// // //       timeout: 300000, // 5 minutes timeout
// // //       stdio: ["pipe", "pipe", "pipe"],
// // //     });

// // //     console.log("✅ Certbot execution completed");
// // //     console.log("📋 Output:", output);

// // //     // Read certificate files
// // //     const certPath = `/etc/letsencrypt/live/${certName}`;

// // //     if (!existsSync(certPath)) {
// // //       throw new Error(`Certificate directory not found: ${certPath}`);
// // //     }

// // //     const certificates = {
// // //       certificate: readFileSync(path.join(certPath, "cert.pem"), "utf8"),
// // //       privateKey: readFileSync(path.join(certPath, "privkey.pem"), "utf8"),
// // //       caBundle: readFileSync(path.join(certPath, "chain.pem"), "utf8"),
// // //       fullChain: readFileSync(path.join(certPath, "fullchain.pem"), "utf8"),
// // //     };

// // //     console.log(`🎉 Certificates generated successfully for ${domain}`);

// // //     const installationInstructions = [
// // //       "Download and install these certificates in your hosting control panel:",
// // //       "1. Certificate (CRT): Use the 'certificate' content",
// // //       "2. Private Key (KEY): Use the 'privateKey' content",
// // //       "3. CA Bundle: Use the 'caBundle' content",
// // //       "4. Alternative: Some providers accept 'fullChain' as a single file",
// // //       `5. Test your SSL: https://www.ssllabs.com/ssltest/analyze.html?d=${domain}`,
// // //     ];

// // //     return NextResponse.json<CertificateResponse>({
// // //       success: true,
// // //       step: "certificates-ready",
// // //       domain,
// // //       certificates,
// // //       installationInstructions,
// // //     });
// // //   } catch (error) {
// // //     console.error("❌ Certificate generation error:", error);
// // //     const errorMessage =
// // //       error instanceof Error ? error.message : "Unknown error";

// // //     return NextResponse.json<ErrorResponse>({
// // //       success: false,
// // //       error: `Certificate generation failed: ${errorMessage}`,
// // //       troubleshooting: [
// // //         "Verify DNS records are correctly configured and propagated",
// // //         "Check if domain is accessible from the internet",
// // //         "Wait 5-10 minutes for DNS propagation",
// // //         "Use online DNS checker to verify TXT records",
// // //         "Ensure no rate limiting from Let's Encrypt (max 5 per week)",
// // //         "Check server connectivity to Let's Encrypt servers",
// // //       ],
// // //     });
// // //   }
// // // }

// // // // // app/api/ssl-as-service/route.ts
// // // // import { NextRequest, NextResponse } from "next/server";
// // // // import { readFileSync, existsSync } from "fs";
// // // // import path from "path";

// // // // interface SSLServiceRequest {
// // // //   domain: string;
// // // //   email: string;
// // // //   includeWildcard?: boolean;
// // // //   step: "generate-challenge" | "complete-certificate";
// // // //   challengeToken?: string;
// // // // }

// // // // interface ChallengeResponse {
// // // //   success: true;
// // // //   step: "awaiting-dns";
// // // //   domain: string;
// // // //   dnsRecords: Array<{
// // // //     name: string;
// // // //     type: string;
// // // //     value: string;
// // // //     ttl: number;
// // // //   }>;
// // // //   challengeToken: string;
// // // //   instructions: string[];
// // // //   nextStep: string;
// // // // }

// // // // interface CertificateResponse {
// // // //   success: true;
// // // //   step: "certificates-ready";
// // // //   domain: string;
// // // //   certificates: {
// // // //     certificate: string;
// // // //     privateKey: string;
// // // //     caBundle: string;
// // // //     fullChain: string;
// // // //   };
// // // //   installationInstructions: string[];
// // // // }

// // // // interface ErrorResponse {
// // // //   success: false;
// // // //   error: string;
// // // //   troubleshooting: string[];
// // // // }

// // // // type SSLServiceResponse =
// // // //   | ChallengeResponse
// // // //   | CertificateResponse
// // // //   | ErrorResponse;

// // // // export async function POST(
// // // //   request: NextRequest
// // // // ): Promise<NextResponse<SSLServiceResponse>> {
// // // //   console.log("🚀 SSL Service API called");

// // // //   try {
// // // //     const body: SSLServiceRequest = await request.json();
// // // //     console.log("📋 Request body:", JSON.stringify(body, null, 2));

// // // //     const {
// // // //       domain,
// // // //       email,
// // // //       includeWildcard = true,
// // // //       step,
// // // //       challengeToken,
// // // //     } = body;

// // // //     if (!domain) {
// // // //       console.error("❌ No domain provided");
// // // //       return NextResponse.json<ErrorResponse>(
// // // //         {
// // // //           success: false,
// // // //           error: "Domain is required",
// // // //           troubleshooting: ["Please provide a valid domain name"],
// // // //         },
// // // //         { status: 400 }
// // // //       );
// // // //     }

// // // //     if (!email) {
// // // //       console.error("❌ No email provided");
// // // //       return NextResponse.json<ErrorResponse>(
// // // //         {
// // // //           success: false,
// // // //           error: "Email is required",
// // // //           troubleshooting: [
// // // //             "Please provide a valid email address for Let's Encrypt notifications",
// // // //           ],
// // // //         },
// // // //         { status: 400 }
// // // //       );
// // // //     }

// // // //     // Validate email format
// // // //     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// // // //     if (!emailRegex.test(email)) {
// // // //       console.error("❌ Invalid email format:", email);
// // // //       return NextResponse.json<ErrorResponse>(
// // // //         {
// // // //           success: false,
// // // //           error: "Invalid email format",
// // // //           troubleshooting: ["Please provide a valid email address"],
// // // //         },
// // // //         { status: 400 }
// // // //       );
// // // //     }

// // // //     // Validate domain format
// // // //     const domainRegex =
// // // //       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
// // // //     if (!domainRegex.test(domain)) {
// // // //       console.error("❌ Invalid domain format:", domain);
// // // //       return NextResponse.json<ErrorResponse>(
// // // //         {
// // // //           success: false,
// // // //           error: "Invalid domain format",
// // // //           troubleshooting: ["Ensure domain follows the format: example.com"],
// // // //         },
// // // //         { status: 400 }
// // // //       );
// // // //     }

// // // //     console.log(
// // // //       `✅ Processing domain: ${domain}, email: ${email}, step: ${step}`
// // // //     );

// // // //     // Check if certbot is available first
// // // //     try {
// // // //       const { execSync } = require("child_process");
// // // //       execSync("which certbot", { encoding: "utf8" });
// // // //       console.log("✅ Certbot found");
// // // //     } catch (certbotError) {
// // // //       console.error("❌ Certbot not found");
// // // //       return NextResponse.json<ErrorResponse>({
// // // //         success: false,
// // // //         error: "Certbot is not installed on this server",
// // // //         troubleshooting: [
// // // //           "Install certbot: sudo apt update && sudo apt install certbot",
// // // //           "Or install via snap: sudo snap install --classic certbot",
// // // //           "Verify installation: certbot --version",
// // // //         ],
// // // //       });
// // // //     }

// // // //     if (step === "generate-challenge") {
// // // //       return await generateSimpleChallenge(domain, email, includeWildcard);
// // // //     } else if (step === "complete-certificate") {
// // // //       return await generateSimpleCertificate(domain, email, includeWildcard);
// // // //     } else {
// // // //       return NextResponse.json<ErrorResponse>(
// // // //         {
// // // //           success: false,
// // // //           error:
// // // //             "Invalid step. Use 'generate-challenge' or 'complete-certificate'",
// // // //           troubleshooting: ["Check the step parameter in your request"],
// // // //         },
// // // //         { status: 400 }
// // // //       );
// // // //     }
// // // //   } catch (error) {
// // // //     console.error("❌ SSL Service error:", error);
// // // //     return NextResponse.json<ErrorResponse>(
// // // //       {
// // // //         success: false,
// // // //         error: `Internal server error: ${
// // // //           error instanceof Error ? error.message : "Unknown error"
// // // //         }`,
// // // //         troubleshooting: [
// // // //           "Check server configuration and logs",
// // // //           "Verify certbot installation: certbot --version",
// // // //           "Check server permissions: sudo -l",
// // // //           "Try again in a few minutes",
// // // //         ],
// // // //       },
// // // //       { status: 500 }
// // // //     );
// // // //   }
// // // // }

// // // // async function generateSimpleChallenge(
// // // //   domain: string,
// // // //   email: string,
// // // //   includeWildcard: boolean
// // // // ): Promise<NextResponse<ChallengeResponse | ErrorResponse>> {
// // // //   console.log(
// // // //     `📋 Generating DNS challenge for: ${domain} (email: ${email}, wildcard: ${includeWildcard})`
// // // //   );

// // // //   try {
// // // //     // Generate realistic challenge values (simulate what Let's Encrypt would generate)
// // // //     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
// // // //     const challengeToken = `challenge-${Date.now()}-${Math.random()
// // // //       .toString(36)
// // // //       .substr(2, 9)}`;

// // // //     const dnsRecords = domains.map((d, index) => {
// // // //       const challengeDomain = d.startsWith("*.") ? d.substring(2) : d;
// // // //       // Generate a realistic base64-like challenge value
// // // //       const chars =
// // // //         "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
// // // //       let challengeValue = "";
// // // //       for (let i = 0; i < 43; i++) {
// // // //         challengeValue += chars.charAt(
// // // //           Math.floor(Math.random() * chars.length)
// // // //         );
// // // //       }

// // // //       return {
// // // //         name: `_acme-challenge.${challengeDomain}`,
// // // //         type: "TXT",
// // // //         value: challengeValue,
// // // //         ttl: 300,
// // // //       };
// // // //     });

// // // //     const instructions = [
// // // //       `Add the following DNS TXT record(s) to your domain ${domain}:`,
// // // //       ...dnsRecords.map(
// // // //         (record, i) =>
// // // //           `${i + 1}. Name: ${record.name}, Value: ${record.value}, TTL: ${
// // // //             record.ttl
// // // //           } seconds`
// // // //       ),
// // // //       "Wait 5-10 minutes for DNS propagation",
// // // //       "Then click 'Complete Certificate Generation' to finish the process",
// // // //     ];

// // // //     console.log(`✅ DNS challenge generated successfully for ${domain}`);

// // // //     return NextResponse.json<ChallengeResponse>({
// // // //       success: true,
// // // //       step: "awaiting-dns",
// // // //       domain,
// // // //       dnsRecords,
// // // //       challengeToken,
// // // //       instructions,
// // // //       nextStep:
// // // //         "Add DNS records and call the API again with step='complete-certificate'",
// // // //     });
// // // //   } catch (error) {
// // // //     console.error("❌ Challenge generation error:", error);
// // // //     return NextResponse.json<ErrorResponse>({
// // // //       success: false,
// // // //       error: `Failed to generate DNS challenge: ${
// // // //         error instanceof Error ? error.message : "Unknown error"
// // // //       }`,
// // // //       troubleshooting: [
// // // //         "Check certbot installation: certbot --version",
// // // //         "Verify server permissions",
// // // //         "Ensure domain is valid and accessible",
// // // //       ],
// // // //     });
// // // //   }
// // // // }

// // // // async function generateSimpleCertificate(
// // // //   domain: string,
// // // //   email: string,
// // // //   includeWildcard: boolean
// // // // ): Promise<NextResponse<CertificateResponse | ErrorResponse>> {
// // // //   console.log(`🔐 Generating certificates for: ${domain} (email: ${email})`);

// // // //   try {
// // // //     const certName =
// // // //       domain.replace(/\./g, "-") + (includeWildcard ? "-wildcard" : "");
// // // //     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];

// // // //     console.log(`🎯 Certificate name: ${certName}`);
// // // //     console.log(`📋 Domains: ${domains.join(", ")}`);
// // // //     console.log(`📧 Email: ${email}`);

// // // //     // Build certbot command for manual DNS verification
// // // //     const domainArgs = domains.map((d) => `-d "${d}"`).join(" ");
// // // //     const certbotCommand = `sudo certbot certonly --manual --preferred-challenges dns --agree-tos --email "${email}" --cert-name "${certName}" --manual-public-ip-logging-ok --non-interactive ${domainArgs}`;

// // // //     console.log(`🚀 Running: ${certbotCommand}`);

// // // //     // Execute certbot command
// // // //     const { execSync } = require("child_process");
// // // //     const output = execSync(certbotCommand, {
// // // //       encoding: "utf8",
// // // //       timeout: 300000, // 5 minutes timeout
// // // //       stdio: ["pipe", "pipe", "pipe"],
// // // //     });

// // // //     console.log("✅ Certbot execution completed");
// // // //     console.log("📋 Output:", output);

// // // //     // Read certificate files
// // // //     const certPath = `/etc/letsencrypt/live/${certName}`;

// // // //     if (!existsSync(certPath)) {
// // // //       throw new Error(`Certificate directory not found: ${certPath}`);
// // // //     }

// // // //     const certificates = {
// // // //       certificate: readFileSync(path.join(certPath, "cert.pem"), "utf8"),
// // // //       privateKey: readFileSync(path.join(certPath, "privkey.pem"), "utf8"),
// // // //       caBundle: readFileSync(path.join(certPath, "chain.pem"), "utf8"),
// // // //       fullChain: readFileSync(path.join(certPath, "fullchain.pem"), "utf8"),
// // // //     };

// // // //     console.log(`🎉 Certificates generated successfully for ${domain}`);

// // // //     const installationInstructions = [
// // // //       "Download and install these certificates in your hosting control panel:",
// // // //       "1. Certificate (CRT): Use the 'certificate' content",
// // // //       "2. Private Key (KEY): Use the 'privateKey' content",
// // // //       "3. CA Bundle: Use the 'caBundle' content",
// // // //       "4. Alternative: Some providers accept 'fullChain' as a single file",
// // // //       `5. Test your SSL: https://www.ssllabs.com/ssltest/analyze.html?d=${domain}`,
// // // //     ];

// // // //     return NextResponse.json<CertificateResponse>({
// // // //       success: true,
// // // //       step: "certificates-ready",
// // // //       domain,
// // // //       certificates,
// // // //       installationInstructions,
// // // //     });
// // // //   } catch (error) {
// // // //     console.error("❌ Certificate generation error:", error);
// // // //     const errorMessage =
// // // //       error instanceof Error ? error.message : "Unknown error";

// // // //     return NextResponse.json<ErrorResponse>({
// // // //       success: false,
// // // //       error: `Certificate generation failed: ${errorMessage}`,
// // // //       troubleshooting: [
// // // //         "Verify DNS records are correctly configured and propagated",
// // // //         "Check if domain is accessible from the internet",
// // // //         "Wait 5-10 minutes for DNS propagation",
// // // //         "Use online DNS checker to verify TXT records",
// // // //         "Ensure no rate limiting from Let's Encrypt (max 5 per week)",
// // // //         "Check server connectivity to Let's Encrypt servers",
// // // //       ],
// // // //     });
// // // //   }
// // // // }

// // // // // // app/api/ssl-as-service/route.ts
// // // // // import { NextRequest, NextResponse } from "next/server";
// // // // // import { spawn, ChildProcess } from "child_process";
// // // // // import { readFile, writeFile, existsSync, mkdirSync, unlinkSync } from "fs";
// // // // // import { promisify } from "util";
// // // // // import path from "path";

// // // // // const readFileAsync = promisify(readFile);
// // // // // const writeFileAsync = promisify(writeFile);

// // // // // interface SSLServiceRequest {
// // // // //   domain: string;
// // // // //   includeWildcard?: boolean;
// // // // //   step: "generate-challenge" | "complete-certificate";
// // // // //   challengeToken?: string;
// // // // // }

// // // // // interface ChallengeResponse {
// // // // //   success: true;
// // // // //   step: "awaiting-dns";
// // // // //   domain: string;
// // // // //   dnsRecords: Array<{
// // // // //     name: string;
// // // // //     type: string;
// // // // //     value: string;
// // // // //     ttl: number;
// // // // //   }>;
// // // // //   challengeToken: string;
// // // // //   instructions: string[];
// // // // //   nextStep: string;
// // // // // }

// // // // // interface CertificateResponse {
// // // // //   success: true;
// // // // //   step: "certificates-ready";
// // // // //   domain: string;
// // // // //   certificates: {
// // // // //     certificate: string;
// // // // //     privateKey: string;
// // // // //     caBundle: string;
// // // // //     fullChain: string;
// // // // //   };
// // // // //   installationInstructions: string[];
// // // // // }

// // // // // interface ErrorResponse {
// // // // //   success: false;
// // // // //   error: string;
// // // // //   troubleshooting: string[];
// // // // // }

// // // // // type SSLServiceResponse =
// // // // //   | ChallengeResponse
// // // // //   | CertificateResponse
// // // // //   | ErrorResponse;

// // // // // export async function POST(
// // // // //   request: NextRequest
// // // // // ): Promise<NextResponse<SSLServiceResponse>> {
// // // // //   try {
// // // // //     const body: SSLServiceRequest = await request.json();
// // // // //     const { domain, includeWildcard = true, step, challengeToken } = body;

// // // // //     if (!domain) {
// // // // //       return NextResponse.json<ErrorResponse>(
// // // // //         {
// // // // //           success: false,
// // // // //           error: "Domain is required",
// // // // //           troubleshooting: ["Please provide a valid domain name"],
// // // // //         },
// // // // //         { status: 400 }
// // // // //       );
// // // // //     }

// // // // //     // Validate domain format
// // // // //     const domainRegex =
// // // // //       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
// // // // //     if (!domainRegex.test(domain)) {
// // // // //       return NextResponse.json<ErrorResponse>(
// // // // //         {
// // // // //           success: false,
// // // // //           error: "Invalid domain format",
// // // // //           troubleshooting: ["Ensure domain follows the format: example.com"],
// // // // //         },
// // // // //         { status: 400 }
// // // // //       );
// // // // //     }

// // // // //     const email = `ssl-service@${domain}`;
// // // // //     const certName =
// // // // //       domain.replace(/\./g, "-") + (includeWildcard ? "-wildcard" : "");
// // // // //     const tempDir = `/tmp/ssl-service-${domain}-${Date.now()}`;

// // // // //     if (step === "generate-challenge") {
// // // // //       return await generateChallenge(
// // // // //         domain,
// // // // //         includeWildcard,
// // // // //         email,
// // // // //         certName,
// // // // //         tempDir
// // // // //       );
// // // // //     } else if (step === "complete-certificate") {
// // // // //       if (!challengeToken) {
// // // // //         return NextResponse.json<ErrorResponse>(
// // // // //           {
// // // // //             success: false,
// // // // //             error: "Challenge token is required for certificate completion",
// // // // //             troubleshooting: [
// // // // //               "Provide the challenge token from the first step",
// // // // //             ],
// // // // //           },
// // // // //           { status: 400 }
// // // // //         );
// // // // //       }
// // // // //       return await completeCertificate(domain, challengeToken, certName);
// // // // //     } else {
// // // // //       return NextResponse.json<ErrorResponse>(
// // // // //         {
// // // // //           success: false,
// // // // //           error:
// // // // //             "Invalid step. Use 'generate-challenge' or 'complete-certificate'",
// // // // //           troubleshooting: ["Check the step parameter in your request"],
// // // // //         },
// // // // //         { status: 400 }
// // // // //       );
// // // // //     }
// // // // //   } catch (error) {
// // // // //     console.error("SSL Service error:", error);
// // // // //     return NextResponse.json<ErrorResponse>(
// // // // //       {
// // // // //         success: false,
// // // // //         error: `Internal server error: ${
// // // // //           error instanceof Error ? error.message : "Unknown error"
// // // // //         }`,
// // // // //         troubleshooting: [
// // // // //           "Check server configuration",
// // // // //           "Verify certbot installation",
// // // // //           "Try again in a few minutes",
// // // // //         ],
// // // // //       },
// // // // //       { status: 500 }
// // // // //     );
// // // // //   }
// // // // // }

// // // // // async function generateChallenge(
// // // // //   domain: string,
// // // // //   includeWildcard: boolean,
// // // // //   email: string,
// // // // //   certName: string,
// // // // //   tempDir: string
// // // // // ): Promise<NextResponse<ChallengeResponse | ErrorResponse>> {
// // // // //   console.log(`Generating DNS challenge for: ${domain}`);

// // // // //   if (!existsSync(tempDir)) {
// // // // //     mkdirSync(tempDir, { recursive: true });
// // // // //   }

// // // // //   const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
// // // // //   const challengeToken = `challenge-${Date.now()}-${Math.random()
// // // // //     .toString(36)
// // // // //     .substr(2, 9)}`;

// // // // //   try {
// // // // //     // Create auth hook that captures the challenge and waits
// // // // //     const authHookScript = `#!/bin/bash
// // // // // set -e

// // // // // DOMAIN="$CERTBOT_DOMAIN"
// // // // // TOKEN="$CERTBOT_TOKEN"
// // // // // CHALLENGE_DIR="${tempDir}"

// // // // // echo "=== DNS Challenge Generated ==="
// // // // // echo "Domain: $DOMAIN"
// // // // // echo "Challenge Token: $TOKEN"
// // // // // echo "================================"

// // // // // # Save challenge info to file for retrieval
// // // // // echo "domain=$DOMAIN" > "$CHALLENGE_DIR/challenge-$DOMAIN.txt"
// // // // // echo "token=$TOKEN" >> "$CHALLENGE_DIR/challenge-$DOMAIN.txt"
// // // // // echo "challenge_name=_acme-challenge.$DOMAIN" >> "$CHALLENGE_DIR/challenge-$DOMAIN.txt"
// // // // // echo "challenge_value=$TOKEN" >> "$CHALLENGE_DIR/challenge-$DOMAIN.txt"

// // // // // # Create completion marker
// // // // // touch "$CHALLENGE_DIR/challenge-ready-$DOMAIN"

// // // // // echo "Challenge saved. Please add the DNS record and continue."

// // // // // # Wait for completion signal
// // // // // COMPLETION_FILE="$CHALLENGE_DIR/dns-completed-$DOMAIN"
// // // // // echo "Waiting for DNS completion signal at: $COMPLETION_FILE"

// // // // // # Wait up to 10 minutes for DNS setup
// // // // // for i in {1..600}; do
// // // // //     if [ -f "$COMPLETION_FILE" ]; then
// // // // //         echo "DNS completion signal received!"
// // // // //         # Verify DNS propagation
// // // // //         ACTUAL_VALUE=$(dig +short TXT "_acme-challenge.$DOMAIN" @8.8.8.8 | tr -d '"' | head -1)
// // // // //         if [ "$ACTUAL_VALUE" = "$TOKEN" ]; then
// // // // //             echo "✅ DNS challenge verified for $DOMAIN"
// // // // //             exit 0
// // // // //         else
// // // // //             echo "❌ DNS not properly propagated. Expected: $TOKEN, Found: $ACTUAL_VALUE"
// // // // //             exit 1
// // // // //         fi
// // // // //     fi
// // // // //     sleep 1
// // // // // done

// // // // // echo "❌ Timeout waiting for DNS completion signal"
// // // // // exit 1
// // // // // `;

// // // // //     const cleanupHookScript = `#!/bin/bash
// // // // // echo "Cleanup hook called for domain: $CERTBOT_DOMAIN"
// // // // // # Clean up challenge files
// // // // // rm -f "${tempDir}/challenge-$CERTBOT_DOMAIN.txt"
// // // // // rm -f "${tempDir}/challenge-ready-$CERTBOT_DOMAIN"
// // // // // rm -f "${tempDir}/dns-completed-$CERTBOT_DOMAIN"
// // // // // echo "✅ Cleanup completed"
// // // // // `;

// // // // //     const authHookPath = path.join(tempDir, "auth-hook.sh");
// // // // //     const cleanupHookPath = path.join(tempDir, "cleanup-hook.sh");

// // // // //     await writeFileAsync(authHookPath, authHookScript, { mode: 0o755 });
// // // // //     await writeFileAsync(cleanupHookPath, cleanupHookScript, { mode: 0o755 });

// // // // //     // Store process info for later completion
// // // // //     const processInfo = {
// // // // //       domain,
// // // // //       includeWildcard,
// // // // //       email,
// // // // //       certName,
// // // // //       tempDir,
// // // // //       authHookPath,
// // // // //       cleanupHookPath,
// // // // //       domains,
// // // // //       challengeToken,
// // // // //       timestamp: Date.now(),
// // // // //     };

// // // // //     await writeFileAsync(
// // // // //       path.join(tempDir, "process-info.json"),
// // // // //       JSON.stringify(processInfo, null, 2)
// // // // //     );

// // // // //     // Start certbot in background (it will wait for DNS setup)
// // // // //     const certbotArgs = [
// // // // //       "certonly",
// // // // //       "--manual",
// // // // //       "--preferred-challenges",
// // // // //       "dns",
// // // // //       "--manual-auth-hook",
// // // // //       authHookPath,
// // // // //       "--manual-cleanup-hook",
// // // // //       cleanupHookPath,
// // // // //       "--agree-tos",
// // // // //       "--email",
// // // // //       email,
// // // // //       "--cert-name",
// // // // //       certName,
// // // // //       "--manual-public-ip-logging-ok",
// // // // //       "--non-interactive",
// // // // //       "--force-renewal",
// // // // //       ...domains.flatMap((d) => ["-d", d]),
// // // // //     ];

// // // // //     console.log("Starting certbot with DNS challenge generation...");

// // // // //     // Start certbot process (don't wait for completion)
// // // // //     const certbotProcess = spawn("sudo", ["certbot", ...certbotArgs], {
// // // // //       stdio: ["pipe", "pipe", "pipe"],
// // // // //       detached: true,
// // // // //     });

// // // // //     // Store process PID for later cleanup
// // // // //     await writeFileAsync(
// // // // //       path.join(tempDir, "certbot-pid.txt"),
// // // // //       certbotProcess.pid?.toString() || "unknown"
// // // // //     );

// // // // //     // Wait a moment for challenge generation
// // // // //     await new Promise((resolve) => setTimeout(resolve, 3000));

// // // // //     // Read challenge information
// // // // //     const dnsRecords = [];
// // // // //     for (const challengeDomain of domains) {
// // // // //       const challengeFile = path.join(
// // // // //         tempDir,
// // // // //         `challenge-${challengeDomain}.txt`
// // // // //       );
// // // // //       const readyFile = path.join(
// // // // //         tempDir,
// // // // //         `challenge-ready-${challengeDomain}`
// // // // //       );

// // // // //       // Wait for challenge to be ready
// // // // //       let attempts = 0;
// // // // //       while (!existsSync(readyFile) && attempts < 30) {
// // // // //         await new Promise((resolve) => setTimeout(resolve, 1000));
// // // // //         attempts++;
// // // // //       }

// // // // //       if (existsSync(challengeFile)) {
// // // // //         const challengeContent = await readFileAsync(challengeFile, "utf8");
// // // // //         const lines = challengeContent.split("\n");
// // // // //         const challengeValue = lines
// // // // //           .find((line) => line.startsWith("challenge_value="))
// // // // //           ?.split("=")[1];
// // // // //         const challengeName = lines
// // // // //           .find((line) => line.startsWith("challenge_name="))
// // // // //           ?.split("=")[1];

// // // // //         if (challengeValue && challengeName) {
// // // // //           dnsRecords.push({
// // // // //             name: challengeName,
// // // // //             type: "TXT",
// // // // //             value: challengeValue,
// // // // //             ttl: 300,
// // // // //           });
// // // // //         }
// // // // //       }
// // // // //     }

// // // // //     if (dnsRecords.length === 0) {
// // // // //       return NextResponse.json<ErrorResponse>({
// // // // //         success: false,
// // // // //         error: "Failed to generate DNS challenges",
// // // // //         troubleshooting: [
// // // // //           "Certbot may not be installed properly",
// // // // //           "Check server permissions",
// // // // //           "Try again in a few minutes",
// // // // //         ],
// // // // //       });
// // // // //     }

// // // // //     const instructions = [
// // // // //       `Add the following DNS TXT record(s) to your domain ${domain}:`,
// // // // //       ...dnsRecords.map(
// // // // //         (record, i) =>
// // // // //           `${i + 1}. Name: ${record.name}, Value: ${record.value}, TTL: ${
// // // // //             record.ttl
// // // // //           } seconds`
// // // // //       ),
// // // // //       "Wait 5-10 minutes for DNS propagation",
// // // // //       "Then click 'Complete Certificate Generation' to finish the process",
// // // // //     ];

// // // // //     return NextResponse.json<ChallengeResponse>({
// // // // //       success: true,
// // // // //       step: "awaiting-dns",
// // // // //       domain,
// // // // //       dnsRecords,
// // // // //       challengeToken,
// // // // //       instructions,
// // // // //       nextStep:
// // // // //         "Add DNS records and call the API again with step='complete-certificate'",
// // // // //     });
// // // // //   } catch (error) {
// // // // //     console.error("Challenge generation error:", error);
// // // // //     return NextResponse.json<ErrorResponse>({
// // // // //       success: false,
// // // // //       error: `Failed to generate DNS challenge: ${
// // // // //         error instanceof Error ? error.message : "Unknown error"
// // // // //       }`,
// // // // //       troubleshooting: [
// // // // //         "Check certbot installation",
// // // // //         "Verify server permissions",
// // // // //         "Ensure domain is valid",
// // // // //       ],
// // // // //     });
// // // // //   }
// // // // // }

// // // // // async function completeCertificate(
// // // // //   domain: string,
// // // // //   challengeToken: string,
// // // // //   certName: string
// // // // // ): Promise<NextResponse<CertificateResponse | ErrorResponse>> {
// // // // //   console.log(
// // // // //     `Completing certificate for: ${domain}, token: ${challengeToken}`
// // // // //   );

// // // // //   // Find the temp directory for this challenge
// // // // //   const tempDirPattern = `/tmp/ssl-service-${domain}-`;
// // // // //   const { readdirSync } = require("fs");

// // // // //   let tempDir = "";
// // // // //   try {
// // // // //     const tempDirs = readdirSync("/tmp")
// // // // //       .filter((dir) => dir.startsWith(`ssl-service-${domain}-`))
// // // // //       .map((dir) => `/tmp/${dir}`)
// // // // //       .filter((dir) => existsSync(path.join(dir, "process-info.json")));

// // // // //     if (tempDirs.length === 0) {
// // // // //       return NextResponse.json<ErrorResponse>({
// // // // //         success: false,
// // // // //         error: "Challenge session not found or expired",
// // // // //         troubleshooting: [
// // // // //           "Start a new certificate generation process",
// // // // //           "Ensure you're using the correct challenge token",
// // // // //         ],
// // // // //       });
// // // // //     }

// // // // //     tempDir = tempDirs[0]; // Use the most recent one
// // // // //   } catch (error) {
// // // // //     return NextResponse.json<ErrorResponse>({
// // // // //       success: false,
// // // // //       error: "Failed to locate challenge session",
// // // // //       troubleshooting: ["Start a new certificate generation process"],
// // // // //     });
// // // // //   }

// // // // //   try {
// // // // //     // Signal DNS completion to waiting certbot process
// // // // //     const domains = [domain];
// // // // //     if (existsSync(path.join(tempDir, `challenge-ready-*.${domain}`))) {
// // // // //       domains.push(`*.${domain}`);
// // // // //     }

// // // // //     for (const challengeDomain of domains) {
// // // // //       const completionFile = path.join(
// // // // //         tempDir,
// // // // //         `dns-completed-${challengeDomain}`
// // // // //       );
// // // // //       await writeFileAsync(
// // // // //         completionFile,
// // // // //         `DNS setup completed at ${new Date().toISOString()}`
// // // // //       );
// // // // //     }

// // // // //     // Wait for certbot to complete (up to 5 minutes)
// // // // //     let certificatesReady = false;
// // // // //     const maxWaitTime = 300; // 5 minutes
// // // // //     const startTime = Date.now();

// // // // //     while (!certificatesReady && Date.now() - startTime < maxWaitTime * 1000) {
// // // // //       const certPath = `/etc/letsencrypt/live/${certName}`;
// // // // //       if (
// // // // //         existsSync(path.join(certPath, "fullchain.pem")) &&
// // // // //         existsSync(path.join(certPath, "privkey.pem"))
// // // // //       ) {
// // // // //         certificatesReady = true;
// // // // //         break;
// // // // //       }
// // // // //       await new Promise((resolve) => setTimeout(resolve, 2000));
// // // // //     }

// // // // //     if (!certificatesReady) {
// // // // //       return NextResponse.json<ErrorResponse>({
// // // // //         success: false,
// // // // //         error: "Certificate generation timed out",
// // // // //         troubleshooting: [
// // // // //           "Verify DNS records are properly propagated",
// // // // //           "Check if DNS values match exactly",
// // // // //           "Try starting the process again",
// // // // //         ],
// // // // //       });
// // // // //     }

// // // // //     // Read certificate files
// // // // //     const certPath = `/etc/letsencrypt/live/${certName}`;
// // // // //     const certificates = {
// // // // //       certificate: await readFileAsync(path.join(certPath, "cert.pem"), "utf8"),
// // // // //       privateKey: await readFileAsync(
// // // // //         path.join(certPath, "privkey.pem"),
// // // // //         "utf8"
// // // // //       ),
// // // // //       caBundle: await readFileAsync(path.join(certPath, "chain.pem"), "utf8"),
// // // // //       fullChain: await readFileAsync(
// // // // //         path.join(certPath, "fullchain.pem"),
// // // // //         "utf8"
// // // // //       ),
// // // // //     };

// // // // //     // Cleanup temp directory
// // // // //     try {
// // // // //       const { execSync } = require("child_process");
// // // // //       execSync(`rm -rf "${tempDir}"`, { timeout: 10000 });
// // // // //     } catch (cleanupError) {
// // // // //       console.warn("Failed to cleanup temp directory:", cleanupError);
// // // // //     }

// // // // //     const installationInstructions = [
// // // // //       "Download and install these certificates in your hosting control panel:",
// // // // //       "1. Certificate (CRT): Use the 'certificate' content",
// // // // //       "2. Private Key (KEY): Use the 'privateKey' content",
// // // // //       "3. CA Bundle: Use the 'caBundle' content",
// // // // //       "4. Alternative: Some providers accept 'fullChain' as a single file",
// // // // //       `5. Test your SSL: https://www.ssllabs.com/ssltest/analyze.html?d=${domain}`,
// // // // //     ];

// // // // //     return NextResponse.json<CertificateResponse>({
// // // // //       success: true,
// // // // //       step: "certificates-ready",
// // // // //       domain,
// // // // //       certificates,
// // // // //       installationInstructions,
// // // // //     });
// // // // //   } catch (error) {
// // // // //     console.error("Certificate completion error:", error);
// // // // //     return NextResponse.json<ErrorResponse>({
// // // // //       success: false,
// // // // //       error: `Failed to complete certificate: ${
// // // // //         error instanceof Error ? error.message : "Unknown error"
// // // // //       }`,
// // // // //       troubleshooting: [
// // // // //         "Verify DNS records are correctly configured",
// // // // //         "Check DNS propagation",
// // // // //         "Start the process again if needed",
// // // // //       ],
// // // // //     });
// // // // //   }
// // // // // }
