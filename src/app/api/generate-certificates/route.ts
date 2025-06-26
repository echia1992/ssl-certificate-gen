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

interface GenerateCertificatesResponse {
  success: boolean;
  message?: string;
  certificates?: CertificateFiles;
  domain?: string;
  certName?: string;
  certificatePath?: string;
  expiryInfo?: string;
  renewalCommand?: string;
  installationInstructions?: InstallationInstructions;
  output?: string;
  error?: string;
  troubleshooting?: string[];
  errorOutput?: string;
  certbotExitCode?: number;
  dnsUpdateRequired?: boolean;
  newDnsRecords?: DnsRecord[];
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<GenerateCertificatesResponse>> {
  try {
    const body: GenerateCertificatesRequest = await request.json();
    const { domain, dnsRecords } = body;

    if (!domain || !dnsRecords || !Array.isArray(dnsRecords)) {
      return NextResponse.json(
        { success: false, error: "Domain and DNS records are required" },
        { status: 400 }
      );
    }

    console.log(`Starting certificate generation for domain: ${domain}`);

    // Validate domain format
    const domainRegex =
      /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return NextResponse.json(
        { success: false, error: "Invalid domain format" },
        { status: 400 }
      );
    }

    // Extract domains from DNS records and prepare domain arguments
    const domains: string[] = [
      ...new Set(dnsRecords.map((record: DnsRecord) => record.domain)),
    ];
    const certName: string = domain.replace(/\*\./g, "wildcard-");

    // Check if wildcard is needed
    const hasWildcard = dnsRecords.some(
      (record) =>
        record.name.includes(`_acme-challenge.${domain}`) &&
        domains.includes(domain)
    );
    if (hasWildcard && !domains.includes(`*.${domain}`)) {
      domains.push(`*.${domain}`);
    }

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

    return new Promise<NextResponse<GenerateCertificatesResponse>>(
      (resolvePromise) => {
        // Use manual mode without auth hooks - Let's Encrypt will verify the existing DNS records
        const certbotArgs: string[] = [
          "certonly",
          "--manual",
          "--preferred-challenges",
          "dns",
          "--agree-tos",
          "--email",
          email,
          "--server",
          "https://acme-v02.api.letsencrypt.org/directory",
          "--cert-name",
          certName,
          "--manual-public-ip-logging-ok",
          "--non-interactive",
          "--force-renewal", // Force renewal to ensure fresh certificates
          ...domains.flatMap((d: string) => ["-d", d]),
        ];

        console.log(
          `Generating certificates for domains: ${domains.join(", ")}`
        );
        console.log("Certbot args:", certbotArgs.join(" "));

        const certbotProcess: ChildProcess = spawn(
          "sudo",
          ["certbot", ...certbotArgs],
          {
            stdio: ["pipe", "pipe", "pipe"],
          }
        );

        let output: string = "";
        let errorOutput: string = "";
        const newDnsRecords: DnsRecord[] = [];
        let waitingForDns: boolean = false;

        certbotProcess.stdout?.on("data", (data: Buffer) => {
          const text: string = data.toString();
          output += text;
          console.log("Certbot stdout:", text);

          // Check if certbot is asking for DNS record updates
          if (
            text.includes("Please deploy a DNS TXT record under the name") ||
            text.includes("_acme-challenge")
          ) {
            waitingForDns = true;

            // Parse new DNS challenge records if they appear
            const lines: string[] = text.split("\n");
            for (let i = 0; i < lines.length; i++) {
              const line: string = lines[i].trim();

              if (line.includes("_acme-challenge.")) {
                const nameMatch = line.match(
                  /_acme-challenge\.[a-zA-Z0-9\.\-]+/
                );
                if (nameMatch) {
                  const recordName = nameMatch[0];

                  // Look for value in surrounding lines
                  for (let j = i; j < Math.min(i + 10, lines.length); j++) {
                    const valueLine = lines[j];
                    const valueMatch = valueLine.match(
                      /\b([A-Za-z0-9_\-]{40,})\b/
                    );
                    if (
                      valueMatch &&
                      !valueMatch[1].includes("_acme-challenge")
                    ) {
                      const recordValue = valueMatch[1];
                      const baseDomain = recordName.replace(
                        "_acme-challenge.",
                        ""
                      );

                      const newRecord: DnsRecord = {
                        name: recordName,
                        type: "TXT",
                        value: recordValue,
                        domain: baseDomain,
                      };

                      if (
                        !newDnsRecords.find(
                          (r) =>
                            r.name === recordName && r.value === recordValue
                        )
                      ) {
                        newDnsRecords.push(newRecord);
                      }
                      break;
                    }
                  }
                }
              }
            }
          }

          // If we see the prompt to continue, we need to handle it
          if (
            text.includes("Press Enter to Continue") ||
            text.includes("Press ENTER to continue")
          ) {
            if (waitingForDns && newDnsRecords.length > 0) {
              // New DNS records needed - return them to the user
              setTimeout(() => {
                certbotProcess.kill("SIGTERM");
                resolvePromise(
                  NextResponse.json({
                    success: false,
                    error:
                      "DNS records need to be updated with new challenge values",
                    dnsUpdateRequired: true,
                    newDnsRecords,
                    message:
                      "Let's Encrypt generated new challenge values. Please update your DNS records.",
                    troubleshooting: [
                      "Let's Encrypt has generated new DNS challenge values",
                      "Update your DNS records with the new values shown below",
                      "Wait 5-10 minutes for DNS propagation",
                      "Try generating certificates again",
                    ],
                  })
                );
              }, 1000);
            } else {
              // Continue with existing DNS records
              certbotProcess.stdin?.write("\n");
            }
          }
        });

        certbotProcess.stderr?.on("data", (data: Buffer) => {
          const text: string = data.toString();
          errorOutput += text;
          console.error("Certbot stderr:", text);

          // Check for specific DNS validation errors
          if (
            text.includes("Incorrect TXT record") ||
            text.includes("unauthorized")
          ) {
            waitingForDns = true;
          }
        });

        certbotProcess.on("close", async (code: number | null) => {
          console.log(
            `Certbot process ended with code: ${code} for domain: ${domain}`
          );

          if (code === 0) {
            // Success - try to read certificate files
            try {
              const certPath: string = `/etc/letsencrypt/live/${certName}`;
              console.log(`Reading certificates from: ${certPath}`);

              if (existsSync(certPath)) {
                const certificateFiles: CertificateFiles = {};

                // Read each certificate file if it exists
                const files: Array<{
                  key: keyof CertificateFiles;
                  path: string;
                }> = [
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

                  resolvePromise(
                    NextResponse.json({
                      success: true,
                      message: `SSL certificates generated successfully for ${domain}!`,
                      certificates: certificateFiles,
                      domain,
                      certName,
                      certificatePath: certPath,
                      expiryInfo: "Certificates are valid for 90 days",
                      renewalCommand: `sudo certbot renew --cert-name ${certName}`,
                      installationInstructions,
                      output,
                    })
                  );
                  return;
                }
              }

              // If we get here, certificates weren't found
              resolvePromise(
                NextResponse.json({
                  success: false,
                  error: `Certificate files not found after generation for ${domain}`,
                  troubleshooting: [
                    "Certbot completed but certificate files are missing",
                    "Check certbot logs: sudo journalctl -u certbot",
                    "Verify DNS records are still propagated",
                    "Try running certbot manually to see detailed output",
                  ],
                  output,
                  errorOutput,
                })
              );
            } catch (readError) {
              console.error("Failed to read certificate files:", readError);
              resolvePromise(
                NextResponse.json({
                  success: false,
                  error: `Failed to read certificate files for ${domain}: ${
                    readError instanceof Error
                      ? readError.message
                      : "Unknown error"
                  }`,
                  troubleshooting: [
                    "Certificates may have been generated but are not readable",
                    "Check file permissions in /etc/letsencrypt/live/",
                    "Verify certbot completed successfully",
                    "Try running certbot manually",
                  ],
                  output,
                  errorOutput,
                })
              );
            }
          } else {
            // Certbot failed - check if it's due to DNS issues
            if (
              waitingForDns ||
              errorOutput.includes("Incorrect TXT record") ||
              errorOutput.includes("unauthorized")
            ) {
              // DNS validation failed - likely due to changed challenge values
              resolvePromise(
                NextResponse.json({
                  success: false,
                  error: `DNS validation failed for ${domain}. Challenge values may have changed.`,
                  dnsUpdateRequired: true,
                  newDnsRecords:
                    newDnsRecords.length > 0 ? newDnsRecords : undefined,
                  troubleshooting: [
                    "Let's Encrypt generated new DNS challenge values",
                    "The DNS records you added earlier are no longer valid",
                    "You need to update your DNS records with fresh challenge values",
                    "Go back to Step 1 to generate new DNS challenge records",
                    "Or try the manual server command approach",
                  ],
                  output,
                  errorOutput,
                  certbotExitCode: code || undefined,
                  message:
                    "Please generate new DNS challenge records and try again.",
                })
              );
            } else {
              // Other certbot error
              resolvePromise(
                NextResponse.json({
                  success: false,
                  error: `Certificate generation failed for ${domain} (exit code: ${code})`,
                  troubleshooting: [
                    "Check if domain is accessible from the internet",
                    "Verify DNS records are correctly configured",
                    "Check certbot logs for detailed error information",
                    "Ensure no firewall blocking Let's Encrypt validation",
                    "Try generating new DNS challenge records",
                  ],
                  output,
                  errorOutput,
                  certbotExitCode: code || undefined,
                })
              );
            }
          }
        });

        certbotProcess.on("error", (error: Error) => {
          console.error(`Certbot process error for ${domain}:`, error);

          resolvePromise(
            NextResponse.json({
              success: false,
              error: `Failed to start certificate generation for ${domain}: ${error.message}`,
              troubleshooting: [
                "Check if certbot is installed on the server",
                "Ensure you have proper sudo permissions",
                "Verify the domain format is correct",
                "Check server connectivity and DNS resolution",
              ],
            })
          );
        });

        // Timeout after 5 minutes
        setTimeout(() => {
          certbotProcess.kill("SIGTERM");

          resolvePromise(
            NextResponse.json({
              success: false,
              error: `Certificate generation timed out for ${domain}`,
              troubleshooting: [
                "The certificate generation process took too long",
                "DNS validation may be slow or failing",
                "Check internet connectivity and DNS propagation",
                "Try again with verified DNS records",
              ],
              output,
              errorOutput,
            })
          );
        }, 300000); // 5 minutes
      }
    );
  } catch (error) {
    console.error(`Certificate generation error:`, error);
    return NextResponse.json(
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
