import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";

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

    // Clean up any existing processes first
    try {
      await new Promise<void>((resolve) => {
        const cleanup = spawn("sudo", [
          "bash",
          "-c",
          "pkill -f certbot || true; rm -f /var/lib/letsencrypt/.certbot.lock || true; rm -rf /tmp/certbot-* || true",
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

    // Build domains array
    const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];

    // Execute certbot in manual mode with proper configuration
    const certbotArgs = [
      "certonly",
      "--manual",
      "--preferred-challenges",
      "dns",
      "--dry-run", // Keep dry-run for getting DNS challenge without rate limits
      "--agree-tos",
      "--email",
      email,
      "--server",
      "https://acme-v02.api.letsencrypt.org/directory",
      "--cert-name",
      domain,
      ...domains.flatMap((d) => ["-d", d]),
    ];

    console.log("Executing certbot with args:", certbotArgs);

    const certbotProcess = spawn("sudo", ["certbot", ...certbotArgs], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    let errorOutput = "";
    const dnsRecords: any[] = [];
    let responseSent = false;

    certbotProcess.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      console.log("Certbot stdout:", text);

      // Parse DNS challenge records more aggressively
      const lines = text.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Look for DNS TXT record instructions
        if (line.includes("Please deploy a DNS TXT record under the name")) {
          let recordName = "";
          let recordValue = "";

          // Look ahead for the record details
          for (let j = i + 1; j < Math.min(i + 25, lines.length); j++) {
            const nextLine = lines[j].trim();

            // Find record name (contains _acme-challenge)
            if (nextLine.includes("_acme-challenge.") && !recordName) {
              // Extract clean record name
              const match = nextLine.match(/_acme-challenge\.[a-zA-Z0-9\.\-]+/);
              if (match) {
                recordName = match[0].replace(/\.$/, ""); // Remove trailing dot if present
                console.log("Found DNS record name:", recordName);
              }
            }

            // Find record value (long alphanumeric string after "with the following value:")
            if (
              nextLine.length > 30 &&
              /^[A-Za-z0-9_\-]+$/.test(nextLine) &&
              !nextLine.includes("_acme-challenge") &&
              !nextLine.includes("with the following") &&
              !nextLine.includes("Please deploy")
            ) {
              // Check if previous lines mentioned "with the following value"
              const prevLines = lines.slice(Math.max(0, j - 3), j).join(" ");
              if (
                prevLines.includes("with the following value") ||
                prevLines.includes("following value")
              ) {
                recordValue = nextLine;
                console.log("Found DNS record value:", recordValue);
                break;
              }
            }
          }

          if (recordName && recordValue) {
            const baseDomain = recordName.replace("_acme-challenge.", "");
            const dnsRecord = {
              name: recordName,
              type: "TXT",
              value: recordValue,
              domain: baseDomain,
            };

            // Avoid duplicates
            if (
              !dnsRecords.find(
                (r) => r.name === recordName && r.value === recordValue
              )
            ) {
              dnsRecords.push(dnsRecord);
              console.log("Added DNS record:", dnsRecord);

              // Send response immediately when we get DNS records
              if (!responseSent) {
                responseSent = true;
                setTimeout(() => {
                  certbotProcess.kill("SIGTERM");
                }, 2000);
              }
            }
          }
        }

        // Alternative parsing for different certbot output formats
        if (line.includes("_acme-challenge.") && !line.includes("Please")) {
          const nameMatch = line.match(/_acme-challenge\.[a-zA-Z0-9\.\-]+/);
          if (nameMatch) {
            const recordName = nameMatch[0].replace(/\.$/, "");
            const baseDomain = recordName.replace("_acme-challenge.", "");

            // Look for value in surrounding lines
            for (
              let k = Math.max(0, i - 3);
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
                  domain: baseDomain,
                };

                if (
                  !dnsRecords.find(
                    (r) => r.name === recordName && r.value === valueLine
                  )
                ) {
                  dnsRecords.push(dnsRecord);
                  console.log("Added DNS record (alt):", dnsRecord);

                  if (!responseSent) {
                    responseSent = true;
                    setTimeout(() => {
                      certbotProcess.kill("SIGTERM");
                    }, 2000);
                  }
                }
                break;
              }
            }
          }
        }
      }

      // Kill process if we see "Press Enter to Continue" - we have what we need
      if (
        (text.includes("Press Enter to Continue") ||
          text.includes("Press ENTER to continue")) &&
        dnsRecords.length > 0 &&
        !responseSent
      ) {
        responseSent = true;
        setTimeout(() => {
          certbotProcess.kill("SIGTERM");
        }, 1000);
      }
    });

    certbotProcess.stderr.on("data", (data) => {
      const text = data.toString();
      errorOutput += text;
      console.error("Certbot stderr:", text);
    });

    // Send response after timeout if we haven't already
    const timeoutId = setTimeout(() => {
      if (!responseSent) {
        responseSent = true;
        certbotProcess.kill("SIGTERM");
      }
    }, 30000); // 30 seconds timeout

    return new Promise<NextResponse>((resolve) => {
      certbotProcess.on("close", (code) => {
        clearTimeout(timeoutId);
        if (responseSent) return;

        console.log("Certbot process ended with code:", code);
        responseSent = true;

        if (dnsRecords.length > 0) {
          resolve(
            NextResponse.json({
              success: true,
              message:
                "DNS verification required. Add these TXT records to your DNS provider.",
              dnsRecords,
              serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
                .map((d) => `-d ${d}`)
                .join(" ")} --agree-tos --cert-name ${domain}`,
              certificatePath: `/etc/letsencrypt/live/${domain}/`,
              instructions: [
                "Add the DNS TXT records shown above to your DNS provider",
                "Wait 5-10 minutes for DNS propagation",
                "Run the server command to generate real certificates",
                "When prompted, press Enter to continue verification",
              ],
              note: "Remove --dry-run from the server command to generate actual certificates.",
              output,
            })
          );
        } else {
          // Return instructions even if we couldn't parse DNS records
          resolve(
            NextResponse.json({
              success: true,
              message:
                "Please run the server command below to get DNS verification instructions.",
              serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
                .map((d) => `-d ${d}`)
                .join(" ")} --agree-tos --cert-name ${domain}`,
              certificatePath: `/etc/letsencrypt/live/${domain}/`,
              instructions: [
                "SSH into your server",
                "Run the server command shown above",
                "Certbot will show you the DNS TXT records to add",
                "Add those records to your DNS provider",
                "Wait for DNS propagation, then press Enter in certbot",
              ],
              note: "This tool will show you the exact command to run. The actual DNS values will be displayed when you run certbot on your server.",
              exampleDnsFormat: domains.map((d) => {
                const cleanDomain = d.replace("*.", "");
                return {
                  name: `_acme-challenge.${cleanDomain}`,
                  type: "TXT",
                  value: "[VALUE_FROM_CERTBOT]",
                  domain: cleanDomain,
                };
              }),
              output: output || "No output captured",
              errorOutput: errorOutput || "No errors",
            })
          );
        }
      });

      certbotProcess.on("error", (error) => {
        clearTimeout(timeoutId);
        if (responseSent) return;

        console.error("Process error:", error);
        responseSent = true;

        resolve(
          NextResponse.json(
            {
              success: false,
              error: `Process failed to start: ${error.message}`,
              serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
                .map((d) => `-d ${d}`)
                .join(" ")} --agree-tos --cert-name ${domain}`,
              troubleshooting: [
                "If this tool isn't working, you can run certbot manually:",
                "1. SSH into your server",
                "2. Run the server command shown above",
                "3. Follow the DNS verification steps",
              ],
            },
            { status: 500 }
          )
        );
      });

      // Handle the case where we found DNS records during stdout processing
      if (dnsRecords.length > 0 && !responseSent) {
        responseSent = true;
        resolve(
          NextResponse.json({
            success: true,
            message:
              "DNS verification required. Add these TXT records to your DNS provider.",
            dnsRecords,
            serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
              .map((d) => `-d ${d}`)
              .join(" ")} --agree-tos --cert-name ${domain}`,
            certificatePath: `/etc/letsencrypt/live/${domain}/`,
            instructions: [
              "Add the DNS TXT records shown above to your DNS provider",
              "Wait 5-10 minutes for DNS propagation",
              "Run the server command to generate real certificates",
              "When prompted, press Enter to continue verification",
            ],
            note: "Remove --dry-run from the server command to generate actual certificates.",
            output,
          })
        );
      }
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

//     // Use interactive mode to get DNS challenge
//     const certbotArgs = [
//       "certonly",
//       "--manual",
//       "--preferred-challenges",
//       "dns",
//       "--dry-run",
//       "--agree-tos",
//       "--email",
//       email,
//       "--server",
//       "https://acme-v02.api.letsencrypt.org/directory",
//       ...domains.flatMap((d) => ["-d", d]),
//     ];

//     console.log("Executing certbot with args:", certbotArgs);

//     const certbotProcess = spawn("sudo", ["certbot", ...certbotArgs], {
//       stdio: ["pipe", "pipe", "pipe"],
//     });

//     let output = "";
//     let errorOutput = "";
//     const dnsRecords: any[] = [];
//     let responseSent = false;

//     // Send "no" to any prompts to avoid hanging and get DNS info
//     certbotProcess.stdin.write("n\n");

//     certbotProcess.stdout.on("data", (data) => {
//       const text = data.toString();
//       output += text;
//       console.log("Certbot stdout:", text);

//       // Parse DNS challenge from output
//       const lines = text.split("\n");

//       for (let i = 0; i < lines.length; i++) {
//         const line = lines[i].trim();

//         // Look for DNS TXT record instructions
//         if (line.includes("Please deploy a DNS TXT record under the name")) {
//           let recordName = "";
//           let recordValue = "";

//           // Look ahead for the record details
//           for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
//             const nextLine = lines[j].trim();

//             // Find record name (contains _acme-challenge)
//             if (nextLine.includes("_acme-challenge.") && !recordName) {
//               recordName = nextLine.replace(/[^\w\.\-]/g, "");
//               console.log("Found DNS record name:", recordName);
//             }

//             // Find record value (long alphanumeric string after "with the following value:")
//             if (
//               lines[j - 1] &&
//               lines[j - 1].includes("with the following value") &&
//               nextLine.length > 20 &&
//               /^[A-Za-z0-9_\-]+$/.test(nextLine)
//             ) {
//               recordValue = nextLine;
//               console.log("Found DNS record value:", recordValue);
//               break;
//             }
//           }

//           if (recordName && recordValue) {
//             const baseDomain = recordName.replace("_acme-challenge.", "");
//             const dnsRecord = {
//               name: recordName,
//               type: "TXT",
//               value: recordValue,
//               domain: baseDomain,
//             };

//             // Avoid duplicates
//             if (
//               !dnsRecords.find(
//                 (r) => r.name === recordName && r.value === recordValue
//               )
//             ) {
//               dnsRecords.push(dnsRecord);
//               console.log("Added DNS record:", dnsRecord);
//             }
//           }
//         }
//       }

//       // If we found DNS records, prepare to return them
//       if (dnsRecords.length > 0 && !responseSent) {
//         responseSent = true;
//         // Give it a moment to capture all output, then kill
//         setTimeout(() => {
//           certbotProcess.kill("SIGTERM");
//         }, 2000);
//       }
//     });

//     certbotProcess.stderr.on("data", (data) => {
//       const text = data.toString();
//       errorOutput += text;
//       console.error("Certbot stderr:", text);
//     });

//     return new Promise<NextResponse>((resolve) => {
//       const timeoutId = setTimeout(() => {
//         if (!responseSent) {
//           responseSent = true;
//           certbotProcess.kill("SIGTERM");

//           // If we didn't get DNS records from certbot, generate the expected format
//           if (dnsRecords.length === 0) {
//             // Generate example DNS records for the user to understand the format
//             const exampleRecords = domains.map((d) => {
//               const cleanDomain = d.replace("*.", "");
//               return {
//                 name: `_acme-challenge.${cleanDomain}`,
//                 type: "TXT",
//                 value: "EXAMPLE_VALUE_FROM_CERTBOT",
//                 domain: cleanDomain,
//               };
//             });

//             resolve(
//               NextResponse.json({
//                 success: true,
//                 message:
//                   "Manual DNS verification required. Run the server command below to get the actual TXT record values.",
//                 dnsRecords: exampleRecords,
//                 serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
//                   .map((d) => `-d ${d}`)
//                   .join(" ")} --agree-tos --cert-name ${domain}`,
//                 certificatePath: `/etc/letsencrypt/live/${domain}/`,
//                 note: "The server command will show you the exact TXT record values to add to your DNS.",
//                 instructions: [
//                   "1. Run the server command shown below on your server",
//                   "2. Certbot will display the exact DNS TXT records to add",
//                   "3. Add those TXT records to your DNS provider",
//                   "4. Wait 5-10 minutes for DNS propagation",
//                   "5. Press Enter in the certbot prompt to verify and generate certificates",
//                 ],
//                 output,
//               })
//             );
//           } else {
//             resolve(
//               NextResponse.json({
//                 success: true,
//                 message:
//                   "DNS verification required. Add these TXT records to your DNS provider.",
//                 dnsRecords,
//                 serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
//                   .map((d) => `-d ${d}`)
//                   .join(" ")} --agree-tos`,
//                 certificatePath: `/etc/letsencrypt/live/${domain}/`,
//                 output,
//                 note: "Remove --dry-run from the server command to generate actual certificates.",
//                 instructions: [
//                   "1. Add the DNS TXT records shown above to your DNS provider",
//                   "2. Wait 5-10 minutes for DNS propagation",
//                   "3. Run the server command to generate real certificates",
//                   "4. When prompted, press Enter to continue verification",
//                 ],
//               })
//             );
//           }
//         }
//       }, 30000); // 30 seconds timeout

//       certbotProcess.on("close", (code) => {
//         clearTimeout(timeoutId);
//         if (responseSent) return;

//         console.log("Certbot process ended with code:", code);
//         responseSent = true;

//         if (dnsRecords.length > 0) {
//           resolve(
//             NextResponse.json({
//               success: true,
//               message:
//                 "DNS verification required. Add these TXT records to your DNS provider.",
//               dnsRecords,
//               serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
//                 .map((d) => `-d ${d}`)
//                 .join(" ")} --agree-tos`,
//               certificatePath: `/etc/letsencrypt/live/${domain}/`,
//               output,
//               instructions: [
//                 "1. Add the DNS TXT records shown above",
//                 "2. Wait for DNS propagation (5-10 minutes)",
//                 "3. Run the server command",
//                 "4. Press Enter when prompted",
//               ],
//             })
//           );
//         } else {
//           // Return instructions even if we couldn't parse DNS records
//           resolve(
//             NextResponse.json({
//               success: true,
//               message:
//                 "Please run the server command below to get DNS verification instructions.",
//               serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
//                 .map((d) => `-d ${d}`)
//                 .join(" ")} --agree-tos`,
//               certificatePath: `/etc/letsencrypt/live/${domain}/`,
//               instructions: [
//                 "1. SSH into your server",
//                 "2. Run the server command shown above",
//                 "3. Certbot will show you the DNS TXT records to add",
//                 "4. Add those records to your DNS provider",
//                 "5. Wait for DNS propagation, then press Enter in certbot",
//               ],
//               note: "This tool will show you the exact command to run. The actual DNS values will be displayed when you run certbot on your server.",
//               exampleDnsFormat: domains.map((d) => {
//                 const cleanDomain = d.replace("*.", "");
//                 return {
//                   name: `_acme-challenge.${cleanDomain}`,
//                   type: "TXT",
//                   value: "[VALUE_FROM_CERTBOT]",
//                   domain: cleanDomain,
//                 };
//               }),
//               output: output || "No output captured",
//               errorOutput: errorOutput || "No errors",
//             })
//           );
//         }
//       });

//       certbotProcess.on("error", (error) => {
//         clearTimeout(timeoutId);
//         if (responseSent) return;

//         console.error("Process error:", error);
//         responseSent = true;

//         resolve(
//           NextResponse.json(
//             {
//               success: false,
//               error: `Process failed to start: ${error.message}`,
//               serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
//                 .map((d) => `-d ${d}`)
//                 .join(" ")} --agree-tos`,
//               fallbackInstructions: [
//                 "If this tool isn't working, you can run certbot manually:",
//                 "1. SSH into your server",
//                 "2. Run the server command shown above",
//                 "3. Follow the DNS verification steps",
//               ],
//             },
//             { status: 500 }
//           )
//         );
//       });
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
// // import { spawn, exec } from "child_process";
// // import { promisify } from "util";

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

// //     // Clean up any existing certbot processes and lock files
// //     try {
// //       await execAsync("sudo pkill -f certbot || true");
// //       await execAsync("sudo rm -f /var/lib/letsencrypt/.certbot.lock || true");
// //       await execAsync("sudo rm -rf /tmp/certbot-* || true");

// //       // Wait a moment for cleanup
// //       await new Promise((resolve) => setTimeout(resolve, 2000));
// //     } catch (cleanupError) {
// //       console.log("Cleanup warning:", cleanupError);
// //       // Continue anyway
// //     }

// //     // Build domains array
// //     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];

// //     // Execute certbot in manual mode with proper configuration
// //     const certbotArgs = [
// //       "certonly",
// //       "--manual",
// //       "--preferred-challenges",
// //       "dns",
// //       "--dry-run", // Keep dry-run for testing
// //       "--agree-tos",
// //       "--email",
// //       email,
// //       "--server",
// //       "https://acme-v02.api.letsencrypt.org/directory",
// //       "--non-interactive",
// //       "--cert-name",
// //       domain,
// //       ...domains.flatMap((d) => ["-d", d]),
// //     ];

// //     console.log("Executing certbot with args:", certbotArgs);

// //     const certbotProcess = spawn("sudo", ["certbot", ...certbotArgs], {
// //       stdio: ["pipe", "pipe", "pipe"],
// //       env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" },
// //     });

// //     let output = "";
// //     let errorOutput = "";
// //     const dnsRecords: any[] = [];
// //     let responseSent = false;

// //     certbotProcess.stdout.on("data", (data) => {
// //       const text = data.toString();
// //       output += text;
// //       console.log("Certbot stdout:", text);

// //       // Parse DNS records from output
// //       const lines = text.split("\n");

// //       for (let i = 0; i < lines.length; i++) {
// //         const line = lines[i].trim();

// //         // Look for DNS challenge instructions
// //         if (line.includes("Please deploy a DNS TXT record under the name")) {
// //           console.log("Found DNS challenge instruction");

// //           // Look for the record name and value in subsequent lines
// //           let recordName = "";
// //           let recordValue = "";

// //           for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
// //             const currentLine = lines[j].trim();

// //             // Record name line (contains _acme-challenge)
// //             if (currentLine.includes("_acme-challenge.") && !recordName) {
// //               recordName = currentLine.replace(/[^\w\-\.]/g, "");
// //               console.log("Found record name:", recordName);
// //             }

// //             // Record value line (long alphanumeric string)
// //             if (
// //               !recordValue &&
// //               currentLine.length > 30 &&
// //               /^[A-Za-z0-9_\-]+$/.test(currentLine) &&
// //               !currentLine.includes("_acme-challenge")
// //             ) {
// //               recordValue = currentLine;
// //               console.log("Found record value:", recordValue);
// //               break;
// //             }
// //           }

// //           if (recordName && recordValue) {
// //             const domain = recordName.replace("_acme-challenge.", "");
// //             const dnsRecord = {
// //               name: recordName,
// //               type: "TXT",
// //               value: recordValue,
// //               domain: domain,
// //             };

// //             // Avoid duplicates
// //             if (
// //               !dnsRecords.find(
// //                 (r) => r.name === recordName && r.value === recordValue
// //               )
// //             ) {
// //               dnsRecords.push(dnsRecord);
// //               console.log("Added DNS record:", dnsRecord);
// //             }
// //           }
// //         }

// //         // Alternative parsing pattern
// //         if (
// //           line.match(/_acme-challenge\.[a-zA-Z0-9\.\-]+/) &&
// //           !line.includes("Please")
// //         ) {
// //           const nameMatch = line.match(/_acme-challenge\.[a-zA-Z0-9\.\-]+/);
// //           if (nameMatch) {
// //             const recordName = nameMatch[0];
// //             const domain = recordName.replace("_acme-challenge.", "");

// //             // Look for value in nearby lines
// //             for (
// //               let k = Math.max(0, i - 2);
// //               k < Math.min(i + 5, lines.length);
// //               k++
// //             ) {
// //               const valueLine = lines[k].trim();
// //               if (
// //                 valueLine.length > 30 &&
// //                 /^[A-Za-z0-9_\-]+$/.test(valueLine) &&
// //                 !valueLine.includes("_acme-challenge")
// //               ) {
// //                 const dnsRecord = {
// //                   name: recordName,
// //                   type: "TXT",
// //                   value: valueLine,
// //                   domain: domain,
// //                 };

// //                 if (
// //                   !dnsRecords.find(
// //                     (r) => r.name === recordName && r.value === valueLine
// //                   )
// //                 ) {
// //                   dnsRecords.push(dnsRecord);
// //                   console.log("Added DNS record (alt):", dnsRecord);
// //                 }
// //                 break;
// //               }
// //             }
// //           }
// //         }
// //       }

// //       // Send response when we have DNS records
// //       if (dnsRecords.length > 0 && !responseSent) {
// //         responseSent = true;
// //         setTimeout(() => certbotProcess.kill("SIGTERM"), 1000);
// //       }
// //     });

// //     certbotProcess.stderr.on("data", (data) => {
// //       const text = data.toString();
// //       errorOutput += text;
// //       console.error("Certbot stderr:", text);

// //       // Handle specific errors
// //       if (text.includes("Another instance of Certbot is already running")) {
// //         if (!responseSent) {
// //           responseSent = true;
// //           certbotProcess.kill("SIGTERM");
// //         }
// //       }
// //     });

// //     return new Promise<NextResponse>((resolve) => {
// //       const timeoutId = setTimeout(() => {
// //         if (!responseSent) {
// //           responseSent = true;
// //           certbotProcess.kill("SIGTERM");

// //           if (dnsRecords.length > 0) {
// //             resolve(
// //               NextResponse.json({
// //                 success: true,
// //                 message:
// //                   "DNS verification required. Add these TXT records to your DNS provider.",
// //                 dnsRecords,
// //                 serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
// //                   .map((d) => `-d ${d}`)
// //                   .join(" ")} --agree-tos`,
// //                 certificatePath: `/etc/letsencrypt/live/${domain}/`,
// //                 output,
// //                 note: "This was a dry-run. Remove --dry-run from the server command for actual certificates.",
// //                 nextSteps: [
// //                   "1. Add the DNS TXT records shown above to your DNS provider",
// //                   "2. Wait 5-10 minutes for DNS propagation",
// //                   "3. Run the server command to generate real certificates",
// //                   "4. When prompted, press Enter to continue verification",
// //                 ],
// //               })
// //             );
// //           } else {
// //             resolve(
// //               NextResponse.json(
// //                 {
// //                   success: false,
// //                   error: "No DNS records were generated. Please try again.",
// //                   output,
// //                   errorOutput,
// //                 },
// //                 { status: 500 }
// //               )
// //             );
// //           }
// //         }
// //       }, 15000); // 15 seconds timeout

// //       certbotProcess.on("close", (code) => {
// //         clearTimeout(timeoutId);
// //         if (responseSent) return;

// //         console.log("Certbot process ended with code:", code);

// //         if (
// //           errorOutput.includes("Another instance of Certbot is already running")
// //         ) {
// //           resolve(
// //             NextResponse.json(
// //               {
// //                 success: false,
// //                 error:
// //                   "Another certbot process is running. Please wait a moment and try again.",
// //                 suggestion:
// //                   "Try refreshing the page and generating again in 30 seconds.",
// //                 troubleshooting: [
// //                   "A previous certbot process is still running",
// //                   "Please wait 30 seconds and try again",
// //                   "If this persists, contact the administrator",
// //                 ],
// //               },
// //               { status: 409 }
// //             )
// //           );
// //         } else if (dnsRecords.length > 0) {
// //           resolve(
// //             NextResponse.json({
// //               success: true,
// //               message:
// //                 "DNS verification required. Add these TXT records to your DNS provider.",
// //               dnsRecords,
// //               serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
// //                 .map((d) => `-d ${d}`)
// //                 .join(" ")} --agree-tos`,
// //               certificatePath: `/etc/letsencrypt/live/${domain}/`,
// //               output,
// //               note: "This was a dry-run. Remove --dry-run for actual certificates.",
// //             })
// //           );
// //         } else {
// //           resolve(
// //             NextResponse.json(
// //               {
// //                 success: false,
// //                 error: errorOutput || "Certificate generation failed",
// //                 output,
// //                 code,
// //                 troubleshooting: [
// //                   "Make sure your domain points to this server",
// //                   "Check that ports 80 and 443 are accessible",
// //                   "Verify your email address is valid",
// //                   "Try again in a few minutes",
// //                 ],
// //               },
// //               { status: 500 }
// //             )
// //           );
// //         }
// //       });

// //       certbotProcess.on("error", (error) => {
// //         clearTimeout(timeoutId);
// //         if (responseSent) return;

// //         console.error("Process error:", error);
// //         resolve(
// //           NextResponse.json(
// //             {
// //               success: false,
// //               error: `Process failed to start: ${error.message}`,
// //             },
// //             { status: 500 }
// //           )
// //         );
// //       });
// //     });
// //   } catch (error) {
// //     console.error("Certificate generation error:", error);
// //     return NextResponse.json(
// //       { success: false, error: "Internal server error" },
// //       { status: 500 }
// //     );
// //   }
// // }

// // // import { NextRequest, NextResponse } from "next/server";
// // // import { spawn } from "child_process";
// // // import { promises as fs } from "fs";
// // // import path from "path";

// // // export async function POST(request: NextRequest): Promise<NextResponse> {
// // //   try {
// // //     const { domain, email, includeWildcard } = await request.json();

// // //     if (!domain || !email) {
// // //       return NextResponse.json(
// // //         { success: false, error: "Domain and email are required" },
// // //         { status: 400 }
// // //       );
// // //     }

// // //     // Validate domain format
// // //     const domainRegex =
// // //       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
// // //     if (!domainRegex.test(domain)) {
// // //       return NextResponse.json(
// // //         { success: false, error: "Invalid domain format" },
// // //         { status: 400 }
// // //       );
// // //     }

// // //     // Build domains array
// // //     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];

// // //     // Generate certificate using certbot
// // //     const certbotArgs = [
// // //       "certonly",
// // //       "--manual",
// // //       "--preferred-challenges",
// // //       "dns",
// // //       "--manual-public-ip-logging-ok",
// // //       "--agree-tos",
// // //       "--email",
// // //       email,
// // //       "--server",
// // //       "https://acme-v02.api.letsencrypt.org/directory",
// // //       "--cert-name",
// // //       domain, // Use domain as cert name
// // //       ...domains.flatMap((d) => ["-d", d]),
// // //     ];

// // //     console.log("Executing certbot for download with args:", certbotArgs);

// // //     const process = spawn("sudo", ["certbot", ...certbotArgs], {
// // //       stdio: ["pipe", "pipe", "pipe"],
// // //     });

// // //     let output = "";
// // //     let errorOutput = "";
// // //     const dnsRecords: any[] = [];

// // //     process.stdout.on("data", (data) => {
// // //       const text = data.toString();
// // //       output += text;
// // //       console.log("Certbot stdout:", text);

// // //       // Parse DNS challenge records
// // //       const lines = text.split("\n");
// // //       for (let i = 0; i < lines.length; i++) {
// // //         const line = lines[i];

// // //         if (line.includes("Please deploy a DNS TXT record")) {
// // //           // Look for DNS record details in subsequent lines
// // //           for (let j = i; j < Math.min(i + 10, lines.length); j++) {
// // //             const currentLine = lines[j];
// // //             const nameMatch = currentLine.match(/_acme-challenge\.([^\s\n]+)/);
// // //             if (nameMatch) {
// // //               for (let k = j + 1; k < Math.min(j + 5, lines.length); k++) {
// // //                 const valueLine = lines[k].trim();
// // //                 if (
// // //                   valueLine &&
// // //                   !valueLine.includes("_acme-challenge") &&
// // //                   valueLine.length > 10
// // //                 ) {
// // //                   dnsRecords.push({
// // //                     name: `_acme-challenge.${nameMatch[1]}`,
// // //                     type: "TXT",
// // //                     value: valueLine,
// // //                     domain: nameMatch[1],
// // //                   });
// // //                   break;
// // //                 }
// // //               }
// // //               break;
// // //             }
// // //           }
// // //         }
// // //       }
// // //     });

// // //     process.stderr.on("data", (data) => {
// // //       const text = data.toString();
// // //       errorOutput += text;
// // //       console.error("Certbot stderr:", text);
// // //     });

// // //     return new Promise<NextResponse>((resolve) => {
// // //       process.on("close", async (code) => {
// // //         console.log("Certbot process ended with code:", code);

// // //         if (code === 0) {
// // //           try {
// // //             // Certificate was generated successfully, read the files
// // //             const certPath = `/etc/letsencrypt/live/${domain}`;

// // //             const certificateFiles: any = {};

// // //             try {
// // //               // Read certificate files if they exist
// // //               const fullchainPath = path.join(certPath, "fullchain.pem");
// // //               const privkeyPath = path.join(certPath, "privkey.pem");
// // //               const certPath_file = path.join(certPath, "cert.pem");
// // //               const chainPath = path.join(certPath, "chain.pem");

// // //               // Check if files exist and read them
// // //               if (
// // //                 await fs
// // //                   .access(fullchainPath)
// // //                   .then(() => true)
// // //                   .catch(() => false)
// // //               ) {
// // //                 certificateFiles.fullchain = await fs.readFile(
// // //                   fullchainPath,
// // //                   "utf8"
// // //                 );
// // //               }

// // //               if (
// // //                 await fs
// // //                   .access(privkeyPath)
// // //                   .then(() => true)
// // //                   .catch(() => false)
// // //               ) {
// // //                 certificateFiles.privkey = await fs.readFile(
// // //                   privkeyPath,
// // //                   "utf8"
// // //                 );
// // //               }

// // //               if (
// // //                 await fs
// // //                   .access(certPath_file)
// // //                   .then(() => true)
// // //                   .catch(() => false)
// // //               ) {
// // //                 certificateFiles.cert = await fs.readFile(
// // //                   certPath_file,
// // //                   "utf8"
// // //                 );
// // //               }

// // //               if (
// // //                 await fs
// // //                   .access(chainPath)
// // //                   .then(() => true)
// // //                   .catch(() => false)
// // //               ) {
// // //                 certificateFiles.chain = await fs.readFile(chainPath, "utf8");
// // //               }

// // //               resolve(
// // //                 NextResponse.json({
// // //                   success: true,
// // //                   message: "Certificate generated successfully!",
// // //                   certificateFiles,
// // //                   certificatePath: certPath,
// // //                   dnsRecords: dnsRecords.length > 0 ? dnsRecords : undefined,
// // //                   expiryDate: new Date(
// // //                     Date.now() + 90 * 24 * 60 * 60 * 1000
// // //                   ).toISOString(), // 90 days from now
// // //                   domains,
// // //                   output,
// // //                 })
// // //               );
// // //             } catch (fileError) {
// // //               console.error("Error reading certificate files:", fileError);
// // //               resolve(
// // //                 NextResponse.json({
// // //                   success: true,
// // //                   message:
// // //                     "Certificate generated but files could not be read. Check server permissions.",
// // //                   certificatePath: certPath,
// // //                   dnsRecords,
// // //                   error: `File access error: ${fileError}`,
// // //                   output,
// // //                 })
// // //               );
// // //             }
// // //           } catch (error) {
// // //             console.error("Post-generation error:", error);
// // //             resolve(
// // //               NextResponse.json(
// // //                 {
// // //                   success: false,
// // //                   error: `Post-generation error: ${error}`,
// // //                   output,
// // //                   dnsRecords,
// // //                 },
// // //                 { status: 500 }
// // //               )
// // //             );
// // //           }
// // //         } else {
// // //           // Certificate generation failed
// // //           resolve(
// // //             NextResponse.json(
// // //               {
// // //                 success: false,
// // //                 error: errorOutput || "Certificate generation failed",
// // //                 dnsRecords: dnsRecords.length > 0 ? dnsRecords : undefined,
// // //                 output,
// // //                 code,
// // //                 message:
// // //                   dnsRecords.length > 0
// // //                     ? "DNS verification required. Add the TXT records above and try again."
// // //                     : "Certificate generation failed.",
// // //               },
// // //               { status: 500 }
// // //             )
// // //           );
// // //         }
// // //       });

// // //       process.on("error", (error) => {
// // //         console.error("Process error:", error);
// // //         resolve(
// // //           NextResponse.json(
// // //             {
// // //               success: false,
// // //               error: `Process failed to start: ${error.message}`,
// // //               dnsRecords,
// // //             },
// // //             { status: 500 }
// // //           )
// // //         );
// // //       });

// // //       // Handle timeout
// // //       setTimeout(() => {
// // //         process.kill();
// // //         resolve(
// // //           NextResponse.json(
// // //             {
// // //               success: false,
// // //               error: "Certificate generation timed out",
// // //               dnsRecords,
// // //             },
// // //             { status: 408 }
// // //           )
// // //         );
// // //       }, 600000); // 10 minutes timeout for actual cert generation
// // //     });
// // //   } catch (error) {
// // //     console.error("Certificate generation error:", error);
// // //     return NextResponse.json(
// // //       { success: false, error: "Internal server error" },
// // //       { status: 500 }
// // //     );
// // //   }
// // // }

// // // // import { NextRequest, NextResponse } from "next/server";
// // // // import { exec, spawn } from "child_process";
// // // // import { promisify } from "util";
// // // // import { join } from "path";

// // // // const execAsync = promisify(exec);

// // // // export async function POST(request: NextRequest): Promise<NextResponse> {
// // // //   try {
// // // //     const { domain, email, includeWildcard } = await request.json();

// // // //     if (!domain || !email) {
// // // //       return NextResponse.json(
// // // //         { success: false, error: "Domain and email are required" },
// // // //         { status: 400 }
// // // //       );
// // // //     }

// // // //     // Validate domain format
// // // //     const domainRegex =
// // // //       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
// // // //     if (!domainRegex.test(domain)) {
// // // //       return NextResponse.json(
// // // //         { success: false, error: "Invalid domain format" },
// // // //         { status: 400 }
// // // //       );
// // // //     }

// // // //     // Build certbot command
// // // //     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
// // // //     const domainFlags = domains.map((d) => `-d ${d}`).join(" ");

// // // //     const command = `sudo certbot certonly \
// // // //       --manual \
// // // //       --preferred-challenges dns \
// // // //       --manual-public-ip-logging-ok \
// // // //       --non-interactive \
// // // //       --agree-tos \
// // // //       --email ${email} \
// // // //       --server https://acme-v02.api.letsencrypt.org/directory \
// // // //       --manual-auth-hook /bin/true \
// // // //       --manual-cleanup-hook /bin/true \
// // // //       ${domainFlags}`;

// // // //     // Execute certbot in manual mode
// // // //     const process = spawn(
// // // //       "sudo",
// // // //       [
// // // //         "certbot",
// // // //         "certonly",
// // // //         "--manual",
// // // //         "--preferred-challenges",
// // // //         "dns",
// // // //         "--manual-public-ip-logging-ok",
// // // //         "--non-interactive",
// // // //         "--agree-tos",
// // // //         "--email",
// // // //         email,
// // // //         "--server",
// // // //         "https://acme-v02.api.letsencrypt.org/directory",
// // // //         ...domains.flatMap((d) => ["-d", d]),
// // // //       ],
// // // //       {
// // // //         stdio: ["pipe", "pipe", "pipe"],
// // // //       }
// // // //     );

// // // //     let output = "";
// // // //     let errorOutput = "";
// // // //     const dnsRecords: any[] = [];

// // // //     process.stdout.on("data", (data) => {
// // // //       const text = data.toString();
// // // //       output += text;
// // // //       console.log("Certbot output:", text);

// // // //       // Parse DNS challenge records
// // // //       const lines = text.split("\n");
// // // //       for (let i = 0; i < lines.length; i++) {
// // // //         if (lines[i].includes("_acme-challenge") && lines[i + 1]) {
// // // //           const nameMatch = lines[i].match(/_acme-challenge\.([^\s]+)/);
// // // //           const valueMatch = lines[i + 1].match(/^\s*(.+)$/);

// // // //           if (nameMatch && valueMatch) {
// // // //             dnsRecords.push({
// // // //               name: `_acme-challenge.${nameMatch[1]}`,
// // // //               type: "TXT",
// // // //               value: valueMatch[1].trim(),
// // // //               domain: nameMatch[1],
// // // //             });
// // // //           }
// // // //         }
// // // //       }
// // // //     });

// // // //     process.stderr.on("data", (data) => {
// // // //       errorOutput += data.toString();
// // // //       console.error("Certbot error:", data.toString());
// // // //     });

// // // //     return new Promise<NextResponse>((resolve) => {
// // // //       process.on("close", (code) => {
// // // //         console.log("Certbot process ended with code:", code);

// // // //         if (code === 0) {
// // // //           resolve(
// // // //             NextResponse.json({
// // // //               success: true,
// // // //               message: "Certificate generated successfully",
// // // //               dnsRecords,
// // // //               certificatePath: `/etc/letsencrypt/live/${domain}/`,
// // // //               output,
// // // //             })
// // // //           );
// // // //         } else {
// // // //           resolve(
// // // //             NextResponse.json(
// // // //               {
// // // //                 success: false,
// // // //                 error: errorOutput || "Certificate generation failed",
// // // //                 dnsRecords,
// // // //                 output,
// // // //               },
// // // //               { status: 500 }
// // // //             )
// // // //           );
// // // //         }
// // // //       });

// // // //       // Handle timeout
// // // //       setTimeout(() => {
// // // //         process.kill();
// // // //         resolve(
// // // //           NextResponse.json(
// // // //             {
// // // //               success: false,
// // // //               error: "Certificate generation timed out",
// // // //               dnsRecords,
// // // //             },
// // // //             { status: 408 }
// // // //           )
// // // //         );
// // // //       }, 300000); // 5 minutes timeout
// // // //     });
// // // //   } catch (error) {
// // // //     console.error("Certificate generation error:", error);
// // // //     return NextResponse.json(
// // // //       { success: false, error: "Internal server error" },
// // // //       { status: 500 }
// // // //     );
// // // //   }
// // // // }

// // // // import { NextRequest, NextResponse } from "next/server";
// // // // import { exec, spawn } from "child_process";
// // // // import { promisify } from "util";
// // // // import { writeFileSync, readFileSync, existsSync } from "fs";
// // // // import { join } from "path";

// // // // const execAsync = promisify(exec);

// // // // export async function POST(request: NextRequest) {
// // // //   try {
// // // //     const { domain, email, includeWildcard } = await request.json();

// // // //     if (!domain || !email) {
// // // //       return NextResponse.json(
// // // //         { success: false, error: "Domain and email are required" },
// // // //         { status: 400 }
// // // //       );
// // // //     }

// // // //     // Validate domain format
// // // //     const domainRegex =
// // // //       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
// // // //     if (!domainRegex.test(domain)) {
// // // //       return NextResponse.json(
// // // //         { success: false, error: "Invalid domain format" },
// // // //         { status: 400 }
// // // //       );
// // // //     }

// // // //     // Build certbot command
// // // //     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
// // // //     const domainFlags = domains.map((d) => `-d ${d}`).join(" ");

// // // //     const command = `certbot certonly \
// // // //       --manual \
// // // //       --preferred-challenges dns \
// // // //       --manual-public-ip-logging-ok \
// // // //       --non-interactive \
// // // //       --agree-tos \
// // // //       --email ${email} \
// // // //       --server https://acme-v02.api.letsencrypt.org/directory \
// // // //       --manual-auth-hook /bin/true \
// // // //       --manual-cleanup-hook /bin/true \
// // // //       ${domainFlags}`;

// // // //     // Execute certbot in manual mode
// // // //     const process = spawn(
// // // //       "certbot",
// // // //       [
// // // //         "certonly",
// // // //         "--manual",
// // // //         "--preferred-challenges",
// // // //         "dns",
// // // //         "--manual-public-ip-logging-ok",
// // // //         "--non-interactive",
// // // //         "--agree-tos",
// // // //         "--email",
// // // //         email,
// // // //         "--server",
// // // //         "https://acme-v02.api.letsencrypt.org/directory",
// // // //         ...domains.flatMap((d) => ["-d", d]),
// // // //       ],
// // // //       {
// // // //         stdio: ["pipe", "pipe", "pipe"],
// // // //       }
// // // //     );

// // // //     let output = "";
// // // //     let errorOutput = "";
// // // //     const dnsRecords: any[] = [];

// // // //     process.stdout.on("data", (data) => {
// // // //       const text = data.toString();
// // // //       output += text;

// // // //       // Parse DNS challenge records
// // // //       const dnsMatch = text.match(
// // // //         /Please deploy a DNS TXT record under the name[\s\S]*?_acme-challenge\.(.+?)\s+with the following value:\s*(.+)/g
// // // //       );
// // // //       if (dnsMatch) {
// // // //         dnsMatch.forEach((match: any) => {
// // // //           const nameMatch = match.match(/_acme-challenge\.(.+?)\s/);
// // // //           const valueMatch = match.match(/value:\s*(.+)/);
// // // //           if (nameMatch && valueMatch) {
// // // //             dnsRecords.push({
// // // //               name: `_acme-challenge.${nameMatch[1]}`,
// // // //               type: "TXT",
// // // //               value: valueMatch[1].trim(),
// // // //               domain: nameMatch[1],
// // // //             });
// // // //           }
// // // //         });
// // // //       }
// // // //     });

// // // //     process.stderr.on("data", (data) => {
// // // //       errorOutput += data.toString();
// // // //     });

// // // //     return new Promise((resolve) => {
// // // //       process.on("close", (code) => {
// // // //         if (code === 0) {
// // // //           resolve(
// // // //             NextResponse.json({
// // // //               success: true,
// // // //               message: "Certificate generated successfully",
// // // //               dnsRecords,
// // // //               certificatePath: `/etc/letsencrypt/live/${domain}/`,
// // // //               output,
// // // //             })
// // // //           );
// // // //         } else {
// // // //           resolve(
// // // //             NextResponse.json(
// // // //               {
// // // //                 success: false,
// // // //                 error: errorOutput || "Certificate generation failed",
// // // //                 dnsRecords,
// // // //               },
// // // //               { status: 500 }
// // // //             )
// // // //           );
// // // //         }
// // // //       });

// // // //       // Handle timeout
// // // //       setTimeout(() => {
// // // //         process.kill();
// // // //         resolve(
// // // //           NextResponse.json(
// // // //             {
// // // //               success: false,
// // // //               error: "Certificate generation timed out",
// // // //               dnsRecords,
// // // //             },
// // // //             { status: 408 }
// // // //           )
// // // //         );
// // // //       }, 300000); // 5 minutes timeout
// // // //     });
// // // //   } catch (error) {
// // // //     console.error("Certificate generation error:", error);
// // // //     return NextResponse.json(
// // // //       { success: false, error: "Internal server error" },
// // // //       { status: 500 }
// // // //     );
// // // //   }
// // // // }
