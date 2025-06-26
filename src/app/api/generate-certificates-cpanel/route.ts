// app/api/generate-certificates-cpanel/route.ts
import { NextRequest, NextResponse } from "next/server";
import { spawn, ChildProcess } from "child_process";
import { readFile, writeFile, existsSync, mkdirSync } from "fs";
import { promisify } from "util";
import path from "path";

const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);

interface DnsRecord {
  name: string;
  type: string;
  value: string;
  domain: string;
}

interface CertificateFiles {
  fullchain: string;
  privkey: string;
  cert: string;
  chain: string;
}

interface GenerateCertificatesRequest {
  domain: string;
  dnsRecords: DnsRecord[];
}

interface GenerateCertificatesSuccessResponse {
  success: true;
  message: string;
  certificates: CertificateFiles;
  domain: string;
  certName: string;
  cpanelInstructions: {
    certificate: string;
    privateKey: string;
    caBundle: string;
  };
  installationSteps: string[];
}

interface GenerateCertificatesErrorResponse {
  success: false;
  error: string;
  troubleshooting: string[];
  output?: string;
  errorOutput?: string;
}

type GenerateCertificatesResponse =
  | GenerateCertificatesSuccessResponse
  | GenerateCertificatesErrorResponse;

export async function POST(
  request: NextRequest
): Promise<NextResponse<GenerateCertificatesResponse>> {
  try {
    const body: GenerateCertificatesRequest = await request.json();
    const { domain, dnsRecords } = body;

    if (!domain || !dnsRecords || !Array.isArray(dnsRecords)) {
      return NextResponse.json<GenerateCertificatesErrorResponse>(
        {
          success: false,
          error: "Domain and DNS records are required",
          troubleshooting: ["Provide valid domain and DNS records"],
        },
        { status: 400 }
      );
    }

    // Validate domain format
    const domainRegex =
      /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return NextResponse.json<GenerateCertificatesErrorResponse>(
        {
          success: false,
          error: "Invalid domain format",
          troubleshooting: ["Ensure domain follows the format: example.com"],
        },
        { status: 400 }
      );
    }

    console.log(
      `Starting cPanel-ready certificate generation for domain: ${domain}`
    );

    const certName: string = domain.replace(/\*\./g, "wildcard-");
    const tempDir = `/tmp/ssl-gen-${Date.now()}`;
    const email = `admin@${domain}`;

    // Create temporary directory for our files
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    try {
      // Create auth hook script that uses our verified DNS records
      const authHookScript = `#!/bin/bash
# SSL Generator Auth Hook
set -e

DOMAIN="$CERTBOT_DOMAIN"
TOKEN="$CERTBOT_TOKEN"

echo "Auth hook called for domain: $DOMAIN"
echo "Token: $TOKEN"

# Array of all our verified DNS challenge values for this domain
VALID_VALUES=(
${dnsRecords
  .map((record) => {
    const cleanDomain = record.name.replace("_acme-challenge.", "");
    return `  # ${cleanDomain}: "${record.value}"`;
  })
  .join("\n")}
${dnsRecords.map((record) => `  "${record.value}"`).join("\n")}
)

echo "Checking against \${#VALID_VALUES[@]} valid values..."

# Get all current DNS TXT records for this domain
ACTUAL_VALUES=$(dig +short TXT "_acme-challenge.$DOMAIN" | tr -d '"')

echo "Found DNS records:"
echo "$ACTUAL_VALUES"

# Check if any of our valid values match any of the actual DNS values
FOUND_MATCH=false
for valid_value in "\${VALID_VALUES[@]}"; do
    echo "Checking for: $valid_value"
    if echo "$ACTUAL_VALUES" | grep -q "$valid_value"; then
        echo "✅ Found matching DNS record for $DOMAIN: $valid_value"
        FOUND_MATCH=true
        break
    fi
done

if [ "$FOUND_MATCH" = true ]; then
    echo "✅ DNS validation successful for $DOMAIN"
    exit 0
else
    echo "❌ No matching DNS record found for $DOMAIN"
    echo "Expected one of:"
    printf '  %s\n' "\${VALID_VALUES[@]}"
    echo "Found:"
    echo "$ACTUAL_VALUES"
    exit 1
fi
`;

      const cleanupHookScript = `#!/bin/bash
