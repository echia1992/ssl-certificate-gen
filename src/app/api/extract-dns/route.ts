import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { domain } = await request.json();

    if (!domain) {
      return NextResponse.json(
        { success: false, error: "Domain is required" },
        { status: 400 }
      );
    }

    return new Promise<NextResponse>((resolve) => {
      // Read recent certbot logs
      const logProcess = spawn(
        "sudo",
        ["tail", "-100", "/var/log/letsencrypt/letsencrypt.log"],
        {
          stdio: ["pipe", "pipe", "pipe"],
        }
      );

      let logOutput = "";

      logProcess.stdout.on("data", (data) => {
        logOutput += data.toString();
      });

      logProcess.on("close", () => {
        const dnsRecords: any[] = [];
        const lines = logOutput.split("\n");

        // Parse logs for DNS records
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          if (line.includes("_acme-challenge.") && line.includes(domain)) {
            // Extract record name
            const nameMatch = line.match(/_acme-challenge\.[a-zA-Z0-9\.\-]+/);
            if (nameMatch) {
              const recordName = nameMatch[0];

              // Look for value in surrounding lines
              for (let j = i; j < Math.min(i + 10, lines.length); j++) {
                const valueLine = lines[j];
                // Look for long alphanumeric strings that could be DNS values
                const valueMatch = valueLine.match(/\b([A-Za-z0-9_\-]{40,})\b/);
                if (valueMatch && !valueMatch[1].includes("_acme-challenge")) {
                  const recordValue = valueMatch[1];
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
                  }
                  break;
                }
              }
            }
          }
        }

        if (dnsRecords.length > 0) {
          resolve(
            NextResponse.json({
              success: true,
              message:
                "DNS records extracted from logs. Add these TXT records to your DNS provider.",
              dnsRecords,
              serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email admin@${domain} -d ${domain} --agree-tos --cert-name ${domain}`,
              instructions: [
                "Add the DNS TXT records shown above to your DNS provider",
                "Wait 5-10 minutes for DNS propagation",
                "Run the server command to complete certificate generation",
              ],
              source: "extracted from certbot logs",
            })
          );
        } else {
          resolve(
            NextResponse.json({
              success: false,
              error: "No DNS records found in recent logs",
              logOutput: logOutput.slice(-1000), // Last 1000 chars for debugging
            })
          );
        }
      });

      logProcess.on("error", (error) => {
        resolve(
          NextResponse.json(
            { success: false, error: `Failed to read logs: ${error.message}` },
            { status: 500 }
          )
        );
      });
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
