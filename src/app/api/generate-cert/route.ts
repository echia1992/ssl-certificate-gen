import { NextRequest, NextResponse } from "next/server";
import { spawn, exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { domain, email, includeWildcard } = await request.json();

    if (!domain || !email) {
      return NextResponse.json(
        { success: false, error: "Domain and email are required" },
        { status: 400 }
      );
    }

    // Validate domain format
    const domainRegex =
      /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return NextResponse.json(
        { success: false, error: "Invalid domain format" },
        { status: 400 }
      );
    }

    // Clean up any existing certbot processes and lock files
    try {
      await execAsync("sudo pkill -f certbot || true");
      await execAsync("sudo rm -f /var/lib/letsencrypt/.certbot.lock || true");
      await execAsync("sudo rm -rf /tmp/certbot-* || true");

      // Wait a moment for cleanup
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (cleanupError) {
      console.log("Cleanup warning:", cleanupError);
      // Continue anyway
    }

    // Build domains array
    const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];

    // Execute certbot in manual mode with proper configuration
    const certbotArgs = [
      "certonly",
      "--manual",
      "--preferred-challenges",
      "dns",
      "--dry-run", // Keep dry-run for testing
      "--agree-tos",
      "--email",
      email,
      "--server",
      "https://acme-v02.api.letsencrypt.org/directory",
      "--non-interactive",
      "--cert-name",
      domain,
      ...domains.flatMap((d) => ["-d", d]),
    ];

    console.log("Executing certbot with args:", certbotArgs);

    const certbotProcess = spawn("sudo", ["certbot", ...certbotArgs], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" },
    });

    let output = "";
    let errorOutput = "";
    const dnsRecords: any[] = [];
    let responseSent = false;

    certbotProcess.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      console.log("Certbot stdout:", text);

      // Parse DNS records from output
      const lines = text.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Look for DNS challenge instructions
        if (line.includes("Please deploy a DNS TXT record under the name")) {
          console.log("Found DNS challenge instruction");

          // Look for the record name and value in subsequent lines
          let recordName = "";
          let recordValue = "";

          for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
            const currentLine = lines[j].trim();

            // Record name line (contains _acme-challenge)
            if (currentLine.includes("_acme-challenge.") && !recordName) {
              recordName = currentLine.replace(/[^\w\-\.]/g, "");
              console.log("Found record name:", recordName);
            }

            // Record value line (long alphanumeric string)
            if (
              !recordValue &&
              currentLine.length > 30 &&
              /^[A-Za-z0-9_\-]+$/.test(currentLine) &&
              !currentLine.includes("_acme-challenge")
            ) {
              recordValue = currentLine;
              console.log("Found record value:", recordValue);
              break;
            }
          }

          if (recordName && recordValue) {
            const domain = recordName.replace("_acme-challenge.", "");
            const dnsRecord = {
              name: recordName,
              type: "TXT",
              value: recordValue,
              domain: domain,
            };

            // Avoid duplicates
            if (
              !dnsRecords.find(
                (r) => r.name === recordName && r.value === recordValue
              )
            ) {
              dnsRecords.push(dnsRecord);
              console.log("Added DNS record:", dnsRecord);
            }
          }
        }

        // Alternative parsing pattern
        if (
          line.match(/_acme-challenge\.[a-zA-Z0-9\.\-]+/) &&
          !line.includes("Please")
        ) {
          const nameMatch = line.match(/_acme-challenge\.[a-zA-Z0-9\.\-]+/);
          if (nameMatch) {
            const recordName = nameMatch[0];
            const domain = recordName.replace("_acme-challenge.", "");

            // Look for value in nearby lines
            for (
              let k = Math.max(0, i - 2);
              k < Math.min(i + 5, lines.length);
              k++
            ) {
              const valueLine = lines[k].trim();
              if (
                valueLine.length > 30 &&
                /^[A-Za-z0-9_\-]+$/.test(valueLine) &&
                !valueLine.includes("_acme-challenge")
              ) {
                const dnsRecord = {
                  name: recordName,
                  type: "TXT",
                  value: valueLine,
                  domain: domain,
                };

                if (
                  !dnsRecords.find(
                    (r) => r.name === recordName && r.value === valueLine
                  )
                ) {
                  dnsRecords.push(dnsRecord);
                  console.log("Added DNS record (alt):", dnsRecord);
                }
                break;
              }
            }
          }
        }
      }

      // Send response when we have DNS records
      if (dnsRecords.length > 0 && !responseSent) {
        responseSent = true;
        setTimeout(() => certbotProcess.kill("SIGTERM"), 1000);
      }
    });

    certbotProcess.stderr.on("data", (data) => {
      const text = data.toString();
      errorOutput += text;
      console.error("Certbot stderr:", text);

      // Handle specific errors
      if (text.includes("Another instance of Certbot is already running")) {
        if (!responseSent) {
          responseSent = true;
          certbotProcess.kill("SIGTERM");
        }
      }
    });

    return new Promise<NextResponse>((resolve) => {
      const timeoutId = setTimeout(() => {
        if (!responseSent) {
          responseSent = true;
          certbotProcess.kill("SIGTERM");

          if (dnsRecords.length > 0) {
            resolve(
              NextResponse.json({
                success: true,
                message:
                  "DNS verification required. Add these TXT records to your DNS provider.",
                dnsRecords,
                serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
                  .map((d) => `-d ${d}`)
                  .join(" ")} --agree-tos`,
                certificatePath: `/etc/letsencrypt/live/${domain}/`,
                output,
                note: "This was a dry-run. Remove --dry-run from the server command for actual certificates.",
                nextSteps: [
                  "1. Add the DNS TXT records shown above to your DNS provider",
                  "2. Wait 5-10 minutes for DNS propagation",
                  "3. Run the server command to generate real certificates",
                  "4. When prompted, press Enter to continue verification",
                ],
              })
            );
          } else {
            resolve(
              NextResponse.json(
                {
                  success: false,
                  error: "No DNS records were generated. Please try again.",
                  output,
                  errorOutput,
                },
                { status: 500 }
              )
            );
          }
        }
      }, 15000); // 15 seconds timeout

      certbotProcess.on("close", (code) => {
        clearTimeout(timeoutId);
        if (responseSent) return;

        console.log("Certbot process ended with code:", code);

        if (
          errorOutput.includes("Another instance of Certbot is already running")
        ) {
          resolve(
            NextResponse.json(
              {
                success: false,
                error:
                  "Another certbot process is running. Please wait a moment and try again.",
                suggestion:
                  "Try refreshing the page and generating again in 30 seconds.",
                troubleshooting: [
                  "A previous certbot process is still running",
                  "Please wait 30 seconds and try again",
                  "If this persists, contact the administrator",
                ],
              },
              { status: 409 }
            )
          );
        } else if (dnsRecords.length > 0) {
          resolve(
            NextResponse.json({
              success: true,
              message:
                "DNS verification required. Add these TXT records to your DNS provider.",
              dnsRecords,
              serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
                .map((d) => `-d ${d}`)
                .join(" ")} --agree-tos`,
              certificatePath: `/etc/letsencrypt/live/${domain}/`,
              output,
              note: "This was a dry-run. Remove --dry-run for actual certificates.",
            })
          );
        } else {
          resolve(
            NextResponse.json(
              {
                success: false,
                error: errorOutput || "Certificate generation failed",
                output,
                code,
                troubleshooting: [
                  "Make sure your domain points to this server",
                  "Check that ports 80 and 443 are accessible",
                  "Verify your email address is valid",
                  "Try again in a few minutes",
                ],
              },
              { status: 500 }
            )
          );
        }
      });

      certbotProcess.on("error", (error) => {
        clearTimeout(timeoutId);
        if (responseSent) return;

        console.error("Process error:", error);
        resolve(
          NextResponse.json(
            {
              success: false,
              error: `Process failed to start: ${error.message}`,
            },
            { status: 500 }
          )
        );
      });
    });
  } catch (error) {
    console.error("Certificate generation error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// import { NextRequest, NextResponse } from "next/server";
// import { spawn } from "child_process";
// import { promises as fs } from "fs";
// import path from "path";

// export async function POST(request: NextRequest): Promise<NextResponse> {
//   try {
//     const { domain, email, includeWildcard } = await request.json();

//     if (!domain || !email) {
//       return NextResponse.json(
//         { success: false, error: "Domain and email are required" },
//         { status: 400 }
//       );
//     }

//     // Validate domain format
//     const domainRegex =
//       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
//     if (!domainRegex.test(domain)) {
//       return NextResponse.json(
//         { success: false, error: "Invalid domain format" },
//         { status: 400 }
//       );
//     }

//     // Build domains array
//     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];

//     // Generate certificate using certbot
//     const certbotArgs = [
//       "certonly",
//       "--manual",
//       "--preferred-challenges",
//       "dns",
//       "--manual-public-ip-logging-ok",
//       "--agree-tos",
//       "--email",
//       email,
//       "--server",
//       "https://acme-v02.api.letsencrypt.org/directory",
//       "--cert-name",
//       domain, // Use domain as cert name
//       ...domains.flatMap((d) => ["-d", d]),
//     ];

//     console.log("Executing certbot for download with args:", certbotArgs);

//     const process = spawn("sudo", ["certbot", ...certbotArgs], {
//       stdio: ["pipe", "pipe", "pipe"],
//     });

//     let output = "";
//     let errorOutput = "";
//     const dnsRecords: any[] = [];

//     process.stdout.on("data", (data) => {
//       const text = data.toString();
//       output += text;
//       console.log("Certbot stdout:", text);

//       // Parse DNS challenge records
//       const lines = text.split("\n");
//       for (let i = 0; i < lines.length; i++) {
//         const line = lines[i];

//         if (line.includes("Please deploy a DNS TXT record")) {
//           // Look for DNS record details in subsequent lines
//           for (let j = i; j < Math.min(i + 10, lines.length); j++) {
//             const currentLine = lines[j];
//             const nameMatch = currentLine.match(/_acme-challenge\.([^\s\n]+)/);
//             if (nameMatch) {
//               for (let k = j + 1; k < Math.min(j + 5, lines.length); k++) {
//                 const valueLine = lines[k].trim();
//                 if (
//                   valueLine &&
//                   !valueLine.includes("_acme-challenge") &&
//                   valueLine.length > 10
//                 ) {
//                   dnsRecords.push({
//                     name: `_acme-challenge.${nameMatch[1]}`,
//                     type: "TXT",
//                     value: valueLine,
//                     domain: nameMatch[1],
//                   });
//                   break;
//                 }
//               }
//               break;
//             }
//           }
//         }
//       }
//     });

//     process.stderr.on("data", (data) => {
//       const text = data.toString();
//       errorOutput += text;
//       console.error("Certbot stderr:", text);
//     });

//     return new Promise<NextResponse>((resolve) => {
//       process.on("close", async (code) => {
//         console.log("Certbot process ended with code:", code);

//         if (code === 0) {
//           try {
//             // Certificate was generated successfully, read the files
//             const certPath = `/etc/letsencrypt/live/${domain}`;

//             const certificateFiles: any = {};

//             try {
//               // Read certificate files if they exist
//               const fullchainPath = path.join(certPath, "fullchain.pem");
//               const privkeyPath = path.join(certPath, "privkey.pem");
//               const certPath_file = path.join(certPath, "cert.pem");
//               const chainPath = path.join(certPath, "chain.pem");

//               // Check if files exist and read them
//               if (
//                 await fs
//                   .access(fullchainPath)
//                   .then(() => true)
//                   .catch(() => false)
//               ) {
//                 certificateFiles.fullchain = await fs.readFile(
//                   fullchainPath,
//                   "utf8"
//                 );
//               }

//               if (
//                 await fs
//                   .access(privkeyPath)
//                   .then(() => true)
//                   .catch(() => false)
//               ) {
//                 certificateFiles.privkey = await fs.readFile(
//                   privkeyPath,
//                   "utf8"
//                 );
//               }

//               if (
//                 await fs
//                   .access(certPath_file)
//                   .then(() => true)
//                   .catch(() => false)
//               ) {
//                 certificateFiles.cert = await fs.readFile(
//                   certPath_file,
//                   "utf8"
//                 );
//               }

//               if (
//                 await fs
//                   .access(chainPath)
//                   .then(() => true)
//                   .catch(() => false)
//               ) {
//                 certificateFiles.chain = await fs.readFile(chainPath, "utf8");
//               }

//               resolve(
//                 NextResponse.json({
//                   success: true,
//                   message: "Certificate generated successfully!",
//                   certificateFiles,
//                   certificatePath: certPath,
//                   dnsRecords: dnsRecords.length > 0 ? dnsRecords : undefined,
//                   expiryDate: new Date(
//                     Date.now() + 90 * 24 * 60 * 60 * 1000
//                   ).toISOString(), // 90 days from now
//                   domains,
//                   output,
//                 })
//               );
//             } catch (fileError) {
//               console.error("Error reading certificate files:", fileError);
//               resolve(
//                 NextResponse.json({
//                   success: true,
//                   message:
//                     "Certificate generated but files could not be read. Check server permissions.",
//                   certificatePath: certPath,
//                   dnsRecords,
//                   error: `File access error: ${fileError}`,
//                   output,
//                 })
//               );
//             }
//           } catch (error) {
//             console.error("Post-generation error:", error);
//             resolve(
//               NextResponse.json(
//                 {
//                   success: false,
//                   error: `Post-generation error: ${error}`,
//                   output,
//                   dnsRecords,
//                 },
//                 { status: 500 }
//               )
//             );
//           }
//         } else {
//           // Certificate generation failed
//           resolve(
//             NextResponse.json(
//               {
//                 success: false,
//                 error: errorOutput || "Certificate generation failed",
//                 dnsRecords: dnsRecords.length > 0 ? dnsRecords : undefined,
//                 output,
//                 code,
//                 message:
//                   dnsRecords.length > 0
//                     ? "DNS verification required. Add the TXT records above and try again."
//                     : "Certificate generation failed.",
//               },
//               { status: 500 }
//             )
//           );
//         }
//       });

//       process.on("error", (error) => {
//         console.error("Process error:", error);
//         resolve(
//           NextResponse.json(
//             {
//               success: false,
//               error: `Process failed to start: ${error.message}`,
//               dnsRecords,
//             },
//             { status: 500 }
//           )
//         );
//       });

//       // Handle timeout
//       setTimeout(() => {
//         process.kill();
//         resolve(
//           NextResponse.json(
//             {
//               success: false,
//               error: "Certificate generation timed out",
//               dnsRecords,
//             },
//             { status: 408 }
//           )
//         );
//       }, 600000); // 10 minutes timeout for actual cert generation
//     });
//   } catch (error) {
//     console.error("Certificate generation error:", error);
//     return NextResponse.json(
//       { success: false, error: "Internal server error" },
//       { status: 500 }
//     );
//   }
// }

// // import { NextRequest, NextResponse } from "next/server";
// // import { exec, spawn } from "child_process";
// // import { promisify } from "util";
// // import { join } from "path";

// // const execAsync = promisify(exec);

// // export async function POST(request: NextRequest): Promise<NextResponse> {
// //   try {
// //     const { domain, email, includeWildcard } = await request.json();

// //     if (!domain || !email) {
// //       return NextResponse.json(
// //         { success: false, error: "Domain and email are required" },
// //         { status: 400 }
// //       );
// //     }

// //     // Validate domain format
// //     const domainRegex =
// //       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
// //     if (!domainRegex.test(domain)) {
// //       return NextResponse.json(
// //         { success: false, error: "Invalid domain format" },
// //         { status: 400 }
// //       );
// //     }

// //     // Build certbot command
// //     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
// //     const domainFlags = domains.map((d) => `-d ${d}`).join(" ");

// //     const command = `sudo certbot certonly \
// //       --manual \
// //       --preferred-challenges dns \
// //       --manual-public-ip-logging-ok \
// //       --non-interactive \
// //       --agree-tos \
// //       --email ${email} \
// //       --server https://acme-v02.api.letsencrypt.org/directory \
// //       --manual-auth-hook /bin/true \
// //       --manual-cleanup-hook /bin/true \
// //       ${domainFlags}`;

// //     // Execute certbot in manual mode
// //     const process = spawn(
// //       "sudo",
// //       [
// //         "certbot",
// //         "certonly",
// //         "--manual",
// //         "--preferred-challenges",
// //         "dns",
// //         "--manual-public-ip-logging-ok",
// //         "--non-interactive",
// //         "--agree-tos",
// //         "--email",
// //         email,
// //         "--server",
// //         "https://acme-v02.api.letsencrypt.org/directory",
// //         ...domains.flatMap((d) => ["-d", d]),
// //       ],
// //       {
// //         stdio: ["pipe", "pipe", "pipe"],
// //       }
// //     );

// //     let output = "";
// //     let errorOutput = "";
// //     const dnsRecords: any[] = [];

// //     process.stdout.on("data", (data) => {
// //       const text = data.toString();
// //       output += text;
// //       console.log("Certbot output:", text);

// //       // Parse DNS challenge records
// //       const lines = text.split("\n");
// //       for (let i = 0; i < lines.length; i++) {
// //         if (lines[i].includes("_acme-challenge") && lines[i + 1]) {
// //           const nameMatch = lines[i].match(/_acme-challenge\.([^\s]+)/);
// //           const valueMatch = lines[i + 1].match(/^\s*(.+)$/);

// //           if (nameMatch && valueMatch) {
// //             dnsRecords.push({
// //               name: `_acme-challenge.${nameMatch[1]}`,
// //               type: "TXT",
// //               value: valueMatch[1].trim(),
// //               domain: nameMatch[1],
// //             });
// //           }
// //         }
// //       }
// //     });

// //     process.stderr.on("data", (data) => {
// //       errorOutput += data.toString();
// //       console.error("Certbot error:", data.toString());
// //     });

// //     return new Promise<NextResponse>((resolve) => {
// //       process.on("close", (code) => {
// //         console.log("Certbot process ended with code:", code);

// //         if (code === 0) {
// //           resolve(
// //             NextResponse.json({
// //               success: true,
// //               message: "Certificate generated successfully",
// //               dnsRecords,
// //               certificatePath: `/etc/letsencrypt/live/${domain}/`,
// //               output,
// //             })
// //           );
// //         } else {
// //           resolve(
// //             NextResponse.json(
// //               {
// //                 success: false,
// //                 error: errorOutput || "Certificate generation failed",
// //                 dnsRecords,
// //                 output,
// //               },
// //               { status: 500 }
// //             )
// //           );
// //         }
// //       });

// //       // Handle timeout
// //       setTimeout(() => {
// //         process.kill();
// //         resolve(
// //           NextResponse.json(
// //             {
// //               success: false,
// //               error: "Certificate generation timed out",
// //               dnsRecords,
// //             },
// //             { status: 408 }
// //           )
// //         );
// //       }, 300000); // 5 minutes timeout
// //     });
// //   } catch (error) {
// //     console.error("Certificate generation error:", error);
// //     return NextResponse.json(
// //       { success: false, error: "Internal server error" },
// //       { status: 500 }
// //     );
// //   }
// // }

// // import { NextRequest, NextResponse } from "next/server";
// // import { exec, spawn } from "child_process";
// // import { promisify } from "util";
// // import { writeFileSync, readFileSync, existsSync } from "fs";
// // import { join } from "path";

// // const execAsync = promisify(exec);

// // export async function POST(request: NextRequest) {
// //   try {
// //     const { domain, email, includeWildcard } = await request.json();

// //     if (!domain || !email) {
// //       return NextResponse.json(
// //         { success: false, error: "Domain and email are required" },
// //         { status: 400 }
// //       );
// //     }

// //     // Validate domain format
// //     const domainRegex =
// //       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
// //     if (!domainRegex.test(domain)) {
// //       return NextResponse.json(
// //         { success: false, error: "Invalid domain format" },
// //         { status: 400 }
// //       );
// //     }

// //     // Build certbot command
// //     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
// //     const domainFlags = domains.map((d) => `-d ${d}`).join(" ");

// //     const command = `certbot certonly \
// //       --manual \
// //       --preferred-challenges dns \
// //       --manual-public-ip-logging-ok \
// //       --non-interactive \
// //       --agree-tos \
// //       --email ${email} \
// //       --server https://acme-v02.api.letsencrypt.org/directory \
// //       --manual-auth-hook /bin/true \
// //       --manual-cleanup-hook /bin/true \
// //       ${domainFlags}`;

// //     // Execute certbot in manual mode
// //     const process = spawn(
// //       "certbot",
// //       [
// //         "certonly",
// //         "--manual",
// //         "--preferred-challenges",
// //         "dns",
// //         "--manual-public-ip-logging-ok",
// //         "--non-interactive",
// //         "--agree-tos",
// //         "--email",
// //         email,
// //         "--server",
// //         "https://acme-v02.api.letsencrypt.org/directory",
// //         ...domains.flatMap((d) => ["-d", d]),
// //       ],
// //       {
// //         stdio: ["pipe", "pipe", "pipe"],
// //       }
// //     );

// //     let output = "";
// //     let errorOutput = "";
// //     const dnsRecords: any[] = [];

// //     process.stdout.on("data", (data) => {
// //       const text = data.toString();
// //       output += text;

// //       // Parse DNS challenge records
// //       const dnsMatch = text.match(
// //         /Please deploy a DNS TXT record under the name[\s\S]*?_acme-challenge\.(.+?)\s+with the following value:\s*(.+)/g
// //       );
// //       if (dnsMatch) {
// //         dnsMatch.forEach((match: any) => {
// //           const nameMatch = match.match(/_acme-challenge\.(.+?)\s/);
// //           const valueMatch = match.match(/value:\s*(.+)/);
// //           if (nameMatch && valueMatch) {
// //             dnsRecords.push({
// //               name: `_acme-challenge.${nameMatch[1]}`,
// //               type: "TXT",
// //               value: valueMatch[1].trim(),
// //               domain: nameMatch[1],
// //             });
// //           }
// //         });
// //       }
// //     });

// //     process.stderr.on("data", (data) => {
// //       errorOutput += data.toString();
// //     });

// //     return new Promise((resolve) => {
// //       process.on("close", (code) => {
// //         if (code === 0) {
// //           resolve(
// //             NextResponse.json({
// //               success: true,
// //               message: "Certificate generated successfully",
// //               dnsRecords,
// //               certificatePath: `/etc/letsencrypt/live/${domain}/`,
// //               output,
// //             })
// //           );
// //         } else {
// //           resolve(
// //             NextResponse.json(
// //               {
// //                 success: false,
// //                 error: errorOutput || "Certificate generation failed",
// //                 dnsRecords,
// //               },
// //               { status: 500 }
// //             )
// //           );
// //         }
// //       });

// //       // Handle timeout
// //       setTimeout(() => {
// //         process.kill();
// //         resolve(
// //           NextResponse.json(
// //             {
// //               success: false,
// //               error: "Certificate generation timed out",
// //               dnsRecords,
// //             },
// //             { status: 408 }
// //           )
// //         );
// //       }, 300000); // 5 minutes timeout
// //     });
// //   } catch (error) {
// //     console.error("Certificate generation error:", error);
// //     return NextResponse.json(
// //       { success: false, error: "Internal server error" },
// //       { status: 500 }
// //     );
// //   }
// // }
