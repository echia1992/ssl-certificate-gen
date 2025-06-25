"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Globe,
  CheckCircle,
  AlertCircle,
  Clock,
  Copy,
  RefreshCw,
  Mail,
  FileText,
  Download,
} from "lucide-react";
import { CertificateResponse, CertificateStatus, DNSRecord } from "../types";

export default function CertificateGenerator() {
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [includeWildcard, setIncludeWildcard] = useState(true);
  const [status, setStatus] = useState<CertificateStatus>(
    CertificateStatus.IDLE
  );
  const [message, setMessage] = useState("");
  const [dnsRecords, setDnsRecords] = useState<DNSRecord[]>([]);
  const [verificationProgress, setVerificationProgress] = useState(0);
  const [certificateInfo, setCertificateInfo] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!domain || !email) {
      setMessage("Please fill in all required fields");
      return;
    }

    setStatus(CertificateStatus.REQUESTING);
    setMessage("Initiating certificate request...");

    try {
      const response = await fetch("/api/generate-cert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, email, includeWildcard }),
      });

      const data: CertificateResponse = await response.json();

      if (data.success && data.dnsRecords) {
        setDnsRecords(data.dnsRecords);
        setStatus(CertificateStatus.DNS_PENDING);
        setMessage(
          "DNS TXT records required. Please add these records to your DNS:"
        );
        startDNSVerification(data.dnsRecords);
      } else {
        setStatus(CertificateStatus.ERROR);
        setMessage(data.error || "Certificate request failed");
      }
    } catch (error) {
      setStatus(CertificateStatus.ERROR);
      setMessage("Network error. Please try again.");
    }
  };

  const startDNSVerification = async (records: DNSRecord[]) => {
    const maxAttempts = 30; // 5 minutes with 10-second intervals
    let attempts = 0;

    const checkDNS = async (): Promise<void> => {
      attempts++;
      setVerificationProgress((attempts / maxAttempts) * 100);

      try {
        const response = await fetch("/api/check-dns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records }),
        });

        const data = await response.json();

        if (data.verified) {
          setStatus(CertificateStatus.VERIFYING);
          setMessage("DNS records verified! Finalizing certificate...");
          await verifyCertificate();
        } else if (attempts < maxAttempts) {
          setMessage(
            `DNS verification in progress... (${attempts}/${maxAttempts})`
          );
          setTimeout(checkDNS, 10000); // Check every 10 seconds
        } else {
          setStatus(CertificateStatus.ERROR);
          setMessage(
            "DNS verification timeout. Please ensure records are properly configured."
          );
        }
      } catch (error) {
        if (attempts < maxAttempts) {
          setTimeout(checkDNS, 10000);
        } else {
          setStatus(CertificateStatus.ERROR);
          setMessage("DNS verification failed. Please try again.");
        }
      }
    };

    // Start checking after 30 seconds to allow DNS propagation
    setTimeout(checkDNS, 30000);
  };

  const verifyCertificate = async () => {
    try {
      const response = await fetch("/api/verify-cert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });

      const data = await response.json();

      if (data.success) {
        setStatus(CertificateStatus.SUCCESS);
        setMessage("SSL certificate generated successfully!");
        setCertificateInfo(data.certificate);
      } else {
        setStatus(CertificateStatus.ERROR);
        setMessage(data.error || "Certificate verification failed");
      }
    } catch (error) {
      setStatus(CertificateStatus.ERROR);
      setMessage("Certificate verification error");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const resetForm = () => {
    setStatus(CertificateStatus.IDLE);
    setMessage("");
    setDnsRecords([]);
    setVerificationProgress(0);
    setCertificateInfo(null);
  };

  const getStatusIcon = () => {
    switch (status) {
      case CertificateStatus.REQUESTING:
      case CertificateStatus.VERIFYING:
        return <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />;
      case CertificateStatus.DNS_PENDING:
        return <Clock className="w-6 h-6 text-yellow-500" />;
      case CertificateStatus.SUCCESS:
        return <CheckCircle className="w-6 h-6 text-green-500" />;
      case CertificateStatus.ERROR:
        return <AlertCircle className="w-6 h-6 text-red-500" />;
      default:
        return <Shield className="w-6 h-6 text-gray-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center mb-4">
            <Shield className="w-12 h-12 text-blue-600 mr-3" />
            <h1 className="text-4xl font-bold text-gray-900">
              Let's Encrypt SSL Generator
            </h1>
          </div>
          <p className="text-xl text-gray-600">
            Generate free SSL certificates with automatic DNS verification
          </p>
        </motion.div>

        {/* Main Form */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl shadow-xl p-8 mb-8"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <Globe className="w-4 h-4 inline mr-2" />
                  Domain Name
                </label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="example.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  disabled={status !== CertificateStatus.IDLE}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <Mail className="w-4 h-4 inline mr-2" />
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  disabled={status !== CertificateStatus.IDLE}
                />
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="wildcard"
                checked={includeWildcard}
                onChange={(e) => setIncludeWildcard(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                disabled={status !== CertificateStatus.IDLE}
              />
              <label htmlFor="wildcard" className="ml-2 text-sm text-gray-700">
                Include wildcard certificate (*.{domain || "example.com"})
              </label>
            </div>

            <button
              type="submit"
              disabled={status !== CertificateStatus.IDLE}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === CertificateStatus.IDLE
                ? "Generate SSL Certificate"
                : "Processing..."}
            </button>
          </form>
        </motion.div>

        {/* Status Display */}
        <AnimatePresence>
          {status !== CertificateStatus.IDLE && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-2xl shadow-xl p-8 mb-8"
            >
              <div className="flex items-center mb-4">
                {getStatusIcon()}
                <h2 className="text-2xl font-bold text-gray-900 ml-3">
                  Certificate Status
                </h2>
              </div>

              <p className="text-gray-700 mb-4">{message}</p>

              {status === CertificateStatus.DNS_PENDING &&
                verificationProgress > 0 && (
                  <div className="mb-4">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>DNS Verification Progress</span>
                      <span>{Math.round(verificationProgress)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <motion.div
                        className="bg-blue-500 h-2 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${verificationProgress}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                )}

              {(status === CertificateStatus.SUCCESS ||
                status === CertificateStatus.ERROR) && (
                <button
                  onClick={resetForm}
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Generate Another Certificate
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* DNS Records */}
        <AnimatePresence>
          {dnsRecords.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-2xl shadow-xl p-8 mb-8"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                <FileText className="w-5 h-5 inline mr-2" />
                Required DNS TXT Records
              </h3>
              <p className="text-gray-600 mb-6">
                Add these TXT records to your DNS provider to verify domain
                ownership:
              </p>

              <div className="space-y-4">
                {dnsRecords.map((record, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4">
                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Name
                        </label>
                        <div className="flex items-center">
                          <code className="bg-white px-2 py-1 rounded border text-sm flex-1">
                            {record.name}
                          </code>
                          <button
                            onClick={() => copyToClipboard(record.name)}
                            className="ml-2 p-1 text-gray-500 hover:text-gray-700"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Type
                        </label>
                        <code className="bg-white px-2 py-1 rounded border text-sm block">
                          {record.type}
                        </code>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Value
                        </label>
                        <div className="flex items-center">
                          <code className="bg-white px-2 py-1 rounded border text-sm flex-1 truncate">
                            {record.value}
                          </code>
                          <button
                            onClick={() => copyToClipboard(record.value)}
                            className="ml-2 p-1 text-gray-500 hover:text-gray-700"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <p className="text-blue-800 text-sm">
                  <strong>Note:</strong> DNS propagation can take up to 30
                  minutes. The system will automatically verify these records
                  once they're detected.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Certificate Info */}
        <AnimatePresence>
          {certificateInfo && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-2xl shadow-xl p-8"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                <CheckCircle className="w-5 h-5 inline mr-2 text-green-500" />
                Certificate Information
              </h3>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">
                    Certificate Details
                  </h4>
                  <p>
                    <strong>Domain:</strong> {certificateInfo.domain}
                  </p>
                  <p>
                    <strong>Expires:</strong> {certificateInfo.expiryDate}
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">
                    File Locations
                  </h4>
                  <div className="space-y-1 text-sm">
                    <p>
                      <strong>Certificate:</strong>{" "}
                      <code>{certificateInfo.paths.certificate}</code>
                    </p>
                    <p>
                      <strong>Private Key:</strong>{" "}
                      <code>{certificateInfo.paths.privateKey}</code>
                    </p>
                    <p>
                      <strong>Chain:</strong>{" "}
                      <code>{certificateInfo.paths.chain}</code>
                    </p>
                    <p>
                      <strong>Full Chain:</strong>{" "}
                      <code>{certificateInfo.paths.fullchain}</code>
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