# SSL Generator Cleanup Hook
echo "Cleanup hook called for domain: $CERTBOT_DOMAIN"
echo "✅ Cleanup completed"
exit 0
`;

      const authHookPath = path.join(tempDir, "auth-hook.sh");
      const cleanupHookPath = path.join(tempDir, "cleanup-hook.sh");

      await writeFileAsync(authHookPath, authHookScript, { mode: 0o755 });
      await writeFileAsync(cleanupHookPath, cleanupHookScript, { mode: 0o755 });

      console.log(`Created auth hooks in: ${tempDir}`);

      // Extract domains from DNS records
      const domains: string[] = [
        ...new Set(dnsRecords.map((record: DnsRecord) => record.domain)),
      ];

      // Check if wildcard is needed based on DNS records
      const hasWildcardRecord = dnsRecords.some(
        (record) =>
          record.name.includes(`_acme-challenge.${domain}`) &&
          record.domain === domain
      );

      if (hasWildcardRecord && !domains.includes(`*.${domain}`)) {
        domains.push(`*.${domain}`);
      }

      console.log(`Generating certificates for domains: ${domains.join(", ")}`);

      // Build certbot command with our auth hooks
      const certbotArgs: string[] = [
        "certonly",
        "--manual",
        "--preferred-challenges",
        "dns",
        "--manual-auth-hook",
        authHookPath,
        "--manual-cleanup-hook",
        cleanupHookPath,
        "--agree-tos",
        "--email",
        email,
        "--server",
        "https://acme-v02.api.letsencrypt.org/directory",
        "--cert-name",
        certName,
        "--manual-public-ip-logging-ok",
        "--non-interactive",
        "--force-renewal",
        ...domains.flatMap((d: string) => ["-d", d]),
      ];

      console.log("Running certbot with args:", certbotArgs.join(" "));

      const result = await new Promise<{
        success: boolean;
        output: string;
        errorOutput: string;
        exitCode: number | null;
      }>((resolve) => {
        const certbotProcess: ChildProcess = spawn(
          "sudo",
          ["certbot", ...certbotArgs],
          {
            stdio: ["pipe", "pipe", "pipe"],
          }
        );

        let output: string = "";
        let errorOutput: string = "";

        certbotProcess.stdout?.on("data", (data: Buffer) => {
          const text: string = data.toString();
          output += text;
          console.log("Certbot stdout:", text);
        });

        certbotProcess.stderr?.on("data", (data: Buffer) => {
          const text: string = data.toString();
          errorOutput += text;
          console.error("Certbot stderr:", text);
        });

        certbotProcess.on("close", (code: number | null) => {
          console.log(`Certbot process ended with code: ${code}`);
          resolve({
            success: code === 0,
            output,
            errorOutput,
            exitCode: code,
          });
        });

        certbotProcess.on("error", (error: Error) => {
          console.error("Certbot process error:", error);
          resolve({
            success: false,
            output,
            errorOutput: error.message,
            exitCode: -1,
          });
        });

        // Timeout after 5 minutes
        setTimeout(() => {
          certbotProcess.kill("SIGTERM");
          resolve({
            success: false,
            output,
            errorOutput: "Process timed out after 5 minutes",
            exitCode: -1,
          });
        }, 300000);
      });

      if (result.success) {
        // Read certificate files
        const certPath: string = `/etc/letsencrypt/live/${certName}`;
        console.log(`Reading certificates from: ${certPath}`);

        if (existsSync(certPath)) {
          const certificateFiles: CertificateFiles = {
            fullchain: "",
            privkey: "",
            cert: "",
            chain: "",
          };

          // Read each certificate file
          const files: Array<{ key: keyof CertificateFiles; path: string }> = [
            { key: "fullchain", path: `${certPath}/fullchain.pem` },
            { key: "privkey", path: `${certPath}/privkey.pem` },
            { key: "cert", path: `${certPath}/cert.pem` },
            { key: "chain", path: `${certPath}/chain.pem` },
          ];

          let allFilesRead = true;

          for (const file of files) {
            if (existsSync(file.path)) {
              try {
                const content: string = await readFileAsync(file.path, "utf8");
                certificateFiles[file.key] = content.toString();
                console.log(
                  `Successfully read ${file.key} (${content.length} characters)`
                );
              } catch (readError) {
                console.error(`Failed to read ${file.key}:`, readError);
                allFilesRead = false;
              }
            } else {
              console.error(`Certificate file not found: ${file.path}`);
              allFilesRead = false;
            }
          }

          if (
            allFilesRead &&
            certificateFiles.cert &&
            certificateFiles.privkey
          ) {
            // Prepare cPanel-ready format
            const cpanelInstructions = {
              certificate: certificateFiles.cert,
              privateKey: certificateFiles.privkey,
              caBundle: certificateFiles.chain || "", // Chain file for CA Bundle
            };

            const installationSteps = [
              "1. Go to cPanel → SSL/TLS → Install and Manage SSL",
              `2. Select domain: ${domain}`,
              "3. Copy the Certificate (CRT) content below and paste it in the Certificate field",
              "4. Copy the Private Key (KEY) content below and paste it in the Private Key field",
              "5. Copy the CA Bundle content below and paste it in the CABUNDLE field (if required)",
              "6. Click 'Install Certificate'",
              "7. Your SSL certificate will be active within a few minutes",
            ];

            return NextResponse.json<GenerateCertificatesSuccessResponse>({
              success: true,
              message: `SSL certificates generated successfully for ${domain}! Ready for cPanel installation.`,
              certificates: certificateFiles,
              domain,
              certName,
              cpanelInstructions,
              installationSteps,
            });
          }
        }

        return NextResponse.json<GenerateCertificatesErrorResponse>({
          success: false,
          error: `Certificate files not found or incomplete after generation for ${domain}`,
          troubleshooting: [
            "Certbot completed but certificate files are missing or incomplete",
            "Check certbot logs: sudo journalctl -u certbot",
            "Verify DNS records are still propagated",
            "Try running certbot manually to see detailed output",
          ],
          output: result.output,
          errorOutput: result.errorOutput,
        });
      } else {
        return NextResponse.json<GenerateCertificatesErrorResponse>({
          success: false,
          error: `Certificate generation failed for ${domain} (exit code: ${result.exitCode})`,
          troubleshooting: [
            "DNS validation may have failed",
            "Check if DNS records are correctly configured and propagated",
            "Verify certbot has proper permissions",
            "Check server connectivity to Let's Encrypt",
            "Review the error output below for specific issues",
          ],
          output: result.output,
          errorOutput: result.errorOutput,
        });
      }
    } finally {
      // Cleanup temporary files
      try {
        const { execSync } = require("child_process");
        execSync(`rm -rf "${tempDir}"`, { timeout: 10000 });
        console.log(`Cleaned up temporary directory: ${tempDir}`);
      } catch (cleanupError) {
        console.warn(`Failed to cleanup temporary directory: ${cleanupError}`);
      }
    }
  } catch (error) {
    console.error(`Certificate generation error:`, error);
    return NextResponse.json<GenerateCertificatesErrorResponse>(
      {
        success: false,
        error: `Internal server error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        troubleshooting: [
          "Check server configuration and permissions",
          "Verify certbot installation",
          "Ensure proper DNS record format",
          "Try again with a valid domain and DNS records",
        ],
      },
      { status: 500 }
    );
  }
}

