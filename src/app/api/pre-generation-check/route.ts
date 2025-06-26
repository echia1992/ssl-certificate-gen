// app/api/pre-generation-check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface DnsRecord {
  name: string;
  type: string;
  value: string;
  domain: string;
}

interface PreGenerationCheckRequest {
  domain: string;
  dnsRecords: DnsRecord[];
}

interface PreGenerationCheckResponse {
  success: boolean;
  domain: string;
  readyForGeneration: boolean;
  checks: Array<{
    name: string;
    status: "pass" | "fail" | "warning";
    message: string;
    details?: string;
  }>;
  recommendations: string[];
  estimatedSuccessRate: number;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<PreGenerationCheckResponse>> {
  let domain = "unknown";

  try {
    const body: PreGenerationCheckRequest = await request.json();
    const { domain: requestDomain, dnsRecords } = body;
    domain = requestDomain || "unknown";

    if (!requestDomain || !dnsRecords || !Array.isArray(dnsRecords)) {
      return NextResponse.json(
        {
          success: false,
          domain,
          readyForGeneration: false,
          checks: [
            {
              name: "Input Validation",
              status: "fail" as const,
              message: "Invalid request parameters",
              details: "Domain and DNS records are required",
            },
          ],
          recommendations: ["Provide valid domain and DNS records"],
          estimatedSuccessRate: 0,
        },
        { status: 400 }
      );
    }

    console.log(`Pre-generation check for domain: ${domain}`);

    const checks = [];
    const recommendations = [];
    let passedChecks = 0;
    const totalChecks = 6;

    // Check 1: DNS Record Validation
    try {
      let allRecordsValid = true;
      for (const record of dnsRecords) {
        const digCommand = `dig +short TXT "${record.name}" @8.8.8.8`;
        const { stdout } = await execAsync(digCommand, { timeout: 10000 });

        const foundValues = stdout
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => line.replace(/"/g, "").trim());

        if (!foundValues.includes(record.value)) {
          allRecordsValid = false;
          break;
        }
      }

      if (allRecordsValid) {
        checks.push({
          name: "DNS Records Validation",
          status: "pass" as const,
          message: "All DNS TXT records are correctly propagated",
          details: `Verified ${dnsRecords.length} DNS record(s)`,
        });
        passedChecks++;
      } else {
        checks.push({
          name: "DNS Records Validation",
          status: "fail" as const,
          message: "Some DNS records are not properly propagated",
          details: "Wait for DNS propagation or check record values",
        });
        recommendations.push("Wait 10-15 minutes for DNS propagation");
        recommendations.push("Verify DNS record values in your DNS provider");
      }
    } catch (error) {
      checks.push({
        name: "DNS Records Validation",
        status: "fail" as const,
        message: "Failed to verify DNS records",
        details: error instanceof Error ? error.message : "Unknown error",
      });
      recommendations.push("Check internet connectivity and DNS resolution");
    }

    // Check 2: Certbot Installation
    try {
      await execAsync("certbot --version", { timeout: 5000 });
      checks.push({
        name: "Certbot Installation",
        status: "pass" as const,
        message: "Certbot is installed and accessible",
      });
      passedChecks++;
    } catch (error) {
      checks.push({
        name: "Certbot Installation",
        status: "fail" as const,
        message: "Certbot is not installed or not accessible",
        details: "Install certbot: sudo apt install certbot",
      });
      recommendations.push("Install certbot: sudo apt install certbot");
    }

    // Check 3: Sudo Permissions
    try {
      await execAsync("sudo -n true", { timeout: 5000 });
      checks.push({
        name: "Sudo Permissions",
        status: "pass" as const,
        message: "Sudo access is available",
      });
      passedChecks++;
    } catch (error) {
      checks.push({
        name: "Sudo Permissions",
        status: "fail" as const,
        message: "Sudo access is not available",
        details: "Configure passwordless sudo for certbot operations",
      });
      recommendations.push("Configure sudoers for passwordless certbot access");
    }

    // Check 4: Let's Encrypt Connectivity
    try {
      const { stdout } = await execAsync(
        "curl -s -o /dev/null -w '%{http_code}' https://acme-v02.api.letsencrypt.org/directory",
        { timeout: 10000 }
      );
      if (stdout.trim() === "200") {
        checks.push({
          name: "Let's Encrypt API",
          status: "pass" as const,
          message: "Can reach Let's Encrypt API",
        });
        passedChecks++;
      } else {
        checks.push({
          name: "Let's Encrypt API",
          status: "warning" as const,
          message: "Let's Encrypt API returned unexpected response",
          details: `HTTP status: ${stdout.trim()}`,
        });
        recommendations.push("Check firewall rules for HTTPS traffic");
      }
    } catch (error) {
      checks.push({
        name: "Let's Encrypt API",
        status: "fail" as const,
        message: "Cannot reach Let's Encrypt API",
        details: "Check firewall and internet connectivity",
      });
      recommendations.push("Check firewall rules and internet connectivity");
    }

    // Check 5: Rate Limiting
    try {
      const { stdout } = await execAsync(
        `sudo certbot certificates | grep -c "${domain}" || echo "0"`,
        { timeout: 5000 }
      );
      const existingCerts = parseInt(stdout.trim()) || 0;

      if (existingCerts < 5) {
        checks.push({
          name: "Rate Limiting",
          status: "pass" as const,
          message: "No rate limiting concerns detected",
          details: `Found ${existingCerts} existing certificate(s) for this domain`,
        });
        passedChecks++;
      } else {
        checks.push({
          name: "Rate Limiting",
          status: "warning" as const,
          message: "Multiple existing certificates detected",
          details: "May hit rate limits if generating too frequently",
        });
        recommendations.push(
          "Use --force-renewal sparingly to avoid rate limits"
        );
      }
    } catch (error) {
      checks.push({
        name: "Rate Limiting",
        status: "warning" as const,
        message: "Could not check existing certificates",
        details: "Proceed with caution regarding rate limits",
      });
    }

    // Check 6: Disk Space
    try {
      const { stdout } = await execAsync(
        "df -h /etc/letsencrypt | tail -1 | awk '{print $4}'",
        { timeout: 5000 }
      );
      const freeSpace = stdout.trim();

      if (freeSpace && !freeSpace.includes("0K")) {
        checks.push({
          name: "Disk Space",
          status: "pass" as const,
          message: "Sufficient disk space available",
          details: `Free space: ${freeSpace}`,
        });
        passedChecks++;
      } else {
        checks.push({
          name: "Disk Space",
          status: "warning" as const,
          message: "Low disk space detected",
          details: `Free space: ${freeSpace}`,
        });
        recommendations.push("Free up disk space before proceeding");
      }
    } catch (error) {
      checks.push({
        name: "Disk Space",
        status: "warning" as const,
        message: "Could not check disk space",
      });
    }

    // Calculate success rate and readiness
    const estimatedSuccessRate = Math.round((passedChecks / totalChecks) * 100);
    const criticalFailures = checks.filter(
      (check) =>
        check.status === "fail" &&
        [
          "DNS Records Validation",
          "Certbot Installation",
          "Sudo Permissions",
        ].includes(check.name)
    );

    const readyForGeneration =
      criticalFailures.length === 0 && estimatedSuccessRate >= 60;

    // Generate recommendations
    if (readyForGeneration) {
      recommendations.unshift(
        "✅ All critical checks passed! Ready to generate SSL certificates."
      );
    } else {
      recommendations.unshift(
        "❌ Critical issues detected. Please resolve the failed checks before proceeding."
      );
    }

    if (estimatedSuccessRate >= 80) {
      recommendations.push(
        "High success probability - proceed with certificate generation"
      );
    } else if (estimatedSuccessRate >= 60) {
      recommendations.push(
        "Moderate success probability - consider addressing warnings first"
      );
    } else {
      recommendations.push(
        "Low success probability - fix critical issues before attempting generation"
      );
    }

    return NextResponse.json({
      success: true,
      domain,
      readyForGeneration,
      checks,
      recommendations,
      estimatedSuccessRate,
    });
  } catch (error) {
    console.error("Pre-generation check error:", error);
    return NextResponse.json(
      {
        success: false,
        domain,
        readyForGeneration: false,
        checks: [
          {
            name: "System Check",
            status: "fail" as const,
            message: `Pre-generation check failed: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ],
        recommendations: ["Check server configuration and try again"],
        estimatedSuccessRate: 0,
      },
      { status: 500 }
    );
  }
}
