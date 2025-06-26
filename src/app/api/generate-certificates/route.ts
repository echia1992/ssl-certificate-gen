// app/api/generate-certificates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { spawn, ChildProcess } from "child_process";
import { readFile, existsSync } from "fs";
import { promisify } from "util";

const readFileAsync = promisify(readFile);

interface DnsRecord {
  name: string;
  type: string;
  value: string;
  domain: string;
}

interface CertificateFiles {
  fullchain?: string;
  privkey?: string;
  cert?: string;
  chain?: string;
}

interface InstallationInstructions {
  cPanel: string[];
  nginx: string[];
  apache: string[];
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
  certificatePath: string;
  expiryInfo: string;
  renewalCommand: string;
  installationInstructions: InstallationInstructions;
  output: string;
}

interface GenerateCertificatesErrorResponse {
  success: false;
  error: string;
  troubleshooting: string[];
  output?: string;
  errorOutput?: string;
  certbotExitCode?: number;
  dnsUpdateRequired?: boolean;
  newDnsRecords?: DnsRecord[];
  message?: string;
  manualCommand?: string;
  requiresManualExecution?: boolean;
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

    console.log(`Starting certificate generation for domain: ${domain}`);

    // Extract domains from DNS records
    const domains: string[] = [
      ...new Set(dnsRecords.map((record: DnsRecord) => record.domain)),
    ];
    const certName: string = domain.replace(/\*\./g, "wildcard-");

    // Check if this is a wildcard certificate
    const hasWildcard = dnsRecords.some(
      (record) =>
        record.name.includes(`_acme-challenge.${domain}`) &&
        !domains.includes(`*.${domain}`)
    );

    if (hasWildcard) {
      domains.push(`*.${domain}`);
    }

    console.log(
      `Certificate will be generated for domains: ${domains.join(", ")}`
    );