// // app/api/generate-certificates-cpanel/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import { spawn, ChildProcess } from "child_process";
// import { readFile, writeFile, existsSync, mkdirSync } from "fs";
// import { promisify } from "util";
// import path from "path";

// const readFileAsync = promisify(readFile);
// const writeFileAsync = promisify(writeFile);

// interface DnsRecord {
//   name: string;
//   type: string;
//   value: string;
//   domain: string;
// }

// interface CertificateFiles {
//   fullchain: string;
//   privkey: string;
//   cert: string;
//   chain: string;
// }

// interface GenerateCertificatesRequest {
//   domain: string;
//   dnsRecords: DnsRecord[];
// }

// interface GenerateCertificatesSuccessResponse {
//   success: true;
//   message: string;
//   certificates: CertificateFiles;
//   domain: string;
//   certName: string;
//   cpanelInstructions: {
//     certificate: string;
//     privateKey: string;
//     caBundle: string;
//   };
//   installationSteps: string[];
// }

// interface GenerateCertificatesErrorResponse {
//   success: false;
//   error: string;
//   troubleshooting: string[];
//   output?: string;
//   errorOutput?: string;
// }

// type GenerateCertificatesResponse =
//   | GenerateCertificatesSuccessResponse
//   | GenerateCertificatesErrorResponse;

