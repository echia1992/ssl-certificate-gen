// app/api/generate-dns-challenge/route.ts
import { NextRequest, NextResponse } from "next/server";
import { spawn, ChildProcess } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";

interface DnsRecord {
  name: string;
  type: string;
  value: string;
  domain: string;
  placeholder?: boolean;
}

interface GenerateDnsChallengeRequest {
  domain: string;
  email: string;
  includeWildcard: boolean;
}

interface GenerateDnsChallengeResponse {
  success: boolean;
  message?: string;
  dnsRecords?: DnsRecord[];
  domain?: string;
  certName?: string;
  instructions?: string[];
  note?: string;
  serverCommand?: string;
  requiresServerCommand?: boolean;
  error?: string;
  troubleshooting?: string[];
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<GenerateDnsChallengeResponse>> {
  try {
    const body: GenerateDnsChallengeRequest = await request.json();
    const { domain, email, includeWildcard } = body;

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
    const domains: string[] = includeWildcard
      ? [domain, `*.${domain}`]
      : [domain];
    const certName: string = domain.replace(/\*\./g, "wildcard-");

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

    return new Promise<NextResponse<GenerateDnsChallengeResponse>>(
      (resolvePromise) => {
        // Create temporary auth and cleanup hooks
        const tempDir: string = "/tmp";
        const authHookPath: string = join(
          tempDir,
          `auth-hook-${Date.now()}.sh`
        );
        const cleanupHookPath: string = join(
          tempDir,
          `cleanup-hook-${Date.now()}.sh`
        );

        // Create auth hook script that extracts DNS info
        const authHookScript: string = `#!/bin/bash
echo "Domain: $CERTBOT_DOMAIN"
echo "Validation: $CERTBOT_VALIDATION"
echo "Token: $CERTBOT_TOKEN"
echo "DNS_RECORD_NAME: _acme-challenge.$CERTBOT_DOMAIN"
echo "DNS_RECORD_VALUE: $CERTBOT_VALIDATION"
echo "Please add the following DNS TXT record:"
echo "Name: _acme-challenge.$CERTBOT_DOMAIN"
echo "Value: $CERTBOT_VALIDATION"
# Don't actually set DNS - just output the info
exit 0
`;

        // Create cleanup hook script
        const cleanupHookScript: string = `#!/bin/bash
echo "Cleanup: $CERTBOT_DOMAIN"
exit 0
`;

        try {
          writeFileSync(authHookPath, authHookScript, { mode: 0o755 });
          writeFileSync(cleanupHookPath, cleanupHookScript, { mode: 0o755 });

          const certbotArgs: string[] = [
            "certonly",
            "--manual",
            "--preferred-challenges",
            "dns",
            "--dry-run", // Use dry-run to avoid rate limits
            "--agree-tos",
            "--email",
            email,
            "--server",
            "https://acme-v02.api.letsencrypt.org/directory",
            "--cert-name",
            certName,
            "--manual-auth-hook",
            authHookPath,
            "--manual-cleanup-hook",
            cleanupHookPath,
            "--non-interactive",
            ...domains.flatMap((d: string) => ["-d", d]),
          ];

          console.log(`Generating DNS challenge for domain: ${domain}`);
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
          const dnsRecords: DnsRecord[] = [];

          certbotProcess.stdout?.on("data", (data: Buffer) => {
            const text: string = data.toString();
            output += text;
            console.log("Certbot stdout:", text);

            // Parse DNS challenge information from the auth hook output
            const lines: string[] = text.split("\n");
            for (let i = 0; i < lines.length; i++) {
              const line: string = lines[i].trim();

              if (line.startsWith("DNS_RECORD_NAME:")) {
                const recordName: string = line
                  .split("DNS_RECORD_NAME:")[1]
                  .trim();

                // Look for corresponding value
                for (let j = i; j < Math.min(i + 5, lines.length); j++) {
                  const valueLine: string = lines[j].trim();
                  if (valueLine.startsWith("DNS_RECORD_VALUE:")) {
                    const recordValue: string = valueLine
                      .split("DNS_RECORD_VALUE:")[1]
                      .trim();
                    const baseDomain: string = recordName.replace(
                      "_acme-challenge.",
                      ""
                    );

                    const dnsRecord: DnsRecord = {
                      name: recordName,
                      type: "TXT",
                      value: recordValue,
                      domain: baseDomain,
                    };

                    // Avoid duplicates
                    if (
                      !dnsRecords.find(
                        (r: DnsRecord) =>
                          r.name === recordName && r.value === recordValue
                      )
                    ) {
                      dnsRecords.push(dnsRecord);
                      console.log(`Added DNS record for ${domain}:`, dnsRecord);
                    }
                    break;
                  }
                }
              }
            }
          });

          certbotProcess.stderr?.on("data", (data: Buffer) => {
            const text: string = data.toString();
            errorOutput += text;
            console.error("Certbot stderr:", text);
          });

          certbotProcess.on("close", (code: number | null) => {
            console.log(
              `Certbot process ended with code: ${code} for domain: ${domain}`
            );

            // Clean up temporary files
            try {
              unlinkSync(authHookPath);
              unlinkSync(cleanupHookPath);
            } catch (cleanupError) {
              console.log("File cleanup warning:", cleanupError);
            }

            if (dnsRecords.length > 0) {
              resolvePromise(
                NextResponse.json({
                  success: true,
                  message: `DNS challenge generated for ${domain}. Add these TXT records to your DNS provider.`,
                  dnsRecords,
                  domain,
                  certName,
                  instructions: [
                    `Add the DNS TXT records shown above to ${domain}'s DNS provider`,
                    "Wait 5-10 minutes for DNS propagation",
                    "Use the verification step to check DNS propagation",
                    "Generate certificates once DNS records are verified",
                  ],
                  note: `DNS records generated for ${domain}. Add them to your DNS provider before proceeding.`,
                })
              );
            } else {
              // Fallback: generate manual DNS records using domain info
              const fallbackRecords: DnsRecord[] = domains.map((d: string) => {
                const challengeDomain: string = d.startsWith("*.")
                  ? d.substring(2)
                  : d;
                return {
                  name: `_acme-challenge.${challengeDomain}`,
                  type: "TXT",
                  value: "PLACEHOLDER_VALUE_ADD_AFTER_RUNNING_CERTBOT",
                  domain: challengeDomain,
                  placeholder: true,
                };
              });

              resolvePromise(
                NextResponse.json({
                  success: true,
                  message: `Manual DNS challenge setup required for ${domain}`,
                  dnsRecords: fallbackRecords,
                  domain,
                  certName,
                  serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
                    .map((d: string) => `-d ${d}`)
                    .join(" ")} --agree-tos --cert-name ${certName}`,
                  instructions: [
                    "Run the server command shown below to get the actual DNS record values",
                    `Add the DNS TXT records to ${domain}'s DNS provider`,
                    "Wait for DNS propagation",
                    "Complete the certbot process when prompted",
                  ],
                  note: `Run the server command to get the actual DNS record values for ${domain}.`,
                  requiresServerCommand: true,
                })
              );
            }
          });

          certbotProcess.on("error", (error: Error) => {
            console.error(`Certbot process error for ${domain}:`, error);

            // Clean up temporary files
            try {
              unlinkSync(authHookPath);
              unlinkSync(cleanupHookPath);
            } catch (cleanupError) {
              console.log("File cleanup warning:", cleanupError);
            }

            resolvePromise(
              NextResponse.json({
                success: false,
                error: `Failed to start certificate generation process for ${domain}: ${error.message}`,
                troubleshooting: [
                  "Check if certbot is installed on the server",
                  "Ensure you have proper permissions",
                  "Verify the domain format is correct",
                  "Try using a different email address",
                ],
              })
            );
          });

          // Timeout after 60 seconds
          setTimeout(() => {
            certbotProcess.kill("SIGTERM");

            // Clean up temporary files
            try {
              unlinkSync(authHookPath);
              unlinkSync(cleanupHookPath);
            } catch (cleanupError) {
              console.log("File cleanup warning:", cleanupError);
            }

            if (dnsRecords.length > 0) {
              resolvePromise(
                NextResponse.json({
                  success: true,
                  message: `DNS challenge generated for ${domain} (process timed out)`,
                  dnsRecords,
                  domain,
                  certName,
                  instructions: [
                    `Add the DNS TXT records shown above to ${domain}'s DNS provider`,
                    "Wait 5-10 minutes for DNS propagation",
                    "Use the verification step to check DNS propagation",
                    "Generate certificates once DNS records are verified",
                  ],
                  note: `Process timed out, but found DNS records for ${domain}.`,
                })
              );
            } else {
              resolvePromise(
                NextResponse.json({
                  success: false,
                  error: `DNS challenge generation timed out for ${domain}`,
                  troubleshooting: [
                    "The process took too long to respond",
                    "Try with a simpler domain configuration",
                    "Check server load and connectivity",
                    "Retry the operation",
                  ],
                })
              );
            }
          }, 60000);
        } catch (fileError) {
          console.error("File creation error:", fileError);
          resolvePromise(
            NextResponse.json({
              success: false,
              error: `Failed to create temporary files: ${
                fileError instanceof Error ? fileError.message : "Unknown error"
              }`,
            })
          );
        }
      }
    );
  } catch (error) {
    console.error(`DNS challenge generation error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: `Internal server error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        troubleshooting: [
          "Check server configuration",
          "Verify certbot installation",
          "Ensure proper permissions",
          "Try again with a different domain",
        ],
      },
      { status: 500 }
    );
  }
}
