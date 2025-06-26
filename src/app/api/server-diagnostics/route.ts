// app/api/server-diagnostics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";

const execAsync = promisify(exec);

interface DiagnosticCheck {
  name: string;
  status: "pass" | "fail" | "warning";
  message: string;
  details?: string;
}

interface ServerDiagnosticsResponse {
  success: true;
  timestamp: string;
  checks: DiagnosticCheck[];
  recommendations: string[];
  serverInfo: {
    os: string;
    uptime: string;
    freeMemory: string;
    loadAverage: number[];
  };
}

export async function GET(): Promise<NextResponse<ServerDiagnosticsResponse>> {
  const checks: DiagnosticCheck[] = [];
  const recommendations: string[] = [];

  try {
    // Check 1: Certbot installation
    try {
      const { stdout: certbotVersion } = await execAsync("certbot --version");
      checks.push({
        name: "Certbot Installation",
        status: "pass",
        message: "Certbot is installed",
        details: certbotVersion.trim(),
      });
    } catch (error) {
      checks.push({
        name: "Certbot Installation",
        status: "fail",
        message: "Certbot is not installed or not accessible",
        details: "Run: sudo apt install certbot",
      });
      recommendations.push("Install certbot: sudo apt install certbot");
    }

    // Check 2: Sudo permissions
    try {
      await execAsync("sudo -n true", { timeout: 5000 });
      checks.push({
        name: "Sudo Permissions",
        status: "pass",
        message: "Sudo access is available",
      });
    } catch (error) {
      checks.push({
        name: "Sudo Permissions",
        status: "fail",
        message: "Sudo access is not available without password",
        details: "Configure passwordless sudo for certbot",
      });
      recommendations.push(
        "Configure sudoers file for passwordless certbot access"
      );
    }

    // Check 3: DNS tools
    try {
      const { stdout: digVersion } = await execAsync("dig -v");
      checks.push({
        name: "DNS Tools (dig)",
        status: "pass",
        message: "DNS tools are available",
        details: digVersion.trim().split("\n")[0],
      });
    } catch (error) {
      checks.push({
        name: "DNS Tools (dig)",
        status: "fail",
        message: "DNS tools (dig) are not installed",
        details: "Run: sudo apt install dnsutils",
      });
      recommendations.push("Install DNS utilities: sudo apt install dnsutils");
    }

    // Check 4: Internet connectivity
    try {
      await execAsync("ping -c 1 8.8.8.8", { timeout: 10000 });
      checks.push({
        name: "Internet Connectivity",
        status: "pass",
        message: "Internet connection is working",
      });
    } catch (error) {
      checks.push({
        name: "Internet Connectivity",
        status: "fail",
        message: "No internet connectivity",
        details: "Check network configuration and firewall",
      });
      recommendations.push("Check network connectivity and firewall settings");
    }

    // Check 5: Let's Encrypt connectivity
    try {
      await execAsync(
        "curl -s -o /dev/null -w '%{http_code}' https://acme-v02.api.letsencrypt.org/directory",
        { timeout: 10000 }
      );
      checks.push({
        name: "Let's Encrypt API",
        status: "pass",
        message: "Can reach Let's Encrypt API",
      });
    } catch (error) {
      checks.push({
        name: "Let's Encrypt API",
        status: "fail",
        message: "Cannot reach Let's Encrypt API",
        details: "Check firewall and DNS resolution",
      });
      recommendations.push(
        "Check firewall rules and DNS resolution for acme-v02.api.letsencrypt.org"
      );
    }

    // Check 6: Certbot directories
    const certbotDirs = [
      "/etc/letsencrypt",
      "/var/log/letsencrypt",
      "/var/lib/letsencrypt",
    ];

    for (const dir of certbotDirs) {
      if (existsSync(dir)) {
        checks.push({
          name: `Certbot Directory (${dir})`,
          status: "pass",
          message: `Directory exists and is accessible`,
        });
      } else {
        checks.push({
          name: `Certbot Directory (${dir})`,
          status: "warning",
          message: `Directory does not exist`,
          details: `Will be created automatically when certbot runs`,
        });
      }
    }

    // Check 7: Port availability
    try {
      const { stdout: port80 } = await execAsync(
        "sudo netstat -tlnp | grep :80 || echo 'Port 80 available'"
      );
      if (port80.includes("Port 80 available")) {
        checks.push({
          name: "Port 80 Availability",
          status: "pass",
          message: "Port 80 is available for standalone mode",
        });
      } else {
        checks.push({
          name: "Port 80 Availability",
          status: "warning",
          message: "Port 80 is in use",
          details: "Standalone mode may not work, use webroot or manual mode",
        });
        recommendations.push(
          "Consider using webroot or manual mode instead of standalone"
        );
      }
    } catch (error) {
      checks.push({
        name: "Port 80 Availability",
        status: "warning",
        message: "Could not check port 80 status",
      });
    }

    // Check 8: Web server detection
    try {
      const { stdout: nginxStatus } = await execAsync(
        "systemctl is-active nginx 2>/dev/null || echo 'inactive'"
      );
      const { stdout: apacheStatus } = await execAsync(
        "systemctl is-active apache2 2>/dev/null || echo 'inactive'"
      );

      if (nginxStatus.trim() === "active") {
        checks.push({
          name: "Web Server (Nginx)",
          status: "pass",
          message: "Nginx is running - webroot mode available",
          details: "Webroot: /var/www/html",
        });
        recommendations.push("Use webroot mode with /var/www/html");
      } else if (apacheStatus.trim() === "active") {
        checks.push({
          name: "Web Server (Apache)",
          status: "pass",
          message: "Apache is running - webroot mode available",
          details: "Webroot: /var/www/html",
        });
        recommendations.push("Use webroot mode with /var/www/html");
      } else {
        checks.push({
          name: "Web Server",
          status: "warning",
          message: "No active web server detected",
          details: "Manual or standalone mode recommended",
        });
        recommendations.push("Use manual mode for certificate generation");
      }
    } catch (error) {
      checks.push({
        name: "Web Server",
        status: "warning",
        message: "Could not detect web server status",
      });
    }

    // Check 9: Previous certbot runs
    try {
      const { stdout: certList } = await execAsync(
        "sudo certbot certificates 2>/dev/null || echo 'No certificates'"
      );
      if (certList.includes("No certificates")) {
        checks.push({
          name: "Previous Certificates",
          status: "pass",
          message: "No existing certificates (clean slate)",
        });
      } else {
        const certCount = (certList.match(/Certificate Name:/g) || []).length;
        checks.push({
          name: "Previous Certificates",
          status: "pass",
          message: `Found ${certCount} existing certificate(s)`,
          details: certList.trim(),
        });
      }
    } catch (error) {
      checks.push({
        name: "Previous Certificates",
        status: "warning",
        message: "Could not check existing certificates",
      });
    }

    // Server info
    const os = require("os");
    const serverInfo = {
      os: `${os.type()} ${os.release()}`,
      uptime: `${Math.floor(os.uptime() / 3600)} hours`,
      freeMemory: `${Math.round(os.freemem() / 1024 / 1024)} MB`,
      loadAverage: os.loadavg(),
    };

    // Generate recommendations based on checks
    const failedChecks = checks.filter((check) => check.status === "fail");
    const warningChecks = checks.filter((check) => check.status === "warning");

    if (failedChecks.length === 0 && warningChecks.length === 0) {
      recommendations.push(
        "✅ All checks passed! Your server is ready for SSL certificate generation."
      );
    } else if (failedChecks.length > 0) {
      recommendations.push(
        "❌ Critical issues found. Please fix the failed checks before proceeding."
      );
    } else {
      recommendations.push(
        "⚠️ Some warnings found. Certificate generation should still work, but consider addressing the warnings."
      );
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      checks,
      recommendations,
      serverInfo,
    });
  } catch (error) {
    console.error("Server diagnostics error:", error);

    checks.push({
      name: "Diagnostics",
      status: "fail",
      message: `Diagnostics failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      checks,
      recommendations: ["Run diagnostics manually to identify server issues"],
      serverInfo: {
        os: "Unknown",
        uptime: "Unknown",
        freeMemory: "Unknown",
        loadAverage: [0, 0, 0],
      },
    });
  }
}