// export async function POST(
//   request: NextRequest
// ): Promise<NextResponse<GenerateCertificatesResponse>> {
//   try {
//     const body: GenerateCertificatesRequest = await request.json();
//     const { domain, dnsRecords } = body;

//     if (!domain || !dnsRecords || !Array.isArray(dnsRecords)) {
//       return NextResponse.json<GenerateCertificatesErrorResponse>(
//         {
//           success: false,
//           error: "Domain and DNS records are required",
//           troubleshooting: ["Provide valid domain and DNS records"],
//         },
//         { status: 400 }
//       );
//     }

//     // Validate domain format
//     const domainRegex =
//       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
//     if (!domainRegex.test(domain)) {
//       return NextResponse.json<GenerateCertificatesErrorResponse>(
//         {
//           success: false,
//           error: "Invalid domain format",
//           troubleshooting: ["Ensure domain follows the format: example.com"],
//         },
//         { status: 400 }
//       );
//     }

//     console.log(
//       `Starting cPanel-ready certificate generation for domain: ${domain}`
//     );

//     const certName: string = domain.replace(/\*\./g, "wildcard-");
//     const tempDir = `/tmp/ssl-gen-${Date.now()}`;
//     const email = `admin@${domain}`;

//     // Create temporary directory for our files
//     if (!existsSync(tempDir)) {
//       mkdirSync(tempDir, { recursive: true });
//     }

//     try {
//       // Create auth hook script that uses our verified DNS records
//       const authHookScript = `#!/bin/bash
// # SSL Generator Auth Hook
// set -e

// DOMAIN="$CERTBOT_DOMAIN"
// TOKEN="$CERTBOT_TOKEN"

// echo "Auth hook called for domain: $DOMAIN"
// echo "Token: $TOKEN"

// # Map of our verified DNS challenge values
// declare -A DNS_RECORDS
// ${dnsRecords
//   .map((record) => {
//     const cleanDomain = record.name.replace("_acme-challenge.", "");
//     return `DNS_RECORDS["${cleanDomain}"]="${record.value}"`;
//   })
//   .join("\n")}

// # Check if we have a pre-verified record for this domain
// if [[ -n "\${DNS_RECORDS[\$DOMAIN]}" ]]; then
//     EXPECTED_VALUE="\${DNS_RECORDS[\$DOMAIN]}"
//     echo "Using pre-verified DNS record value: $EXPECTED_VALUE"

//     # Verify the DNS record exists
//     ACTUAL_VALUE=$(dig +short TXT "_acme-challenge.$DOMAIN" | tr -d '"' | head -1)

//     if [[ "$ACTUAL_VALUE" == "$EXPECTED_VALUE" ]]; then
//         echo "✅ DNS record verified for $DOMAIN"
//         exit 0
//     else
//         echo "❌ DNS record mismatch for $DOMAIN"
//         echo "Expected: $EXPECTED_VALUE"
//         echo "Actual: $ACTUAL_VALUE"
//         exit 1
//     fi
// else
//     echo "❌ No pre-verified DNS record found for $DOMAIN"
//     exit 1
// fi
// `;

//       const cleanupHookScript = `#!/bin/bash
// # SSL Generator Cleanup Hook
// echo "Cleanup hook called for domain: $CERTBOT_DOMAIN"
// echo "✅ Cleanup completed"
// exit 0
// `;

//       const authHookPath = path.join(tempDir, "auth-hook.sh");
//       const cleanupHookPath = path.join(tempDir, "cleanup-hook.sh");

//       await writeFileAsync(authHookPath, authHookScript, { mode: 0o755 });
//       await writeFileAsync(cleanupHookPath, cleanupHookScript, { mode: 0o755 });

//       console.log(`Created auth hooks in: ${tempDir}`);

//       // Extract domains from DNS records
//       const domains: string[] = [
//         ...new Set(dnsRecords.map((record: DnsRecord) => record.domain)),
//       ];

//       // Check if wildcard is needed based on DNS records
//       const hasWildcardRecord = dnsRecords.some(
//         (record) =>
//           record.name.includes(`_acme-challenge.${domain}`) &&
//           record.domain === domain
//       );

//       if (hasWildcardRecord && !domains.includes(`*.${domain}`)) {
//         domains.push(`*.${domain}`);
//       }

