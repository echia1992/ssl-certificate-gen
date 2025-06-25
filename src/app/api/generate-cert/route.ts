import { NextRequest, NextResponse } from "next/server";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { join } from "path";

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

    // Build certbot command
    const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];
    const domainFlags = domains.map((d) => `-d ${d}`).join(" ");

    const command = `sudo certbot certonly \
      --manual \
      --preferred-challenges dns \
      --manual-public-ip-logging-ok \
      --non-interactive \
      --agree-tos \
      --email ${email} \
      --server https://acme-v02.api.letsencrypt.org/directory \
      --manual-auth-hook /bin/true \
      --manual-cleanup-hook /bin/true \
      ${domainFlags}`;

    // Execute certbot in manual mode
    const process = spawn(
      "sudo",
      [
        "certbot",
        "certonly",
        "--manual",
        "--preferred-challenges",
        "dns",
        "--manual-public-ip-logging-ok",
        "--non-interactive",
        "--agree-tos",
        "--email",
        email,
        "--server",
        "https://acme-v02.api.letsencrypt.org/directory",
        ...domains.flatMap((d) => ["-d", d]),
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    let output = "";
    let errorOutput = "";
    const dnsRecords: any[] = [];

    process.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      console.log("Certbot output:", text);

      // Parse DNS challenge records
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("_acme-challenge") && lines[i + 1]) {
          const nameMatch = lines[i].match(/_acme-challenge\.([^\s]+)/);
          const valueMatch = lines[i + 1].match(/^\s*(.+)$/);

          if (nameMatch && valueMatch) {
            dnsRecords.push({
              name: `_acme-challenge.${nameMatch[1]}`,
              type: "TXT",
              value: valueMatch[1].trim(),
              domain: nameMatch[1],
            });
          }
        }
      }
    });

    process.stderr.on("data", (data) => {
      errorOutput += data.toString();
      console.error("Certbot error:", data.toString());
    });

    return new Promise<NextResponse>((resolve) => {
      process.on("close", (code) => {
        console.log("Certbot process ended with code:", code);

        if (code === 0) {
          resolve(
            NextResponse.json({
              success: true,
              message: "Certificate generated successfully",
              dnsRecords,
              certificatePath: `/etc/letsencrypt/live/${domain}/`,
              output,
            })
          );
        } else {
          resolve(
            NextResponse.json(
              {
                success: false,
                error: errorOutput || "Certificate generation failed",
                dnsRecords,
                output,
              },
              { status: 500 }
            )
          );
        }
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
      }, 300000); // 5 minutes timeout
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