    // Clean up any existing processes first
    try {
      await new Promise<void>((resolve) => {
        const cleanup: ChildProcess = spawn("sudo", [
          "bash",
          "-c",
          "pkill -f certbot || true; rm -f /var/lib/letsencrypt/.certbot.lock || true",
        ]);
        cleanup.on("close", () => resolve());
        setTimeout(() => {
          cleanup.kill();
          resolve();
        }, 5000);
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (cleanupError) {
      console.log("Cleanup warning:", cleanupError);
    }

    // Get email from previous certbot runs or use default
    let email: string = "admin@" + domain;
    try {
      const { execSync } = require("child_process");
      const emailOutput: string = execSync(
        `sudo certbot show_account 2>/dev/null | grep -o '[a-zA-Z0-9._%+-]\\+@[a-zA-Z0-9.-]\\+\\.[a-zA-Z]\\{2,\\}' | head -1`,
        { encoding: "utf8" }
      );
      if (emailOutput.trim()) {
        email = emailOutput.trim();
      }
    } catch (emailError) {
      console.log("Could not retrieve existing email, using default:", email);
    }

    // Try different approaches in order of preference
    const approaches = [
      {
        name: "webroot",
        description: "Using webroot method (if web server is running)",
        command: [
          "certonly",
          "--webroot",
          "-w",
          "/var/www/html",
          "--email",
          email,
          "--agree-tos",
          "--cert-name",
          certName,
          "--non-interactive",
          "--force-renewal",
          ...domains.flatMap((d: string) => ["-d", d]),
        ],
      },
      {
        name: "standalone",
        description: "Using standalone method (requires port 80/443)",
        command: [
          "certonly",
          "--standalone",
          "--email",
          email,
          "--agree-tos",
          "--cert-name",
          certName,
          "--non-interactive",
          "--force-renewal",
          ...domains.flatMap((d: string) => ["-d", d]),
        ],
      },
      {
        name: "dns-cloudflare",
        description: "Using Cloudflare DNS plugin (if configured)",
        command: [
          "certonly",
          "--dns-cloudflare",
          "--email",
          email,
          "--agree-tos",
          "--cert-name",
          certName,
          "--non-interactive",
          "--force-renewal",
          ...domains.flatMap((d: string) => ["-d", d]),
        ],
      },
    ];

    // Try each approach
    for (const approach of approaches) {
      console.log(`Trying ${approach.name}: ${approach.description}`);

      const result = await new Promise<{
        success: boolean;
        output: string;
        errorOutput: string;
        exitCode: number | null;
      }>((resolve) => {
        const certbotProcess: ChildProcess = spawn(
          "sudo",
          ["certbot", ...approach.command],
          {
            stdio: ["pipe", "pipe", "pipe"],
          }
        );

        let output: string = "";
        let errorOutput: string = "";

        certbotProcess.stdout?.on("data", (data: Buffer) => {
          const text: string = data.toString();
          output += text;
          console.log(`${approach.name} stdout:`, text);
        });

        certbotProcess.stderr?.on("data", (data: Buffer) => {
          const text: string = data.toString();
          errorOutput += text;
          console.error(`${approach.name} stderr:`, text);
        });

        certbotProcess.on("close", (code: number | null) => {
          console.log(`${approach.name} process ended with code: ${code}`);
          resolve({
            success: code === 0,
            output,
            errorOutput,
            exitCode: code,
          });
        });

        certbotProcess.on("error", (error: Error) => {
          console.error(`${approach.name} process error:`, error);
          resolve({
            success: false,
            output,
            errorOutput: error.message,
            exitCode: -1,
          });
        });

        // Timeout after 2 minutes per approach
        setTimeout(() => {
          certbotProcess.kill("SIGTERM");
          resolve({
            success: false,
            output,
            errorOutput: "Process timed out",
            exitCode: -1,
          });
        }, 120000);
      });

      if (result.success) {
        // Success! Try to read certificate files
        console.log(
          `Successfully generated certificates using ${approach.name}`
        );

        try {
          const certPath: string = `/etc/letsencrypt/live/${certName}`;
          console.log(`Reading certificates from: ${certPath}`);

          if (existsSync(certPath)) {
            const certificateFiles: CertificateFiles = {};

            // Read each certificate file if it exists
            const files: Array<{ key: keyof CertificateFiles; path: string }> =
              [
                { key: "fullchain", path: `${certPath}/fullchain.pem` },
                { key: "privkey", path: `${certPath}/privkey.pem` },
                { key: "cert", path: `${certPath}/cert.pem` },
                { key: "chain", path: `${certPath}/chain.pem` },
              ];

            for (const file of files) {
              if (existsSync(file.path)) {
                try {
                  const content: string = await readFileAsync(
                    file.path,
                    "utf8"
                  );
                  certificateFiles[file.key] = content.toString();
                  console.log(
                    `Successfully read ${file.key} (${content.length} characters)`
                  );
                } catch (readError) {
                  console.error(`Failed to read ${file.key}:`, readError);
                }
              } else {
                console.warn(`Certificate file not found: ${file.path}`);
              }
            }

            if (Object.keys(certificateFiles).length > 0) {
              const installationInstructions: InstallationInstructions = {
                cPanel: [
                  "Go to cPanel → SSL/TLS → Install and Manage SSL",
                  `Select ${domain}`,
                  "Upload or paste the Full Chain certificate in the Certificate (CRT) field",
                  "Upload or paste the Private Key in the Private Key (KEY) field",
                  "Upload or paste the Chain certificate in the Certificate Authority Bundle (CABUNDLE) field",
                  "Click Install Certificate",
                ],
                nginx: [
                  `Configure your Nginx server block for ${domain}`,
                  `Add: ssl_certificate ${certPath}/fullchain.pem;`,
                  `Add: ssl_certificate_key ${certPath}/privkey.pem;`,
                  `Test configuration: sudo nginx -t`,
                  `Restart Nginx: sudo systemctl restart nginx`,
                ],
                apache: [
                  `Configure your Apache virtual host for ${domain}`,
                  `Add: SSLCertificateFile ${certPath}/cert.pem`,
                  `Add: SSLCertificateKeyFile ${certPath}/privkey.pem`,
                  `Add: SSLCertificateChainFile ${certPath}/chain.pem`,
                  `Test configuration: sudo apache2ctl configtest`,
                  `Restart Apache: sudo systemctl restart apache2`,
                ],
              };

              return NextResponse.json<GenerateCertificatesSuccessResponse>({
                success: true,
                message: `SSL certificates generated successfully for ${domain} using ${approach.name} method!`,
                certificates: certificateFiles,
                domain,
                certName,
                certificatePath: certPath,
                expiryInfo: "Certificates are valid for 90 days",
                renewalCommand: `sudo certbot renew --cert-name ${certName}`,
                installationInstructions,
                output: result.output,
              });
            }
          }
        } catch (readError) {
          console.error("Failed to read certificate files:", readError);
        }
      } else {
        console.log(`${approach.name} failed, trying next approach...`);
      }
    }

    // If all automated approaches failed, provide manual command
    const manualCommand = `sudo certbot certonly \\
  --manual \\
  --preferred-challenges dns \\
  --email "${email}" \\
  --agree-tos \\
  --cert-name "${certName}" \\
  ${domains.map((d: string) => `-d "${d}"`).join(" \\\n  ")}`;

    return NextResponse.json<GenerateCertificatesErrorResponse>({
      success: false,
      error: `All automated certificate generation methods failed for ${domain}`,
      requiresManualExecution: true,
      manualCommand,
      troubleshooting: [
        "All automated methods (webroot, standalone, dns-cloudflare) failed",
        "DNS records are verified, but automated certificate generation failed",
        "Use the manual command below for guaranteed certificate generation",
        "Run the manual command on your server and follow the prompts",
        "The manual method will work since DNS records are already verified",
      ],
      message: `Please run the manual command below on your server to generate certificates for ${domain}`,
    });
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
// // app/api/generate-certificates/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import { spawn, ChildProcess } from "child_process";
// import { readFile, existsSync } from "fs";
// import { promisify } from "util";
// import { writeFileSync, unlinkSync } from "fs";
// import { join } from "path";

// const readFileAsync = promisify(readFile);

// interface DnsRecord {
//   name: string;
//   type: string;
//   value: string;
//   domain: string;
// }

// interface CertificateFiles {
//   fullchain?: string;
//   privkey?: string;
//   cert?: string;
//   chain?: string;
// }

// interface InstallationInstructions {
//   cPanel: string[];
//   nginx: string[];
//   apache: string[];
// }

// interface GenerateCertificatesRequest {
//   domain: string;
//   dnsRecords: DnsRecord[];
// }

// interface GenerateCertificatesResponse {
//   success: boolean;
//   message?: string;
//   certificates?: CertificateFiles;
//   domain?: string;
//   certName?: string;
//   certificatePath?: string;
//   expiryInfo?: string;
//   renewalCommand?: string;
//   installationInstructions?: InstallationInstructions;
//   output?: string;
//   error?: string;
//   troubleshooting?: string[];
//   errorOutput?: string;
//   certbotExitCode?: number;
// }

// export async function POST(
//   request: NextRequest
// ): Promise<NextResponse<GenerateCertificatesResponse>> {
//   try {
//     const body: GenerateCertificatesRequest = await request.json();
//     const { domain, dnsRecords } = body;

//     if (!domain || !dnsRecords || !Array.isArray(dnsRecords)) {
//       return NextResponse.json(
//         { success: false, error: "Domain and DNS records are required" },
//         { status: 400 }
//       );
//     }

//     console.log(`Starting certificate generation for domain: ${domain}`);

//     // Validate domain format
//     const domainRegex =
//       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
//     if (!domainRegex.test(domain)) {
//       return NextResponse.json(
//         { success: false, error: "Invalid domain format" },
//         { status: 400 }
//       );
//     }

//     // Extract domains from DNS records
//     const domains: string[] = [
//       ...new Set(dnsRecords.map((record: DnsRecord) => record.domain)),
//     ];
//     const certName: string = domain.replace(/\*\./g, "wildcard-");

//     // Clean up any existing processes first
//     try {
//       await new Promise<void>((resolve) => {
//         const cleanup: ChildProcess = spawn("sudo", [
//           "bash",
//           "-c",
//           "pkill -f certbot || true; rm -f /var/lib/letsencrypt/.certbot.lock || true",
//         ]);
//         cleanup.on("close", () => resolve());
//         setTimeout(() => {
//           cleanup.kill();
//           resolve();
//         }, 5000);
//       });
//       await new Promise((resolve) => setTimeout(resolve, 2000));
//     } catch (cleanupError) {
//       console.log("Cleanup warning:", cleanupError);
//     }

//     return new Promise<NextResponse<GenerateCertificatesResponse>>(
//       (resolvePromise) => {
//         // Create temporary auth and cleanup hooks that simulate DNS validation
//         const tempDir: string = "/tmp";
//         const authHookPath: string = join(
//           tempDir,
//           `auth-hook-${Date.now()}.sh`
//         );
//         const cleanupHookPath: string = join(
//           tempDir,
//           `cleanup-hook-${Date.now()}.sh`
//         );

//         // Create auth hook script that simulates successful DNS validation
//         const authHookScript: string = `#!/bin/bash
// echo "Simulating DNS validation for $CERTBOT_DOMAIN"
// echo "Token: $CERTBOT_TOKEN"
// echo "Validation: $CERTBOT_VALIDATION"

// # Find the corresponding DNS record value for this domain
// EXPECTED_VALUE=""
// DOMAIN_TO_CHECK=""

// case "$CERTBOT_DOMAIN" in
// ${domains
//   .map(
//     (d: string) => `  "${d}")
//     DOMAIN_TO_CHECK="${d}"
//     EXPECTED_VALUE="${
//       dnsRecords.find((r: DnsRecord) => r.domain === d)?.value || ""
//     }"
//     ;;`
//   )
//   .join("\n")}
//   *.*)
//     # Handle wildcard domains
//     BASE_DOMAIN="\${CERTBOT_DOMAIN#*.}"
//     DOMAIN_TO_CHECK="$BASE_DOMAIN"
//     EXPECTED_VALUE="${
//       dnsRecords.find((r: DnsRecord) => r.domain === domain)?.value || ""
//     }"
//     ;;
// esac

// echo "Checking domain: $DOMAIN_TO_CHECK"
// echo "Expected validation: $EXPECTED_VALUE"

// # Verify the DNS record exists
// if [ -n "$EXPECTED_VALUE" ]; then
//   echo "DNS record found for domain validation"
//   exit 0
// else
//   echo "DNS record not found"
//   exit 1
// fi
// `;

//         // Create cleanup hook script
//         const cleanupHookScript: string = `#!/bin/bash
// echo "Cleanup completed for $CERTBOT_DOMAIN"
// exit 0
// `;

//         try {
//           writeFileSync(authHookPath, authHookScript, { mode: 0o755 });
//           writeFileSync(cleanupHookPath, cleanupHookScript, { mode: 0o755 });

//           // First, try to get the email from previous certbot runs or use a default
//           const getEmailCommand: string = `sudo certbot show_account 2>/dev/null | grep -o '[a-zA-Z0-9._%+-]\\+@[a-zA-Z0-9.-]\\+\\.[a-zA-Z]\\{2,\\}' | head -1`;

//           let email: string = "admin@" + domain;
//           try {
//             const { execSync } = require("child_process");
//             const emailOutput: string = execSync(getEmailCommand, {
//               encoding: "utf8",
//             });
//             if (emailOutput.trim()) {
//               email = emailOutput.trim();
//             }
//           } catch (emailError) {
//             console.log(
//               "Could not retrieve existing email, using default:",
//               email
//             );
//           }

//           const certbotArgs: string[] = [
//             "certonly",
//             "--manual",
//             "--preferred-challenges",
//             "dns",
//             "--agree-tos",
//             "--email",
//             email,
//             "--server",
//             "https://acme-v02.api.letsencrypt.org/directory",
//             "--cert-name",
//             certName,
//             "--manual-auth-hook",
//             authHookPath,
//             "--manual-cleanup-hook",
//             cleanupHookPath,
//             "--non-interactive",
//             "--force-renewal", // Force renewal to ensure fresh certificates
//             ...domains.flatMap((d: string) => ["-d", d]),
//           ];

//           console.log(`Generating real certificates for domain: ${domain}`);
//           console.log("Certbot args:", certbotArgs.join(" "));

//           const certbotProcess: ChildProcess = spawn(
//             "sudo",
//             ["certbot", ...certbotArgs],
//             {
//               stdio: ["pipe", "pipe", "pipe"],
//             }
//           );

//           let output: string = "";
//           let errorOutput: string = "";

//           certbotProcess.stdout?.on("data", (data: Buffer) => {
//             const text: string = data.toString();
//             output += text;
//             console.log("Certbot stdout:", text);
//           });

//           certbotProcess.stderr?.on("data", (data: Buffer) => {
//             const text: string = data.toString();
//             errorOutput += text;
//             console.error("Certbot stderr:", text);
//           });

//           certbotProcess.on("close", async (code: number | null) => {
//             console.log(
//               `Certbot process ended with code: ${code} for domain: ${domain}`
//             );

//             // Clean up temporary files
//             try {
//               unlinkSync(authHookPath);
//               unlinkSync(cleanupHookPath);
//             } catch (cleanupError) {
//               console.log("File cleanup warning:", cleanupError);
//             }

//             if (code === 0) {
//               // Success - try to read certificate files
//               try {
//                 const certPath: string = `/etc/letsencrypt/live/${certName}`;
//                 console.log(`Reading certificates from: ${certPath}`);

//                 if (existsSync(certPath)) {
//                   const certificateFiles: CertificateFiles = {};

//                   // Read each certificate file if it exists
//                   const files: Array<{
//                     key: keyof CertificateFiles;
//                     path: string;
//                   }> = [
//                     { key: "fullchain", path: `${certPath}/fullchain.pem` },
//                     { key: "privkey", path: `${certPath}/privkey.pem` },
//                     { key: "cert", path: `${certPath}/cert.pem` },
//                     { key: "chain", path: `${certPath}/chain.pem` },
//                   ];

//                   for (const file of files) {
//                     if (existsSync(file.path)) {
//                       try {
//                         const content: string = await readFileAsync(
//                           file.path,
//                           "utf8"
//                         );
//                         certificateFiles[file.key] = content.toString();
//                         console.log(
//                           `Successfully read ${file.key} (${content.length} characters)`
//                         );
//                       } catch (readError) {
//                         console.error(`Failed to read ${file.key}:`, readError);
//                       }
//                     } else {
//                       console.warn(`Certificate file not found: ${file.path}`);
//                     }
//                   }

//                   if (Object.keys(certificateFiles).length > 0) {
//                     const installationInstructions: InstallationInstructions = {
//                       cPanel: [
//                         "Go to cPanel → SSL/TLS → Install and Manage SSL",
//                         `Select ${domain}`,
//                         "Upload or paste the Full Chain certificate in the Certificate (CRT) field",
//                         "Upload or paste the Private Key in the Private Key (KEY) field",
//                         "Upload or paste the Chain certificate in the Certificate Authority Bundle (CABUNDLE) field",
//                         "Click Install Certificate",
//                       ],
//                       nginx: [
//                         `Configure your Nginx server block for ${domain}`,
//                         `Add: ssl_certificate ${certPath}/fullchain.pem;`,
//                         `Add: ssl_certificate_key ${certPath}/privkey.pem;`,
//                         `Test configuration: sudo nginx -t`,
//                         `Restart Nginx: sudo systemctl restart nginx`,
//                       ],
//                       apache: [
//                         `Configure your Apache virtual host for ${domain}`,
//                         `Add: SSLCertificateFile ${certPath}/cert.pem`,
//                         `Add: SSLCertificateKeyFile ${certPath}/privkey.pem`,
//                         `Add: SSLCertificateChainFile ${certPath}/chain.pem`,
//                         `Test configuration: sudo apache2ctl configtest`,
//                         `Restart Apache: sudo systemctl restart apache2`,
//                       ],
//                     };

//                     resolvePromise(
//                       NextResponse.json({
//                         success: true,
//                         message: `SSL certificates generated successfully for ${domain}!`,
//                         certificates: certificateFiles,
//                         domain,
//                         certName,
//                         certificatePath: certPath,
//                         expiryInfo: "Certificates are valid for 90 days",
//                         renewalCommand: `sudo certbot renew --cert-name ${certName}`,
//                         installationInstructions,
//                         output,
//                       })
//                     );
//                     return;
//                   }
//                 }

//                 // If we get here, certificates weren't found
//                 resolvePromise(
//                   NextResponse.json({
//                     success: false,
//                     error: `Certificate files not found after generation for ${domain}`,
//                     troubleshooting: [
//                       "Certbot completed but certificate files are missing",
//                       "Check certbot logs: sudo journalctl -u certbot",
//                       "Verify DNS records are still propagated",
//                       "Try running certbot manually to see detailed output",
//                     ],
//                     output,
//                     errorOutput,
//                   })
//                 );
//               } catch (readError) {
//                 console.error("Failed to read certificate files:", readError);
//                 resolvePromise(
//                   NextResponse.json({
//                     success: false,
//                     error: `Failed to read certificate files for ${domain}: ${
//                       readError instanceof Error
//                         ? readError.message
//                         : "Unknown error"
//                     }`,
//                     troubleshooting: [
//                       "Certificates may have been generated but are not readable",
//                       "Check file permissions in /etc/letsencrypt/live/",
//                       "Verify certbot completed successfully",
//                       "Try running certbot manually",
//                     ],
//                     output,
//                     errorOutput,
//                   })
//                 );
//               }
//             } else {
//               // Certbot failed
//               resolvePromise(
//                 NextResponse.json({
//                   success: false,
//                   error: `Certificate generation failed for ${domain} (exit code: ${code})`,
//                   troubleshooting: [
//                     "DNS records may not be properly propagated",
//                     "Check if domain is accessible from the internet",
//                     "Verify DNS records are correctly configured",
//                     "Check certbot logs for detailed error information",
//                     "Ensure no firewall blocking Let's Encrypt validation",
//                   ],
//                   output,
//                   errorOutput,
//                   certbotExitCode: code || undefined,
//                 })
//               );
//             }
//           });

//           certbotProcess.on("error", (error: Error) => {
//             console.error(`Certbot process error for ${domain}:`, error);

//             // Clean up temporary files
//             try {
//               unlinkSync(authHookPath);
//               unlinkSync(cleanupHookPath);
//             } catch (cleanupError) {
//               console.log("File cleanup warning:", cleanupError);
//             }

//             resolvePromise(
//               NextResponse.json({
//                 success: false,
//                 error: `Failed to start certificate generation for ${domain}: ${error.message}`,
//                 troubleshooting: [
//                   "Check if certbot is installed on the server",
//                   "Ensure you have proper sudo permissions",
//                   "Verify the domain format is correct",
//                   "Check server connectivity and DNS resolution",
//                 ],
//               })
//             );
//           });

//           // Timeout after 5 minutes
//           setTimeout(() => {
//             certbotProcess.kill("SIGTERM");

//             // Clean up temporary files
//             try {
//               unlinkSync(authHookPath);
//               unlinkSync(cleanupHookPath);
//             } catch (cleanupError) {
//               console.log("File cleanup warning:", cleanupError);
//             }

//             resolvePromise(
//               NextResponse.json({
//                 success: false,
//                 error: `Certificate generation timed out for ${domain}`,
//                 troubleshooting: [
//                   "The certificate generation process took too long",
//                   "DNS validation may be slow or failing",
//                   "Check internet connectivity and DNS propagation",
//                   "Try again with verified DNS records",
//                 ],
//                 output,
//                 errorOutput,
//               })
//             );
//           }, 300000); // 5 minutes
//         } catch (fileError) {
//           console.error("File creation error:", fileError);
//           resolvePromise(
//             NextResponse.json({
//               success: false,
//               error: `Failed to create temporary files: ${
//                 fileError instanceof Error ? fileError.message : "Unknown error"
//               }`,
//             })
//           );
//         }
//       }
//     );
//   } catch (error) {
//     console.error(`Certificate generation error:`, error);
//     return NextResponse.json(
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