//       console.log(`Generating certificates for domains: ${domains.join(", ")}`);

//       // Build certbot command with our auth hooks
//       const certbotArgs: string[] = [
//         "certonly",
//         "--manual",
//         "--preferred-challenges",
//         "dns",
//         "--manual-auth-hook",
//         authHookPath,
//         "--manual-cleanup-hook",
//         cleanupHookPath,
//         "--agree-tos",
//         "--email",
//         email,
//         "--server",
//         "https://acme-v02.api.letsencrypt.org/directory",
//         "--cert-name",
//         certName,
//         "--manual-public-ip-logging-ok",
//         "--non-interactive",
//         "--force-renewal",
//         ...domains.flatMap((d: string) => ["-d", d]),
//       ];

//       console.log("Running certbot with args:", certbotArgs.join(" "));

//       const result = await new Promise<{
//         success: boolean;
//         output: string;
//         errorOutput: string;
//         exitCode: number | null;
//       }>((resolve) => {
//         const certbotProcess: ChildProcess = spawn(
//           "sudo",
//           ["certbot", ...certbotArgs],
//           {
//             stdio: ["pipe", "pipe", "pipe"],
//           }
//         );

//         let output: string = "";
//         let errorOutput: string = "";

//         certbotProcess.stdout?.on("data", (data: Buffer) => {
//           const text: string = data.toString();
//           output += text;
//           console.log("Certbot stdout:", text);
//         });

//         certbotProcess.stderr?.on("data", (data: Buffer) => {
//           const text: string = data.toString();
//           errorOutput += text;
//           console.error("Certbot stderr:", text);
//         });

//         certbotProcess.on("close", (code: number | null) => {
//           console.log(`Certbot process ended with code: ${code}`);
//           resolve({
//             success: code === 0,
//             output,
//             errorOutput,
//             exitCode: code,
//           });
//         });

//         certbotProcess.on("error", (error: Error) => {
//           console.error("Certbot process error:", error);
//           resolve({
//             success: false,
//             output,
//             errorOutput: error.message,
//             exitCode: -1,
//           });
//         });

//         // Timeout after 5 minutes
//         setTimeout(() => {
//           certbotProcess.kill("SIGTERM");
//           resolve({
//             success: false,
//             output,
//             errorOutput: "Process timed out after 5 minutes",
//             exitCode: -1,
//           });
//         }, 300000);
//       });

//       if (result.success) {
//         // Read certificate files
//         const certPath: string = `/etc/letsencrypt/live/${certName}`;
//         console.log(`Reading certificates from: ${certPath}`);

//         if (existsSync(certPath)) {
//           const certificateFiles: CertificateFiles = {
//             fullchain: "",
//             privkey: "",
//             cert: "",
//             chain: "",
//           };

//           // Read each certificate file
//           const files: Array<{ key: keyof CertificateFiles; path: string }> = [
//             { key: "fullchain", path: `${certPath}/fullchain.pem` },
//             { key: "privkey", path: `${certPath}/privkey.pem` },
//             { key: "cert", path: `${certPath}/cert.pem` },
//             { key: "chain", path: `${certPath}/chain.pem` },
//           ];

//           let allFilesRead = true;

//           for (const file of files) {
//             if (existsSync(file.path)) {
//               try {
//                 const content: string = await readFileAsync(file.path, "utf8");
//                 certificateFiles[file.key] = content.toString();
//                 console.log(
//                   `Successfully read ${file.key} (${content.length} characters)`
//                 );
//               } catch (readError) {
//                 console.error(`Failed to read ${file.key}:`, readError);
//                 allFilesRead = false;
//               }
//             } else {
//               console.error(`Certificate file not found: ${file.path}`);
//               allFilesRead = false;
//             }
//           }

//           if (
//             allFilesRead &&
//             certificateFiles.cert &&
//             certificateFiles.privkey
//           ) {
//             // Prepare cPanel-ready format
//             const cpanelInstructions = {
//               certificate: certificateFiles.cert,
//               privateKey: certificateFiles.privkey,
//               caBundle: certificateFiles.chain || "", // Chain file for CA Bundle
//             };

