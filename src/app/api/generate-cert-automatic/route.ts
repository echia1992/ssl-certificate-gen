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

    // Clean up any existing processes and lock files
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

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (cleanupError) {
      console.log("Cleanup warning:", cleanupError);
    }

    // Build domains array
    const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];

    // Execute certbot to generate actual certificates
    const certbotArgs = [
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
      domain,
      "--expand", // Allow certificate expansion
      ...domains.flatMap((d) => ["-d", d]),
    ];

    console.log(
      "Executing certbot for automatic generation with args:",
      certbotArgs
    );

    const certbotProcess = spawn("sudo", ["certbot", ...certbotArgs], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" },
    });

    let output = "";
    let errorOutput = "";
    const dnsRecords: any[] = [];
    let responseSent = false;
    let certificatesGenerated = false;

    // Auto-respond to prompts
    certbotProcess.stdin.write("Y\n"); // Agree to terms if prompted

    certbotProcess.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      console.log("Certbot stdout:", text);

      // Check if certificates were successfully generated
      if (
        text.includes("Successfully received certificate") ||
        text.includes("Certificate is saved at") ||
        text.includes("Congratulations!")
      ) {
        certificatesGenerated = true;
        console.log("Certificates generated successfully");
      }

      // Parse DNS challenge records
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.includes("Please deploy a DNS TXT record under the name")) {
          let recordName = "";
          let recordValue = "";

          // Look for record details in subsequent lines
          for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
            const nextLine = lines[j].trim();

            // Find record name
            if (nextLine.includes("_acme-challenge.") && !recordName) {
              recordName = nextLine.replace(/[^\w\.\-]/g, "");
            }

            // Find record value
            if (
              lines[j - 1] &&
              lines[j - 1].includes("with the following value") &&
              nextLine.length > 20 &&
              /^[A-Za-z0-9_\-]+$/.test(nextLine)
            ) {
              recordValue = nextLine;
              break;
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

            if (
              !dnsRecords.find(
                (r) => r.name === recordName && r.value === recordValue
              )
            ) {
              dnsRecords.push(dnsRecord);
              console.log("Found DNS record:", dnsRecord);
            }
          }
        }
      }

      // Auto-continue if we see the DNS challenge prompt
      if (
        text.includes("Press Enter to Continue") ||
        text.includes("Press ENTER to continue")
      ) {
        setTimeout(() => {
          certbotProcess.stdin.write("\n");
        }, 1000);
      }
    });

    certbotProcess.stderr.on("data", (data) => {
      const text = data.toString();
      errorOutput += text;
      console.error("Certbot stderr:", text);
    });

    return new Promise<NextResponse>((resolve) => {
      const timeoutId = setTimeout(() => {
        if (!responseSent) {
          responseSent = true;
          certbotProcess.kill("SIGTERM");

          // Return DNS records for manual verification
          resolve(
            NextResponse.json({
              success: true,
              message:
                "DNS verification required. Please add the TXT records below, wait for propagation, then run the server command.",
              dnsRecords,
              serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
                .map((d) => `-d ${d}`)
                .join(" ")} --agree-tos --cert-name ${domain}`,
              certificatePath: `/etc/letsencrypt/live/${domain}/`,
              instructions: [
                "Add the DNS TXT records shown above to your DNS provider",
                "Wait 5-10 minutes for DNS propagation",
                "Run the server command to complete certificate generation",
                "Download the generated certificate files",
              ],
              output,
            })
          );
        }
      }, 60000); // 60 seconds timeout

      certbotProcess.on("close", async (code) => {
        clearTimeout(timeoutId);
        if (responseSent) return;

        console.log("Certbot process ended with code:", code);
        responseSent = true;

        if (certificatesGenerated || code === 0) {
          try {
            // Try to read the generated certificate files
            const certPath = `/etc/letsencrypt/live/${domain}`;
            const certificateFiles: any = {};

            try {
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

              if (Object.keys(certificateFiles).length > 0) {
                // Certificates were successfully generated and read
                resolve(
                  NextResponse.json({
                    success: true,
                    message:
                      "SSL certificates generated successfully! Download the files below.",
                    certificateFiles,
                    certificatePath: certPath,
                    expiryDate: new Date(
                      Date.now() + 90 * 24 * 60 * 60 * 1000
                    ).toISOString(),
                    domains,
                    instructions: [
                      "Download the certificate files using the buttons below",
                      "Upload them to your hosting control panel or server",
                      "Configure your web server to use the new certificates",
                      "Test your SSL installation",
                      "Set up auto-renewal for certificates expiring in 90 days",
                    ],
                    output,
                  })
                );
                return;
              }
            } catch (fileError) {
              console.error("Error reading certificate files:", fileError);
            }

            // If we can't read files but process succeeded, return DNS verification info
            resolve(
              NextResponse.json({
                success: true,
                message:
                  "Certificate generation initiated. Complete DNS verification to generate files.",
                dnsRecords: dnsRecords.length > 0 ? dnsRecords : undefined,
                serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
                  .map((d) => `-d ${d}`)
                  .join(" ")} --agree-tos --cert-name ${domain}`,
                certificatePath: certPath,
                instructions: [
                  "Add any required DNS TXT records to your DNS provider",
                  "Wait for DNS propagation (5-10 minutes)",
                  "Run the server command to complete certificate generation",
                  "Check /etc/letsencrypt/live/ for your certificate files",
                ],
                output,
              })
            );
          } catch (error) {
            console.error("Post-generation error:", error);
            resolve(
              NextResponse.json(
                {
                  success: false,
                  error: `Certificate generation completed but files could not be accessed: ${error}`,
                  dnsRecords: dnsRecords.length > 0 ? dnsRecords : undefined,
                  serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
                    .map((d) => `-d ${d}`)
                    .join(" ")} --agree-tos --cert-name ${domain}`,
                  troubleshooting: [
                    "Check if certbot completed successfully",
                    "Verify certificate files exist in /etc/letsencrypt/live/",
                    "Check file permissions",
                    "Try running the server command manually",
                  ],
                  output,
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
                serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
                  .map((d) => `-d ${d}`)
                  .join(" ")} --agree-tos --cert-name ${domain}`,
                output,
                code,
                troubleshooting: [
                  "Verify your domain points to this server",
                  "Check that ports 80 and 443 are accessible",
                  "Ensure DNS records are correct",
                  "Try running the command manually for more detailed output",
                  "Check /var/log/letsencrypt/letsencrypt.log for detailed errors",
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
        responseSent = true;

        resolve(
          NextResponse.json(
            {
              success: false,
              error: `Certbot process failed to start: ${error.message}`,
              serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
                .map((d) => `-d ${d}`)
                .join(" ")} --agree-tos --cert-name ${domain}`,
              troubleshooting: [
                "Ensure certbot is installed on the server",
                "Check that the certbot service is running",
                "Verify sudo permissions for the application",
                "Try running the server command manually",
              ],
            },
            { status: 500 }
          )
        );
      });
    });
  } catch (error) {
    console.error("Certificate generation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error. Please try again.",
        troubleshooting: [
          "Check server logs for detailed error information",
          "Ensure all required services are running",
          "Verify network connectivity",
          "Try again in a few minutes",
        ],
      },
      { status: 500 }
    );
  }
}
