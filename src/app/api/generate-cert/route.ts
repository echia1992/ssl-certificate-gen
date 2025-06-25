import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";

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

    // Build domains array
    const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];

    // Generate certificate using certbot
    const certbotArgs = [
      "certonly",
      "--manual",
      "--preferred-challenges",
      "dns",
      "--manual-public-ip-logging-ok",
      "--agree-tos",
      "--email",
      email,
      "--server",
      "https://acme-v02.api.letsencrypt.org/directory",
      "--cert-name",
      domain, // Use domain as cert name
      ...domains.flatMap((d) => ["-d", d]),
    ];

    console.log("Executing certbot for download with args:", certbotArgs);

    const process = spawn("sudo", ["certbot", ...certbotArgs], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    let errorOutput = "";
    const dnsRecords: any[] = [];

    process.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      console.log("Certbot stdout:", text);

      // Parse DNS challenge records
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes("Please deploy a DNS TXT record")) {
          // Look for DNS record details in subsequent lines
          for (let j = i; j < Math.min(i + 10, lines.length); j++) {
            const currentLine = lines[j];
            const nameMatch = currentLine.match(/_acme-challenge\.([^\s\n]+)/);
            if (nameMatch) {
              for (let k = j + 1; k < Math.min(j + 5, lines.length); k++) {
                const valueLine = lines[k].trim();
                if (
                  valueLine &&
                  !valueLine.includes("_acme-challenge") &&
                  valueLine.length > 10
                ) {
                  dnsRecords.push({
                    name: `_acme-challenge.${nameMatch[1]}`,
                    type: "TXT",
                    value: valueLine,
                    domain: nameMatch[1],
                  });
                  break;
                }
              }
              break;
            }
          }
        }
      }
    });

    process.stderr.on("data", (data) => {
      const text = data.toString();
      errorOutput += text;
      console.error("Certbot stderr:", text);
    });

    return new Promise<NextResponse>((resolve) => {
      process.on("close", async (code) => {
        console.log("Certbot process ended with code:", code);

        if (code === 0) {
          try {
            // Certificate was generated successfully, read the files
            const certPath = `/etc/letsencrypt/live/${domain}`;

            const certificateFiles: any = {};

            try {
              // Read certificate files if they exist
              const fullchainPath = path.join(certPath, "fullchain.pem");
              const privkeyPath = path.join(certPath, "privkey.pem");
              const certPath_file = path.join(certPath, "cert.pem");
              const chainPath = path.join(certPath, "chain.pem");

              // Check if files exist and read them
              if (
                await fs
                  .access(fullchainPath)
                  .then(() => true)
                  .catch(() => false)
              ) {
                certificateFiles.fullchain = await fs.readFile(
                  fullchainPath,
                  "utf8"
                );
              }

              if (
                await fs
                  .access(privkeyPath)
                  .then(() => true)
                  .catch(() => false)
              ) {
                certificateFiles.privkey = await fs.readFile(
                  privkeyPath,
                  "utf8"
                );
              }

              if (
                await fs
                  .access(certPath_file)
                  .then(() => true)
                  .catch(() => false)
              ) {
                certificateFiles.cert = await fs.readFile(
                  certPath_file,
                  "utf8"
                );
              }

              if (
                await fs
                  .access(chainPath)
                  .then(() => true)
                  .catch(() => false)
              ) {
                certificateFiles.chain = await fs.readFile(chainPath, "utf8");
              }

              resolve(
                NextResponse.json({
                  success: true,
                  message: "Certificate generated successfully!",
                  certificateFiles,
                  certificatePath: certPath,
                  dnsRecords: dnsRecords.length > 0 ? dnsRecords : undefined,
                  expiryDate: new Date(
                    Date.now() + 90 * 24 * 60 * 60 * 1000
                  ).toISOString(), // 90 days from now
                  domains,
                  output,
                })
              );
            } catch (fileError) {
              console.error("Error reading certificate files:", fileError);
              resolve(
                NextResponse.json({
                  success: true,
                  message:
                    "Certificate generated but files could not be read. Check server permissions.",
                  certificatePath: certPath,
                  dnsRecords,
                  error: `File access error: ${fileError}`,
                  output,
                })
              );
            }
          } catch (error) {
            console.error("Post-generation error:", error);
            resolve(
              NextResponse.json(
                {
                  success: false,
                  error: `Post-generation error: ${error}`,
                  output,
                  dnsRecords,
                },
                { status: 500 }
              )
            );
          }
        } else {
          // Certificate generation failed
          resolve(
            NextResponse.json(
              {
                success: false,
                error: errorOutput || "Certificate generation failed",
                dnsRecords: dnsRecords.length > 0 ? dnsRecords : undefined,
                output,
                code,
                message:
                  dnsRecords.length > 0
                    ? "DNS verification required. Add the TXT records above and try again."
                    : "Certificate generation failed.",
              },
              { status: 500 }
            )
          );
        }
      });

      process.on("error", (error) => {
        console.error("Process error:", error);
        resolve(
          NextResponse.json(
            {
              success: false,
              error: `Process failed to start: ${error.message}`,
              dnsRecords,
            },
            { status: 500 }
          )
        );
      });

      // Handle timeout
      setTimeout(() => {
        process.kill();
        resolve(
          NextResponse.json(
            {
              success: false,
              error: "Certificate generation timed out",
              dnsRecords,
            },
            { status: 408 }
          )
        );
      }, 600000); // 10 minutes timeout for actual cert generation
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
// import { exec, spawn } from "child_process";
// import { promisify } from "util";
// import { join } from "path";

// const execAsync = promisify(exec);

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

//     // Build certbot command
//     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
//     const domainFlags = domains.map((d) => `-d ${d}`).join(" ");

//     const command = `sudo certbot certonly \
//       --manual \
//       --preferred-challenges dns \
//       --manual-public-ip-logging-ok \
//       --non-interactive \
//       --agree-tos \
//       --email ${email} \
//       --server https://acme-v02.api.letsencrypt.org/directory \
//       --manual-auth-hook /bin/true \
//       --manual-cleanup-hook /bin/true \
//       ${domainFlags}`;

//     // Execute certbot in manual mode
//     const process = spawn(
//       "sudo",
//       [
//         "certbot",
//         "certonly",
//         "--manual",
//         "--preferred-challenges",
//         "dns",
//         "--manual-public-ip-logging-ok",
//         "--non-interactive",
//         "--agree-tos",
//         "--email",
//         email,
//         "--server",
//         "https://acme-v02.api.letsencrypt.org/directory",
//         ...domains.flatMap((d) => ["-d", d]),
//       ],
//       {
//         stdio: ["pipe", "pipe", "pipe"],
//       }
//     );

//     let output = "";
//     let errorOutput = "";
//     const dnsRecords: any[] = [];

//     process.stdout.on("data", (data) => {
//       const text = data.toString();
//       output += text;
//       console.log("Certbot output:", text);

//       // Parse DNS challenge records
//       const lines = text.split("\n");
//       for (let i = 0; i < lines.length; i++) {
//         if (lines[i].includes("_acme-challenge") && lines[i + 1]) {
//           const nameMatch = lines[i].match(/_acme-challenge\.([^\s]+)/);
//           const valueMatch = lines[i + 1].match(/^\s*(.+)$/);

//           if (nameMatch && valueMatch) {
//             dnsRecords.push({
//               name: `_acme-challenge.${nameMatch[1]}`,
//               type: "TXT",
//               value: valueMatch[1].trim(),
//               domain: nameMatch[1],
//             });
//           }
//         }
//       }
//     });

//     process.stderr.on("data", (data) => {
//       errorOutput += data.toString();
//       console.error("Certbot error:", data.toString());
//     });

//     return new Promise<NextResponse>((resolve) => {
//       process.on("close", (code) => {
//         console.log("Certbot process ended with code:", code);

//         if (code === 0) {
//           resolve(
//             NextResponse.json({
//               success: true,
//               message: "Certificate generated successfully",
//               dnsRecords,
//               certificatePath: `/etc/letsencrypt/live/${domain}/`,
//               output,
//             })
//           );
//         } else {
//           resolve(
//             NextResponse.json(
//               {
//                 success: false,
//                 error: errorOutput || "Certificate generation failed",
//                 dnsRecords,
//                 output,
//               },
//               { status: 500 }
//             )
//           );
//         }
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
//       }, 300000); // 5 minutes timeout
//     });
//   } catch (error) {
//     console.error("Certificate generation error:", error);
//     return NextResponse.json(
//       { success: false, error: "Internal server error" },
//       { status: 500 }
//     );
//   }
// }

// import { NextRequest, NextResponse } from "next/server";
// import { exec, spawn } from "child_process";
// import { promisify } from "util";
// import { writeFileSync, readFileSync, existsSync } from "fs";
// import { join } from "path";

// const execAsync = promisify(exec);

// export async function POST(request: NextRequest) {
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

//     // Build certbot command
//     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
//     const domainFlags = domains.map((d) => `-d ${d}`).join(" ");

//     const command = `certbot certonly \
//       --manual \
//       --preferred-challenges dns \
//       --manual-public-ip-logging-ok \
//       --non-interactive \
//       --agree-tos \
//       --email ${email} \
//       --server https://acme-v02.api.letsencrypt.org/directory \
//       --manual-auth-hook /bin/true \
//       --manual-cleanup-hook /bin/true \
//       ${domainFlags}`;

//     // Execute certbot in manual mode
//     const process = spawn(
//       "certbot",
//       [
//         "certonly",
//         "--manual",
//         "--preferred-challenges",
//         "dns",
//         "--manual-public-ip-logging-ok",
//         "--non-interactive",
//         "--agree-tos",
//         "--email",
//         email,
//         "--server",
//         "https://acme-v02.api.letsencrypt.org/directory",
//         ...domains.flatMap((d) => ["-d", d]),
//       ],
//       {
//         stdio: ["pipe", "pipe", "pipe"],
//       }
//     );

//     let output = "";
//     let errorOutput = "";
//     const dnsRecords: any[] = [];

//     process.stdout.on("data", (data) => {
//       const text = data.toString();
//       output += text;

//       // Parse DNS challenge records
//       const dnsMatch = text.match(
//         /Please deploy a DNS TXT record under the name[\s\S]*?_acme-challenge\.(.+?)\s+with the following value:\s*(.+)/g
//       );
//       if (dnsMatch) {
//         dnsMatch.forEach((match: any) => {
//           const nameMatch = match.match(/_acme-challenge\.(.+?)\s/);
//           const valueMatch = match.match(/value:\s*(.+)/);
//           if (nameMatch && valueMatch) {
//             dnsRecords.push({
//               name: `_acme-challenge.${nameMatch[1]}`,
//               type: "TXT",
//               value: valueMatch[1].trim(),
//               domain: nameMatch[1],
//             });
//           }
//         });
//       }
//     });

//     process.stderr.on("data", (data) => {
//       errorOutput += data.toString();
//     });

//     return new Promise((resolve) => {
//       process.on("close", (code) => {
//         if (code === 0) {
//           resolve(
//             NextResponse.json({
//               success: true,
//               message: "Certificate generated successfully",
//               dnsRecords,
//               certificatePath: `/etc/letsencrypt/live/${domain}/`,
//               output,
//             })
//           );
//         } else {
//           resolve(
//             NextResponse.json(
//               {
//                 success: false,
//                 error: errorOutput || "Certificate generation failed",
//                 dnsRecords,
//               },
//               { status: 500 }
//             )
//           );
//         }
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
//       }, 300000); // 5 minutes timeout
//     });
//   } catch (error) {
//     console.error("Certificate generation error:", error);
//     return NextResponse.json(
//       { success: false, error: "Internal server error" },
//       { status: 500 }
//     );
//   }
// }