//             const installationSteps = [
//               "1. Go to cPanel → SSL/TLS → Install and Manage SSL",
//               `2. Select domain: ${domain}`,
//               "3. Copy the Certificate (CRT) content below and paste it in the Certificate field",
//               "4. Copy the Private Key (KEY) content below and paste it in the Private Key field",
//               "5. Copy the CA Bundle content below and paste it in the CABUNDLE field (if required)",
//               "6. Click 'Install Certificate'",
//               "7. Your SSL certificate will be active within a few minutes",
//             ];

//             return NextResponse.json<GenerateCertificatesSuccessResponse>({
//               success: true,
//               message: `SSL certificates generated successfully for ${domain}! Ready for cPanel installation.`,
//               certificates: certificateFiles,
//               domain,
//               certName,
//               cpanelInstructions,
//               installationSteps,
//             });
//           }
//         }

//         return NextResponse.json<GenerateCertificatesErrorResponse>({
//           success: false,
//           error: `Certificate files not found or incomplete after generation for ${domain}`,
//           troubleshooting: [
//             "Certbot completed but certificate files are missing or incomplete",
//             "Check certbot logs: sudo journalctl -u certbot",
//             "Verify DNS records are still propagated",
//             "Try running certbot manually to see detailed output",
//           ],
//           output: result.output,
//           errorOutput: result.errorOutput,
//         });
//       } else {
//         return NextResponse.json<GenerateCertificatesErrorResponse>({
//           success: false,
//           error: `Certificate generation failed for ${domain} (exit code: ${result.exitCode})`,
//           troubleshooting: [
//             "DNS validation may have failed",
//             "Check if DNS records are correctly configured and propagated",
//             "Verify certbot has proper permissions",
//             "Check server connectivity to Let's Encrypt",
//             "Review the error output below for specific issues",
//           ],
//           output: result.output,
//           errorOutput: result.errorOutput,
//         });
//       }
//     } finally {
//       // Cleanup temporary files
//       try {
//         const { execSync } = require("child_process");
//         execSync(`rm -rf "${tempDir}"`, { timeout: 10000 });
//         console.log(`Cleaned up temporary directory: ${tempDir}`);
//       } catch (cleanupError) {
//         console.warn(`Failed to cleanup temporary directory: ${cleanupError}`);
//       }
//     }
//   } catch (error) {
//     console.error(`Certificate generation error:`, error);
//     return NextResponse.json<GenerateCertificatesErrorResponse>(
//       {
//         success: false,
//         error: `Internal server error: ${
//           error instanceof Error ? error.message : "Unknown error"
//         }`,
//         troubleshooting: [
//           "Check server configuration and permissions",
//           "Verify certbot installation",
//           "Ensure proper DNS record format",
//           "Try again with a valid domain and DNS records",
//         ],
//       },
//       { status: 500 }
//     );
//   }
// }
// // // app/api/manual-certificate-command/route.ts
// // import { NextRequest, NextResponse } from "next/server";

// // interface DnsRecord {
// //   name: string;
// //   type: string;
// //   value: string;
// //   domain: string;
// // }

// // interface ManualCertificateRequest {
// //   domain: string;
// //   email: string;
// //   includeWildcard?: boolean;
// //   dnsRecords?: DnsRecord[];
// // }

// // interface ManualCertificateSuccessResponse {
// //   success: true;
// //   domain: string;
// //   certName: string;
// //   manualCommand: string;
// //   stepByStepInstructions: string[];
// //   dnsRecordsNeeded: DnsRecord[];
// //   troubleshootingTips: string[];
// //   certificatePaths: {
// //     fullchain: string;
// //     privkey: string;
// //     cert: string;
// //     chain: string;
// //   };
// //   renewalCommand: string;
// // }

// // interface ManualCertificateErrorResponse {
// //   success: false;
// //   error: string;
// // }

// // type ManualCertificateResponse =
// //   | ManualCertificateSuccessResponse
// //   | ManualCertificateErrorResponse;

// // export async function POST(
// //   request: NextRequest
// // ): Promise<NextResponse<ManualCertificateResponse>> {
// //   try {
// //     const body: ManualCertificateRequest = await request.json();
// //     const { domain, email, includeWildcard = false, dnsRecords = [] } = body;

// //     if (!domain || !email) {
// //       return NextResponse.json<ManualCertificateErrorResponse>(
// //         { success: false, error: "Domain and email are required" },
// //         { status: 400 }
// //       );
// //     }

