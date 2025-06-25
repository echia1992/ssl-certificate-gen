import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, readFileSync } from "fs";

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { domain } = await request.json();

    if (!domain) {
      return NextResponse.json(
        { success: false, error: "Domain is required" },
        { status: 400 }
      );
    }

    const certPath = `/etc/letsencrypt/live/${domain}/cert.pem`;
    const keyPath = `/etc/letsencrypt/live/${domain}/privkey.pem`;
    const chainPath = `/etc/letsencrypt/live/${domain}/chain.pem`;
    const fullchainPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;

    // Check if certificate files exist
    const filesExist = [certPath, keyPath, chainPath, fullchainPath].every(
      existsSync
    );

    if (!filesExist) {
      return NextResponse.json(
        {
          success: false,
          error: "Certificate files not found",
        },
        { status: 404 }
      );
    }

    // Verify certificate validity
    try {
      const { stdout } = await execAsync(
        `openssl x509 -in ${certPath} -text -noout`
      );
      const expiryMatch = stdout.match(/Not After : (.+)/);
      const subjectMatch = stdout.match(/Subject:.*CN\s*=\s*([^,\n]+)/);

      return NextResponse.json({
        success: true,
        message: "Certificate verified successfully",
        certificate: {
          domain: subjectMatch ? subjectMatch[1].trim() : domain,
          expiryDate: expiryMatch ? expiryMatch[1] : "Unknown",
          paths: {
            certificate: certPath,
            privateKey: keyPath,
            chain: chainPath,
            fullchain: fullchainPath,
          },
        },
      });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: "Certificate verification failed",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Certificate verification error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