// //     // Validate domain format
// //     const domainRegex =
// //       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
// //     if (!domainRegex.test(domain)) {
// //       return NextResponse.json<ManualCertificateErrorResponse>(
// //         { success: false, error: "Invalid domain format" },
// //         { status: 400 }
// //       );
// //     }

// //     console.log(`Generating manual certificate command for domain: ${domain}`);

// //     // Build domains array
// //     const domains: string[] = includeWildcard
// //       ? [domain, `*.${domain}`]
// //       : [domain];
// //     const certName: string = domain.replace(/\*\./g, "wildcard-");

// //     // Generate DNS records template if not provided
// //     const dnsRecordsNeeded: DnsRecord[] =
// //       dnsRecords.length > 0
// //         ? dnsRecords
// //         : domains.map((d: string) => {
// //             const challengeDomain = d.startsWith("*.") ? d.substring(2) : d;
// //             return {
// //               name: `_acme-challenge.${challengeDomain}`,
// //               type: "TXT",
// //               value: "[VALUE_WILL_BE_SHOWN_BY_CERTBOT]",
// //               domain: challengeDomain,
// //             };
// //           });

// //     // Build the manual certbot command
// //     const domainArgs = domains.map((d: string) => `-d "${d}"`).join(" ");
// //     const manualCommand = `sudo certbot certonly \\
// //   --manual \\
// //   --preferred-challenges dns \\
// //   --email "${email}" \\
// //   --agree-tos \\
// //   --cert-name "${certName}" \\
// //   --manual-public-ip-logging-ok \\
// //   ${domainArgs}`;

// //     // Step-by-step instructions
// //     const stepByStepInstructions: string[] = [
// //       `SSH into your server where certbot is installed`,
// //       `Run the following command:`,
// //       `${manualCommand}`,
// //       `Certbot will show you the exact DNS TXT record(s) to add`,
// //       `Add each DNS TXT record to your domain's DNS settings:`,
// //       ...dnsRecordsNeeded.map(
// //         (record, index) =>
// //           `  ${index + 1}. Name: ${
// //             record.name
// //           }, Type: TXT, Value: [shown by certbot]`
// //       ),
// //       `Wait 5-10 minutes for DNS propagation`,
// //       `Press Enter in the certbot prompt to continue verification`,
// //       `Certbot will verify the DNS records and generate certificates`,
// //       `Your certificates will be saved to /etc/letsencrypt/live/${certName}/`,
// //     ];

// //     // Certificate file paths
// //     const certificatePaths = {
// //       fullchain: `/etc/letsencrypt/live/${certName}/fullchain.pem`,
// //       privkey: `/etc/letsencrypt/live/${certName}/privkey.pem`,
// //       cert: `/etc/letsencrypt/live/${certName}/cert.pem`,
// //       chain: `/etc/letsencrypt/live/${certName}/chain.pem`,
// //     };

// //     // Renewal command
// //     const renewalCommand = `sudo certbot renew --cert-name "${certName}"`;

// //     // Troubleshooting tips
// //     const troubleshootingTips: string[] = [
// //       "Make sure certbot is installed: sudo apt install certbot",
// //       "Ensure you have sudo privileges on the server",
// //       "Verify the domain is accessible from the internet",
// //       "Check that port 53 (DNS) is not blocked by firewall",
// //       "Use online DNS propagation checkers to verify records",
// //       "If wildcard certificate fails, try without wildcard first",
// //       "For rate limit issues, wait 1 hour before retrying",
// //       "Check /var/log/letsencrypt/letsencrypt.log for detailed errors",
// //       "Ensure DNS records are added to the ROOT domain, not a subdomain",
// //       "Remove any conflicting DNS records before adding new ones",
// //     ];

// //     return NextResponse.json<ManualCertificateSuccessResponse>({
// //       success: true,
// //       domain,
// //       certName,
// //       manualCommand,
// //       stepByStepInstructions,
// //       dnsRecordsNeeded,
// //       troubleshootingTips,
// //       certificatePaths,
// //       renewalCommand,
// //     });
// //   } catch (error) {
// //     console.error(`Manual certificate command generation error:`, error);
// //     return NextResponse.json<ManualCertificateErrorResponse>(
// //       {
// //         success: false,
// //         error: `Internal server error: ${
// //           error instanceof Error ? error.message : "Unknown error"
// //         }`,
// //       },
// //       { status: 500 }
// //     );
// //   }
// // }
